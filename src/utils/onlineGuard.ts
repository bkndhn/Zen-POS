export class OnlineRequiredError extends Error {
  readonly code = 'ONLINE_REQUIRED';

  constructor(action = 'This action') {
    super(`${action} requires an internet connection. Your offline data is unchanged.`);
    this.name = 'OnlineRequiredError';
  }
}

export function requireOnline(action?: string): void {
  if (!navigator.onLine) throw new OnlineRequiredError(action);
}

export function isOnlineRequiredError(error: unknown): error is OnlineRequiredError {
  return error instanceof OnlineRequiredError
    || (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ONLINE_REQUIRED');
}