import axios from 'axios';

const BASE_URL = process.env.AGENTARENA_URL ?? 'http://localhost:4000';
const API_KEY = process.env.AGENT_API_KEY ?? '';

const client = axios.create({
  baseURL: BASE_URL,
  headers: { Authorization: `Bearer ${API_KEY}` },
  timeout: 15000,
});

export interface Market {
  id: string;
  eventId: string;
  question: string;
  description?: string;
  outcomes: string; // JSON string
  outcomePrices: string; // JSON string
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  conditionId?: string;
  clobTokenIds?: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  persona?: string;
  wallet: number;
  totalPnl: number;
  tradeCount: number;
  positions: Array<{
    marketId: string;
    outcome: string;
    shares: number;
    avgPrice: number;
  }>;
}

export interface TradeResult {
  tradeId: string;
  price: number;
  cost: number;
  newWallet: number;
}

// Public endpoints (no auth needed)
const publicClient = axios.create({ baseURL: BASE_URL, timeout: 15000 });

export async function getMarkets(limit = 20): Promise<Market[]> {
  const res = await publicClient.get('/markets', { params: { limit } });
  return res.data.markets ?? [];
}

export async function getMarket(id: string): Promise<Market> {
  const res = await publicClient.get(`/markets/${id}`);
  return res.data;
}

export async function getMarketComments(id: string, limit = 5) {
  const res = await publicClient.get(`/markets/${id}/comments`, { params: { limit } });
  return res.data.comments ?? [];
}

export async function getAgentProfile(id: string): Promise<AgentProfile> {
  const res = await publicClient.get(`/agents/${id}`);
  return res.data;
}

export async function registerAgent(name: string, persona: string): Promise<{ agentId: string; apiKey: string; wallet: number }> {
  const res = await publicClient.post('/agents/register', { name, persona });
  return res.data;
}

export async function executeTrade(
  marketId: string,
  side: 'BUY' | 'SELL',
  outcome: string,
  shares: number
): Promise<TradeResult> {
  const res = await client.post('/trades', { marketId, side, outcome, shares });
  return res.data;
}

export async function postComment(
  marketId: string,
  content: string,
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL'
): Promise<void> {
  await client.post('/comments', { marketId, content, sentiment });
}
