import { useEffect, type RefObject } from 'react';

/**
 * Sizes `ref` so it runs from its own top edge down to the top of the mobile
 * bottom navigation (or the bottom of the screen when that bar is hidden).
 * Measures the real elements instead of guessing heights, so it fits any phone or tablet.
 */
export function useFillToBottom(ref: RefObject<HTMLElement>, enabled: boolean, gap = 6) {
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) {
      if (el) el.style.height = '';
      return;
    }

    const findNav = () => {
      const nav = document.querySelector<HTMLElement>('nav[aria-label="Primary"]');
      if (!nav) return null;
      const r = nav.getBoundingClientRect();
      return getComputedStyle(nav).display !== 'none' && r.height > 0 ? nav : null;
    };

    const update = () => {
      const top = el.getBoundingClientRect().top + window.scrollY;
      const viewportH = window.visualViewport?.height ?? window.innerHeight;
      const nav = findNav();
      const bottom = nav ? nav.getBoundingClientRect().top + window.scrollY : viewportH + window.scrollY;
      el.style.height = `${Math.max(320, Math.floor(bottom - top - gap))}px`;
    };

    update();
    const raf = requestAnimationFrame(update);
    const ro = new ResizeObserver(update);
    const nav = findNav();
    if (nav) ro.observe(nav);
    if (el.parentElement) ro.observe(el.parentElement);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.visualViewport?.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.visualViewport?.removeEventListener('resize', update);
      el.style.height = '';
    };
  }, [ref, enabled, gap]);
}
