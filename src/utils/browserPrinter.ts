import { isBillNumberHidden } from './printerConfig';
import { PrintData } from './bluetoothPrinter';
import { formatQuantityWithUnit, getShortUnit, calculateSmartQtyCount } from './timeUtils';
import QRCode from 'qrcode';

export const printBrowserReceipt = async (data: PrintData) => {
  const width = data.printerWidth || '58mm';
  const paperSaving = localStorage.getItem('hotel_pos_paper_saving_mode') === 'true';
  const widthValue = width === '80mm' ? '80mm' : '58mm';
  const fontSize = width === '80mm' ? '16px' : '12px';
  const shopNameFontSize = width === '80mm' ? '22px' : '15px';
  const totalFontSize = width === '80mm' ? '18px' : '13px';

  let qrCodeDataUrl = '';
  try {
    const cachedHeaderStr = localStorage.getItem('hotel_pos_bill_header')
      || Object.keys(localStorage).filter(k => k.startsWith('hotel_pos_bill_header_')).map(k => localStorage.getItem(k)).find(v => v);
    if (cachedHeaderStr) {
      const parsedHeader = JSON.parse(cachedHeaderStr);
      const receiptQrEnabled = parsedHeader.receiptQrEnabled === true;
      if (receiptQrEnabled && !paperSaving) {
        const receiptQrType = parsedHeader.receiptQrType || 'payment';
        if (receiptQrType === 'payment' && parsedHeader.upiId) {
          const upiUrl = `upi://pay?pa=${parsedHeader.upiId}&pn=${encodeURIComponent(parsedHeader.upiName || data.shopName || '')}&am=${data.total.toFixed(2)}&tr=${data.billNo}&cu=INR`;
          qrCodeDataUrl = await QRCode.toDataURL(upiUrl, { width: 140, margin: 1 });
        } else if (receiptQrType === 'social' && parsedHeader.telegram) {
          qrCodeDataUrl = await QRCode.toDataURL(parsedHeader.telegram, { width: 140, margin: 1 });
        }
      }
    }
  } catch (e) {
    console.error('QR Generation error:', e);
  }

  // Debug logging
  console.log('🖨️ Browser Print Data:', {
    billNo: data.billNo,
    itemCount: data.items.length,
    total: data.total
  });

  // Compact item rows with header: Item Name | Qty | Rate | Value (with two decimals)
  const itemsHeader = width === '80mm' ? `<tr style="font-weight:bold;border-bottom:1px dashed #000">
    <td style="width:36%;text-align:left;padding-right:4px;">ITEM</td>
    <td style="width:16%;text-align:center;padding-right:4px;">QTY</td>
    <td style="width:26%;text-align:right;padding-right:6px;">RATE</td>
    <td style="width:22%;text-align:right;">VALUE</td>
  </tr>` : `<tr style="font-weight:bold;border-bottom:1px dashed #000">
    <td style="width:55%;text-align:left;padding-right:4px;">ITEM</td>
    <td style="width:20%;text-align:center;padding-right:4px;">QTY</td>
    <td style="width:25%;text-align:right;">VALUE</td>
  </tr>`;
  const itemsHtml = data.items.map(item => {
    const targetUnit = (item as any).selling_unit || item.unit;
    const qtyWithUnit = formatQuantityWithUnit(item.quantity, targetUnit);
    const shortUnit = getShortUnit(targetUnit);
    const baseVal = (item as any).selling_quantity || item.base_value;
    const baseValStr = baseVal && baseVal !== 1 ? `${baseVal}` : '';
    const rateText = `₹${item.price.toFixed(0)}/${baseValStr}${shortUnit}`;
    
    if (width === '80mm') {
      return `<tr>
        <td style="width:36%;text-align:left;word-break:break-all;padding-right:4px;">${item.name}</td>
        <td style="width:16%;text-align:center;white-space:nowrap;padding-right:4px;">${qtyWithUnit}</td>
        <td style="width:26%;text-align:right;white-space:nowrap;padding-right:6px;">${rateText}</td>
        <td style="width:22%;text-align:right;white-space:nowrap;">${item.total.toFixed(2)}</td>
      </tr>`;
    } else {
      return `<tr>
        <td style="width:55%;text-align:left;word-break:break-all;padding-right:4px;">${item.name}</td>
        <td style="width:20%;text-align:center;white-space:nowrap;padding-right:4px;">${qtyWithUnit}</td>
        <td style="width:25%;text-align:right;white-space:nowrap;">${item.total.toFixed(2)}</td>
      </tr>`;
    }
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
  } else if (taxEntries.length > 0 && width === '80mm') {
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
  <title>Bill Receipt</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: monospace;
      font-size: ${paperSaving ? (width === '80mm' ? '14px' : '11px') : fontSize};
      width: ${widthValue};
      max-width: 100%;
      margin: 0 auto;
      padding: ${paperSaving ? '2px' : '6px'};
      background: white;
      color: black;
    }
    .center { text-align: center; }
    .shop-name { font-size: ${paperSaving ? (width === '80mm' ? '18px' : '13px') : shopNameFontSize}; font-weight: bold; margin-bottom: ${paperSaving ? '2px' : '4px'}; }
    hr { border: none; border-top: 1px dashed #000; margin: ${paperSaving ? '4px 0' : '6px 0'}; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td { padding: ${paperSaving ? '1.5px 1px' : '3px 2px'}; vertical-align: top; font-size: ${paperSaving ? (width === '80mm' ? '14px' : '11px') : fontSize}; }
    .total { font-size: ${paperSaving ? (width === '80mm' ? '16px' : '12px') : totalFontSize}; font-weight: bold; }
    .footer { margin-top: ${paperSaving ? '6px' : '12px'}; font-size: ${paperSaving ? (width === '80mm' ? '13px' : '10px') : fontSize}; margin-bottom: ${paperSaving ? '8px' : '24px'}; }
    @media print {
      @page { 
        margin: 0 !important; 
        size: auto; 
      }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        height: auto !important;
        max-height: 100% !important;
        overflow: hidden !important;
        background: white;
        color: black;
      }
      body { 
        width: ${widthValue}; 
        margin: 0; 
        padding: ${paperSaving ? '0px 0px 4px 0px' : '4px 4px 10px 4px'} !important; 
      }
      /* Hide browser default headers and footers */
      header, footer, .no-print {
        display: none !important;
      }
    }
  </style>
</head>
<body>
  <div class="center">
    ${(data as any).logoUrl && !paperSaving ? `<img src="${(data as any).logoUrl}" alt="logo" style="max-height:55px;max-width:110px;object-fit:contain;margin-bottom:4px;" />` : ''}
    <div class="shop-name">${(data.shopName || data.hotelName || 'HOTEL').toUpperCase()}</div>
    ${data.address && !paperSaving ? `<div>${data.address}</div>` : ''}
    ${data.contactNumber && !paperSaving ? `<div>Ph: ${data.contactNumber}${data.gstin ? ` | GSTIN: ${data.gstin}` : ''}</div>` : (!paperSaving && data.gstin ? `<div>GSTIN: ${data.gstin}</div>` : '')}
  </div>
  
  <hr>
  
  <table>
    ${isBillNumberHidden() 
      ? `<tr><td><b>Date:</b></td><td style="text-align:right">${data.date}</td></tr>` 
      : `<tr><td>#${data.billNo}</td><td style="text-align:right">${data.date}</td></tr>`}
    <tr><td>Time:</td><td style="text-align:right">${data.time}</td></tr>
    ${(data as any).orderType ? `<tr><td><b>Type:</b></td><td style="text-align:right"><b>${(data as any).orderType === 'parcel' ? 'PARCEL' : 'DINE IN'}</b></td></tr>` : ''}
    ${data.customerMobile && !paperSaving ? `<tr><td><b>Cust Mob:</b></td><td style="text-align:right">${data.customerMobile}</td></tr>` : ''}
    ${data.customerGstin && !paperSaving ? `<tr><td><b>Cust GSTIN:</b></td><td style="text-align:right;font-family:monospace;">${data.customerGstin}</td></tr>` : ''}
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
  
  <table style="margin-top: ${paperSaving ? '4px' : '8px'}">
    <tr><td>Paid via:</td><td style="text-align:right">${data.paymentMethod.toUpperCase()}</td></tr>
  </table>
 
  ${gstHtml}
  
  <div class="footer center">
    ${qrCodeDataUrl ? `<div style="margin-top: 10px; margin-bottom: 5px;"><img src="${qrCodeDataUrl}" alt="QR Code" style="display:block;margin:0 auto;max-width:140px;" /></div>` : ''}
    <div>Thank you!</div>
    ${(data.facebook || data.instagram || data.whatsapp) && !paperSaving ? '<hr>' : ''}
    ${data.facebook && !paperSaving ? `<div>FB: ${data.facebook}</div>` : ''}
    ${data.instagram && !paperSaving ? `<div>IG: ${data.instagram}</div>` : ''}
    ${data.whatsapp && !paperSaving ? `<div>WA: ${data.whatsapp}</div>` : ''}
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
        setTimeout(function() { window.close(); }, 500);
      }, 300);
    };
  </script>
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
};
