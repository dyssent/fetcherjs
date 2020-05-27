import { useState, useEffect, useMemo } from 'react';

/**
 * @internal
 */
export function useOnline(onChange?: (online: boolean) => void, observe: boolean = true, threshold: number = -1) {
  const [online, setOnline] = useState(navigator.onLine);
  const startOfflineAt = useMemo(() => (!online ? Date.now() : -1), []);

  useEffect(() => {
    if (!observe || !window) {
      return;
    }

    let offlineAt = startOfflineAt;

    function onOffline() {
      setOnline(false);
      offlineAt = Date.now();

      if (onChange) {
        onChange(false);
      }
    }

    function onOnline() {
      setOnline(true);
      if (threshold >= 0 && offlineAt >= 0 && Date.now() - offlineAt < threshold) {
        return;
      }

      if (onChange) {
        onChange(true);
      }
    }

    window.addEventListener('offline', onOffline, false);
    window.addEventListener('online', onOnline, false);
    return () => {
      window.removeEventListener('offline', onOffline, false);
      window.removeEventListener('online', onOnline, false);
    };
  }, [onChange]);

  return online;
}
