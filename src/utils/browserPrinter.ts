import { isBillNumberHidden } from './printerConfig';
import { PrintData } from './bluetoothPrinter';
import { formatQuantityWithUnit, getShortUnit, calculateSmartQtyCount } from './timeUtils';
import { calculateBillTypography, generatePrintStyleHeader, getStoredFooterMessage } from './billFontUtils';
import QRCode from 'qrcode';

const escapeHtml = (str: string | undefined | null): string => {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
};

export const printBrowserReceipt = async (data: PrintData) => {
  const width = data.printerWidth || '58mm';
  const branchId = data.branchId || localStorage.getItem('hotel_pos_active_branch_id') || undefined;
  const paperSaving = localStorage.getItem('hotel_pos_paper_saving_mode') === 'true';
  const fontMetrics = calculateBillTypography(width, data.fontScale, branchId, data.fontFamily);

  let qrCodeDataUrl = '';
  try {
    const cachedHeaderStr = localStorage.getItem('hotel_pos_bill_header')
      || Object.keys(localStorage).filter(k => k.startsWith('hotel_pos_bill_header_')).map(k => localStorage.getItem(k)).find(v => v);
    let parsedHeader: any = {};
    if (cachedHeaderStr) {
      try { parsedHeader = JSON.parse(cachedHeaderStr); } catch {}
    }

    const receiptQrEnabled = data.receiptQrEnabled ?? parsedHeader.receiptQrEnabled ?? false;
    const receiptQrType = data.receiptQrType || parsedHeader.receiptQrType || 'payment';
    const upiId = data.upiId || parsedHeader.upiId || '';
    const upiName = data.upiName || parsedHeader.upiName || data.shopName || '';
    const telegram = data.telegram || parsedHeader.telegram || '';

    if (receiptQrEnabled && !paperSaving) {
      if (receiptQrType === 'payment' && upiId) {
        const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${data.total.toFixed(2)}&tr=${data.billNo}&cu=INR`;
        qrCodeDataUrl = await QRCode.toDataURL(upiUrl, { width: 140, margin: 1 });
      } else if (receiptQrType === 'social' && telegram) {
        qrCodeDataUrl = await QRCode.toDataURL(telegram, { width: 140, margin: 1 });
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
        <td style="width:36%;text-align:left;word-break:break-all;padding-right:4px;">${escapeHtml(item.name)}</td>
        <td style="width:16%;text-align:center;white-space:nowrap;padding-right:4px;">${qtyWithUnit}</td>
        <td style="width:26%;text-align:right;white-space:nowrap;padding-right:6px;">${rateText}</td>
        <td style="width:22%;text-align:right;white-space:nowrap;">${item.total.toFixed(2)}</td>
      </tr>`;
    } else {
      return `<tr>
        <td style="width:55%;text-align:left;word-break:break-all;padding-right:4px;">${escapeHtml(item.name)}</td>
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

  const customFooterMsg = data.footerMessage || getStoredFooterMessage(branchId);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bill Receipt</title>
  ${generatePrintStyleHeader(width, data.fontScale, branchId, data.fontFamily)}
  <style>
    .center { text-align: center; }
    .shop-name { font-size: ${fontMetrics.shopTitleFontSizePx}px !important; font-weight: bold; margin-bottom: ${paperSaving ? '2px' : '4px'}; }
    hr { border: none; border-top: 1px dashed #000; margin: ${paperSaving ? '4px 0' : '6px 0'}; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; word-break: break-word; overflow-wrap: anywhere; }
    td, th { padding: ${paperSaving ? '1.5px 1px' : '3px 2px'}; vertical-align: top; font-size: ${fontMetrics.bodyFontSizePx}px; overflow-wrap: anywhere; word-break: break-word; }
    .total { font-size: ${fontMetrics.grandTotalFontSizePx}px !important; font-weight: bold; }
    .footer { margin-top: ${paperSaving ? '6px' : '12px'}; font-size: ${fontMetrics.bodyFontSizePx}px; margin-bottom: ${paperSaving ? '8px' : '24px'}; }
  </style>
</head>
<body>
  <div class="center">
    ${(data as any).logoUrl && !paperSaving ? `<img src="${escapeHtml((data as any).logoUrl)}" alt="logo" style="max-height:55px;max-width:110px;object-fit:contain;margin-bottom:4px;" />` : ''}
    <div class="shop-name">${escapeHtml((data.shopName || data.hotelName || 'HOTEL').toUpperCase())}</div>
    ${data.address && !paperSaving ? `<div>${escapeHtml(data.address)}</div>` : ''}
    ${data.contactNumber && !paperSaving ? `<div>Ph: ${escapeHtml(data.contactNumber)}${data.gstin ? ` | GSTIN: ${escapeHtml(data.gstin)}` : ''}</div>` : (!paperSaving && data.gstin ? `<div>GSTIN: ${escapeHtml(data.gstin)}</div>` : '')}
  </div>
  
  <hr>
  
  <table>
    ${isBillNumberHidden() 
      ? `<tr><td><b>Date:</b></td><td style="text-align:right">${escapeHtml(data.date)} ${escapeHtml(data.time)}</td></tr>` 
      : `<tr><td>#${escapeHtml(data.billNo)}</td><td style="text-align:right">${escapeHtml(data.date)} ${escapeHtml(data.time)}</td></tr>`}
    ${(data as any).orderType ? `<tr><td><b>Type:</b></td><td style="text-align:right"><b>${(data as any).orderType === 'parcel' ? 'PARCEL' : 'DINE IN'}</b></td></tr>` : ''}
    ${data.customerMobile && !paperSaving ? `<tr><td><b>Cust Mob:</b></td><td style="text-align:right">${escapeHtml(data.customerMobile)}</td></tr>` : ''}
    ${data.customerGstin && !paperSaving ? `<tr><td><b>Cust GSTIN:</b></td><td style="text-align:right;font-family:monospace;">${escapeHtml(data.customerGstin)}</td></tr>` : ''}
  </table>
  
  <hr>
  
  <table>${itemsHeader}${itemsHtml}</table>
  
  <hr>
  
  <table>
    <tr><td><b>Items: ${totalItems}</b></td><td style="text-align:right"><b>Qty: ${smartQty}</b></td></tr>
  </table>
  
  <hr>
  
  <table>
    <tr><td><b>Subtotal:</b></td><td style="text-align:right"><b>₹${data.subtotal.toFixed(2)}</b></td></tr>
    ${data.additionalCharges?.map(c => `<tr><td>${escapeHtml(c.name)}:</td><td style="text-align:right">₹${c.amount.toFixed(2)}</td></tr>`).join('') || ''}
    ${data.discount && data.discount > 0 ? `<tr><td>Discount:</td><td style="text-align:right">-₹${data.discount.toFixed(2)}</td></tr>` : ''}
    <tr class="total" style="font-size: ${width === '80mm' ? '22px' : '16px'}; font-weight: bold;"><td><b>TOTAL:</b></td><td style="text-align:right"><b>₹${data.total.toFixed(2)}</b></td></tr>
  </table>
  
  <table style="margin-top: ${paperSaving ? '4px' : '8px'}">
    <tr><td>Paid via:</td><td style="text-align:right">${escapeHtml(data.paymentMethod.toUpperCase())}</td></tr>
  </table>
 
  ${gstHtml}
  
  <div class="footer center">
    ${qrCodeDataUrl ? `<div style="margin-top: 10px; margin-bottom: 5px;"><img src="${qrCodeDataUrl}" alt="QR Code" style="display:block;margin:0 auto;max-width:140px;" /></div>` : ''}
    <div style="font-weight: 700; margin-top: 6px; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(customFooterMsg)}</div>
    ${(data.facebook || data.instagram || data.whatsapp) && !paperSaving ? '<hr>' : ''}
    ${data.facebook && !paperSaving ? `<div>FB: ${escapeHtml(data.facebook)}</div>` : ''}
    ${data.instagram && !paperSaving ? `<div>IG: ${escapeHtml(data.instagram)}</div>` : ''}
    ${data.whatsapp && !paperSaving ? `<div>WA: ${escapeHtml(data.whatsapp)}</div>` : ''}
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

export interface BrowserKOTData {
  title?: string;
  tableNumber: string;
  seatText?: string;
  orderScope?: string;
  orderNumber?: number | string;
  ordersCount?: number;
  items: Array<{ name: string; quantity: number; unit?: string; instructions?: string }>;
  customerNote?: string;
  printerWidth?: '58mm' | '80mm';
  date?: string;
  time?: string;
}

export const printBrowserKOT = (data: BrowserKOTData) => {
  const width = data.printerWidth || '58mm';
  const widthValue = width === '80mm' ? '80mm' : '58mm';
  const fontSize = width === '80mm' ? '15px' : '12px';
  const headerFontSize = width === '80mm' ? '22px' : '16px';
  const now = new Date();
  const dateStr = data.date || now.toLocaleDateString('en-IN');
  const timeStr = data.time || now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  const itemsHtml = data.items.map(item => {
    const qtyStr = formatQuantityWithUnit(item.quantity, item.unit);
    return `
      <tr>
        <td style="padding: 2px 0; font-weight: bold;">${escapeHtml(item.name)}</td>
        <td style="padding: 2px 0; text-align: right; font-weight: bold;">${qtyStr}</td>
      </tr>
      ${item.instructions ? `<tr><td colspan="2" style="padding-bottom:4px; font-size:10px; color:#d97706;">📝 ${escapeHtml(item.instructions)}</td></tr>` : ''}
    `;
  }).join('');

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>KOT Ticket - Table ${data.tableNumber}</title>
  <style>
    @page { size: ${widthValue} auto; margin: 0; }
    body {
      width: ${widthValue};
      margin: 0;
      padding: 6px;
      font-family: monospace;
      font-size: ${fontSize};
      color: #000;
      background: #fff;
    }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bold { font-weight: bold; }
    .header { font-size: ${headerFontSize}; font-weight: bold; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 4px; }
    .badge { display: inline-block; background: #000; color: #fff; padding: 2px 6px; font-size: 11px; font-weight: bold; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    hr { border: none; border-top: 1px dashed #000; margin: 4px 0; }
    @media print {
      header, footer, .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="text-center header">*** KITCHEN KOT ***</div>
  <div class="text-center" style="margin-bottom: 4px;">
    <span class="badge">TABLE ${data.tableNumber}</span>
    ${data.seatText ? `<span style="font-weight:bold; margin-left: 4px;">· ${data.seatText}</span>` : ''}
  </div>
  ${data.orderNumber ? `<div style="font-size: 11px;"><b>Order #:</b> ${data.orderNumber}</div>` : ''}
  ${data.ordersCount ? `<div style="font-size: 11px;"><b>Group Tickets:</b> ${data.ordersCount}</div>` : ''}
  <div style="font-size: 10px; color: #444;">Time: ${dateStr} ${timeStr}</div>
  <hr>
  <table>
    <tr style="font-weight: bold; border-bottom: 1px solid #000;">
      <td style="text-align: left;">ITEM</td>
      <td style="text-align: right;">QTY</td>
    </tr>
    ${itemsHtml}
  </table>
  <hr>
  ${data.customerNote ? `<div style="font-size: 11px; padding: 4px; border: 1px solid #000; margin-top: 4px;">💬 Note: ${data.customerNote}</div>` : ''}
  <div class="text-center" style="margin-top: 8px; font-size: 10px; text-transform: uppercase;">-- KITCHEN DISPLAY COPY --</div>
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

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('Please allow popups to print KOT tickets');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();
};

