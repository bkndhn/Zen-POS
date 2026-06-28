import { PrintData } from './bluetoothPrinter';
import { formatQuantityWithUnit, getShortUnit, calculateSmartQtyCount } from './timeUtils';

export const printBrowserReceipt = (data: PrintData) => {
  const width = data.printerWidth || '58mm';
  const widthValue = width === '80mm' ? '80mm' : '58mm';
  const fontSize = width === '80mm' ? '14px' : '12px';
  const shopNameFontSize = width === '80mm' ? '18px' : '15px';
  const totalFontSize = width === '80mm' ? '16px' : '13px';

  // Debug logging
  console.log('🖨️ Browser Print Data:', {
    billNo: data.billNo,
    itemCount: data.items.length,
    total: data.total
  });

  // Compact item rows with header: Item Name | Qty | Rate | Value (with two decimals)
  const itemsHeader = `<tr style="font-weight:bold;border-bottom:1px dashed #000">
    <td style="width:36%;text-align:left;padding-right:4px;">ITEM</td>
    <td style="width:16%;text-align:center;padding-right:4px;">QTY</td>
    <td style="width:26%;text-align:right;padding-right:6px;">RATE</td>
    <td style="width:22%;text-align:right;">VALUE</td>
  </tr>`;
  let itemsHtml = data.items.map(item => {
    const targetUnit = (item as any).selling_unit || item.unit;
    const qtyWithUnit = formatQuantityWithUnit(item.quantity, targetUnit);
    const shortUnit = getShortUnit(targetUnit);
    const baseVal = (item as any).selling_quantity || item.base_value;
    const baseValStr = baseVal && baseVal !== 1 ? `${baseVal}` : '';
    const rateText = `₹${item.price.toFixed(0)}/${baseValStr}${shortUnit}`;
    return `<tr>
      <td style="width:36%;text-align:left;word-break:break-all;padding-right:4px;">${item.name}</td>
      <td style="width:16%;text-align:center;white-space:nowrap;padding-right:4px;">${qtyWithUnit}</td>
      <td style="width:26%;text-align:right;white-space:nowrap;padding-right:6px;">${rateText}</td>
      <td style="width:22%;text-align:right;white-space:nowrap;">${item.total.toFixed(2)}</td>
    </tr>`;
  }).join('');

  const totalItems = data.totalItemsCount !== undefined ? data.totalItemsCount : data.items.length;
  const smartQty = data.smartQtyCount !== undefined ? data.smartQtyCount : calculateSmartQtyCount(data.items);

  // Parse tax summary
  let parsedTaxSummary: any = null;
  if (data.taxSummary) {
    try {
      parsedTaxSummary = typeof data.taxSummary === 'string' ? JSON.parse(data.taxSummary) : data.taxSummary;
    } catch (e) {
      console.error('Error parsing tax summary in browser printer:', e);
    }
  }

  const getTaxEntries = () => {
    if (!parsedTaxSummary) return [];
    if (Array.isArray(parsedTaxSummary)) return parsedTaxSummary;
    if (parsedTaxSummary.entries && Array.isArray(parsedTaxSummary.entries)) {
      return parsedTaxSummary.entries;
    }
    return Object.entries(parsedTaxSummary).map(([rateStr, entry]: [string, any]) => {
      const rate = parseFloat(rateStr);
      return {
        taxName: entry.taxName || `GST ${rate}%`,
        taxRate: rate,
        taxableAmount: entry.taxable || entry.taxableAmount || 0,
        cgst: entry.cgst || 0,
        sgst: entry.sgst || 0,
        cess: entry.cess || entry.cessAmount || 0,
        totalTax: entry.total || entry.totalTax || 0
      };
    });
  };

  let gstHtml = '';
  const taxEntries = getTaxEntries();
  if (data.isComposition) {
    gstHtml = `<hr>
    <div style="text-align:center;font-size:10px;margin-top:6px;font-style:italic;font-weight:bold;">
      Composition Scheme - Tax Rate: ${data.totalTax ? ((data.totalTax / data.subtotal) * 100).toFixed(1) : '1'}%<br>(No Input Tax Credit)
    </div>`;
  } else if (taxEntries.length > 0) {
    const rows = taxEntries.map((entry: any) => {
      const rate = entry.taxRate;
      const halfRate = rate / 2;
      return `<tr>
        <td style="text-align:left;">GST ${rate}%</td>
        <td style="text-align:right;">₹${entry.taxableAmount.toFixed(2)}</td>
        <td style="text-align:right;">${halfRate}%<br>₹${entry.cgst.toFixed(2)}</td>
        <td style="text-align:right;">${halfRate}%<br>₹${entry.sgst.toFixed(2)}</td>
        <td style="text-align:right;">₹${entry.cess.toFixed(2)}</td>
        <td style="text-align:right;">₹${entry.totalTax.toFixed(2)}</td>
      </tr>`;
    }).join('');

    gstHtml = `<hr>
    <div style="font-size:10px;font-weight:bold;margin-bottom:4px;">GST TAX BREAKUP:</div>
    <table style="width:100%;font-size:9px;margin-top:4px;border-collapse:collapse;line-height:1.2;">
      <thead>
        <tr style="font-weight:bold;border-bottom:1px dashed #000">
          <td style="width:20%;text-align:left;padding-bottom:4px;">RATE</td>
          <td style="width:20%;text-align:right;padding-bottom:4px;">TAXABLE</td>
          <td style="width:18%;text-align:right;padding-bottom:4px;">CGST</td>
          <td style="width:18%;text-align:right;padding-bottom:4px;">SGST</td>
          <td style="width:12%;text-align:right;padding-bottom:4px;">CESS</td>
          <td style="width:12%;text-align:right;padding-bottom:4px;">TOTAL</td>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>`;
  }

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
      font-size: ${fontSize};
      width: ${widthValue};
      max-width: 100%;
      margin: 0 auto;
      padding: 6px;
      background: white;
      color: black;
    }
    .center { text-align: center; }
    .shop-name { font-size: ${shopNameFontSize}; font-weight: bold; margin-bottom: 4px; }
    hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td { padding: 3px 2px; vertical-align: top; font-size: ${fontSize}; }
    .total { font-size: ${totalFontSize}; font-weight: bold; }
    .footer { margin-top: 12px; font-size: ${fontSize}; margin-bottom: 24px; }
    @media print {
      @page { 
        size: ${widthValue} auto; 
        margin: 0; 
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        height: auto !important;
        overflow: visible !important;
        background: white;
        color: black;
      }
      body { 
        width: ${widthValue}; 
        margin: 0; 
        padding: 4px 4px 30px 4px; 
      }
    }
  </style>
