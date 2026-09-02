import { useEffect, useState } from "react";

export type BrokerType = "iol" | "ppi";

const STORAGE_KEY = "sentinel:broker";

export function useBroker(): [BrokerType, (b: BrokerType) => void] {
  const [broker, setBrokerState] = useState<BrokerType>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return saved === "ppi" ? "ppi" : "iol";
  });

  const setBroker = (b: BrokerType) => {
    setBrokerState(b);
    try {
      localStorage.setItem(STORAGE_KEY, b);
    } catch {
      /* ignore */
    }
  };

  // Sync if another tab changes
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && (e.newValue === "iol" || e.newValue === "ppi")) {
        setBrokerState(e.newValue as BrokerType);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return [broker, setBroker];
}
