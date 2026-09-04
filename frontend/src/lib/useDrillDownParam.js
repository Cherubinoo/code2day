import { useState, useEffect, useCallback } from "react";

/**
 * Generic version of useTabNav's working pushState/popstate pattern, for
 * "which item is open within this page" state (a selected problem slug,
 * company, quiz question index, passage id, ...) instead of just a tab.
 *
 * Without this, that kind of drill-down selection tends to live in plain
 * useState with no browser-history entry at all — so hitting the browser
 * Back button while it's set doesn't restore the previous selection, it
 * falls through to whatever page-level history entry came before, which
 * looks like the app "exiting" the view entirely.
 *
 * `parse`/`serialize` let a caller store non-string values (e.g. a numeric
 * question index) while the URL param itself stays a string.
 */
export function useDrillDownParam(
  paramName,
  { defaultValue = "", parse = (v) => v, serialize = (v) => String(v) } = {},
) {
  const readFromUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(paramName);
    return raw === null ? defaultValue : parse(raw);
  }, [paramName, defaultValue, parse]);

  const [value, setValueState] = useState(readFromUrl);

  const setValue = useCallback(
    (next) => {
      setValueState(next);
      const url = new URL(window.location);
      // "" / null / undefined always means "clear this param" — deliberately
      // NOT compared against `defaultValue`: a caller whose default is some
      // non-empty fallback (e.g. restored from localStorage) must still be
      // able to explicitly clear the param, which setting it to that
      // default's value would not do.
      if (next === "" || next === null || next === undefined) {
        url.searchParams.delete(paramName);
      } else {
        url.searchParams.set(paramName, serialize(next));
      }
      window.history.pushState({ [paramName]: next }, "", url);
    },
    [paramName, serialize],
  );

  useEffect(() => {
    const handlePopState = () => setValueState(readFromUrl());
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [readFromUrl]);

  return [value, setValue];
}
