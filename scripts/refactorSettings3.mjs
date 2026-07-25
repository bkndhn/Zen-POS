import fs from 'fs';

let code = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');

if (!code.includes('TabsContent')) {
  // Add imports
  code = code.replace(
    'import { ErrorBoundary } from \'@/components/ErrorBoundary\';',
    'import { ErrorBoundary } from \'@/components/ErrorBoundary\';\nimport { Tabs, TabsContent, TabsList, TabsTrigger } from \'@/components/ui/tabs\';'
  );

  const extractRegex = (regex) => {
    const match = code.match(regex);
    if (!match) {
      console.log('Not found:', regex);
      return '';
    }
    code = code.replace(match[0], '');
    return match[0];
  };

  const paymentTypes = extractRegex(/\{profile\?\.role === 'admin' && <PaymentTypesManagement \/>\}/);
  const additionalCharges = extractRegex(/\{\/\* Additional Charges Management \*\/\}[\s\S]*?fetchAdditionalCharges\(\);\n\s*\}\}\n\s*\/>\n\s*<\/CardContent>\n\s*<\/Card>/);
  const gst = extractRegex(/\{\/\* GST \/ Tax Settings \*\/\}[\s\S]*?<GSTSettings \/>\n\s*<\/ErrorBoundary>/);
  const calci = extractRegex(/\{\/\* Calci Billing Settings \*\/\}[\s\S]*?<CalciBillingSettings \/>\n\s*<\/ErrorBoundary>/);
  const quickBill = extractRegex(/\{\/\* Quick Bill Settings \*\/\}[\s\S]*?<QuickBillSettings \/>\n\s*<\/ErrorBoundary>/);
  const whatsapp = extractRegex(/\{\/\* WhatsApp Bill Share Settings \*\/\}[\s\S]*?<WhatsAppSettings \/>\n\s*<\/ErrorBoundary>/);
  const aggregator = extractRegex(/\{\/\* Food Aggregator Integrations \*\/\}[\s\S]*?<AggregatorIntegrationSettings \/>\n\s*<\/ErrorBoundary>/);
  const bluetooth = extractRegex(/\{\/\* Bluetooth Printer Settings \*\/\}[\s\S]*?<BluetoothPrinterSettings \/>\n\s*<\/ErrorBoundary>/);
  const orderType = extractRegex(/\{\/\* Order Type \(Dine In \/ Parcel\) Settings \*\/\}[\s\S]*?<OrderTypeSettings \/>\n\s*<\/ErrorBoundary>/);
  const branch = extractRegex(/\{\/\* Branch Management \(admin only\) \*\/\}[\s\S]*?<BranchManagement \/>\n\s*<\/ErrorBoundary>/);
  const privacy = extractRegex(/\{\/\* Data Privacy & Storage \*\/\}[\s\S]*?className="h-9 font-mono tracking-widest"\n\s*\/>\n\s*<\/div>\n\s*<\/div>\n\s*<\/CardContent>\n\s*<\/Card>/);
  const quickKeys = extractRegex(/<ErrorBoundary fallback=\{<div className="p-4 text-sm text-muted-foreground border rounded-lg">Calci Quick Keys failed to load\. Try refreshing\.<\/div>\}>\n\s*<CalciQuickKeysSettings \/>\n\s*<\/ErrorBoundary>/);
  const print = extractRegex(/\{\/\* Print Settings \*\/\}[\s\S]*?disabled=\{isAllBranchesView\}\n\s*\/>\n\s*<\/div>\n\s*<\/CardContent>\n\s*<\/Card>/);
  const accessibility = extractRegex(/\{\/\* Accessibility Settings \*\/\}[\s\S]*?application for better visibility\.\n\s*<\/p>\n\s*<\/div>\n\s*<\/CardContent>\n\s*<\/Card>/);
  const billNum = extractRegex(/\{\/\* Bill Numbering Settings \*\/\}[\s\S]*?Next bill number<\/p>\n\s*<\/div>\n\s*<\/div>\n\s*<\/div>\n\s*<\/CardContent>\n\s*<\/Card>/);
  const display = extractRegex(/\{\/\* Display Settings \*\/\}[\s\S]*?\{profile\?\.user_id && <DisplaySettings userId=\{profile\.user_id\} \/>\}\n\s*<\/ErrorBoundary>\n\s*<\/CardContent>\n\s*<\/Card>/);
  const theme = extractRegex(/\{\/\* Theme Settings \*\/\}[\s\S]*?<ThemeSettings \/>\n\s*<\/ErrorBoundary>/);

  const tabsContent = `
          <Tabs defaultValue="billing" className="w-full">
            <TabsList className="w-full flex flex-wrap h-auto mb-4 p-1 bg-muted/50 gap-1 justify-start">
              <TabsTrigger value="billing" className="flex-1 min-w-[120px] text-xs sm:text-sm">🛒 Billing & Checkout</TabsTrigger>
              <TabsTrigger value="hardware" className="flex-1 min-w-[120px] text-xs sm:text-sm">🖨️ Hardware & Print</TabsTrigger>
              <TabsTrigger value="preferences" className="flex-1 min-w-[120px] text-xs sm:text-sm">⚙️ App Preferences</TabsTrigger>
              <TabsTrigger value="integrations" className="flex-1 min-w-[120px] text-xs sm:text-sm">📲 Integrations</TabsTrigger>
              {profile?.role === 'admin' && <TabsTrigger value="branches" className="flex-1 min-w-[120px] text-xs sm:text-sm">🏢 Branches</TabsTrigger>}
            </TabsList>

            <TabsContent value="billing" className="space-y-4 sm:space-y-6 mt-0">
              ${gst}
              ${orderType}
              ${paymentTypes}
              ${additionalCharges}
              ${calci}
              ${quickKeys}
              ${quickBill}
              ${billNum}
            </TabsContent>

            <TabsContent value="hardware" className="space-y-4 sm:space-y-6 mt-0">
              ${bluetooth}
              ${print}
            </TabsContent>

            <TabsContent value="preferences" className="space-y-4 sm:space-y-6 mt-0">
              ${display}
              ${theme}
              ${accessibility}
              ${privacy}
            </TabsContent>

            <TabsContent value="integrations" className="space-y-4 sm:space-y-6 mt-0">
              ${whatsapp}
              ${aggregator}
            </TabsContent>

            {profile?.role === 'admin' && (
              <TabsContent value="branches" className="space-y-4 sm:space-y-6 mt-0">
                ${branch}
              </TabsContent>
            )}
          </Tabs>
`;
  
  code = code.replace(
    '          {/* Shop Details */}\n          <ShopSettingsForm />',
    '          {/* Shop Details */}\n          <ShopSettingsForm />\n' + tabsContent
  );

  fs.writeFileSync('src/pages/Settings.tsx', code);
  console.log('Settings successfully restructured!');
} else {
  console.log('Already has TabsContent');
}
