"""Module 4: ZReportDialog.tsx - Anti-theft variance trigger + handover fields"""

path = r"C:\Users\USER\.gemini\antigravity\scratch\hotel-zen-pos\src\components\ZReportDialog.tsx"

with open(path, 'rb') as f:
    raw = f.read()

content = raw.replace(b'\r\n', b'\n').replace(b'\r', b'\n').decode('utf-8')

# 1. Update handlePrint signature
old_sig = "  const handlePrint = async (countedCash?: number, countNotes?: string) => {"
new_sig = "  const handlePrint = async (countedCash?: number, countNotes?: string, counts?: any, safeDrop = 0, handoverFloat = 0, handoverStaff = '') => {"
content = content.replace(old_sig, new_sig, 1)

# 2. Add handover fields to reconciliation insert (after notes line)
old_recon = "          notes: notesText || null,\n        } as any);"
new_recon = """          notes: notesText || null,
          handover_float: handoverFloat,
          handover_staff: handoverStaff || null,
          safe_drop: safeDrop,
          shift_name: (reportData.shift as any)?.shift_name || 'General Shift',
        } as any);"""
content = content.replace(old_recon, new_recon, 1)

# 3. After checkSupabaseResult, add anti-theft alert trigger (before cashSummary assignment)
old_after_recon = """        checkSupabaseResult('shift_reconciliations.insert', reconResult as any);

        cashSummary = {"""
new_after_recon = """        checkSupabaseResult('shift_reconciliations.insert', reconResult as any);

        // Auto-trigger anti-theft alert if variance exceeds threshold
        try {
          const variance = actualCash - expectedCash;
          const { data: settingsRow } = await supabase
            .from('shop_settings')
            .select('antitheft_shift_variance_amt')
            .eq('user_id', adminId)
            .eq('branch_id', branchId)
            .maybeSingle();
          const threshold = Number((settingsRow as any)?.antitheft_shift_variance_amt ?? 100);
          if (Math.abs(variance) >= threshold) {
            await supabase.from('anti_theft_alerts').insert({
              admin_id: adminId,
              branch_id: branchId,
              alert_type: 'shift_variance',
              severity: variance < 0 ? 'critical' : 'medium',
              amount: Math.abs(variance),
              cashier_name: profile?.full_name || (profile as any)?.email || 'Unknown',
              details: {
                expected: expectedCash,
                actual: actualCash,
                variance,
                reason: countNotes || '',
                shift_name: (reportData.shift as any)?.shift_name || 'General Shift',
                safe_drop: safeDrop,
                handover_float: handoverFloat,
                handover_staff: handoverStaff,
              },
            } as any);
          }
        } catch (atErr) {
          console.warn('Anti-theft alert insert failed:', atErr);
        }

        cashSummary = {"""
content = content.replace(old_after_recon, new_after_recon, 1)

# 4. Update BlindShiftClose onConfirm in JSX to 6-param signature
old_confirm = "            onConfirm={async (cash, reason) => { await handlePrint(cash, reason); setBlindCloseOpen(false); }}"
new_confirm = "            onConfirm={async (cash, reason, cts, sd, hf, hs) => { await handlePrint(cash, reason, cts, sd, hf, hs); setBlindCloseOpen(false); }}"
content = content.replace(old_confirm, new_confirm, 1)

# 5. Add shiftName prop to BlindShiftClose
old_bsc = """          <BlindShiftClose
            open={blindCloseOpen}
            onOpenChange={setBlindCloseOpen}
            expectedCash={expectedForShift}
            busy={isClosingShift}"""
new_bsc = """          <BlindShiftClose
            open={blindCloseOpen}
            onOpenChange={setBlindCloseOpen}
            expectedCash={expectedForShift}
            busy={isClosingShift}
            shiftName={(reportData?.shift as any)?.shift_name}"""
content = content.replace(old_bsc, new_bsc, 1)

out = content.replace('\n', '\r\n').encode('utf-8')
with open(path, 'wb') as f:
    f.write(out)

print("Module 4 done.")
