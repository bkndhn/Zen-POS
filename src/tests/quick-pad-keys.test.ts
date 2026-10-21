import { describe, it, expect } from 'vitest';
import { mapPadKey } from '@/components/QuickCounterPad';

describe('physical numpad keys', () => {
  it('Enter cashes and prints', () => expect(mapPadKey('Enter')).toBe('enter'));
  it('Escape clears', () => expect(mapPadKey('Escape')).toBe('clear'));
  it('Backspace deletes a digit', () => expect(mapPadKey('Backspace')).toBe('back'));
  it('digits and + pass through', () => { expect(mapPadKey('7')).toBe('7'); expect(mapPadKey('+')).toBe('+'); });
  it('letters are ignored', () => expect(mapPadKey('a')).toBeNull());
});
