import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import QRCode from 'qrcode';
import { getAppBaseUrl } from '@/utils/urlUtils';
import { RemoteOrderStatusBoard } from '@/components/reports/RemoteOrderStatusBoard';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { getPoleDisplayUrl, isValidPoleToken } from '@/utils/polePairing';

const POLE_KEY = 'zenpos_staff_pole_link';

const StaffHub: React.FC = () => {
  const { adminProfileId } = useAuth();
  const { operatingBranchId } = useBranch();
  const [tables, setTables] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [poleLink, setPoleLink] = useState<string>(() => localStorage.getItem(POLE_KEY) || '');
  const [draft, setDraft] = useState('');
  const [qrTable, setQrTable] = useState<any | null>(null);
  const [qrImg, setQrImg] = useState('');
  const tableLink = (t: any) => `${getAppBaseUrl()}/menu/${adminProfileId}?table=${encodeURIComponent(t.table_number)}`;
  useEffect(() => {
    if (!qrTable) { setQrImg(''); return; }
    QRCode.toDataURL(tableLink(qrTable), { width: 320, margin: 2 }).then(setQrImg).catch(() => setQrImg(''));
  }, [qrTable]);

  const load = useCallback(async () => {
    if (!adminProfileId) return;
    let tq = (supabase as any).from('tables').select('id,table_number,table_name,status,capacity')
      .eq('admin_id', adminProfileId).eq('is_active', true).order('display_order', { ascending: true });
    let oq = supabase.from('table_orders').select('id,table_number,order_number,status,total_amount,items,created_at,seat_label')
      .eq('admin_id', adminProfileId).eq('is_billed', false).order('created_at', { ascending: false }).limit(100);
    if (operatingBranchId) { tq = tq.eq('branch_id', operatingBranchId); oq = oq.eq('branch_id', operatingBranchId); }
    const [t, o] = await Promise.all([tq, oq]);
    setTables(t.data || []);
    setOrders(o.data || []);
  }, [adminProfileId, operatingBranchId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!adminProfileId) return;
    const ch = supabase.channel(`staffhub-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'table_orders', filter: `admin_id=eq.${adminProfileId}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tables', filter: `admin_id=eq.${adminProfileId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [adminProfileId, load]);

  const savePole = () => {
    try {
      const u = new URL(draft.trim(), window.location.origin);
      const pair = u.searchParams.get('pair');
      if (u.origin !== window.location.origin || !isValidPoleToken(pair)) throw new Error();
      const safe = `/display?mode=pole&pair=${pair}`;
      localStorage.setItem(POLE_KEY, safe); setPoleLink(safe); setDraft('');
    } catch { alert('That is not a valid pole display link from this app.'); }
  };

  const poleSrc = poleLink || getPoleDisplayUrl();

  return (
    <div className="p-3 space-y-3 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold">Staff</h1>
      <Tabs defaultValue="tables">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="tables">Tables</TabsTrigger>
          <TabsTrigger value="orders">Orders ({orders.length})</TabsTrigger>
          <TabsTrigger value="online">Online</TabsTrigger>
          <TabsTrigger value="pole">Pole screen</TabsTrigger>
        </TabsList>
        <TabsContent value="tables" className="mt-3">
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            {tables.map(t => {
              const open = orders.filter(o => o.table_number === t.table_number).length;
              return (
                <Card key={t.id}><CardContent className="p-3 text-center space-y-1">
                  <div className="font-semibold">{t.table_name || `T${t.table_number}`}</div>
                  <Badge variant={t.status === 'available' ? 'secondary' : 'default'} className="capitalize">{t.status}</Badge>
                  {open > 0 && <div className="text-xs text-muted-foreground">{open} open order{open > 1 ? 's' : ''}</div>}
                  <Button size="sm" variant="outline" className="h-7 text-xs w-full" onClick={() => setQrTable(t)}>Table QR</Button>
                </CardContent></Card>
              );
            })}
            {tables.length === 0 && <p className="text-sm text-muted-foreground col-span-full">No tables set up.</p>}
          </div>
        </TabsContent>
        <TabsContent value="orders" className="mt-3 space-y-2">
          {orders.length === 0 && <p className="text-sm text-muted-foreground">No open table orders.</p>}
          {orders.map(o => (
            <Card key={o.id}><CardContent className="p-3">
              <div className="flex justify-between">
                <span className="font-semibold">Table {o.table_number}{o.seat_label ? ` · ${o.seat_label}` : ''}</span>
                <Badge className="capitalize">{o.status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {(Array.isArray(o.items) ? o.items : []).map((i: any) => `${i.quantity ?? 1}× ${i.name}`).join(', ')}
              </div>
              <div className="text-xs mt-1">₹{Number(o.total_amount || 0).toFixed(0)} · {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
            </CardContent></Card>
          ))}
        </TabsContent>
        <TabsContent value="online" className="mt-3"><RemoteOrderStatusBoard compact /></TabsContent>
        <TabsContent value="pole" className="mt-3 space-y-2">
          <div className="flex gap-2">
            <Input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Paste the till's pole display link" />
            <Button onClick={savePole} disabled={!draft.trim()}>Link</Button>
          </div>
          <p className="text-xs text-muted-foreground">Copy the link from Billing → pole display button on the counter till.</p>
          <iframe title="Pole screen" src={`${poleSrc}&orders=1`} className="w-full h-[70vh] rounded-lg border" />
        </TabsContent>
      </Tabs>
      <Dialog open={!!qrTable} onOpenChange={o => !o && setQrTable(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader><DialogTitle>{qrTable ? (qrTable.table_name || `Table ${qrTable.table_number}`) : ''}</DialogTitle></DialogHeader>
          {qrTable && (
            <div className="space-y-3 text-center">
              {qrImg && <img src={qrImg} alt="Table menu QR" className="mx-auto rounded bg-background" />}
              <p className="text-xs break-all text-muted-foreground">{tableLink(qrTable)}</p>
              <div className="flex gap-2">
                <Button className="flex-1" variant="outline" onClick={() => navigator.clipboard?.writeText(tableLink(qrTable))}>Copy link</Button>
                {qrImg && <Button className="flex-1" asChild><a href={qrImg} download={`table-${qrTable.table_number}-qr.png`}>Download</a></Button>}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StaffHub;
