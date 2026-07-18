import React, { useState, useCallback } from 'react';
import { useBranch } from '@/contexts/BranchContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000; // 1 minute lockout after max attempts

export const PinLockGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { operatingBranchId } = useBranch();
  const branchKey = (base: string) => operatingBranchId ? `${base}_${operatingBranchId}` : base;
  
  const savedPin = localStorage.getItem(branchKey('hotel_pos_reports_pin'));
  
  const [isLocked, setIsLocked] = useState(!!savedPin);
  const [pinInput, setPinInput] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);

  if (!isLocked) {
    return <>{children}</>;
  }

  const isLockedOut = Date.now() < lockedUntil;

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isLockedOut) {
      const secondsLeft = Math.ceil((lockedUntil - Date.now()) / 1000);
      toast({ title: `Locked out`, description: `Try again in ${secondsLeft}s`, variant: "destructive" });
      return;
    }
    
    if (pinInput === savedPin) {
      setIsLocked(false);
      setAttempts(0);
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPinInput('');
      
      if (newAttempts >= MAX_ATTEMPTS) {
        setLockedUntil(Date.now() + LOCKOUT_MS);
        setAttempts(0);
        toast({ title: "Too many attempts", description: "Locked for 1 minute.", variant: "destructive" });
      } else {
        toast({ title: "Incorrect PIN", description: `${MAX_ATTEMPTS - newAttempts} attempts remaining`, variant: "destructive" });
      }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-4 text-center">
      <div className="bg-white dark:bg-zinc-900 p-8 rounded-2xl shadow-xl max-w-sm w-full border border-zinc-200 dark:border-zinc-800">
        <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mx-auto mb-4">
          <Lock className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold mb-2">Restricted Access</h2>
        <p className="text-sm text-muted-foreground mb-6">Enter the 4-digit PIN to view this page.</p>
        
        <form onSubmit={handleUnlock} className="flex flex-col gap-4">
          <Input 
            type="password" 
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            autoFocus
            value={pinInput}
            onChange={e => {
              // Only allow digits
              const val = e.target.value.replace(/[^0-9]/g, '');
              setPinInput(val);
            }}
            className="text-center text-2xl tracking-[0.5em] font-mono h-14"
            placeholder="****"
            disabled={isLockedOut}
          />
          <Button type="submit" size="lg" className="w-full" disabled={isLockedOut}>
            {isLockedOut ? 'Locked' : 'Unlock'}
          </Button>
        </form>
      </div>
    </div>
  );
};
