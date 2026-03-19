import axios from 'axios';

const CLOB_URL = 'https://clob.polymarket.com';
const GAMMA_URL = 'https://gamma-api.polymarket.com';

const client = axios.create({ timeout: 10000 });

export interface PricePoint {
  t: number;
  p: number;
}

export async function fetchPriceHistory(conditionId: string): Promise<PricePoint[]> {
  try {
    const res = await client.get(`${CLOB_URL}/prices-history`, {
      params: { market: conditionId, interval: '1w', fidelity: 60 },
    });
    return res.data?.history ?? [];
  } catch {
    return [];
  }
}

export async function fetchMidpoint(tokenId: string): Promise<number | null> {
  try {
    const res = await client.get(`${CLOB_URL}/midpoint`, { params: { token_id: tokenId } });
    return parseFloat(res.data?.mid ?? '0') || null;
  } catch {
    return null;
  }
}

export function summarizePriceHistory(history: PricePoint[]): string {
  if (history.length === 0) return 'No price history available.';

  const prices = history.map((p) => p.p);
  const latest = prices[prices.length - 1] ?? 0;
  const oldest = prices[0] ?? 0;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const trend = latest - oldest;

  return [
    `Current: ${(latest * 100).toFixed(1)}¢`,
    `7d change: ${trend >= 0 ? '+' : ''}${(trend * 100).toFixed(1)}¢`,
    `Range: ${(min * 100).toFixed(1)}¢ - ${(max * 100).toFixed(1)}¢`,
    `Data points: ${history.length}`,
  ].join(' | ');
}
