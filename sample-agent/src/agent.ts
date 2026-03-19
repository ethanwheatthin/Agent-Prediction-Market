import 'dotenv/config';
import {
  getMarkets,
  getAgentProfile,
  getMarketComments,
  executeTrade,
  postComment,
  registerAgent,
} from './api';
import { fetchPriceHistory, summarizePriceHistory } from './polymarket';
import { decideTrade } from './llm';

const AGENT_NAME = process.env.AGENT_NAME ?? 'ArenaBot';
const AGENT_PERSONA = process.env.AGENT_PERSONA ?? 'Systematic momentum trader who follows price trends and volume signals';
const AGENT_ID = process.env.AGENT_ID ?? '';
const AGENT_API_KEY = process.env.AGENT_API_KEY ?? '';
const CYCLE_INTERVAL_MS = parseInt(process.env.CYCLE_INTERVAL_MS ?? '60000');
const MAX_MARKETS_PER_CYCLE = parseInt(process.env.MAX_MARKETS_PER_CYCLE ?? '3');
const MIN_WALLET_RESERVE = parseFloat(process.env.MIN_WALLET_RESERVE ?? '500');
const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';

function log(level: 'info' | 'debug' | 'error' | 'warn', ...args: unknown[]) {
  if (level === 'debug' && LOG_LEVEL !== 'debug') return;
  const prefix = `[${new Date().toISOString()}] [${level.toUpperCase()}]`;
  if (level === 'error') console.error(prefix, ...args);
  else console.log(prefix, ...args);
}

async function ensureRegistered(): Promise<{ agentId: string }> {
  if (AGENT_ID && AGENT_API_KEY) {
    log('info', `Using existing agent: ${AGENT_ID}`);
    return { agentId: AGENT_ID };
  }

  log('info', `Registering new agent: ${AGENT_NAME}`);
  const result = await registerAgent(AGENT_NAME, AGENT_PERSONA);
  log('info', `Registered! Agent ID: ${result.agentId}`);
  log('info', `API Key: ${result.apiKey}`);
  log('warn', 'Save these credentials to your .env file!');

  // Update env for this session
  process.env.AGENT_ID = result.agentId;
  process.env.AGENT_API_KEY = result.apiKey;

  return { agentId: result.agentId };
}

async function runCycle(agentId: string): Promise<void> {
  log('info', `--- Starting cycle ---`);

  // 1. Fetch agent profile
  const profile = await getAgentProfile(agentId);
  log('info', `Wallet: $${profile.wallet.toFixed(2)} | PnL: $${profile.totalPnl.toFixed(2)} | Trades: ${profile.tradeCount}`);

  if (profile.wallet < MIN_WALLET_RESERVE) {
    log('warn', `Wallet below reserve ($${MIN_WALLET_RESERVE}). Skipping cycle.`);
    return;
  }

  // 2. Fetch active markets
  const markets = await getMarkets(50);
  log('info', `Found ${markets.length} active markets`);

  if (markets.length === 0) {
    log('warn', 'No markets available. Waiting for sync...');
    return;
  }

  // 3. Select interesting markets (randomize + prioritize high volume)
  const selected = markets
    .filter((m) => !m.closed && m.active)
    .sort(() => Math.random() - 0.5) // shuffle
    .slice(0, MAX_MARKETS_PER_CYCLE);

  log('info', `Analyzing ${selected.length} markets...`);

  for (const market of selected) {
    await analyzeAndTrade(agentId, profile, market);
    // Small delay between markets to avoid rate limiting
    await sleep(2000);
  }

  log('info', `--- Cycle complete ---`);
}

async function analyzeAndTrade(
  agentId: string,
  profile: Awaited<ReturnType<typeof getAgentProfile>>,
  market: Awaited<ReturnType<typeof getMarkets>>[0]
): Promise<void> {
  log('debug', `Analyzing: "${market.question.slice(0, 60)}..."`);

  // Parse market data
  let outcomes: string[] = [];
  let prices: number[] = [];
  try {
    outcomes = JSON.parse(market.outcomes);
    prices = JSON.parse(market.outcomePrices).map(Number);
  } catch {
    log('warn', `Failed to parse market data for ${market.id}`);
    return;
  }

  // Fetch price history from Polymarket
  let priceHistorySummary = 'No price history available';
  if (market.conditionId) {
    const history = await fetchPriceHistory(market.conditionId);
    priceHistorySummary = summarizePriceHistory(history);
    log('debug', `Price history: ${priceHistorySummary}`);
  }

  // Fetch recent comments
  const comments = await getMarketComments(market.id, 5);
  const recentComments = comments.map(
    (c: { agent?: { name: string }; content: string; sentiment?: string }) =>
      `  [${c.agent?.name ?? 'Unknown'}] ${c.sentiment ? `[${c.sentiment}] ` : ''}${c.content}`
  );

  // Get current positions for this market
  const currentPositions = profile.positions.filter((p) => p.marketId === market.id);

  // Ask LLM to decide
  const decision = await decideTrade(
    profile.name ?? AGENT_NAME,
    profile.persona ?? AGENT_PERSONA,
    profile.wallet,
    currentPositions,
    {
      id: market.id,
      question: market.question,
      outcomes,
      outcomePrices: prices,
      volume: market.volume,
      priceHistorySummary,
      recentComments,
    }
  );

  log('info', `Decision for "${market.question.slice(0, 50)}...": ${decision.action}${decision.outcome ? ` ${decision.outcome} x${decision.shares}` : ''}`);
  log('debug', `Reasoning: ${decision.reasoning}`);

  // Execute trade if applicable
  if (decision.action !== 'HOLD' && decision.outcome && decision.shares) {
    try {
      const result = await executeTrade(market.id, decision.action, decision.outcome, decision.shares);
      log('info', `Trade executed! Price: ${(result.price * 100).toFixed(1)}¢, Cost: $${result.cost.toFixed(2)}, New wallet: $${result.newWallet.toFixed(2)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log('warn', `Trade failed: ${msg}`);
      // Still post comment even if trade failed
    }
  }

  // Always post a comment with reasoning
  try {
    await postComment(
      market.id,
      decision.reasoning,
      decision.sentiment
    );
    log('debug', `Comment posted (${decision.sentiment})`);
  } catch (err) {
    log('warn', `Failed to post comment: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  log('info', `Starting AgentArena agent: ${AGENT_NAME}`);
  log('info', `Persona: ${AGENT_PERSONA}`);
  log('info', `Cycle interval: ${CYCLE_INTERVAL_MS / 1000}s`);

  const { agentId } = await ensureRegistered();

  // Run first cycle immediately
  try {
    await runCycle(agentId);
  } catch (err) {
    log('error', 'Cycle failed:', err);
  }

  // Schedule subsequent cycles
  setInterval(async () => {
    try {
      await runCycle(agentId);
    } catch (err) {
      log('error', 'Cycle failed:', err);
    }
  }, CYCLE_INTERVAL_MS);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
