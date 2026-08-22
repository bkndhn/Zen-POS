/**
 * Payment gateway script loaders.
 * Keeps third-party SDK bootstrapping in one place so pages/components
 * never inject <script> tags ad-hoc.
 */

const RAZORPAY_SRC = 'https://checkout.razorpay.com/v1/checkout.js';

let razorpayPromise: Promise<boolean> | null = null;

/** Loads the Razorpay Checkout SDK once and resolves true when ready. */
export const loadRazorpayScript = (): Promise<boolean> => {
    if (typeof window === 'undefined') return Promise.resolve(false);
    if ((window as any).Razorpay) return Promise.resolve(true);
    if (razorpayPromise) return razorpayPromise;

    razorpayPromise = new Promise<boolean>((resolve) => {
        const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SRC}"]`);
        if (existing) {
            existing.addEventListener('load', () => resolve(true));
            existing.addEventListener('error', () => resolve(false));
            return;
        }
        const script = document.createElement('script');
        script.src = RAZORPAY_SRC;
        script.async = true;
        script.onload = () => resolve(true);
        script.onerror = () => {
            razorpayPromise = null;
            resolve(false);
        };
        document.body.appendChild(script);
    });

    return razorpayPromise;
};
