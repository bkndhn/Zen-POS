/**
 * Bill Image Generator for WhatsApp Sharing
 * 
 * Generates a colorful, professional bill image for sharing via WhatsApp.
 * Design matches the reference: shop header, gradient bill title, colored table, qty footer.
 */

import html2canvas from 'html2canvas';
import { getShortUnit, formatQuantityWithUnit } from '@/utils/timeUtils';

/** Escape HTML special characters to prevent XSS */
const escapeHtml = (str: string | undefined | null): string => {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

interface BillImageData {
  billNo: string;
  shopName: string;
  address?: string;
  phone?: string;
  items: Array<{ name: string; quantity: number; total: number; unit?: string; price: number }>;
  subtotal: number;
  discount?: number;
  additionalCharges?: Array<{ name: string; amount: number }>;
  total: number;
  date: string;
  time: string;
  paymentMethod: string;
  totalItemsCount?: number;
  smartQtyCount?: number;
  paymentDetails?: Record<string, number>;
  // GST fields
  gstin?: string;
  taxSummary?: string;
  totalTax?: number;
  isComposition?: boolean;
  roundOff?: number;
  // Order type
  orderType?: 'dine_in' | 'parcel';
}

/**
 * Generate colorful bill HTML matching reference design
 */
const generateBillHtml = (data: BillImageData): string => {
  const itemRows = data.items.map((item, idx) => {
    const qty = `${formatQuantityWithUnit(item.quantity, item.unit)}`;
    const bgColor = idx % 2 === 0 ? '#f8f9ff' : '#ffffff';
    return `
      <tr style="background: ${bgColor};">
        <td style="padding: 10px 12px; font-weight: 600; color: #1a1a2e; border-bottom: 1px solid #eef0f6;">${escapeHtml(item.name)}</td>
        <td style="padding: 10px 8px; text-align: center; font-weight: 700; color: #4361ee; border-bottom: 1px solid #eef0f6;">${escapeHtml(qty)}</td>
        <td style="padding: 10px 8px; text-align: right; color: #666; border-bottom: 1px solid #eef0f6;">₹${item.price.toFixed(0)}</td>
        <td style="padding: 10px 12px; text-align: right; font-weight: 700; color: #1a1a2e; border-bottom: 1px solid #eef0f6;">₹${item.total.toFixed(0)}</td>
      </tr>
    `;
  }).join('');

  const totalItems = data.totalItemsCount || data.items.length;
  const smartQty = data.smartQtyCount || data.items.reduce((sum, i) => sum + i.quantity, 0);

  // Payment details section
  let paymentHtml = '';
  if (data.paymentDetails && Object.keys(data.paymentDetails).length > 0) {
    const entries = Object.entries(data.paymentDetails).map(([method, amount]) =>
      `<span style="text-transform: uppercase; font-weight: 600;">${escapeHtml(method)}:</span> <span style="font-weight: 700;">₹${Number(amount).toFixed(0)}</span>`
    ).join(' &nbsp;|&nbsp; ');
    paymentHtml = `
      <div style="margin-top: 16px; padding: 12px 16px; background: #f0f4ff; border-radius: 10px; border: 1px solid #dce3ff;">
        <div style="font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Payment Split Details</div>
        <div style="font-size: 13px; color: #1a1a2e;">${entries}</div>
      </div>`;
  } else {
    paymentHtml = `
      <div style="margin-top: 16px; padding: 12px 16px; background: #f0f4ff; border-radius: 10px; border: 1px solid #dce3ff;">
        <div style="font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 6px;">Payment Split Details</div>
        <div style="font-size: 13px; color: #1a1a2e;">
          <span style="text-transform: uppercase; font-weight: 600;">${escapeHtml(data.paymentMethod)}:</span> <span style="font-weight: 700;">₹${data.total.toFixed(0)}</span>
        </div>
      </div>`;
  }

  // Discount HTML
  const discountHtml = data.discount && data.discount > 0 ? `
      <div style="display: flex; justify-content: space-between; padding: 6px 16px; color: #16a34a; font-size: 13px;">
        <span>Discount:</span>
        <span style="font-weight: 700;">-₹${data.discount.toFixed(0)}</span>
      </div>` : '';

  // Additional charges
  const chargesHtml = data.additionalCharges?.map(charge => `
      <div style="display: flex; justify-content: space-between; padding: 4px 16px; font-size: 13px; color: #666;">
        <span>${escapeHtml(charge.name)}:</span>
        <span style="font-weight: 600;">+₹${charge.amount.toFixed(0)}</span>
      </div>
    `).join('') || '';

  return `
    <div id="bill-image-content" style="
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', Arial, sans-serif;
      width: 360px;
      background: #ffffff;
      color: #1a1a2e;
      line-height: 1.5;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
    ">
      <!-- Shop Header -->
      <div style="text-align: center; padding: 24px 20px 16px; background: #ffffff;">
        <div style="font-size: 22px; font-weight: 800; color: #1a1a2e; letter-spacing: 0.5px; text-transform: uppercase;">${escapeHtml(data.shopName)}</div>
         ${data.address ? `<div style="font-size: 12px; color: #6b7280; margin-top: 4px; line-height: 1.4;">${escapeHtml(data.address).replace(/\n/g, '<br>')}</div>` : ''}
         ${data.phone ? `<div style="font-size: 13px; color: #374151; margin-top: 4px; font-weight: 600;">${escapeHtml(data.phone)}</div>` : ''}
         ${data.gstin ? `<div style="font-size: 11px; color: #6366f1; margin-top: 4px; font-weight: 600;">GSTIN: ${escapeHtml(data.gstin)}</div>` : ''}
      </div>
      
      <!-- Bill Title -->
      <div style="
        margin: 0 16px;
        padding: 14px 16px;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a78bfa 100%);
        border-radius: 12px;
        text-align: center;
      ">
        <div style="font-size: 15px; font-weight: 700; color: #ffffff; letter-spacing: 0.3px;">Bill Details - ${escapeHtml(data.billNo)}</div>
        <div style="font-size: 11px; color: rgba(255,255,255,0.85); margin-top: 4px;">${data.date} ${data.time}</div>
        ${data.orderType ? `<div style="font-size: 12px; font-weight: 700; color: #fef08a; margin-top: 4px; text-transform: uppercase;">${data.orderType === 'parcel' ? '📦 PARCEL' : '🍽️ DINE IN'}</div>` : ''}
      </div>

      <!-- Date & Total Row -->
      <div style="
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 20px;
        margin: 12px 16px 0;
        background: #fafbff;
        border-radius: 10px;
        border: 1px solid #eef0f6;
      ">
        <div>
          <div style="font-size: 11px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Date</div>
          <div style="font-size: 14px; font-weight: 600; color: #374151;">${data.date}</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 11px; color: #9ca3af; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">Total</div>
          <div style="font-size: 22px; font-weight: 800; color: #1a1a2e;">₹${data.total.toFixed(2)}</div>
        </div>
      </div>
      
      <!-- Items Table -->
      <div style="margin: 16px 16px 0; border-radius: 12px; overflow: hidden; border: 1px solid #eef0f6;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: linear-gradient(135deg, #eef0ff 0%, #f5f3ff 100%);">
              <th style="padding: 10px 12px; text-align: left; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">Item Name</th>
              <th style="padding: 10px 8px; text-align: center; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">Qty/Kg</th>
              <th style="padding: 10px 8px; text-align: right; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">Rate</th>
              <th style="padding: 10px 12px; text-align: right; font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">Value</th>
            </tr>
          </thead>
          <tbody>
            ${itemRows}
          </tbody>
        </table>
      </div>

      <!-- Qty / Items Count Footer -->
      <div style="
        display: flex;
        margin: 12px 16px 0;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid #dce3ff;
      ">
        <div style="flex: 1; padding: 12px 16px; background: linear-gradient(135deg, #eef0ff 0%, #e8ebff 100%); text-align: center;">
          <div style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">Qty Count</div>
          <div style="font-size: 20px; font-weight: 800; color: #4361ee; margin-top: 2px;">${smartQty}</div>
        </div>
        <div style="width: 1px; background: #dce3ff;"></div>
        <div style="flex: 1; padding: 12px 16px; background: linear-gradient(135deg, #eef0ff 0%, #e8ebff 100%); text-align: center;">
          <div style="font-size: 10px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">Items Count</div>
          <div style="font-size: 20px; font-weight: 800; color: #1a1a2e; margin-top: 2px;">${totalItems}</div>
        </div>
      </div>

      <!-- Subtotal / Discount / Charges -->
      ${chargesHtml}
      ${discountHtml}

      <!-- Tax Summary -->
      ${(() => {
      if (!data.totalTax || data.totalTax <= 0) return '';
      let taxHtml = '<div style="padding: 0 16px;">';
      taxHtml += '<div style="margin-top: 8px; padding: 10px 14px; background: #fef3c7; border-radius: 8px; border: 1px solid #fde68a;">';
      if (data.isComposition) {
        taxHtml += `<div style="display: flex; justify-content: space-between; font-size: 12px; color: #78350f;"><span>Tax (Composition)</span><span style="font-weight: 700;">₹${data.totalTax.toFixed(2)}</span></div>`;
      } else {
        try {
          const summary = data.taxSummary ? JSON.parse(data.taxSummary) : null;
          const entries = summary?.entries || [];
          // Try entries[] format (raw BillTaxSummary)
          const parseEntries = entries.length > 0 ? entries : (() => {
            // Fallback: top-level numeric keys (taxSummaryToJson format)
            if (summary && typeof summary === 'object') {
              return Object.keys(summary).filter(k => !isNaN(parseFloat(k))).map(rate => ({
                taxName: summary[rate].taxName || `GST ${rate}%`,
                taxRate: parseFloat(rate),
                taxableAmount: summary[rate].taxable || 0,
                cgst: summary[rate].cgst || 0,
                sgst: summary[rate].sgst || 0,
                cess: summary[rate].cess || 0
              }));
            }
            return [];
          })();
          if (parseEntries.length > 0) {
            taxHtml += '<table style="width: 100%; font-size: 11px; color: #78350f; border-collapse: collapse;">';
            taxHtml += '<tr style="border-bottom: 1px solid #fde68a;"><th style="text-align: left; padding: 2px 4px; font-size: 10px;">TaxName</th><th style="text-align: right; padding: 2px 4px; font-size: 10px;">Taxable</th><th style="text-align: right; padding: 2px 4px; font-size: 10px;">CGST</th><th style="text-align: right; padding: 2px 4px; font-size: 10px;">SGST</th></tr>';
            parseEntries.forEach((entry: any) => {
              const name = entry.taxName || `GST ${entry.taxRate}%`;
              taxHtml += `<tr><td style="padding: 2px 4px;">${name}</td><td style="text-align: right; padding: 2px 4px;">${(entry.taxableAmount || 0).toFixed(2)}</td><td style="text-align: right; padding: 2px 4px;">${(entry.cgst || 0).toFixed(2)}</td><td style="text-align: right; padding: 2px 4px;">${(entry.sgst || 0).toFixed(2)}</td></tr>`;
            });
            taxHtml += '</table>';
          } else {
            const halfTax = data.totalTax / 2;
            taxHtml += `<div style="display: flex; justify-content: space-between; font-size: 12px; color: #78350f;"><span>CGST</span><span>₹${halfTax.toFixed(2)}</span></div>`;
            taxHtml += `<div style="display: flex; justify-content: space-between; font-size: 12px; color: #78350f;"><span>SGST</span><span>₹${halfTax.toFixed(2)}</span></div>`;
          }
        } catch { taxHtml += `<div style="font-size: 12px; color: #78350f;">Tax: ₹${data.totalTax.toFixed(2)}</div>`; }
      }
      taxHtml += '</div></div>';
      return taxHtml;
    })()}

      <!-- Round Off -->
      ${data.roundOff && data.roundOff !== 0 ? `
      <div style="padding: 0 16px;">
        <div style="display: flex; justify-content: space-between; font-size: 12px; color: #6b7280; padding: 4px 0;">
          <span>Round Off</span>
          <span>${data.roundOff > 0 ? '+' : ''}${data.roundOff.toFixed(2)}</span>
        </div>
      </div>
      ` : ''}

      <!-- Payment Details -->
      <div style="padding: 0 16px 20px;">
        ${paymentHtml}
      </div>

      <!-- Footer -->
      <div style="text-align: center; padding: 12px 20px 20px; font-size: 12px; color: #9ca3af;">
        Thank you for your visit! 🙏
      </div>
    </div>
  `;
};

/**
 * Generate bill as image blob
 */
export const generateBillImage = async (data: BillImageData): Promise<Blob | null> => {
  try {
    // Create a temporary container for rendering
    const container = document.createElement('div');
    container.innerHTML = generateBillHtml(data);
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    document.body.appendChild(container);

    const billElement = container.querySelector('#bill-image-content') as HTMLElement;

    if (!billElement) {
      document.body.removeChild(container);
      return null;
    }

    // Generate image using html2canvas
    const canvas = await html2canvas(billElement, {
      scale: 2,
      backgroundColor: '#ffffff',
      logging: false,
      useCORS: true,
    });

    // Cleanup immediately to prevent memory leaks
    document.body.removeChild(container);

    // Convert canvas to blob
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png', 0.95);
    });
  } catch (error) {
    return null;
  }
};

