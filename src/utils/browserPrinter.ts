import { PrintData } from './bluetoothPrinter';
import { formatQuantityWithUnit } from './timeUtils';

export const printBrowserReceipt = (data: PrintData) => {
  const width = data.printerWidth || '58mm';
  const widthValue = width === '80mm' ? '80mm' : '58mm';

  // Debug logging
  console.log('🖨️ Browser Print Data:', {
    billNo: data.billNo,
    itemCount: data.items.length,
    total: data.total
  });

  // Compact item rows with header: Item Name | Qty | Value (with two decimals)
  const itemsHeader = `<tr style="font-weight:bold;border-bottom:1px dashed #000"><td>ITEM</td><td style="text-align:center">QTY</td><td style="text-align:right">Value</td></tr>`;
  let itemsHtml = data.items.map(item => {
    const qtyWithUnit = formatQuantityWithUnit(item.quantity, item.unit);
    return `<tr><td style="max-width:60%;word-break:break-word">${item.name}</td><td style="text-align:center">${qtyWithUnit}</td><td style="text-align:right">${item.total.toFixed(2)}</td></tr>`;
  }).join('');

  const totalItems = data.totalItemsCount || data.items.length;
  const smartQty = data.smartQtyCount || 0;

  // Simple, clean HTML that works reliably on mobile
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bill ${data.billNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: monospace;
      font-size: 12px;
      width: ${widthValue};
      max-width: 100%;
      margin: 0 auto;
      padding: 8px;
      background: white;
      color: black;
    }
    .center { text-align: center; }
    .shop-name { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
    hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 2px 0; vertical-align: top; }
    .total { font-size: 14px; font-weight: bold; }
    .footer { margin-top: 12px; font-size: 10px; }
    @media print {
      body { width: ${widthValue}; }
    }
  </style>
</head>
<body>
  <div class="center">
    <div class="shop-name">${(data.shopName || data.hotelName || 'HOTEL').toUpperCase()}</div>
    ${data.address ? `<div>${data.address}</div>` : ''}
    ${data.contactNumber ? `<div>Ph: ${data.contactNumber}</div>` : ''}
  </div>
  
  <hr>
  
  <table>
    <tr><td>#${data.billNo}</td><td style="text-align:right">${data.date}</td></tr>
    <tr><td>Time:</td><td style="text-align:right">${data.time}</td></tr>
    ${(data as any).orderType ? `<tr><td><b>Type:</b></td><td style="text-align:right"><b>${(data as any).orderType === 'parcel' ? 'PARCEL' : 'DINE IN'}</b></td></tr>` : ''}
  </table>
  
  <hr>
  
  <table>${itemsHeader}${itemsHtml}</table>
  
  <hr>
  
  <table>
    <tr><td><b>Items: ${totalItems}</b></td><td style="text-align:right"><b>Qty: ${smartQty}</b></td></tr>
  </table>
  
  <hr>
  
  <table>
    <tr><td>Subtotal:</td><td style="text-align:right">₹${data.subtotal.toFixed(2)}</td></tr>
    ${data.additionalCharges?.map(c => `<tr><td>${c.name}:</td><td style="text-align:right">₹${c.amount.toFixed(2)}</td></tr>`).join('') || ''}
    ${data.discount && data.discount > 0 ? `<tr><td>Discount:</td><td style="text-align:right">-₹${data.discount.toFixed(2)}</td></tr>` : ''}
    <tr class="total"><td>TOTAL:</td><td style="text-align:right">₹${data.total.toFixed(2)}</td></tr>
  </table>
  
  <table style="margin-top:8px">
    <tr><td>Paid via:</td><td style="text-align:right">${data.paymentMethod.toUpperCase()}</td></tr>
  </table>
  
  <div class="footer center">
    <div>Thank you!</div>
    ${data.facebook || data.instagram || data.whatsapp ? '<hr>' : ''}
    ${data.facebook ? `<div>FB: ${data.facebook}</div>` : ''}
    ${data.instagram ? `<div>IG: ${data.instagram}</div>` : ''}
    ${data.whatsapp ? `<div>WA: ${data.whatsapp}</div>` : ''}
  </div>
</body>
</html>`;

  // Open new window and print
  const printWindow = window.open('', '_blank');

  if (!printWindow) {
    alert('Please allow popups to print bills');
    return;
  }

  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for document to fully load before printing
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 300);
  };

  // Fallback if onload doesn't fire
  setTimeout(() => {
    if (printWindow && !printWindow.closed) {
      printWindow.focus();
      printWindow.print();
    }
  }, 1000);
};
