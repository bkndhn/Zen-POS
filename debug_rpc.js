import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);

async function debug() {
    console.log('--- FETCHING ADMIN PROFILE ---');
    const { data: profiles } = await supabase.from('profiles').select('*').eq('role', 'admin').limit(1);
    if (!profiles || profiles.length === 0) return console.log('No admin found');
    const admin = profiles[0];
    console.log('Admin Profile ID:', admin.id);
    console.log('Admin User ID:', admin.user_id);

    console.log('\n--- FETCHING ALL SHOP SETTINGS ROWS ---');
    const { data: rawSettings } = await supabase.from('shop_settings').select('id, branch_id, menu_items_per_row, menu_primary_color, logo_url, operating_hours').eq('user_id', admin.user_id);
    console.log(JSON.stringify(rawSettings, null, 2));

    console.log('\n--- CALLING RPC (branch = null) ---');
    const { data: rpcNull, error: rpcNullErr } = await supabase.rpc('get_public_shop_settings_for_branch', {
        p_admin_id: admin.id,
        p_branch_id: null
    });
    if (rpcNullErr) console.log('RPC ERROR:', rpcNullErr);
    else console.log(JSON.stringify(rpcNull, null, 2));
}

debug();
