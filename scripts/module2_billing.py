"""Module 2: Billing.tsx - Shift name + active shift badge"""

path = r"C:\Users\USER\.gemini\antigravity\scratch\hotel-zen-pos\src\pages\Billing.tsx"

with open(path, 'rb') as f:
    raw = f.read()

content = raw.replace(b'\r\n', b'\n').replace(b'\r', b'\n').decode('utf-8')

# 2a. Add shiftName + activeShift + lastShiftHandover states after openingShiftLoading
old_states = "  const [openingShiftLoading, setOpeningShiftLoading] = useState(false);"
new_states = """  const [openingShiftLoading, setOpeningShiftLoading] = useState(false);
  const [shiftName, setShiftName] = useState('');
  const [activeShift, setActiveShift] = useState<any>(null);
  const [lastShiftHandover, setLastShiftHandover] = useState<{ amount: number } | null>(null);"""
content = content.replace(old_states, new_states, 1)

# 2b. Update checkShift to set activeShift and load handover, and select more fields
old_select = "        .select('id, status')"
new_select = "        .select('id, status, opened_at, opening_cash, shift_name')"
content = content.replace(old_select, new_select, 1)

old_shift_found = """      if (!data) {
        setShowShiftModal(true);
      } else {
        setShowShiftModal(false);
      }"""
new_shift_found = """      if (!data) {
        setShowShiftModal(true);
        setActiveShift(null);
        // Load last shift handover float for banner
        try {
          const { data: lastRecon } = await supabase
            .from('shift_reconciliations')
            .select('actual_cash, handover_float, closed_at')
            .eq('admin_id', adminId)
            .eq('branch_id', branchId)
            .order('closed_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (lastRecon && lastRecon.closed_at) {
            const closedAt = new Date(lastRecon.closed_at);
            const diffH = (Date.now() - closedAt.getTime()) / 3600000;
            if (diffH < 24) {
              const amt = Number((lastRecon as any).handover_float ?? lastRecon.actual_cash ?? 0);
              if (amt > 0) setLastShiftHandover({ amount: amt });
            }
          }
        } catch { /* ignore */ }
      } else {
        setShowShiftModal(false);
        setActiveShift(data);
      }"""
content = content.replace(old_shift_found, new_shift_found, 1)

# 2c. Update handleOpenShift to include shift_name
old_insert = """      const { error } = await supabase.from('shifts').insert({
        admin_id: adminId,
        branch_id: branchId,
        user_id: profile?.id,
        opening_cash: Number(openingCash),
        status: 'open'
      });"""
new_insert = """      const { error } = await supabase.from('shifts').insert({
        admin_id: adminId,
        branch_id: branchId,
        user_id: profile?.id,
        opening_cash: Number(openingCash),
        status: 'open',
        shift_name: shiftName || 'General Shift',
      } as any);"""
content = content.replace(old_insert, new_insert, 1)

# 2d. Find where ZReportDialog is used in Billing toolbar - look for the billing toolbar top
# Find a good injection point for the active shift badge near the top toolbar
# Look for the billing header area - typically where branch name / date is
# Let's search for "zReportOpen" existence
if 'zReportOpen' not in content:
    # Need to add zReportOpen state and ZReportDialog import
    # Check if ZReportDialog is imported
    if 'ZReportDialog' not in content:
        # Add import after last import-ish area
        old_import_area = "import { cn } from '@/lib/utils';"
        new_import_area = "import { cn } from '@/lib/utils';\nimport { ZReportDialog } from '@/components/ZReportDialog';"
        content = content.replace(old_import_area, new_import_area, 1)
    # Add zReportOpen state near activeShift
    old_active = "  const [activeShift, setActiveShift] = useState<any>(null);"
    new_active = "  const [activeShift, setActiveShift] = useState<any>(null);\n  const [zReportOpen, setZReportOpen] = useState(false);"
    content = content.replace(old_active, new_active, 1)
    # Add ZReportDialog in JSX near the shift modal
    old_shift_dialog_start = "    <Dialog open={showShiftModal} onOpenChange={() => {}}>"
    new_shift_dialog_start = """    {zReportOpen && <ZReportDialog open={zReportOpen} onOpenChange={setZReportOpen} />}
    <Dialog open={showShiftModal} onOpenChange={() => {}}>"""
    content = content.replace(old_shift_dialog_start, new_shift_dialog_start, 1)
else:
    print("zReportOpen already exists, skipping state add")

# 2e. Add shift name chips + handover banner in OpenShiftModal above opening cash label
old_cash_label = """        <div className="space-y-3 py-2">
          <Label htmlFor="opening-cash">Opening Cash (₹)</Label>"""
new_cash_label = """        <div className="space-y-3 py-2">
          <div className="flex flex-wrap gap-2 mb-1">
            {['Morning (Shift 1)', 'Evening (Shift 2)', 'Night (Shift 3)', 'General Shift'].map(s => (
              <button
                key={s}
                type="button"
                onClick={() => setShiftName(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  shiftName === s ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/30 text-muted-foreground hover:border-primary/60'
                }`}
              >{s}</button>
            ))}
          </div>
          {lastShiftHandover && (
            <div className="bg-primary/10 border border-primary/30 rounded-xl p-3 text-sm">
              <p className="font-semibold text-primary">Previous shift left ₹{lastShiftHandover.amount.toLocaleString('en-IN')} in drawer</p>
              <button
                type="button"
                className="mt-2 text-xs border border-border rounded px-2 py-1 hover:bg-muted"
                onClick={() => setOpeningCash(String(lastShiftHandover.amount))}
              >
                Use ₹{lastShiftHandover.amount.toLocaleString('en-IN')} as Opening Float
              </button>
            </div>
          )}
          <Label htmlFor="opening-cash">Opening Cash (₹)</Label>"""
content = content.replace(old_cash_label, new_cash_label, 1)

# 2f. Add active shift badge to toolbar. Find a stable point near the top billing toolbar.
# Look for a commonly-present billing toolbar element
# Search for the billing page main return with div structure
# We'll inject after the existing showShiftModal logic area by finding a toolbar marker
# The shift badge should be in the header area. Let's look for a toolbar anchor.
# Common pattern: look for something near the top of the billing return JSX.
# Let's find where bills toolbar renders - look for the branch-related header area
# Instead, let's inject right before the CustomItemDialog
old_custom = """    <CustomItemDialog 
      open={isCustomItemOpen} 
      onOpenChange={setIsCustomItemOpen} 
      onAdd={handleAddCustomItem} 
    />"""
new_custom = """    <CustomItemDialog 
      open={isCustomItemOpen} 
      onOpenChange={setIsCustomItemOpen} 
      onAdd={handleAddCustomItem} 
    />
    {activeShift && (
      <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 text-xs bg-card border border-border shadow-lg rounded-full px-3 py-1.5">
        <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
        <span className="font-semibold text-success">{(activeShift as any).shift_name || 'Active Shift'}</span>
        <span className="text-muted-foreground">· {new Date(activeShift.opened_at).toLocaleTimeString('en-IN', {hour:'2-digit', minute:'2-digit'})}</span>
        <button
          type="button"
          onClick={() => setZReportOpen(true)}
          className="ml-1 text-xs font-bold text-primary hover:underline"
        >Close & Handover</button>
      </div>
    )}"""
content = content.replace(old_custom, new_custom, 1)

out = content.replace('\n', '\r\n').encode('utf-8')
with open(path, 'wb') as f:
    f.write(out)

print("Module 2 done.")
