/**
 * Production-safe logger utility
 * Replaces console.log/error/warn with environment-aware logging
 * In production, only errors are logged (without sensitive data)
 */

const isDevelopment = import.meta.env.DEV;
const isDebugMode = import.meta.env.DEV && localStorage.getItem('debug_mode') === 'true';

// Sensitive keys that should never be logged
const SENSITIVE_KEYS = [
    'password', 'token', 'secret', 'key', 'authorization',
    'credit_card', 'card_number', 'cvv', 'pin', 'ssn'
];

// Redact sensitive data from objects
const redactSensitiveData = (obj: any): any => {
    if (typeof obj !== 'object' || obj === null) return obj;

    if (Array.isArray(obj)) {
        return obj.map(redactSensitiveData);
    }

    const redacted: any = {};
    for (const [key, value] of Object.entries(obj)) {
        const lowerKey = key.toLowerCase();
        if (SENSITIVE_KEYS.some(sensitive => lowerKey.includes(sensitive))) {
            redacted[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
            redacted[key] = redactSensitiveData(value);
        } else {
            redacted[key] = value;
        }
    }
    return redacted;
};

// Format log message
const formatMessage = (prefix: string, message: string, ...args: any[]): string[] => {
    const timestamp = new Date().toISOString();
    const safeArgs = args.map(arg =>
        typeof arg === 'object' ? redactSensitiveData(arg) : arg
    );
    return [`[${timestamp}] ${prefix} ${message}`, ...safeArgs];
};

export const logger = {
    /**
     * Debug logging - only in development
     */
    debug: (message: string, ...args: any[]): void => {
        if (isDevelopment || isDebugMode) {
            console.log(...formatMessage('DEBUG', message, ...args));
        }
    },

    /**
     * Info logging - development only, silent in production
     */
    info: (message: string, ...args: any[]): void => {
        if (isDevelopment) {
            console.log(...formatMessage('INFO', message, ...args));
        }
    },

    /**
     * Warning logging - always logged but sanitized in production
     */
    warn: (message: string, ...args: any[]): void => {
        if (isDevelopment) {
            console.warn(...formatMessage('WARN', message, ...args));
        } else {
            // In production, only log the message without potentially sensitive args
            console.warn(`[WARN] ${message}`);
        }
    },

    /**
     * Error logging - always logged with stack trace, sanitized in production
     */
    error: (message: string, error?: Error | any, ...args: any[]): void => {
        if (isDevelopment) {
            console.error(...formatMessage('ERROR', message, error, ...args));
        } else {
            // In production, log error message but redact details
            const errorMsg = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[ERROR] ${message}: ${errorMsg}`);
        }
    },

    /**
     * Security event logging - always logged with timestamp
     */
    security: (event: string, details: Record<string, any> = {}): void => {
        const safeDetails = redactSensitiveData(details);
        console.warn(`[SECURITY] ${event}`, {
            timestamp: new Date().toISOString(),
            environment: isDevelopment ? 'development' : 'production',
            ...safeDetails
        });
    },

    /**
     * Performance logging - development only
     */
    perf: (label: string, startTime: number): void => {
        if (isDevelopment) {
            const duration = Date.now() - startTime;
            console.log(`[PERF] ${label}: ${duration}ms`);
        }
    },

    /**
     * Network request logging - development only
     */
    network: (method: string, url: string, status?: number): void => {
        if (isDevelopment) {
            const statusStr = status ? `[${status}]` : '[pending]';
            console.log(`[NETWORK] ${method} ${url} ${statusStr}`);
        }
    }
};

// Export a simpler log function for quick debugging
export const log = isDevelopment ? console.log.bind(console) : () => { };

export default logger;
