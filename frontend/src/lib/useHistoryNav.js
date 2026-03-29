/**
 * useHistoryNav.js
 * ================
 * Custom hook that syncs the active page with the browser's History API.
 *
 * - Navigating to a new page → `window.history.pushState` (URL updates,
 *   browser Back button works)
 * - Browser Back / Forward / mouse side-buttons → `popstate` fires →
 *   React state updates → app re-renders the correct page
 * - Deep-linking / page refresh → initial state is read from the URL path
 *
 * All child components already receive `setActivePage` as a prop.
 * Pass `navigate` in its place — the function signature is identical.
 * No child component changes are required.
 */

import { useCallback, useEffect, useState } from "react";

/** Map page IDs → URL paths */
export const PAGE_PATHS = {
  explore:  "/",
  roadmaps: "/roadmaps",
  problems: "/problems",
  contest:  "/contest",
  progress: "/progress",
  discuss:  "/discuss",
};

/** Reverse map: URL paths → page IDs */
const PATH_TO_PAGE = Object.fromEntries(
  Object.entries(PAGE_PATHS).map(([page, path]) => [path, page]),
);

/** Read the current page from the URL (used on first load & popstate). */
function pageFromCurrentPath() {
  return PATH_TO_PAGE[window.location.pathname] ?? "explore";
}

/**
 * @param {Function} getInitialPage - Optional function to get initial page (e.g., from localStorage)
 * @returns {[string, Function]} [activePage, navigate]
 *
 * `navigate(page)`            — pushes a new history entry (back-able)
 * `navigate(page, { replace: true })` — replaces the current entry
 *   (used for resets / post-login redirects that shouldn't be back-able)
 */
export function useHistoryNav(getInitialPage) {
  const [activePage, setActivePage] = useState(() => {
    // Priority: 1. URL path, 2. Custom initial page function, 3. Default "explore"
    const fromPath = pageFromCurrentPath();
    if (fromPath && fromPath !== "explore") {
      return fromPath;
    }
    const customInitial = getInitialPage?.() ?? null;
    return customInitial || "explore";
  });

  // Keep the URL in sync with the current page
  const navigate = useCallback(
    (page, { replace = false } = {}) => {
      const path = PAGE_PATHS[page] ?? "/";
      const state = { page };

      if (replace) {
        window.history.replaceState(state, "", path);
      } else {
        // Avoid pushing a duplicate entry when clicking the active nav item
        if (window.location.pathname !== path) {
          window.history.pushState(state, "", path);
        }
      }

      setActivePage(page);
    },
    [],
  );

  // Handle browser Back / Forward / mouse side-buttons
  useEffect(() => {
    function handlePopState() {
      setActivePage(pageFromCurrentPath());
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // On first mount, align the history state so popstate works correctly
  // even if the user landed via a bookmark or deep link.
  useEffect(() => {
    const page = pageFromCurrentPath();
    const path = PAGE_PATHS[page] ?? "/";
    // replaceState so we don't push an extra entry on the very first load
    window.history.replaceState({ page }, "", path);
  }, []);

  return [activePage, navigate];
}
