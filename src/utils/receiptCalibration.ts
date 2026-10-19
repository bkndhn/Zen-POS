export interface ReceiptCalibration {
  width: '58mm' | '80mm';
  leftMarginChars: number;
  feedLines: number;
  cutMode: 'full' | 'partial' | 'none';
}

const KEY = 'zenpos_receipt_calibration';
const clamp = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;

export function normalizeCalibration(value: Partial<ReceiptCalibration> = {}): ReceiptCalibration {
  return {
    width: value.width === '80mm' ? '80mm' : '58mm',
    leftMarginChars: clamp(value.leftMarginChars, 0, 0, 4),
    feedLines: clamp(value.feedLines, 3, 1, 8),
    cutMode: value.cutMode === 'none' || value.cutMode === 'partial' ? value.cutMode : 'full',
  };
}

export function getReceiptCalibration(): ReceiptCalibration {
  try {
    const saved = localStorage.getItem(KEY);
    return normalizeCalibration(saved ? JSON.parse(saved) : { cutMode: localStorage.getItem('hotel_pos_auto_cut') === 'false' ? 'none' : 'full' });
  } catch { return normalizeCalibration(); }
}

export function saveReceiptCalibration(value: ReceiptCalibration): void {
  const normalized = normalizeCalibration(value);
  localStorage.setItem(KEY, JSON.stringify(normalized));
  localStorage.setItem('hotel_pos_auto_cut', String(normalized.cutMode !== 'none'));
}

export function calibrationCommands(value: ReceiptCalibration) {
  const c = normalizeCalibration(value);
  const columns = c.width === '80mm' ? 48 : 32;
  const marginDots = c.leftMarginChars * 12;
  const areaDots = (columns - c.leftMarginChars) * 12;
  return {
    columns: columns - c.leftMarginChars,
    setup: new Uint8Array([0x1d, 0x4c, marginDots & 255, marginDots >> 8, 0x1d, 0x57, areaDots & 255, areaDots >> 8]),
    finish: new Uint8Array([0x1b, 0x64, c.feedLines, ...(c.cutMode === 'none' ? [] : [0x1d, 0x56, c.cutMode === 'partial' ? 1 : 0])]),
  };
}

export function buildAlignmentTicket(value: ReceiptCalibration): Uint8Array {
  const c = normalizeCalibration(value);
  const { columns, setup, finish } = calibrationCommands(c);
  const line = '|'.concat('-'.repeat(columns - 2), '|');
  const text = new TextEncoder().encode(`ZenPOS ${c.width} TEST\n${line}\nLEFT${' '.repeat(columns - 9)}RIGHT\nItem             Qty     Value\nTea                2     20.00\nTOTAL                    20.00\n${line}\nFooter visible before tear\n`);
  return new Uint8Array([0x1b, 0x40, ...setup, ...text, ...finish]);
}