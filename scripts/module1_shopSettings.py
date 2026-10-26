"""Module 1: ShopSettingsForm.tsx - Free shift toggle + shift mode + threshold fields"""
import re

path = r"C:\Users\USER\.gemini\antigravity\scratch\hotel-zen-pos\src\components\ShopSettingsForm.tsx"

with open(path, 'rb') as f:
    raw = f.read()

content = raw.replace(b'\r\n', b'\n').replace(b'\r', b'\n').decode('utf-8')

# 1. Add shiftMode state after shiftManagementUnlocked
old_state = "    const [shiftManagementEnabled, setShiftManagementEnabled] = useState(false);\n    const [shiftManagementUnlocked, setShiftManagementUnlocked] = useState(false);\n    const [remoteOrderFlow, setRemoteOrderFlow] = useState('manual_settle');"
new_state = "    const [shiftManagementEnabled, setShiftManagementEnabled] = useState(false);\n    const [shiftManagementUnlocked, setShiftManagementUnlocked] = useState(false);\n    const [shiftMode, setShiftMode] = useState('single');\n    const [remoteOrderFlow, setRemoteOrderFlow] = useState('manual_settle');"

content = content.replace(old_state, new_state, 1)

# 2. Load shiftMode from DB (after setShiftManagementUnlocked line in fetchSettings)
old_load = "                setShiftManagementEnabled((data as any).shift_management_enabled ?? false);\n                setShiftManagementUnlocked((data as any).shift_management_unlocked ?? false);"
new_load = "                setShiftManagementEnabled((data as any).shift_management_enabled ?? false);\n                setShiftManagementUnlocked((data as any).shift_management_unlocked ?? false);\n                setShiftMode((data as any).shift_mode ?? 'single');"

content = content.replace(old_load, new_load, 1)

# 3. Save shiftMode in qrFields
old_qr = "                    shift_management_enabled: shiftManagementEnabled,\n                    remote_order_flow: remoteOrderFlow,"
new_qr = "                    shift_management_enabled: shiftManagementEnabled,\n                    shift_mode: shiftMode,\n                    antitheft_shift_variance_amt: antitheftVarianceAmt,\n                    remote_order_flow: remoteOrderFlow,"

content = content.replace(old_qr, new_qr, 1)

# 4. Fix the toggle UI: remove disabled and lock guard
old_toggle_block = """                            <div className="flex flex-col items-end gap-1">
                                <Switch
                                    checked={shiftManagementEnabled}
                                    onCheckedChange={setShiftManagementEnabled}
                                    disabled={!shiftManagementUnlocked}
                                />
                                {!shiftManagementUnlocked && (
                                    <span className="text-[10px] text-red-500 font-medium">Contact Super Admin to unlock</span>
                                )}
                            </div>"""

new_toggle_block = """                            <div className="flex flex-col items-end gap-1">
                                <Switch
                                    checked={shiftManagementEnabled}
                                    onCheckedChange={setShiftManagementEnabled}
                                />
                            </div>"""

content = content.replace(old_toggle_block, new_toggle_block, 1)

# 5. Remove PRO ADD-ON badge block
old_badge = """                                    {!shiftManagementUnlocked && (
                                        <Badge variant="secondary" className="bg-orange-100 text-orange-700 text-[10px]">PRO ADD-ON</Badge>
                                    )}"""
new_badge = ""

content = content.replace(old_badge, new_badge, 1)

# 6. Add Shift Mode + Threshold fields after the shift management toggle section (before the Web Orders div)
old_weborders = '                        <div className="flex items-center justify-between pt-4 border-t">'
new_weborders = """                        {shiftManagementEnabled && (
                          <div className="space-y-3 pt-3 border-t">
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-sm">Shift Mode</Label>
                                <p className="text-xs text-muted-foreground mt-0.5">How many shifts per day?</p>
                              </div>
                              <Select value={shiftMode} onValueChange={setShiftMode}>
                                <SelectTrigger className="w-[180px] h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="single">Single Shift (Daily)</SelectItem>
                                  <SelectItem value="two">2 Shifts (Day / Night)</SelectItem>
                                  <SelectItem value="three">3 Shifts 24/7</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex items-center justify-between">
                              <div>
                                <Label className="text-sm">Anti-Theft Shortage Alert (₹)</Label>
                                <p className="text-xs text-muted-foreground mt-0.5">Trigger alert when drawer short by this amount</p>
                              </div>
                              <Input
                                type="number"
                                min={0}
                                className="w-28 h-8 text-xs"
                                value={antitheftVarianceAmt}
                                onChange={e => setAntitheftVarianceAmt(Math.max(0, Number(e.target.value) || 0))}
                              />
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between pt-4 border-t">"""

content = content.replace(old_weborders, new_weborders, 1)

# Write back as CRLF
out = content.replace('\n', '\r\n').encode('utf-8')
with open(path, 'wb') as f:
    f.write(out)

print("Module 1 done.")
