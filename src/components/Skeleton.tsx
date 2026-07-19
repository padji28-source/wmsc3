import React from 'react';

interface SkeletonProps {
  className?: string;
  key?: any;
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div className={`animate-pulse bg-slate-200 rounded-md ${className}`} />
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-4 w-full">
      <div className="flex space-x-4">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex space-x-4 py-4">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton key={c} className="h-8 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-sm space-y-4">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-10 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
