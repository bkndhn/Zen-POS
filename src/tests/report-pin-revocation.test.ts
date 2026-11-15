import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';

const migrations = readdirSync('supabase/migrations').sort();
const latestDefinition = (name: string) => {
  for (const file of [...migrations].reverse()) {
    const sql = readFileSync(`supabase/migrations/${file}`, 'utf8');
    const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'));
    if (match) return match[0];
  }
  throw new Error(`Missing function ${name}`);
};

describe('report PIN revocation safeguards', () => {
  const setter = latestDefinition('set_report_pin');
  const verifier = latestDefinition('verify_report_pin');

  it('revokes tenant unlocks before both replacement and removal', () => {
    expect(setter).toContain('DELETE FROM private.report_pin_unlocks u USING public.profiles p');
    expect(setter).toContain('u.user_id = p.user_id AND (p.id = v_admin OR p.admin_id = v_admin)');
    expect(setter.indexOf('DELETE FROM private.report_pin_unlocks')).toBeLessThan(setter.indexOf('DELETE FROM private.report_pins'));
    expect(setter.indexOf('DELETE FROM private.report_pin_unlocks')).toBeLessThan(setter.indexOf('INSERT INTO private.report_pins'));
  });

  it('serializes verification with PIN updates before reading the PIN', () => {
    const lock = "PERFORM pg_advisory_xact_lock(hashtextextended('report-pin:' || v_admin::text, 0))";
    expect(setter).toContain(lock);
    expect(verifier).toContain(lock);
    expect(verifier.indexOf(lock)).toBeLessThan(verifier.indexOf('SELECT pin_hash'));
    expect(setter.indexOf(lock)).toBeLessThan(setter.indexOf('DELETE FROM private.report_pin_unlocks'));
  });

  it('retains owner checks, fixed search paths and bounded unlocks', () => {
    expect(setter).toContain('NOT public.is_admin_or_super()');
    expect(verifier).toContain('auth.uid() IS NULL');
    for (const fn of [setter, verifier]) expect(fn).toContain('SET search_path = public, private, extensions');
    expect(verifier).toContain("now() + interval '12 hours'");
  });
});