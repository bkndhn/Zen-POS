import { describe, it, expect } from 'vitest';
import { kitchenUrgency } from '@/utils/kitchenUrgency';

describe('kitchen colour stages', () => {
  it('green under 10 minutes', () => expect(kitchenUrgency(9)).toBe('green'));
  it('amber from 10 minutes', () => expect(kitchenUrgency(10)).toBe('orange'));
  it('red from 15 minutes', () => expect(kitchenUrgency(15)).toBe('red'));
});
