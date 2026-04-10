import { useRef, useEffect, useState, useCallback } from 'react';

export interface PullToRefreshOptions {
  onRefresh: () => Promise<void>;
  /** Pixels of pull needed to trigger refresh (default: 70) */
  threshold?: number;
  /**
   * When true (default), attaches listeners to `window` and checks
   * `window.scrollY`. When false, attach the returned `ref` to a
   * scrollable container element instead.
   */
  useWindow?: boolean;
}

export interface PullToRefreshResult {
  /**
   * Ref for the scrollable container — only needed when `useWindow: false`.
   * When `useWindow: true` (default) this ref is unused.
   */
  ref: React.RefObject<HTMLDivElement>;
  /** Normalised pull progress 0–1 (1 = threshold reached) */
  progress: number;
  /** True while the async refresh callback is running */
  refreshing: boolean;
}

/**
 * Adds pull-to-refresh behaviour to a page or scrollable container.
 *
 * By default attaches to `window` scroll, which works for typical SPA pages
 * that scroll the body. Set `useWindow: false` and attach the returned `ref`
 * to a specific scrollable element instead.
 *
 * @example
 * const { progress, refreshing } = usePullToRefresh({ onRefresh: reload });
 * // Shows a progress indicator above the page content
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 70,
  useWindow = true,
}: PullToRefreshOptions): PullToRefreshResult {
  const ref = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const progressRef = useRef(0);
  const refreshingRef = useRef(false);
  const [progress, setProgress] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const triggerRefresh = useCallback(async () => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    progressRef.current = 1;
    setProgress(1);
    try {
      await onRefresh();
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
      progressRef.current = 0;
      setProgress(0);
    }
  }, [onRefresh]);

  useEffect(() => {
    const getScrollTop = () =>
      useWindow
        ? window.scrollY
        : (ref.current?.scrollTop ?? 0);

    const target = useWindow ? window : ref.current;
    if (!target) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (refreshingRef.current) return;
      if (getScrollTop() > 2) return;
      startY.current = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (startY.current === null || refreshingRef.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        progressRef.current = 0;
        setProgress(0);
        return;
      }
      const next = Math.min(dy / threshold, 1.2);
      progressRef.current = next;
      setProgress(next);
    };

    const handleTouchEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      if (progressRef.current >= 1) {
        triggerRefresh();
      } else {
        progressRef.current = 0;
        setProgress(0);
      }
    };

    const opts: AddEventListenerOptions = { passive: true };
    target.addEventListener('touchstart', handleTouchStart as EventListener, opts);
    target.addEventListener('touchmove', handleTouchMove as EventListener, opts);
    target.addEventListener('touchend', handleTouchEnd as EventListener, opts);

    return () => {
      target.removeEventListener('touchstart', handleTouchStart as EventListener);
      target.removeEventListener('touchmove', handleTouchMove as EventListener);
      target.removeEventListener('touchend', handleTouchEnd as EventListener);
    };
  }, [threshold, triggerRefresh, useWindow]);

  return { ref, progress, refreshing };
}
