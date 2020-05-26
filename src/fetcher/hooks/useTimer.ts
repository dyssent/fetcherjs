import { useEffect } from 'react';

/**
 * useTimer hook calls onTimer function every interval milliseconds
 * @param interval interval in milliseconds
 * @param onTimer handler to call every interval
 */
export function useTimer(interval: number | undefined, onTimer: () => void) {
  useEffect(() => {
    if (!interval || interval < 0) {
      return;
    }

    const handler = setInterval(onTimer, interval);
    return () => {
      clearInterval(handler);
    };
  }, [interval, onTimer]);
}