/**
 * Share bill image via WhatsApp
 * Uses Web Share API if available, otherwise downloads image + opens WhatsApp chat
 */
export const shareBillImageViaWhatsApp = async (
  phoneNumber: string,
  data: BillImageData
): Promise<{ success: boolean; method: 'share' | 'download' | 'error'; error?: string }> => {
  try {
    const blob = await generateBillImage(data);

    if (!blob) {
      return { success: false, method: 'error', error: 'Failed to generate bill image' };
    }

    const file = new File([blob], `Bill_${data.billNo}.png`, { type: 'image/png' });

    // Try Web Share API first (works on mobile)
    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: `Bill #${data.billNo}`,
        text: `Bill from ${data.shopName} - ₹${data.total.toFixed(0)}`
      });
      return { success: true, method: 'share' };
    }

    // Fallback: Download the image  
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Bill_${data.billNo}.png`;
    link.click();
    URL.revokeObjectURL(url);

    // Open WhatsApp chat with cleaned phone number
    const cleanPhone = cleanPhoneForWhatsApp(phoneNumber);

    setTimeout(() => {
      // Try api.whatsapp.com first (more reliable)
      window.open(`https://api.whatsapp.com/send?phone=${cleanPhone}`, '_blank');
    }, 500);

    return { success: true, method: 'download' };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      // User cancelled share - not an error
      return { success: false, method: 'error', error: 'Share cancelled' };
    }
    return { success: false, method: 'error', error: error.message };
  }
};

/**
 * Clean phone number for WhatsApp - handles Indian numbers properly
 */
export const cleanPhoneForWhatsApp = (phoneNumber: string): string => {
  let cleanPhone = phoneNumber.replace(/[\s\-\(\)\+]/g, '');

  // If starts with 0, remove it 
  if (cleanPhone.startsWith('0')) {
    cleanPhone = cleanPhone.substring(1);
  }

  // 10-digit Indian number - add 91
  if (cleanPhone.length === 10 && /^[6-9]/.test(cleanPhone)) {
    cleanPhone = '91' + cleanPhone;
  }

  // If already has country code (starts with 91 and is 12 digits), keep as is
  // Otherwise just return what we have
  return cleanPhone;
};

export type { BillImageData };
