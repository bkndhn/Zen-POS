/**
 * Z-Report ESC/POS generator — prints the end-of-day report on a real
 * thermal printer through the native Bluetooth bridge (Capacitor) with the
 * same conventions used by receipts and KOTs.
 */

import { printerManager } from './printerManager';

export interface ZReportPrintData {
  branchName: string;
  date: string;
  totalBills: number;
  totalAmount: number;
  openingCash?: number | null;
  expectedCash?: number | null;
  actualCash?: number | null;
  variance?: number | null;
  paymentTotals: Record<string, number>;
}

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);

const INIT = new Uint8Array([0x1b, 0x40]);
const ALIGN_CENTER = new Uint8Array([0x1b, 0x61, 0x01]);
const ALIGN_LEFT = new Uint8Array([0x1b, 0x61, 0x00]);
const BOLD_ON = new Uint8Array([0x1b, 0x45, 0x01]);
const BOLD_OFF = new Uint8Array([0x1b, 0x45, 0x00]);
const DOUBLE_SIZE = new Uint8Array([0x1d, 0x21, 0x11]);
const NORMAL_SIZE = new Uint8Array([0x1d, 0x21, 0x00]);
const FEED_LINE = new Uint8Array([0x0a]);
const CUT = new Uint8Array([0x1d, 0x56, 0x42, 0x00]);

const money = (n: number) => `Rs ${Number(n || 0).toFixed(2)}`;

const row = (left: string, right: string, width: number): string => {
  const l = left.length + right.length > width ? left.slice(0, Math.max(0, width - right.length - 1)) : left;
  const pad = Math.max(1, width - l.length - right.length);
  return `${l}${' '.repeat(pad)}${right}`;
};

export const buildZReportBytes = (data: ZReportPrintData, printerWidth: '58mm' | '80mm' = '58mm'): Uint8Array => {
  const LINE = printerWidth === '80mm' ? 48 : 32;
  const SEP = '-'.repeat(LINE);
  const chunks: Uint8Array[] = [];

  chunks.push(INIT, ALIGN_CENTER, BOLD_ON, DOUBLE_SIZE);
  chunks.push(bytes('Z-REPORT'), FEED_LINE);
  chunks.push(NORMAL_SIZE);
  chunks.push(bytes(data.branchName || ''), FEED_LINE);
  chunks.push(BOLD_OFF, ALIGN_LEFT);
  chunks.push(bytes(SEP), FEED_LINE);

  chunks.push(bytes(`Date: ${data.date}`), FEED_LINE);
  chunks.push(bytes(row('Total Bills', String(data.totalBills), LINE)), FEED_LINE);
  chunks.push(bytes(SEP), FEED_LINE);

  for (const [mode, amount] of Object.entries(data.paymentTotals || {})) {
    if (!amount) continue;
    chunks.push(bytes(row(mode.toUpperCase(), money(amount), LINE)), FEED_LINE);
  }

  chunks.push(bytes(SEP), FEED_LINE);
  chunks.push(BOLD_ON);
  chunks.push(bytes(row('TOTAL SALES', money(data.totalAmount), LINE)), FEED_LINE);
  chunks.push(BOLD_OFF);

  if (data.openingCash != null || data.expectedCash != null || data.actualCash != null) {
    chunks.push(bytes(SEP), FEED_LINE);
    if (data.openingCash != null) chunks.push(bytes(row('Opening Cash', money(data.openingCash), LINE)), FEED_LINE);
    if (data.expectedCash != null) chunks.push(bytes(row('Expected Cash', money(data.expectedCash), LINE)), FEED_LINE);
    if (data.actualCash != null) chunks.push(bytes(row('Actual Cash', money(data.actualCash), LINE)), FEED_LINE);
    if (data.variance != null) chunks.push(bytes(row('Variance', money(data.variance), LINE)), FEED_LINE);
  }

  chunks.push(bytes(SEP), FEED_LINE);
  chunks.push(ALIGN_CENTER, bytes('END OF REPORT'), FEED_LINE, FEED_LINE, FEED_LINE);
  chunks.push(CUT);

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
};

/** Try native thermal printing. Returns false so callers can fall back to browser print. */
export const printZReportThermal = async (data: ZReportPrintData): Promise<boolean> => {
  try {
    const width = (localStorage.getItem('hotel_pos_printer_width') === '80mm' ? '80mm' : '58mm') as '58mm' | '80mm';
    const payload = buildZReportBytes(data, width);
    return await printerManager.printRawBytes(payload);
  } catch (err) {
    console.warn('[ZReport] thermal print failed, falling back to browser print:', err);
    return false;
  }
};
