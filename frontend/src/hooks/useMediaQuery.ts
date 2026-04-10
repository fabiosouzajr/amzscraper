import { useState, useEffect } from 'react';

/**
 * Hook to detect if a media query matches.
 *
 * @param query - CSS media query string (e.g., '(max-width: 768px)')
 * @returns boolean indicating if the media query matches
 *
 * @example
 * const isMobile = useMediaQuery('(max-width: 768px)');
 * const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1024px)');
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mediaQueryList = window.matchMedia(query);
    const handleChange = (event: MediaQueryListEvent) => {
      setMatches(event.matches);
    };

    // Add listener (with fallback for older browsers)
    if (mediaQueryList.addEventListener) {
      mediaQueryList.addEventListener('change', handleChange);
    } else if (mediaQueryList.addListener) {
      // Fallback for Safari < 14
      mediaQueryList.addListener(handleChange);
    }

    return () => {
      if (mediaQueryList.removeEventListener) {
        mediaQueryList.removeEventListener('change', handleChange);
      } else if (mediaQueryList.removeListener) {
        mediaQueryList.removeListener(handleChange);
      }
    };
  }, [query]);

  return matches;
}

/**
 * Breakpoint constants for common screen sizes.
 */
export const breakpoints = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
} as const;

/**
 * Hooks for specific breakpoints.
 */
export const useIsSmallScreen = () => useMediaQuery(`(max-width: ${breakpoints.sm})`);
export const useIsMobile = () => useMediaQuery(`(max-width: ${breakpoints.md})`);
export const useIsTablet = () =>
  useMediaQuery(`(min-width: ${breakpoints.md}) and (max-width: ${breakpoints.lg})`);
export const useIsDesktop = () => useMediaQuery(`(min-width: ${breakpoints.lg})`);
