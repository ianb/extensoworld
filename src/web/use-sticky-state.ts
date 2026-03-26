import { useState } from "react";

/**
 * Like useState but persists to localStorage under the given key.
 * Falls back to initialValue if nothing is stored.
 */
export function useStickyState<T>(key: string, initialValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    const stored = localStorage.getItem(key);
    if (stored !== null) {
      try {
        return JSON.parse(stored) as T;
      } catch (_e) {
        return initialValue;
      }
    }
    return initialValue;
  });

  function setAndPersist(newValue: T): void {
    setValue(newValue);
    localStorage.setItem(key, JSON.stringify(newValue));
  }

  return [value, setAndPersist];
}
