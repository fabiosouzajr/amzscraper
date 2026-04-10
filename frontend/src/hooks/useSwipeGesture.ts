import { useRef, useEffect, RefObject } from 'react';

export interface SwipeHandlers {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
}

export interface SwipeGestureReturn {
  ref: RefObject<HTMLElement>;
}

/**
 * Hook to detect swipe gestures on touch devices.
 *
 * @param handlers - Object with callback functions for each direction
 * @returns Object containing a ref to attach to the element
 *
 * @example
 * const { ref } = useSwipeGesture({
 *   onSwipeLeft: () => console.log('swiped left'),
 *   onSwipeRight: () => console.log('swiped right'),
 *   threshold: 50,
 * });
 *
 * return <div ref={ref}>Swipe me</div>;
 */
export function useSwipeGesture(handlers: SwipeHandlers): SwipeGestureReturn {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    threshold = 50,
  } = handlers;

  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null);
  const elementRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      touchStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      };
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStart.current) return;

      const touch = e.changedTouches[0];
      const deltaX = touch.clientX - touchStart.current.x;
      const deltaY = touch.clientY - touchStart.current.y;
      const deltaTime = Date.now() - touchStart.current.time;

      touchStart.current = null;

      // Ignore swipes that took too long (probably scrolling)
      if (deltaTime > 500) return;

      // Ignore small movements
      if (Math.abs(deltaX) < threshold && Math.abs(deltaY) < threshold) return;

      // Determine primary direction
      const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);

      if (isHorizontal) {
        if (deltaX > 0) {
          onSwipeRight?.();
        } else {
          onSwipeLeft?.();
        }
      } else {
        if (deltaY > 0) {
          onSwipeDown?.();
        } else {
          onSwipeUp?.();
        }
      }
    };

    element.addEventListener('touchstart', handleTouchStart, { passive: true });
    element.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      element.removeEventListener('touchstart', handleTouchStart);
      element.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, threshold]);

  return { ref: elementRef };
}

/**
 * Hook for detecting swipe to dismiss gestures (right swipe = dismiss).
 * Useful for slide-in panels and sheets.
 *
 * @param onDismiss - Callback when swipe right is detected
 * @param options - Configuration options
 * @returns Object containing a ref to attach to the element
 *
 * @example
 * const { ref } = useSwipeToDismiss(() => setIsOpen(false));
 * return <div ref={ref}>Content</div>;
 */
export function useSwipeToDismiss(
  onDismiss: () => void,
  options?: { threshold?: number }
): SwipeGestureReturn {
  return useSwipeGesture({
    onSwipeRight: onDismiss,
    threshold: options?.threshold || 50,
  });
}
