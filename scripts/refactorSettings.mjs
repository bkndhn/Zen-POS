import fs from 'fs';

let code = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');

if (!code.includes('TabsContent')) {
  // Add imports
  code = code.replace(
    'import { ErrorBoundary } from \'@/components/ErrorBoundary\';',
    'import { ErrorBoundary } from \'@/components/ErrorBoundary\';\nimport { Tabs, TabsContent, TabsList, TabsTrigger } from \'@/components/ui/tabs\';'
  );

  const extractBlock = (startMarker, endMarker) => {
    const startIdx = code.indexOf(startMarker);
    const endIdx = code.indexOf(endMarker, startIdx);
    if (startIdx === -1 || endIdx === -1) {
      console.log('Could not find block: ', startMarker);
      return '';
    }
    const block = code.substring(startIdx, endIdx + endMarker.length);
    code = code.replace(block, '');
    return block;
  };

  const paymentTypes = extractBlock('{profile?.role === \'admin\' && <PaymentTypesManagement />}', '}');
  const additionalCharges = extractBlock('{/* Additional Charges Management */}', '</Card>');
  const gst = extractBlock('{/* GST / Tax Settings */}', '</ErrorBoundary>');
  const calci = extractBlock('{/* Calci Billing Settings */}', '</ErrorBoundary>');
  const quickBill = extractBlock('{/* Quick Bill Settings */}', '</ErrorBoundary>');
  const whatsapp = extractBlock('{/* WhatsApp Bill Share Settings */}', '</ErrorBoundary>');
  const aggregator = extractBlock('{/* Food Aggregator Integrations */}', '</ErrorBoundary>');
  const bluetooth = extractBlock('{/* Bluetooth Printer Settings */}', '</ErrorBoundary>');
  const orderType = extractBlock('{/* Order Type (Dine In / Parcel) Settings */}', '</ErrorBoundary>');
  const branch = extractBlock('{/* Branch Management (admin only) */}', '</ErrorBoundary>');
  const privacy = extractBlock('{/* Data Privacy & Storage */}', '</Card>');
  const quickKeys = extractBlock('<ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Calci Quick Keys failed to load. Try refreshing.</div>}>', '</ErrorBoundary>');
  const print = extractBlock('{/* Print Settings */}', '</Card>');
  const accessibility = extractBlock('{/* Accessibility Settings */}', '</Card>');
  const billNum = extractBlock('{/* Bill Numbering Settings */}', '</Card>');
  const display = extractBlock('{/* Display Settings */}', '</Card>');
  const theme = extractBlock('{/* Theme Settings */}', '</ErrorBoundary>');

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
              {profile?.role === 'admin' && <PaymentTypesManagement />}
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
