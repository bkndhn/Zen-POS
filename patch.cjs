const fs = require('fs');
const path = require('path');

const filePath = 'src/pages/PublicMenu.tsx';
let content = fs.readFileSync(filePath, 'utf-8');

const replacements = [
    [/<Label className="font-semibold text-gray-800 dark:text-gray-200">Special Instructions<\/Label>/g, `<Label className="font-semibold text-gray-800 dark:text-gray-200">{t('menu.specialInstructions') || 'Special Instructions'}</Label>`],
    [/<span className="text-gray-500 dark:text-gray-400 text-sm font-medium">Quantity<\/span>/g, `<span className="text-gray-500 dark:text-gray-400 text-sm font-medium">{t('menu.quantity') || 'Quantity'}</span>`],
    [/>Loading menu\.\.\.</g, `>{t('common.loading') || 'Loading menu...'}<`],
    [/>Loading menu[^<]+<\/p>/g, `>{t('common.loading') || 'Loading menu...'}</p>`],
    [/>Menu Unavailable<\/h1>/g, `>{t('menu.menuUnavailable') || 'Menu Unavailable'}</h1>`],
    [/>Menu is being updated\. Please check back soon!<\/p>/g, `>{t('menu.menuUpdating') || 'Menu is being updated. Please check back soon!'}</p>`],
    [/>Get Directions<\/span>/g, `>{t('menu.getDirections') || 'Get Directions'}</span>`],
    [/>Share Location<\/span>/g, `>{t('menu.shareLocation') || 'Share Location'}</span>`],
    [/No items found for "\{searchQuery\}"/g, `{t('menu.noItemsFound', { query: searchQuery }) || \`No items found for "\${searchQuery}"\`}`],
    [/>Order #\{order\.order_number\}<\/span>/g, `>{t('menu.orderNumber', { number: order.order_number }) || \`Order #\${order.order_number}\`}</span>`],
    [/>Note: \{order\.customer_note\}<\/p>/g, `>{t('menu.note') || 'Note:'} {order.customer_note}</p>`],
    [/>My Orders \(\{sessionOrders\.length\}\)<\/span>/g, `>{t('menu.myOrdersWithCount', { count: sessionOrders.length }) || \`My Orders (\${sessionOrders.length})\`}</span>`],
    [/>All items served! [^<]+<\/p>/g, `>{t('menu.allItemsServed') || 'All items served! 🥂'}</p>`],
    [/>Would you like anything else\?<\/p>/g, `>{t('menu.anythingElse') || 'Would you like anything else?'}</p>`],
    [/>Bill generated!<\/p>/g, `>{t('menu.billGenerated') || 'Bill generated!'}</p>`],
    [/>You can still order more items if you wish\.<\/p>/g, `>{t('menu.canStillOrder') || 'You can still order more items if you wish.'}</p>`],
    [/>Need Assistance\?<\/h3>/g, `>{t('menu.needAssistance') || 'Need Assistance?'}</h3>`],
    [/Table \{tableNo\}\{seatId \? \` - Seat \$\{seatId\}\` : ''\} [^<]+ Tap to notify staff/g, `{t('menu.tableSeat', { tableNo, seatId })} • {t('menu.tapToNotify') || 'Tap to notify staff'}`],
    [/>Active \(Pending\)<\/span>/g, `>{t('menu.activePending') || 'Active (Pending)'}</span>`],
    [/>Wait \{remainingSec\}s<\/span>/g, `>{t('menu.waitSecs', { secs: remainingSec }) || \`Wait \${remainingSec}s\`}</span>`],
    [/>Amount to Pay<\/span>/g, `>{t('menu.amountToPay') || 'Amount to Pay'}</span>`],
    [/Table \{tableNo\}\{seatId \? \` \\\(Seat \$\{seatId\}\\\)\` : ''\} [^<]+ Order Total/g, `{t('menu.tableSeat', { tableNo, seatId })} • {t('menu.orderTotal') || 'Order Total'}`],
    [/>Merchant Name:<\/span>/g, `>{t('menu.merchantName') || 'Merchant Name:'}</span>`],
    [/>UPI ID:<\/span>/g, `>{t('menu.upiId') || 'UPI ID:'}</span>`],
    [/>Reference Submitted!<\/h4>/g, `>{t('menu.referenceSubmitted') || 'Reference Submitted!'}</h4>`],
    [/>OR SCAN QR CODE<\/span>/g, `>{t('menu.orScanQR') || 'OR SCAN QR CODE'}</span>`],
    [/>Scan using GPay, PhonePe, Paytm etc\.<\/span>/g, `>{t('menu.scanUsing') || 'Scan using GPay, PhonePe, Paytm etc.'}</span>`],
    [/>Enter Payment Reference \(UTR \/ Txn ID\) \*<\/Label>/g, `>{t('menu.enterPaymentRef') || 'Enter Payment Reference (UTR / Txn ID) *'}</Label>`],
    [/>Call<\/span>/g, `>{t('menu.call') || 'Call'}</span>`],
    [/>WhatsApp<\/span>/g, `>{t('menu.whatsapp') || 'WhatsApp'}</span>`]
];

for (const [search, replace] of replacements) {
    content = content.replace(search, replace);
}
fs.writeFileSync(filePath, content, 'utf-8');

const enPath = 'src/i18n/locales/en.json';
const enStrings = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
Object.assign(enStrings.menu, {
    specialInstructions: "Special Instructions", quantity: "Quantity", menuUnavailable: "Menu Unavailable",
    menuUpdating: "Menu is being updated. Please check back soon!", getDirections: "Get Directions", shareLocation: "Share Location",
    noItemsFound: "No items found for \"{{query}}\"", orderNumber: "Order #{{number}}", note: "Note:",
    myOrdersWithCount: "My Orders ({{count}})", allItemsServed: "All items served! 🥂", anythingElse: "Would you like anything else?",
    billGenerated: "Bill generated!", canStillOrder: "You can still order more items if you wish.", needAssistance: "Need Assistance?",
    tableSeat: "Table {{tableNo}}{{seatId ? ' - Seat ' + seatId : ''}}", tapToNotify: "Tap to notify staff",
    activePending: "Active (Pending)", waitSecs: "Wait {{secs}}s", amountToPay: "Amount to Pay", orderTotal: "Order Total",
    merchantName: "Merchant Name:", upiId: "UPI ID:", referenceSubmitted: "Reference Submitted!", orScanQR: "OR SCAN QR CODE",
    scanUsing: "Scan using GPay, PhonePe, Paytm etc.", enterPaymentRef: "Enter Payment Reference (UTR / Txn ID) *", call: "Call"
});
fs.writeFileSync(enPath, JSON.stringify(enStrings, null, 2), 'utf-8');

const taPath = 'src/i18n/locales/ta.json';
if (fs.existsSync(taPath)) {
    const taStrings = JSON.parse(fs.readFileSync(taPath, 'utf-8'));
    for (const [k, v] of Object.entries(enStrings.menu)) {
        if (!taStrings.menu[k]) taStrings.menu[k] = v;
    }
    fs.writeFileSync(taPath, JSON.stringify(taStrings, null, 2), 'utf-8');
}
console.log("Patched PublicMenu.tsx!");
