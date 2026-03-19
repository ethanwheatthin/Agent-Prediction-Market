import axios from 'axios';
import { redis } from './redis';

const GAMMA_URL = process.env.POLYMARKET_GAMMA_URL ?? 'https://gamma-api.polymarket.com';
const CLOB_URL = process.env.POLYMARKET_CLOB_URL ?? 'https://clob.polymarket.com';
const CACHE_TTL = 60; // seconds

const httpClient = axios.create({ timeout: 10000 });

export interface PolymarketEvent {
  id: string;
  title: string;
  description?: string;
  active: boolean;
  closed: boolean;
  markets: PolymarketMarket[];
  tags?: Array<{ id: string; label: string; slug: string }>;
}

export interface PolymarketMarket {
  id: string;
  eventId?: string;
  question: string;
  description?: string;
  outcomes: string; // JSON string
  outcomePrices: string; // JSON string
  volume?: number;
  volumeNum?: number;
  liquidity?: number;
  liquidityNum?: number;
  startDate?: string;
  endDate?: string;
  closed: boolean;
  active: boolean;
  clobTokenIds?: string; // JSON string
  conditionId?: string;
  questionId?: string;
  enableOrderBook?: boolean;
  image?: string;
  icon?: string;
  resolvedBy?: string;
  resolutionSource?: string;
}

async function cachedGet<T>(key: string, fetcher: () => Promise<T>, ttl = CACHE_TTL): Promise<T> {
  const cached = await redis.get(key);
  if (cached) {
    return JSON.parse(cached) as T;
  }
  const data = await fetcher();
  await redis.setex(key, ttl, JSON.stringify(data));
  return data;
}

export async function fetchActiveEvents(limit = 50): Promise<PolymarketEvent[]> {
  return cachedGet(
    `gamma:events:active:${limit}`,
    async () => {
      const res = await httpClient.get(`${GAMMA_URL}/events`, {
        params: { limit, active: true },
      });
      return res.data as PolymarketEvent[];
    },
    CACHE_TTL
  );
}

export async function fetchActiveMarkets(limit = 100): Promise<PolymarketMarket[]> {
  return cachedGet(
    `gamma:markets:active:${limit}`,
    async () => {
      const res = await httpClient.get(`${GAMMA_URL}/markets`, {
        params: { limit, active: true },
      });
      return res.data as PolymarketMarket[];
    },
    CACHE_TTL
  );
}

export async function fetchMarket(marketId: string): Promise<PolymarketMarket | null> {
  return cachedGet(
    `gamma:market:${marketId}`,
    async () => {
      const res = await httpClient.get(`${GAMMA_URL}/markets/${marketId}`);
      return res.data as PolymarketMarket;
    },
    CACHE_TTL
  );
}

export async function fetchEvent(eventId: string): Promise<PolymarketEvent | null> {
  return cachedGet(
    `gamma:event:${eventId}`,
    async () => {
      const res = await httpClient.get(`${GAMMA_URL}/events/${eventId}`);
      return res.data as PolymarketEvent;
    },
    CACHE_TTL
  );
}

export interface ClobPrice {
  price: string;
}

export interface ClobMidpoint {
  mid: string;
}

export async function fetchMarketPrice(tokenId: string): Promise<number | null> {
  try {
    const cacheKey = `clob:midpoint:${tokenId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return parseFloat(cached);

    const res = await httpClient.get(`${CLOB_URL}/midpoint`, {
      params: { token_id: tokenId },
    });
    const mid = parseFloat((res.data as ClobMidpoint).mid);
    await redis.setex(cacheKey, 30, mid.toString());
    return mid;
  } catch {
    return null;
  }
}

export interface PriceHistoryPoint {
  t: number; // Unix timestamp
  p: number; // Price
}

export async function fetchPriceHistory(conditionId: string): Promise<PriceHistoryPoint[]> {
  return cachedGet(
    `clob:history:${conditionId}`,
    async () => {
      const res = await httpClient.get(`${CLOB_URL}/prices-history`, {
        params: { market: conditionId, interval: 'max', fidelity: 60 },
      });
      return (res.data?.history ?? []) as PriceHistoryPoint[];
    },
    300 // 5 min cache for history
  );
}

export async function fetchTags(): Promise<Array<{ id: string; label: string; slug: string }>> {
  return cachedGet(
    'gamma:tags',
    async () => {
      const res = await httpClient.get(`${GAMMA_URL}/tags`);
      return res.data;
    },
    3600 // 1 hour
  );
}

export async function searchMarkets(query: string): Promise<PolymarketMarket[]> {
  const res = await httpClient.get(`${GAMMA_URL}/public-search`, { params: { query } });
  return (res.data?.markets ?? []) as PolymarketMarket[];
}
