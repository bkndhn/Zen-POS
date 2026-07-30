import { useEffect, useRef } from 'react';

interface UseBarcodeScannerProps {
  onScan: (barcode: string) => void;
  minDuration?: number; // Maximum time between keystrokes to be considered a scanner (ms)
}

export function useBarcodeScanner({ onScan, minDuration = 50 }: UseBarcodeScannerProps) {
  const buffer = useRef('');
  const lastKeyTime = useRef(Date.now());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input/textarea
      if (
        e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }

      const now = Date.now();
      const elapsed = now - lastKeyTime.current;
      
      // If the time between keystrokes is too long, assume human typing and reset
      if (elapsed > minDuration) {
        buffer.current = '';
      }

      if (e.key === 'Enter') {
        if (buffer.current.length > 0) {
          onScan(buffer.current);
          buffer.current = '';
        }
      } else if (e.key.length === 1) { // Only capture printable characters
        buffer.current += e.key;
      }
      
      lastKeyTime.current = now;
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onScan, minDuration]);
}
