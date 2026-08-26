// Native-feel swipe-back gesture for navigating back.
// Detects a right-swipe from the left edge of the screen (like iOS/Android native)
// and triggers browser history.back().

import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { hapticTap } from '@/utils/haptics';

const EDGE_WIDTH = 30;       // px from left edge to start detecting
const SWIPE_THRESHOLD = 80;  // px distance to trigger back navigation
const ROOT_PATHS = ['/', '/dashboard', '/auth', '/billing'];

export const useSwipeBack = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let swiping = false;

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches?.[0];
      if (!touch) return;
      // Only activate if touch starts at the left edge
      if (touch.clientX <= EDGE_WIDTH) {
        startX = touch.clientX;
        startY = touch.clientY;
        swiping = true;
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!swiping) return;
      swiping = false;

      const touch = e.changedTouches?.[0];
      if (!touch) return;
      const deltaX = touch.clientX - startX;
      const deltaY = Math.abs(touch.clientY - startY);

      // Must swipe more horizontally than vertically, and past threshold
      if (deltaX > SWIPE_THRESHOLD && deltaX > deltaY * 1.5) {
        // Don't navigate back from root pages
        if (!ROOT_PATHS.includes(location.pathname)) {
          hapticTap();
          navigate(-1);
        }
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [navigate, location.pathname]);
};
