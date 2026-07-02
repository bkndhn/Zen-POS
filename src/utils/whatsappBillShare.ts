/**
 * WhatsApp Bill Sharing Utilities
 */

import { getShortUnit } from '@/utils/timeUtils';

interface BillShareData {
  billNo: string;
  shopName: string;
  items: Array<{ name: string; quantity: number; total: number; unit?: string; price?: number; base_value?: number; selling_unit?: string; selling_quantity?: number }>;
  subtotal: number;
  discount?: number;
  additionalCharges?: Array<{ name: string; amount: number }>;
  total: number;
  date: string;
  time: string;
  paymentMethod: string;
  // GST fields
  gstin?: string;
  taxSummary?: string;
  totalTax?: number;
  isComposition?: boolean;
  roundOff?: number;
  orderType?: 'dine_in' | 'parcel';
  customerName?: string;
}

/**
 * Format bill data into a clean text message for WhatsApp
 */
export const formatBillMessage = (data: BillShareData): string => {
  let message = '';
  if (data.customerName) {
    message += `Hi *${data.customerName}*,\n`;
  }
  message += `🧾 *${data.shopName}*\n`;
  message += `━━━━━━━━━━━━━━\n`;
  message += `📋 Bill #${data.billNo}\n`;
  message += `📅 ${data.date} | ${data.time}\n`;
  if (data.gstin) {
    message += `🏢 GSTIN: ${data.gstin}\n`;
  }
  if (data.orderType) {
    message += `📋 Type: ${data.orderType === 'parcel' ? '📦 PARCEL' : '🍽️ DINE IN'}\n`;
  }
  message += `━━━━━━━━━━━━━━\n\n`;

  // Items
  message += `*Items:*\n`;
  data.items.forEach((item) => {
    const shortUnit = getShortUnit(item.selling_unit || item.unit);
    const qty = `${item.quantity} ${shortUnit}`;
    const rateVal = item.price ?? (item.total / (item.quantity || 1));
    const baseVal = item.selling_quantity || item.base_value;
    const baseValStr = baseVal && baseVal !== 1 ? `${baseVal}` : '';
    const rateText = `₹${rateVal.toFixed(0)}/${baseValStr}${shortUnit}`;
    message += `• ${item.name} (${qty} @ ${rateText}) - ₹${item.total.toFixed(0)}\n`;
  });

  message += `\n━━━━━━━━━━━━━━\n`;
  message += `Subtotal: ₹${data.subtotal.toFixed(0)}\n`;

  // Additional charges
  if (data.additionalCharges && data.additionalCharges.length > 0) {
    data.additionalCharges.forEach(charge => {
      message += `${charge.name}: ₹${charge.amount.toFixed(0)}\n`;
    });
  }

  // Discount
  if (data.discount && data.discount > 0) {
    message += `Discount: -₹${data.discount.toFixed(0)}\n`;
  }

  message += `━━━━━━━━━━━━━━\n`;

  // Tax details
  if (data.totalTax && data.totalTax > 0) {
    if (data.isComposition) {
      message += `Tax (Comp): ₹${data.totalTax.toFixed(2)}\n`;
    } else {
      try {
        const summary = data.taxSummary ? JSON.parse(data.taxSummary) : null;
        const entries = summary?.entries || [];
        // Try entries[] format (raw BillTaxSummary)
        const parseEntries = entries.length > 0 ? entries : (() => {
          if (summary && typeof summary === 'object') {
            return Object.keys(summary).filter(k => !isNaN(parseFloat(k))).map(rate => ({
              taxName: summary[rate].taxName || `GST ${rate}%`,
              taxRate: parseFloat(rate),
              taxableAmount: summary[rate].taxable || 0,
              cgst: summary[rate].cgst || 0,
              sgst: summary[rate].sgst || 0
            }));
          }
          return [];
        })();
        if (parseEntries.length > 0) {
          message += `\n──────────────\n`;
          parseEntries.forEach((entry: any) => {
            const name = entry.taxName || `GST ${entry.taxRate}%`;
            message += `${name}  Taxable: ₹${(entry.taxableAmount || 0).toFixed(2)}\n`;
            message += `  CGST: ₹${(entry.cgst || 0).toFixed(2)}  SGST: ₹${(entry.sgst || 0).toFixed(2)}\n`;
          });
        } else {
          const halfTax = data.totalTax / 2;
          message += `CGST: ₹${halfTax.toFixed(2)}\n`;
          message += `SGST: ₹${halfTax.toFixed(2)}\n`;
        }
      } catch {
        message += `Tax: ₹${data.totalTax.toFixed(2)}\n`;
      }
    }
  }

  // Round Off
  if (data.roundOff && data.roundOff !== 0) {
    const sign = data.roundOff > 0 ? '+' : '';
    message += `Round Off: ${sign}₹${data.roundOff.toFixed(2)}\n`;
  }

  message += `━━━━━━━━━━━━━━\n`;
  message += `*TOTAL: ₹${data.total.toFixed(0)}*\n`;
  message += `Paid via: ${data.paymentMethod}\n\n`;
  message += `Thank you for your visit, ${data.customerName || 'Customer'}! 🙏`;

  return message;
};

/**
 * Open WhatsApp with pre-filled message (Direct/Manual method)
 * Uses api.whatsapp.com/send which is more reliable than wa.me
 */
export const shareViaWhatsApp = (phoneNumber: string, message: string): void => {
  const cleanPhone = cleanPhoneNumber(phoneNumber);
  const encodedMessage = encodeURIComponent(message);

  // api.whatsapp.com/send is more reliable than wa.me for opening WhatsApp
  const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMessage}`;
  window.open(whatsappUrl, '_blank');
};

/**
 * Clean phone number for WhatsApp - handles Indian numbers
 */
const cleanPhoneNumber = (phone: string): string => {
  let cleaned = phone.replace(/[\s\-\(\)\+]/g, '');

  // Remove leading 0
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }

  // 10-digit Indian mobile starting with 6-9 -> add 91
  if (cleaned.length === 10 && /^[6-9]/.test(cleaned)) {
    cleaned = '91' + cleaned;
  }

  return cleaned;
};

/**
 * Send via WhatsApp Business API (Automatic method)
 * This is a placeholder - actual implementation requires edge function
 */
export const sendViaBusinessApi = async (
  phoneNumber: string,
  message: string,
  apiToken: string,
  phoneNumberId: string
): Promise<{ success: boolean; error?: string }> => {
  // This would call an edge function to send via Meta's API
  // For now, return a placeholder response
  console.log('WhatsApp Business API send requested', { phoneNumber, phoneNumberId });

  return {
    success: false,
    error: 'WhatsApp Business API integration coming soon. Please use direct WhatsApp for now.'
  };
};

/**
 * Validate phone number format
 */
export const isValidPhoneNumber = (phone: string): boolean => {
  const cleaned = phone.replace(/[\s\-\(\)\+]/g, '');
  // Indian mobile: 10 digits starting with 6-9
  // Or with country code: 91 + 10 digits
  return /^(91)?[6-9]\d{9}$/.test(cleaned) || /^[6-9]\d{9}$/.test(cleaned);
};
