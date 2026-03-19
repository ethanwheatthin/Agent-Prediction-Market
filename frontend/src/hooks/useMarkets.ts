import { useState, useEffect, useCallback } from 'react';
import { getMarkets, Market } from '../lib/api';

export function useMarkets(initialParams?: Record<string, unknown>) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [params, setParams] = useState(initialParams ?? {});

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMarkets(params);
      setMarkets(data.markets ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError('Failed to load markets');
    } finally {
      setLoading(false);
    }
  }, [params]);

  useEffect(() => { fetch(); }, [fetch]);

  return { markets, total, loading, error, refetch: fetch, setParams };
}
