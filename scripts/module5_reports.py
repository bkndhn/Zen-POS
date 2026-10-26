"""Module 5: Reports.tsx - Add Shifts tab"""

path = r"C:\Users\USER\.gemini\antigravity\scratch\hotel-zen-pos\src\pages\Reports.tsx"

with open(path, 'rb') as f:
    raw = f.read()

content = raw.replace(b'\r\n', b'\n').replace(b'\r', b'\n').decode('utf-8')

# 1. Add subDays, startOfMonth imports (format is already imported)
old_import_date = "import { format } from 'date-fns';"
new_import_date = "import { format, subDays, startOfMonth } from 'date-fns';"
content = content.replace(old_import_date, new_import_date, 1)

# 2. Add shift tab state variables after the existing state declarations
# Find a good anchor after existing state - after useBranchScopedQuery import
old_anchor = "import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';"
new_anchor = """import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';

// Shift tab types
interface ShiftRecon {
  id: string;
  opened_at: string;
  closed_at: string;
  opening_cash: number;
  cash_sales: number;
  expected_cash: number;
  actual_cash: number;
  variance: number;
  total_sales: number;
  total_bills: number;
  payment_breakdown: Record<string, number> | null;
  notes: string | null;
  shift_name?: string;
  safe_drop?: number;
  handover_float?: number;
  handover_staff?: string;
  closed_by?: string;
}"""
content = content.replace(old_anchor, new_anchor, 1)

# 3. Increase grid-cols-10 to grid-cols-11 and add Shifts trigger
old_tabslist = '          <TabsList className="grid w-full grid-cols-10 min-w-[800px] h-10">'
new_tabslist = '          <TabsList className="grid w-full grid-cols-11 min-w-[900px] h-10">'
content = content.replace(old_tabslist, new_tabslist, 1)

old_food_trigger = '            <TabsTrigger value="food_cost" className="text-sm font-medium">Food Cost</TabsTrigger>'
new_food_trigger = '            <TabsTrigger value="food_cost" className="text-sm font-medium">Food Cost</TabsTrigger>\n            <TabsTrigger value="shifts" className="text-sm font-medium">Shifts</TabsTrigger>'
content = content.replace(old_food_trigger, new_food_trigger, 1)

# 4. Add Shifts TabsContent before the food_cost one (or after it)
old_food_content = '        <TabsContent value="food_cost" className="mt-4">\n          <RecipeCostReport />\n        </TabsContent>'
new_food_content = '''        <TabsContent value="food_cost" className="mt-4">
          <RecipeCostReport />
        </TabsContent>

        <TabsContent value="shifts" className="mt-4">
          <ShiftsTabContent adminId={adminId} operatingBranchId={operatingBranchId} />
        </TabsContent>'''
content = content.replace(old_food_content, new_food_content, 1)

