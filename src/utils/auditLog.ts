import { supabase } from '@/integrations/supabase/client';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export type AuditEventType =
  | 'auth'
  | 'authorization'
  | 'data'
  | 'settings'
  | 'billing'
  | 'session';

export interface AuditEventInput {
  eventType: AuditEventType;
  action: string;
  severity?: AuditSeverity;
  targetTable?: string;
  targetRecordId?: string;
  details?: Record<string, unknown>;
}

/**
 * Records a security-relevant event in the server-side audit trail.
 * Never throws — auditing must never break a user flow.
 */
export const logSecurityEvent = async (input: AuditEventInput): Promise<void> => {
  try {
    const { error } = await supabase.rpc('log_security_event', {
      p_event_type: input.eventType,
      p_action: input.action,
      p_severity: input.severity || 'info',
      p_target_table: input.targetTable ?? null,
      p_target_record_id: input.targetRecordId ?? null,
      p_details: {
        ...(input.details || {}),
        client: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 180) : 'unknown',
        at: new Date().toISOString(),
      } as any,
    } as any);

    if (error && import.meta.env.DEV) {
      console.warn('[Audit] failed to log event', input.action, error.message);
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Audit] logging error', e);
  }
};

/** Fire-and-forget variant for hot paths. */
export const auditFireAndForget = (input: AuditEventInput): void => {
  void logSecurityEvent(input);
};

/** Reads the current user's session epoch (bumped on role/status changes). */
export const fetchSecurityEpoch = async (): Promise<number | null> => {
  try {
    const { data, error } = await supabase.rpc('get_my_security_epoch' as any);
    if (error) return null;
    return typeof data === 'number' ? data : null;
  } catch {
    return null;
  }
};