</head>
<body>
  <div class="center">
    ${(data as any).logoUrl ? `<img src="${(data as any).logoUrl}" alt="logo" style="max-height:60px;max-width:120px;object-fit:contain;margin-bottom:4px;" />` : ''}
    <div class="shop-name">${(data.shopName || data.hotelName || 'HOTEL').toUpperCase()}</div>
    ${data.address ? `<div>${data.address}</div>` : ''}
    ${data.contactNumber ? `<div>Ph: ${data.contactNumber}</div>` : ''}
  </div>
  
  <hr>
  
  <table>
    <tr><td>#${data.billNo}</td><td style="text-align:right">${data.date}</td></tr>
    <tr><td>Time:</td><td style="text-align:right">${data.time}</td></tr>
    ${(data as any).orderType ? `<tr><td><b>Type:</b></td><td style="text-align:right"><b>${(data as any).orderType === 'parcel' ? 'PARCEL' : 'DINE IN'}</b></td></tr>` : ''}
    ${data.gstin ? `<tr><td><b>GSTIN:</b></td><td style="text-align:right;font-family:monospace;">${data.gstin}</td></tr>` : ''}
    ${data.customerMobile ? `<tr><td><b>Cust Mob:</b></td><td style="text-align:right">${data.customerMobile}</td></tr>` : ''}
    ${data.customerGstin ? `<tr><td><b>Cust GSTIN:</b></td><td style="text-align:right;font-family:monospace;">${data.customerGstin}</td></tr>` : ''}
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

  ${gstHtml}
  
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
