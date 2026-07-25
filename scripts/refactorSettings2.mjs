import fs from 'fs';

let code = fs.readFileSync('src/pages/Settings.tsx', 'utf-8');

if (!code.includes('TabsContent')) {
  // Add imports
  code = code.replace(
    'import { ErrorBoundary } from \'@/components/ErrorBoundary\';',
    'import { ErrorBoundary } from \'@/components/ErrorBoundary\';\nimport { Tabs, TabsContent, TabsList, TabsTrigger } from \'@/components/ui/tabs\';'
  );

  const extractBlockExact = (startStr, endStr) => {
    const startIdx = code.indexOf(startStr);
    if (startIdx === -1) {
      console.log('Not found:', startStr);
      return '';
    }
    const endIdx = code.indexOf(endStr, startIdx);
    const block = code.substring(startIdx, endIdx + endStr.length);
    code = code.replace(block, '');
    return block;
  };

  const paymentTypes = extractBlockExact('{profile?.role === \'admin\' && <PaymentTypesManagement />}', '}');
  const additionalCharges = extractBlockExact('{/* Additional Charges Management */}', 'fetchAdditionalCharges();\n                }}\n              />\n            </CardContent>\n          </Card>');
  const gst = extractBlockExact('{/* GST / Tax Settings */}', '</ErrorBoundary>');
  const calci = extractBlockExact('{/* Calci Billing Settings */}', '</ErrorBoundary>');
  const quickBill = extractBlockExact('{/* Quick Bill Settings */}', '</ErrorBoundary>');
  const whatsapp = extractBlockExact('{/* WhatsApp Bill Share Settings */}', '</ErrorBoundary>');
  const aggregator = extractBlockExact('{/* Food Aggregator Integrations */}', '</ErrorBoundary>');
  const bluetooth = extractBlockExact('{/* Bluetooth Printer Settings */}', '</ErrorBoundary>');
  const orderType = extractBlockExact('{/* Order Type (Dine In / Parcel) Settings */}', '</ErrorBoundary>');
  const branch = extractBlockExact('{/* Branch Management (admin only) */}', '</ErrorBoundary>');
  const privacy = extractBlockExact('{/* Data Privacy & Storage */}', 'className="h-9 font-mono tracking-widest"\n                  />\n                </div>\n              </div>\n            </CardContent>\n          </Card>');
  const quickKeys = extractBlockExact('<ErrorBoundary fallback={<div className="p-4 text-sm text-muted-foreground border rounded-lg">Calci Quick Keys failed to load. Try refreshing.</div>}>\n            <CalciQuickKeysSettings />\n          </ErrorBoundary>', '</ErrorBoundary>');
  const print = extractBlockExact('{/* Print Settings */}', 'disabled={isAllBranchesView}\n                />\n              </div>\n            </CardContent>\n          </Card>');
  const accessibility = extractBlockExact('{/* Accessibility Settings */}', 'application for better visibility.\n                </p>\n              </div>\n            </CardContent>\n          </Card>');
  const billNum = extractBlockExact('{/* Bill Numbering Settings */}', 'Next bill number</p>\n                  </div>\n                </div>\n              </div>\n            </CardContent>\n          </Card>');
  const display = extractBlockExact('{/* Display Settings */}', '</ErrorBoundary>\n            </CardContent>\n          </Card>');
  const theme = extractBlockExact('{/* Theme Settings */}', '</ErrorBoundary>');

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
