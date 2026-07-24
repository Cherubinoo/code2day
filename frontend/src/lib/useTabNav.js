import { useState, useEffect, useCallback } from 'react';

export function useTabNav(defaultTab = 'overview', paramName = 'tab') {
  const getTabFromUrl = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get(paramName) || defaultTab;
  }, [defaultTab, paramName]);

  const [activeTab, setActiveTabState] = useState(getTabFromUrl());

  const setActiveTab = useCallback((newTab) => {
    setActiveTabState(newTab);
    const url = new URL(window.location);
    url.searchParams.set(paramName, newTab);
    window.history.pushState({ tab: newTab }, '', url);
  }, [paramName]);

  useEffect(() => {
    const handlePopState = () => {
      setActiveTabState(getTabFromUrl());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [getTabFromUrl]);

  // Update URL on first mount if there's no tab param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has(paramName)) {
      const url = new URL(window.location);
      url.searchParams.set(paramName, defaultTab);
      window.history.replaceState({ tab: defaultTab }, '', url);
    }
  }, [defaultTab, paramName]);

  return [activeTab, setActiveTab];
}
