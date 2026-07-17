import React, { useState, useRef, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

export const PullToRefresh: React.FC<{ children: React.ReactNode; onRefresh?: () => Promise<void> }> = ({ children, onRefresh }) => {
  const [isPulling, setIsPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const pullStartY = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only allow pull if we are at the very top of the scroll container
    if (scrollContainerRef.current && scrollContainerRef.current.scrollTop <= 1) {
      pullStartY.current = e.touches[0].clientY;
      setIsPulling(true);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isPulling || isRefreshing) return;
    
    const y = e.touches[0].clientY;
    const distance = y - pullStartY.current;
    
    // Only drag down if we started at top and are moving down
    if (distance > 0 && scrollContainerRef.current && scrollContainerRef.current.scrollTop <= 1) {
      // Damping the pull distance
      const progress = Math.min((distance * 0.4) / 60, 1);
      setPullProgress(progress);
      
      // Prevent default scrolling when pulling to refresh
      if (e.cancelable && distance > 10) {
        e.preventDefault();
      }
    } else if (distance < 0) {
      // If user scrolls down, cancel pull
      setIsPulling(false);
      setPullProgress(0);
    }
  };

  const handleTouchEnd = async () => {
    if (!isPulling) return;
    
    if (pullProgress > 0.8) {
      setIsRefreshing(true);
      if (onRefresh) {
        await onRefresh();
      } else {
        window.location.reload();
      }
      // Assuming reload happens, the component will unmount.
      // If it's a custom promise, we await it then stop refreshing.
      setIsRefreshing(false);
    }
    
    setIsPulling(false);
    setPullProgress(0);
  };

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden">
      {/* Pull indicator */}
      <div 
        className="absolute top-0 left-0 right-0 flex justify-center items-center z-50 pointer-events-none"
        style={{ 
          height: isRefreshing ? '60px' : `${pullProgress * 60}px`,
          opacity: pullProgress > 0.1 || isRefreshing ? 1 : 0,
          transition: isPulling ? 'none' : 'height 0.3s ease-out, opacity 0.3s'
        }}
      >
        <div 
          className={`bg-background shadow-md rounded-full p-2 flex items-center justify-center transition-transform ${isRefreshing ? 'animate-spin' : ''}`}
          style={{ transform: `rotate(${pullProgress * 360}deg)` }}
        >
          <RefreshCw className="w-5 h-5 text-primary" />
        </div>
      </div>
      
      {/* Content wrapper */}
      <div 
        ref={scrollContainerRef}
        className="flex-1 w-full h-full overflow-y-auto overscroll-y-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ 
          transform: `translateY(${isRefreshing ? 60 : (isPulling ? pullProgress * 60 : 0)}px)`,
          transition: isPulling ? 'none' : 'transform 0.3s ease-out'
        }}
      >
        {children}
      </div>
    </div>
  );
};
