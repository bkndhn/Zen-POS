// Reusable skeleton loader components for native-feel loading states.
// These show animated placeholder shapes while content loads, instead of spinners.

import React from 'react';

/** Card-shaped skeleton — for dashboard stats, item cards */
export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-card rounded-2xl border p-4 animate-pulse ${className}`}>
    <div className="flex items-center gap-3 mb-3">
      <div className="w-10 h-10 rounded-xl bg-muted" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-muted rounded w-2/3" />
        <div className="h-2 bg-muted rounded w-1/3" />
      </div>
    </div>
    <div className="h-6 bg-muted rounded w-1/2" />
  </div>
);

/** Row-shaped skeleton — for list items, bills, expenses */
export const SkeletonRow: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex items-center gap-3 p-3 animate-pulse ${className}`}>
    <div className="w-10 h-10 rounded-lg bg-muted flex-shrink-0" />
    <div className="flex-1 space-y-2">
      <div className="h-3 bg-muted rounded w-3/4" />
      <div className="h-2 bg-muted rounded w-1/2" />
    </div>
    <div className="h-5 bg-muted rounded w-14" />
  </div>
);

/** Grid of skeleton cards — for items page, dashboard */
export const SkeletonGrid: React.FC<{ count?: number; className?: string }> = ({ count = 6, className = '' }) => (
  <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);

/** List of skeleton rows — for bills, expenses, reports */
export const SkeletonList: React.FC<{ count?: number; className?: string }> = ({ count = 5, className = '' }) => (
  <div className={`space-y-1 p-2 ${className}`}>
    {Array.from({ length: count }).map((_, i) => (
      <SkeletonRow key={i} />
    ))}
  </div>
);

/** Full-page skeleton — shows a complete page placeholder */
export const SkeletonPage: React.FC = () => (
  <div className="p-4 space-y-4 animate-pulse">
    {/* Header area */}
    <div className="flex items-center justify-between">
      <div className="h-6 bg-muted rounded w-1/3" />
      <div className="h-8 bg-muted rounded-lg w-20" />
    </div>
    {/* Stats row */}
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-card border rounded-xl p-3 space-y-2">
          <div className="h-2 bg-muted rounded w-2/3" />
          <div className="h-5 bg-muted rounded w-1/2" />
        </div>
      ))}
    </div>
    {/* Content rows */}
    <SkeletonList count={6} />
  </div>
);
