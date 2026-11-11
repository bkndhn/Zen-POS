import { Star, Gift } from 'lucide-react';

interface LoyaltyData {
  enabled: boolean;
  stamps_count: number;
  total_orders: number;
  free_items_available: number;
  stamps_required: number;
  reward_description?: string;
}

interface LoyaltyStampCardProps {
  loyalty: LoyaltyData;
  primaryColor?: string;
  compact?: boolean;
}

export const LoyaltyStampCard = ({ loyalty, primaryColor, compact = false }: LoyaltyStampCardProps) => {
  if (!loyalty.enabled) return null;

  const color = primaryColor || '#ea580c';
  const stamps = loyalty.stamps_count ?? 0;
  const required = loyalty.stamps_required || 10;
  const hasFreeItem = (loyalty.free_items_available ?? 0) > 0;
  const progressPct = Math.round((stamps / required) * 100);

  return (
    <div
      className={`rounded-2xl border relative overflow-hidden transition-all ${compact ? 'p-3' : 'p-4'}`}
      style={{
        background: hasFreeItem
          ? `linear-gradient(135deg, ${color}18, ${color}06)`
          : `linear-gradient(135deg, ${color}08, transparent)`,
        borderColor: hasFreeItem ? `${color}35` : `${color}18`,
      }}
    >
      {/* Background deco */}
      <div
        className="absolute top-0 right-0 w-28 h-28 rounded-full pointer-events-none"
        style={{ background: color, opacity: 0.04, transform: 'translate(35%, -35%)' }}
      />

      {/* Header */}
      <div className={`flex items-start justify-between ${compact ? 'mb-2' : 'mb-3'}`}>
        <div>
          <div className="flex items-center gap-1.5">
            <Star className="w-4 h-4 flex-shrink-0" style={{ color }} />
            <span className="font-black text-sm text-gray-800 dark:text-gray-100">
              Loyalty Card
            </span>
          </div>
          {hasFreeItem ? (
            <p className="text-xs font-semibold mt-0.5" style={{ color }}>
              🎁 {loyalty.free_items_available} free item{loyalty.free_items_available > 1 ? 's' : ''} waiting!
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {required - stamps} more order{required - stamps !== 1 ? 's' : ''} to earn a free item
            </p>
          )}
        </div>

        {hasFreeItem ? (
          <div
            className="flex items-center gap-1 px-2.5 py-1 rounded-full text-white text-xs font-bold shadow-sm"
            style={{ background: color }}
          >
            <Gift className="w-3 h-3" />
            Free!
          </div>
        ) : (
          <span className="text-xs font-bold tabular-nums" style={{ color }}>
            {stamps}/{required}
          </span>
        )}
      </div>

      {/* Stamp dots */}
      {!compact && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {Array.from({ length: required }).map((_, i) => {
            const filled = i < stamps;
            return (
              <div
                key={i}
                className="w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-200"
                style={{
                  borderColor: filled ? color : `${color}25`,
                  background: filled ? color : 'transparent',
                  transform: filled ? 'scale(1.08)' : 'scale(1)',
                }}
              >
                {filled && <Star className="w-3 h-3 text-white" fill="currentColor" />}
              </div>
            );
          })}
        </div>
      )}

      {/* Progress bar (compact mode) */}
      {compact && (
        <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700 mb-1">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progressPct}%`, background: color }}
          />
        </div>
      )}

      {/* Reward description */}
      {loyalty.reward_description && (
        <p className="text-[10px] text-gray-400 dark:text-gray-500">
          🏆 Reward: {loyalty.reward_description}
        </p>
      )}
    </div>
  );
};
