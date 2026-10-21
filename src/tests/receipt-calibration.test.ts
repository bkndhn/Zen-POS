import { describe, expect, it } from 'vitest';
import { buildAlignmentTicket, calibrationCommands, normalizeCalibration } from '@/utils/receiptCalibration';

describe('receipt paper calibration', () => {
  it('uses 32 columns on 58mm and 48 on 80mm paper', () => {
    expect(calibrationCommands(normalizeCalibration({ width: '58mm' })).columns).toBe(32);
    expect(calibrationCommands(normalizeCalibration({ width: '80mm' })).columns).toBe(48);
  });

  it('keeps the left margin between 0 and 4 characters', () => {
    expect(normalizeCalibration({ leftMarginChars: 9 }).leftMarginChars).toBe(4);
    expect(normalizeCalibration({ leftMarginChars: -2 }).leftMarginChars).toBe(0);
    expect(calibrationCommands(normalizeCalibration({ width: '58mm', leftMarginChars: 2 })).columns).toBe(30);
  });

  it('keeps feed lines between 1 and 8, default 3', () => {
    expect(normalizeCalibration({}).feedLines).toBe(3);
    expect(normalizeCalibration({ feedLines: 20 }).feedLines).toBe(8);
    expect(normalizeCalibration({ feedLines: 0 }).feedLines).toBe(1);
  });

  it('sends no cut command when the cashier tears by hand', () => {
    const tear = calibrationCommands(normalizeCalibration({ cutMode: 'none' })).finish;
    const partial = calibrationCommands(normalizeCalibration({ cutMode: 'partial' })).finish;
    expect(Array.from(tear)).not.toContain(0x56);
    expect(Array.from(partial.slice(-3))).toEqual([0x1d, 0x56, 1]);
  });

  it('feeds paper past the footer before cutting the test ticket', () => {
    const ticket = Array.from(buildAlignmentTicket(normalizeCalibration({ feedLines: 5, cutMode: 'full' })));
    expect(ticket.slice(-6)).toEqual([0x1b, 0x64, 5, 0x1d, 0x56, 0]);
  });
});
