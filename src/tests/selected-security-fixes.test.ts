import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('selected webhook authorization protections', () => {
  const dispatch = readFileSync('supabase/functions/webhook-dispatch/index.ts', 'utf8');
  it('requires the actual shop owner for user-initiated deliveries', () => {
    expect(dispatch).toContain("myRole !== 'admin' || myProfile !== myAdmin");
    expect(dispatch).toContain("rpc('get_my_profile_id')");
  });
  it('keeps test payloads and tenant identity controlled by the server', () => {
    expect(dispatch).toContain('adminId = myAdmin as string');
    expect(dispatch).toContain("event = 'test.ping'");
    expect(dispatch).toContain("payload = { test: true, message: 'ZenPOS test delivery' }");
  });
});