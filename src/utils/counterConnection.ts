export const COUNTER_HEARTBEAT_MS = 120_000;
export function counterConnectionState(lastSeen: string, now = Date.now()): 'connected' | 'not-seen' {
  const timestamp = Date.parse(lastSeen);
  return Number.isFinite(timestamp) && now - timestamp <= 5 * 60_000 ? 'connected' : 'not-seen';
}