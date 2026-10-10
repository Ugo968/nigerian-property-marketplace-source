import * as React from "react";

/**
 * Generic media query hook for client components.
 *
 * Returns false during SSR and the first client render (to avoid
 * hydration mismatches); updates to the actual match value after
 * mount via matchMedia.
 *
 * Use this for layout-switching UI like the NotificationBell which
 * needs different rendering on mobile vs desktop.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia(query);
    const handler = () => setMatches(mql.matches);
    handler();
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [query]);

  return matches;
}