# 5. Add ShiftsTabContent component before the Reports component export
# Find the last closing of Reports component
old_reports_close = "const Reports = () => {"
# We'll inject the component definition BEFORE the Reports component
shifts_component = '''
// ─── Shifts Tab Component ──────────────────────────────────────────────────
function ShiftsTabContent({ adminId, operatingBranchId }: { adminId: string | undefined; operatingBranchId: string | null | undefined }) {
  const { supabase } = (() => { const { supabase } = require('@/integrations/supabase/client'); return { supabase }; })();
  // Use the global supabase from module scope
  const [recons, setRecons] = React.useState<ShiftRecon[]>([]);
  const [loadingShifts, setLoadingShifts] = React.useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const [rangePreset, setRangePreset] = React.useState<'today' | 'yesterday' | '7d' | 'month' | 'custom'>('today');
  const [rangeStart, setRangeStart] = React.useState(today);
  const [rangeEnd, setRangeEnd] = React.useState(today);

  const applyPreset = (preset: typeof rangePreset) => {
    setRangePreset(preset);
    const now = new Date();
    if (preset === 'today') { setRangeStart(today); setRangeEnd(today); }
    else if (preset === 'yesterday') { const y = format(subDays(now, 1), 'yyyy-MM-dd'); setRangeStart(y); setRangeEnd(y); }
    else if (preset === '7d') { setRangeStart(format(subDays(now, 6), 'yyyy-MM-dd')); setRangeEnd(today); }
    else if (preset === 'month') { setRangeStart(format(startOfMonth(now), 'yyyy-MM-dd')); setRangeEnd(today); }
  };

  React.useEffect(() => { if (rangePreset !== 'custom') applyPreset(rangePreset); }, []);

  React.useEffect(() => {
    if (!adminId) return;
    const fetchShifts = async () => {
      setLoadingShifts(true);
      try {
        const start = new Date(rangeStart + 'T00:00:00').toISOString();
        const end = new Date(rangeEnd + 'T23:59:59').toISOString();
        const query = supabase
          .from('shift_reconciliations')
          .select('*')
          .eq('admin_id', adminId)
          .gte('opened_at', start)
          .lte('opened_at', end)
          .order('opened_at', { ascending: false });
        if (operatingBranchId) (query as any).eq('branch_id', operatingBranchId);
        const { data } = await query;
        setRecons((data || []) as ShiftRecon[]);
      } catch { /* silent */ } finally { setLoadingShifts(false); }
    };
    fetchShifts();
  }, [adminId, operatingBranchId, rangeStart, rangeEnd]);

  const totalCashSettled = recons.reduce((s, r) => s + (r.actual_cash || 0), 0);
  const totalDigital = recons.reduce((s, r) => {
    const pb = r.payment_breakdown || {};
    return s + (Number(pb['upi'] || 0) + Number(pb['card'] || 0));
  }, 0);
  const netVariance = recons.reduce((s, r) => s + (r.variance || 0), 0);

  const exportCSV = () => {
    const headers = ['Date', 'Shift Name', 'Duration (min)', 'Opening Cash', 'Cash Sales', 'Expected Cash', 'Actual Cash', 'Variance', 'Total Sales', 'Bills', 'Safe Drop', 'Handover Float', 'Handover To', 'Notes'];
    const rows = recons.map(r => {
      const dur = r.closed_at && r.opened_at ? Math.round((new Date(r.closed_at).getTime() - new Date(r.opened_at).getTime()) / 60000) : '';
      return [
        format(new Date(r.opened_at), 'dd-MM-yyyy HH:mm'),
        r.shift_name || 'General Shift',
        dur,
        r.opening_cash,
        r.cash_sales,
        r.expected_cash,
        r.actual_cash,
        r.variance,
        r.total_sales,
        r.total_bills,
        r.safe_drop ?? '',
        r.handover_float ?? '',
        r.handover_staff || '',
        r.notes || '',
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(',');
    });
    const csv = [headers.join(','), ...rows].join('\\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `shifts_${rangeStart}_${rangeEnd}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const presets: { key: typeof rangePreset; label: string }[] = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: '7d', label: 'Last 7 Days' },
    { key: 'month', label: 'This Month' },
    { key: 'custom', label: 'Custom' },
  ];

  return (
    <div className="space-y-4">
      {/* Date Range Filter */}
      <div className="flex flex-wrap items-center gap-2">
        {presets.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${rangePreset === p.key ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/60'}`}
          >{p.label}</button>
        ))}
        {rangePreset === 'custom' && (
          <>
            <Input type="date" value={rangeStart} onChange={e => setRangeStart(e.target.value)} className="h-8 w-36 text-xs" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" value={rangeEnd} onChange={e => setRangeEnd(e.target.value)} className="h-8 w-36 text-xs" />
          </>
        )}
        <button
          type="button"
          onClick={exportCSV}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-border rounded-lg hover:bg-muted transition-all"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Total Shifts</p><p className="text-2xl font-bold">{recons.length}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Cash Settled</p><p className="text-2xl font-bold">₹{totalCashSettled.toLocaleString('en-IN')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Digital (UPI+Card)</p><p className="text-2xl font-bold">₹{totalDigital.toLocaleString('en-IN')}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground mb-1">Net Variance</p><p className={`text-2xl font-bold ${netVariance < 0 ? 'text-destructive' : netVariance > 0 ? 'text-warning' : 'text-success'}`}>₹{netVariance.toLocaleString('en-IN')}</p></CardContent></Card>
      </div>

      {/* History Table */}
      {loadingShifts ? (
        <div className="py-8 text-center text-sm text-muted-foreground">Loading shifts...</div>
      ) : recons.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">No shifts found for the selected period.</div>
      ) : (
        <div className="rounded-lg border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                {['Date / Shift', 'Duration', 'Cash Sales', 'Expected', 'Actual', 'Variance', 'Total Sales', 'Bills'].map(h => (
                  <th key={h} className="px-3 py-2 text-left font-semibold text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recons.map(r => {
                const dur = r.closed_at && r.opened_at ? Math.round((new Date(r.closed_at).getTime() - new Date(r.opened_at).getTime()) / 60000) : null;
                const vSign = r.variance < 0 ? 'text-destructive' : r.variance > 0 ? 'text-warning' : 'text-success';
                return (
                  <tr key={r.id} className="border-t border-border hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <p className="font-semibold">{r.shift_name || 'General Shift'}</p>
                      <p className="text-muted-foreground">{format(new Date(r.opened_at), 'dd MMM, hh:mm a')}</p>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{dur != null ? `${dur} min` : '—'}</td>
                    <td className="px-3 py-2">₹{(r.cash_sales || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">₹{(r.expected_cash || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">₹{(r.actual_cash || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2"><span className={`font-bold ${vSign}`}>₹{(r.variance || 0).toLocaleString('en-IN')}</span></td>
                    <td className="px-3 py-2">₹{(r.total_sales || 0).toLocaleString('en-IN')}</td>
                    <td className="px-3 py-2">{r.total_bills}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

'''

# Insert before `const Reports = () => {`
content = content.replace("const Reports = () => {", shifts_component + "const Reports = () => {", 1)

out = content.replace('\n', '\r\n').encode('utf-8')
with open(path, 'wb') as f:
    f.write(out)

print("Module 5 done.")
