import React from 'react';
import { Badge } from '@/components/ui/badge';

interface LoyaltyBadgeProps {
  points: number;
}

export function LoyaltyBadge({ points }: LoyaltyBadgeProps) {
  if (points <= 0) return null;
  return (
    <div className="flex items-center gap-2 mt-2">
      <Badge variant="secondary" className="bg-purple-100 text-purple-800 hover:bg-purple-200">
        🎁 {points} pts (₹{points} discount available)
      </Badge>
    </div>
  );
}
