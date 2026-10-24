import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Gift } from 'lucide-react';

interface LoyaltyBadgeProps {
  points: number;
  /** Optional: show how many rupees will be saved on redeem */
  redeemValue?: number;
  /** Whether redeem mode is active */
  redeeming?: boolean;
  onToggleRedeem?: () => void;
}

export function LoyaltyBadge({ points, redeemValue, redeeming, onToggleRedeem }: LoyaltyBadgeProps) {
  if (points <= 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Badge
        variant="secondary"
        className="bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 hover:bg-purple-200 cursor-default select-none flex items-center gap-1"
      >
        <Gift className="w-3 h-3" />
        {points} pts
        {redeemValue !== undefined && redeemValue > 0 && (
          <span className="ml-1 text-purple-600 dark:text-purple-400">(save ₹{redeemValue})</span>
        )}
      </Badge>
      {onToggleRedeem && redeemValue !== undefined && redeemValue > 0 && (
        <button
          type="button"
          onClick={onToggleRedeem}
          className={[
            'text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-all',
            redeeming
              ? 'bg-purple-600 text-white border-purple-600'
              : 'bg-transparent text-purple-700 dark:text-purple-300 border-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/30',
          ].join(' ')}
        >
          {redeeming ? '✓ Redeeming' : 'Redeem'}
        </button>
      )}
    </div>
  );
}
