import re

with open('src/pages/Settings_backup.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Add imports
if 'TabsContent' not in code:
    code = code.replace(
        "import { ErrorBoundary } from '@/components/ErrorBoundary';",
        "import { ErrorBoundary } from '@/components/ErrorBoundary';\nimport { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';"
    )

def extract_block(pattern_str):
    global code
    pattern = re.compile(pattern_str, re.DOTALL)
    match = pattern.search(code)
    if not match:
        print("Not found:", pattern_str[:40])
        return ""
    code = code.replace(match.group(0), "")
    return match.group(0)

paymentTypes = extract_block(r"\{profile\?\.role === 'admin' && <PaymentTypesManagement \/>\}")
additionalCharges = extract_block(r"\{\/\* Additional Charges Management \*\/\}[\s\S]*?fetchAdditionalCharges\(\);\n\s*\}\}\n\s*\/>\n\s*<\/CardContent>\n\s*<\/Card>")
gst = extract_block(r"\{\/\* GST \/ Tax Settings \*\/\}[\s\S]*?<GSTSettings \/>\n\s*<\/ErrorBoundary>")
calci = extract_block(r"\{\/\* Calci Billing Settings \*\/\}[\s\S]*?<CalciBillingSettings \/>\n\s*<\/ErrorBoundary>")
quickBill = extract_block(r"\{\/\* Quick Bill Settings \*\/\}[\s\S]*?<QuickBillSettings \/>\n\s*<\/ErrorBoundary>")
whatsapp = extract_block(r"\{\/\* WhatsApp Bill Share Settings \*\/\}[\s\S]*?<WhatsAppSettings \/>\n\s*<\/ErrorBoundary>")
aggregator = extract_block(r"\{\/\* Food Aggregator Integrations \*\/\}[\s\S]*?<AggregatorIntegrationSettings \/>\n\s*<\/ErrorBoundary>")
bluetooth = extract_block(r"\{\/\* Bluetooth Printer Settings \*\/\}[\s\S]*?<BluetoothPrinterSettings \/>\n\s*<\/ErrorBoundary>")
orderType = extract_block(r"\{\/\* Order Type \(Dine In \/ Parcel\) Settings \*\/\}[\s\S]*?<OrderTypeSettings \/>\n\s*<\/ErrorBoundary>")
branch = extract_block(r"\{\/\* Branch Management \(admin only\) \*\/\}[\s\S]*?<BranchManagement \/>\n\s*<\/ErrorBoundary>")
privacy = extract_block(r"\{\/\* Data Privacy & Storage \*\/\}[\s\S]*?className=\"h-9 font-mono tracking-widest\"\n\s*\/>\n\s*<\/div>\n\s*<\/div>\n\s*<\/CardContent>\n\s*<\/Card>")
quickKeys = extract_block(r"<ErrorBoundary fallback=\{<div className=\"p-4 text-sm text-muted-foreground border rounded-lg\">Calci Quick Keys failed to load\. Try refreshing\.<\/div>\}>\n\s*<CalciQuickKeysSettings \/>\n\s*<\/ErrorBoundary>")
print_setting = extract_block(r"\{\/\* Print Settings \*\/\}[\s\S]*?disabled=\{isAllBranchesView\}\n\s*\/>\n\s*<\/div>\n\s*<\/CardContent>\n\s*<\/Card>")
accessibility = extract_block(r"\{\/\* Accessibility Settings \*\/\}[\s\S]*?application for better visibility\.\n\s*<\/p>\n\s*<\/div>\n\s*<\/CardContent>\n\s*<\/Card>")
billNum = extract_block(r"\{\/\* Bill Numbering Settings \*\/\}[\s\S]*?Next bill number<\/p>\n\s*<\/div>\n\s*<\/div>\n\s*<\/div>\n\s*<\/CardContent>\n\s*<\/Card>")
display = extract_block(r"\{\/\* Display Settings \*\/\}[\s\S]*?\{profile\?\.user_id && <DisplaySettings userId=\{profile\.user_id\} \/>\}\n\s*<\/ErrorBoundary>\n\s*<\/CardContent>\n\s*<\/Card>")
theme = extract_block(r"\{\/\* Theme Settings \*\/\}[\s\S]*?<ThemeSettings \/>\n\s*<\/ErrorBoundary>")

tabsContent = f"""
          <Tabs defaultValue="billing" className="w-full">
            <TabsList className="w-full flex flex-wrap h-auto mb-4 p-1 bg-muted/50 gap-1 justify-start">
              <TabsTrigger value="billing" className="flex-1 min-w-[120px] text-xs sm:text-sm">🛒 Billing & Checkout</TabsTrigger>
              <TabsTrigger value="hardware" className="flex-1 min-w-[120px] text-xs sm:text-sm">🖨️ Hardware & Print</TabsTrigger>
              <TabsTrigger value="preferences" className="flex-1 min-w-[120px] text-xs sm:text-sm">⚙️ App Preferences</TabsTrigger>
              <TabsTrigger value="integrations" className="flex-1 min-w-[120px] text-xs sm:text-sm">📲 Integrations</TabsTrigger>
              {{profile?.role === 'admin' && <TabsTrigger value="branches" className="flex-1 min-w-[120px] text-xs sm:text-sm">🏢 Branches</TabsTrigger>}}
            </TabsList>

            <TabsContent value="billing" className="space-y-4 sm:space-y-6 mt-0">
              {gst}
              {orderType}
              {paymentTypes}
              {additionalCharges}
              {calci}
              {quickKeys}
              {quickBill}
              {billNum}
            </TabsContent>

            <TabsContent value="hardware" className="space-y-4 sm:space-y-6 mt-0">
              {bluetooth}
              {print_setting}
            </TabsContent>

            <TabsContent value="preferences" className="space-y-4 sm:space-y-6 mt-0">
              {display}
              {theme}
              {accessibility}
              {privacy}
            </TabsContent>

            <TabsContent value="integrations" className="space-y-4 sm:space-y-6 mt-0">
              {whatsapp}
              {aggregator}
            </TabsContent>

            {{profile?.role === 'admin' && (
              <TabsContent value="branches" className="space-y-4 sm:space-y-6 mt-0">
                {branch}
              </TabsContent>
            )}}
          </Tabs>
"""

code = code.replace(
    '          {/* Shop Details */}\n          <ShopSettingsForm />',
    '          {/* Shop Details */}\n          <ShopSettingsForm />\n' + tabsContent
)

with open('src/pages/Settings.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Python refactoring completed successfully!")
