export async function runBounded<T>(items: T[], concurrency: number, work: (item: T) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(items.length, Math.max(1, Math.floor(concurrency))) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await work(item);
    }
  }));
}

export function shouldRetryPush(status: number, result: { failureCount?: number; successCount?: number; errors?: { status?: number }[] }) {
  // Never replay a partial success: that would duplicate deliveries to successful devices.
  if ((result.successCount ?? 0) > 0) return false;
  if (status === 429 || status >= 500) return true;
  return (result.failureCount ?? 0) > 0 && (result.errors ?? []).some(e => e.status === 429 || (e.status ?? 0) >= 500);
}