import { useState, useEffect, useRef, useCallback } from "react";

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

export interface UseApiDataOptions {
  enabled?: boolean;
  ttlMs?: number;
}

export interface UseApiDataResult<T> {
  data: T | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  refetch: (options?: { forceLoading?: boolean }) => Promise<void>;
  mutate: (newData: T | ((prev: T | null) => T)) => void;
}

/** Invalida una clave exacta o todas las claves con un prefijo determinado. Si no se pasa parámetro, limpia toda la cache. */
export function invalidateApiCache(prefixOrKey?: string): void {
  if (!prefixOrKey) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key === prefixOrKey || key.startsWith(prefixOrKey)) {
      memoryCache.delete(key);
    }
  }
}

/** Permite setear manualmente un valor en la cache en memoria */
export function setApiCache<T>(key: string, data: T): void {
  memoryCache.set(key, { data, timestamp: Date.now() });
}

/** Permite obtener manualmente un valor de la cache en memoria */
export function getApiCache<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  return entry ? (entry.data as T) : null;
}

/**
 * Hook central de datos con patrón Stale-While-Revalidate.
 *
 * 1. Si los datos ya existen en cache, se retornan inmediatamente (isLoading: false, isRefreshing: true).
 * 2. En segundo plano se consulta el fetcher para actualizar los datos silenciosamente.
 * 3. Si no existen en cache, isLoading arranca en true (mostrando skeleton solo en primer acceso).
 */
export function useApiData<T>(
  cacheKey: string | null,
  fetcher: () => Promise<T>,
  options?: UseApiDataOptions
): UseApiDataResult<T> {
  const enabled = options?.enabled !== false && cacheKey !== null;
  const ttlMs = options?.ttlMs;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Inicialización sincrónica desde cache si existe
  const getInitialState = () => {
    if (!cacheKey) {
      return { data: null, isLoading: false, isRefreshing: false };
    }
    const cached = memoryCache.get(cacheKey);
    if (cached) {
      return {
        data: cached.data as T,
        isLoading: false,
        isRefreshing: enabled,
      };
    }
    return {
      data: null,
      isLoading: enabled,
      isRefreshing: false,
    };
  };

  const [state, setState] = useState<{
    data: T | null;
    isLoading: boolean;
    isRefreshing: boolean;
  }>(getInitialState);

  const [error, setError] = useState<string | null>(null);

  // Sincronizar estado si cambia el cacheKey o enabled
  const prevKeyRef = useRef<string | null>(cacheKey);
  useEffect(() => {
    if (prevKeyRef.current !== cacheKey) {
      prevKeyRef.current = cacheKey;
      if (!cacheKey) {
        setState({ data: null, isLoading: false, isRefreshing: false });
        setError(null);
      } else {
        const cached = memoryCache.get(cacheKey);
        if (cached) {
          setState({
            data: cached.data as T,
            isLoading: false,
            isRefreshing: enabled,
          });
        } else {
          setState({
            data: null,
            isLoading: enabled,
            isRefreshing: false,
          });
        }
        setError(null);
      }
    }
  }, [cacheKey, enabled]);

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const executeFetch = useCallback(
    async (forceLoading = false) => {
      if (!cacheKey || !enabled) return;

      const cached = memoryCache.get(cacheKey);
      const hasCached = !!cached;

      if (forceLoading || !hasCached) {
        setState((prev) => ({ ...prev, isLoading: true, isRefreshing: false }));
      } else {
        setState((prev) => ({ ...prev, isLoading: false, isRefreshing: true }));
      }

      try {
        const result = await fetcherRef.current();
        if (isMountedRef.current) {
          memoryCache.set(cacheKey, { data: result, timestamp: Date.now() });
          setState({
            data: result,
            isLoading: false,
            isRefreshing: false,
          });
          setError(null);
        }
      } catch (err: unknown) {
        if (isMountedRef.current) {
          const msg =
            err instanceof Error ? err.message : "Error al cargar datos";
          setError(msg);
          setState((prev) => ({
            ...prev,
            isLoading: false,
            isRefreshing: false,
          }));
        }
      }
    },
    [cacheKey, enabled]
  );

  useEffect(() => {
    if (!enabled || !cacheKey) return;

    let isCurrent = true;

    const run = async () => {
      const cached = memoryCache.get(cacheKey);
      if (cached && ttlMs && Date.now() - cached.timestamp < ttlMs) {
        if (isCurrent && isMountedRef.current) {
          setState({
            data: cached.data as T,
            isLoading: false,
            isRefreshing: false,
          });
        }
        return;
      }

      try {
        const result = await fetcherRef.current();
        if (isCurrent && isMountedRef.current) {
          memoryCache.set(cacheKey, { data: result, timestamp: Date.now() });
          setState({
            data: result,
            isLoading: false,
            isRefreshing: false,
          });
          setError(null);
        }
      } catch (err: unknown) {
        if (isCurrent && isMountedRef.current) {
          const msg =
            err instanceof Error ? err.message : "Error al cargar datos";
          setError(msg);
          setState((prev) => ({
            ...prev,
            isLoading: false,
            isRefreshing: false,
          }));
        }
      }
    };

    run();

    return () => {
      isCurrent = false;
    };
  }, [cacheKey, enabled, ttlMs]);

  const refetch = useCallback(
    async (opts?: { forceLoading?: boolean }) => {
      await executeFetch(opts?.forceLoading);
    },
    [executeFetch]
  );

  const mutate = useCallback(
    (newData: T | ((prev: T | null) => T)) => {
      setState((prev) => {
        const resolved =
          typeof newData === "function"
            ? (newData as (prev: T | null) => T)(prev.data)
            : newData;
        if (cacheKey) {
          memoryCache.set(cacheKey, { data: resolved, timestamp: Date.now() });
        }
        return {
          ...prev,
          data: resolved,
        };
      });
    },
    [cacheKey]
  );

  return {
    data: state.data,
    isLoading: state.isLoading,
    isRefreshing: state.isRefreshing,
    error,
    refetch,
    mutate,
  };
}
