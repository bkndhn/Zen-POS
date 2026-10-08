import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const today = new Date().toISOString().split('T')[0];
  const currentISTHour = new Date(
    new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })
  ).toTimeString().slice(0, 5); // e.g. "23:00"

  // Get admins with nightly summary enabled at this hour
  const { data: admins } = await supabaseAdmin
    .from('shop_settings')
    .select('user_id, shop_name, whatsapp_nightly_phone, whatsapp_nightly_time, upi_id')
    .eq('whatsapp_nightly_summary', true)
    .eq('whatsapp_nightly_time', currentISTHour);

  if (!admins?.length) return json({ message: 'No summaries to send', count: 0 });

  let sent = 0;
  const errors: string[] = [];

  for (const admin of admins) {
    try {
      // Get admin profile id
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .eq('user_id', admin.user_id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!profile) continue;

      // Today's bill summary
      const { data: billSummary } = await supabaseAdmin
        .from('bills')
        .select('total_amount, payment_mode')
        .eq('admin_id', profile.id)
        .eq('is_deleted', false)
        .gte('created_at', `${today}T00:00:00`);

      const totalSales = (billSummary || []).reduce((s, b) => s + Number(b.total_amount || 0), 0);
      const billCount = (billSummary || []).length;

      // Payment mode breakdown
      const modeMap: Record<string, number> = {};
      (billSummary || []).forEach(b => {
        const m = b.payment_mode || 'Cash';
        modeMap[m] = (modeMap[m] || 0) + Number(b.total_amount || 0);
      });
      const modeBreakdown = Object.entries(modeMap)
        .map(([mode, amt]) => `${mode}: ₹${Math.round(amt).toLocaleString('en-IN')}`)
        .join(' | ');

      // Today's expenses
      const { data: expenseData } = await supabaseAdmin
        .from('expenses')
        .select('amount')
        .eq('admin_id', profile.id)
        .eq('date', today);
      const totalExpenses = (expenseData || []).reduce((s, e) => s + Number(e.amount || 0), 0);

      // Total Khata dues
      const { data: khataData } = await supabaseAdmin
        .from('customers')
        .select('current_balance')
        .eq('admin_id', profile.id)
        .gt('current_balance', 0);
      const totalKhata = (khataData || []).reduce((s, c) => s + Number(c.current_balance || 0), 0);

      // Top selling item today
      const { data: topItems } = await supabaseAdmin
        .from('bill_items')
        .select('item_name, quantity, bill_id, bills!inner(admin_id, is_deleted, created_at)')
        .eq('bills.admin_id', profile.id)
        .eq('bills.is_deleted', false)
        .gte('bills.created_at', `${today}T00:00:00`)
        .limit(200);

      const itemMap: Record<string, number> = {};
      (topItems || []).forEach((ti: any) => {
        itemMap[ti.item_name] = (itemMap[ti.item_name] || 0) + Number(ti.quantity || 1);
      });
      const topItem = Object.entries(itemMap).sort((a, b) => b[1] - a[1])[0];
      const topItemStr = topItem ? `${topItem[0]} (${topItem[1]} sold)` : 'N/A';

      // Format message
      const date = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' });
      const message = [
        `🏪 *${admin.shop_name || 'ZenPOS'} — Daily Brief*`,
        `📅 ${date}`,
        `━━━━━━━━━━━━━━`,
        `💰 *Total Sales: ₹${Math.round(totalSales).toLocaleString('en-IN')}* (${billCount} bills)`,
        modeBreakdown ? `💳 ${modeBreakdown}` : '',
        totalExpenses > 0 ? `🧾 Expenses: ₹${Math.round(totalExpenses).toLocaleString('en-IN')}` : '',
        totalKhata > 0 ? `📒 Khata Dues: ₹${Math.round(totalKhata).toLocaleString('en-IN')}` : '',
        `🏆 Top Item: ${topItemStr}`,
        `━━━━━━━━━━━━━━`,
        `Net: ₹${Math.round(totalSales - totalExpenses).toLocaleString('en-IN')}`,
        `_Powered by ZenPOS_`,
      ].filter(Boolean).join('\n');

      // Send via WhatsApp (link mode — opens wa.me link via stored phone)
      if (admin.whatsapp_nightly_phone) {
        const phone = admin.whatsapp_nightly_phone.replace(/\D/g, '');
        const target = phone.length === 10 ? `91${phone}` : phone;
        
        // Try Cloud API first if credentials exist
        const { data: creds } = await supabaseAdmin
          .from('shop_whatsapp_credentials')
          .select('whatsapp_business_api_token, whatsapp_business_phone_id')
          .eq('user_id', admin.user_id)
          .maybeSingle();

        if (creds?.whatsapp_business_api_token && creds?.whatsapp_business_phone_id) {
          const res = await fetch(
            `https://graph.facebook.com/v21.0/${creds.whatsapp_business_phone_id}/messages`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${creds.whatsapp_business_api_token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                messaging_product: 'whatsapp',
                to: target,
                type: 'text',
                text: { preview_url: false, body: message },
              }),
            }
          );
          if (res.ok) sent++;
          else errors.push(`${admin.shop_name}: Cloud API failed ${res.status}`);
        } else {
          // Fallback: insert into push_queue for FCM delivery of the text
          await supabaseAdmin.from('push_queue').insert({
            user_id: admin.user_id,
            title: `Daily Brief — ₹${Math.round(totalSales).toLocaleString('en-IN')} today`,
            body: `${billCount} bills | Expenses: ₹${Math.round(totalExpenses)} | ${topItemStr}`,
            data: { url: '/reports' },
          });
          sent++;
        }
      }
    } catch (e) {
      errors.push(String(e));
    }
  }

  return json({ sent, errors, currentISTHour });
});
