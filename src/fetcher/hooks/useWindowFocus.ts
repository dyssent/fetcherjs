import { useState, useEffect, useMemo } from 'react';

/**
 * @internal
 */
export function isDocVisible() {
  return (
    typeof document === 'undefined' || document.visibilityState === undefined || document.visibilityState === 'visible'
  );
}

/**
 * @internal
 */
export function useWindowFocus(onChange?: (focused: boolean) => void, observe: boolean = true, threshold: number = -1) {
  const [focused, setFocused] = useState(isDocVisible());
  const startBlurAt = useMemo(() => (focused ? Date.now() : -1), []);

  useEffect(() => {
    if (!observe || !window) {
      return;
    }

    let blurAt = startBlurAt;

    function onFocus() {
      setFocused(true);
      if (threshold >= 0 && blurAt >= 0 && Date.now() - blurAt < threshold) {
        return;
      }

      if (onChange) {
        onChange(true);
      }
    }

    function onBlur() {
      setFocused(false);
      blurAt = Date.now();
      if (onChange) {
        onChange(false);
      }
    }

    window.addEventListener('focus', onFocus, false);
    window.addEventListener('blur', onBlur, false);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blur', onBlur);
    };
  }, [onChange, threshold]);

  return focused;
}
