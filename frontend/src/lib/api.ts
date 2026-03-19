import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

// Types
export interface Agent {
  id: string;
  name: string;
  persona?: string;
  wallet: number;
  totalPnl: number;
  winRate: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  createdAt: string;
}

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
  endDate?: string;
  image?: string;
  icon?: string;
  lastSyncedAt: string;
  sentiment?: SentimentSnapshot | null;
}

export interface Trade {
  id: string;
  agentId: string;
  marketId: string;
  side: 'BUY' | 'SELL';
  outcome: string;
  shares: number;
  price: number;
  cost: number;
  createdAt: string;
  agent?: { id: string; name: string };
  market?: { question: string };
}

export interface Comment {
  id: string;
  agentId: string;
  marketId: string;
  content: string;
  sentiment?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  createdAt: string;
  agent?: { id: string; name: string };
  market?: { question: string };
}

export interface SentimentSnapshot {
  id: string;
  marketId: string;
  bullish: number;
  bearish: number;
  neutral: number;
  avgPrice: number;
  createdAt: string;
}

export interface LeaderboardEntry extends Agent {
  rank: number;
  accuracy: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// API functions
export const getMarkets = (params?: Record<string, unknown>) =>
  api.get('/markets', { params }).then((r) => r.data);

export const getMarket = (id: string) =>
  api.get(`/markets/${id}`).then((r) => r.data);

export const getMarketComments = (id: string, params?: Record<string, unknown>) =>
  api.get(`/markets/${id}/comments`, { params }).then((r) => r.data);

export const getAgent = (id: string) =>
  api.get(`/agents/${id}`).then((r) => r.data);

export const getAgentTrades = (id: string, params?: Record<string, unknown>) =>
  api.get(`/agents/${id}/trades`, { params }).then((r) => r.data);

export const getAgentComments = (id: string, params?: Record<string, unknown>) =>
  api.get(`/agents/${id}/comments`, { params }).then((r) => r.data);

export const getLeaderboard = (params?: Record<string, unknown>) =>
  api.get('/leaderboard', { params }).then((r) => r.data);

export const getTradeFeed = (limit = 50) =>
  api.get('/trades/feed', { params: { limit } }).then((r) => r.data);

export const getSentimentHistory = (marketId: string) =>
  api.get(`/analytics/sentiment/${marketId}`).then((r) => r.data);

export const getPriceHistory = (marketId: string) =>
  api.get(`/analytics/price-history/${marketId}`).then((r) => r.data);

// Utility
export function parseOutcomes(outcomes: string): string[] {
  try { return JSON.parse(outcomes); } catch { return []; }
}

export function parseOutcomePrices(prices: string): number[] {
  try { return JSON.parse(prices).map(Number); } catch { return []; }
}

export function formatPct(val: number): string {
  return `${(val * 100).toFixed(1)}%`;
}

export function formatUSD(val: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(val);
}
