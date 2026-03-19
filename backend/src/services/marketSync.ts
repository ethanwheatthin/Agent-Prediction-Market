import cron from 'node-cron';
import { prisma } from '../prisma/client';
import { fetchActiveEvents, fetchActiveMarkets, PolymarketMarket } from './polymarket';
import { broadcast } from '../websocket';

const SYNC_INTERVAL_MS = parseInt(process.env.MARKET_SYNC_INTERVAL_MS ?? '300000');

function cronExpression(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60000));
  return `*/${minutes} * * * *`;
}

async function upsertMarket(market: PolymarketMarket, eventId: string): Promise<void> {
  try {
    const data = {
      eventId,
      question: market.question,
      description: market.description ?? null,
      outcomes: market.outcomes ?? '[]',
      outcomePrices: market.outcomePrices ?? '[]',
      volume: market.volumeNum ?? market.volume ?? 0,
      liquidity: market.liquidityNum ?? market.liquidity ?? 0,
      clobTokenIds: market.clobTokenIds ?? '[]',
      conditionId: market.conditionId ?? null,
      image: market.image ?? null,
      icon: market.icon ?? null,
      active: market.active,
      closed: market.closed,
      endDate: market.endDate ? new Date(market.endDate) : null,
      startDate: market.startDate ? new Date(market.startDate) : null,
      lastSyncedAt: new Date(),
    };

    await prisma.market.upsert({
      where: { id: market.id },
      update: data,
      create: { id: market.id, ...data },
    });
  } catch (err) {
    console.error(`[MarketSync] Failed to upsert market ${market.id}:`, err);
  }
}

async function checkResolutions(): Promise<void> {
  // Find closed markets that haven't been resolved yet
  const closedMarkets = await prisma.market.findMany({
    where: { closed: true, resolvedOutcome: null },
    include: { positions: { include: { agent: true } } },
  });

  for (const market of closedMarkets) {
    // Parse outcomes and prices to determine resolved outcome
    let outcomes: string[] = [];
    let prices: string[] = [];
    try {
      outcomes = JSON.parse(market.outcomes);
      prices = JSON.parse(market.outcomePrices);
    } catch {
      continue;
    }

    // Find the outcome with price closest to 1.0 (winner)
    let resolvedOutcome: string | null = null;
    let maxPrice = 0;
    for (let i = 0; i < outcomes.length; i++) {
      const price = parseFloat(prices[i] ?? '0');
      if (price > maxPrice) {
        maxPrice = price;
        resolvedOutcome = outcomes[i];
      }
    }

    // Only resolve if winner is clear (price > 0.95)
    if (!resolvedOutcome || maxPrice < 0.95) continue;

    await resolveMarket(market.id, resolvedOutcome);
  }
}

export async function resolveMarket(marketId: string, resolvedOutcome: string): Promise<void> {
  const market = await prisma.market.findUnique({
    where: { id: marketId },
    include: { positions: { include: { agent: true } } },
  });
  if (!market) return;

  // Update market resolution
  await prisma.market.update({
    where: { id: marketId },
    data: { resolvedOutcome },
  });

  // Score each agent position
  for (const position of market.positions) {
    const won = position.outcome === resolvedOutcome;
    const pnl = won
      ? position.shares * 1.0 - position.shares * position.avgPrice // profit: full payout minus cost
      : -(position.shares * position.avgPrice); // loss: cost of position

    // Update agent wallet
    if (won) {
      await prisma.agent.update({
        where: { id: position.agentId },
        data: {
          wallet: { increment: position.shares * 1.0 }, // full payout
          totalPnl: { increment: pnl },
          winCount: { increment: 1 },
        },
      });
    } else {
      await prisma.agent.update({
        where: { id: position.agentId },
        data: {
          totalPnl: { increment: pnl },
          lossCount: { increment: 1 },
        },
      });
    }

    // Update winRate
    const agent = await prisma.agent.findUnique({ where: { id: position.agentId } });
    if (agent) {
      const totalResolved = agent.winCount + agent.lossCount;
      await prisma.agent.update({
        where: { id: position.agentId },
        data: {
          winRate: totalResolved > 0 ? agent.winCount / totalResolved : 0,
        },
      });
    }

    // Delete the position (it's been resolved)
    await prisma.position.delete({ where: { id: position.id } });
  }

  // Broadcast resolution event
  const winners = market.positions
    .filter((p) => p.outcome === resolvedOutcome)
    .map((p) => ({ agentId: p.agentId }));

  broadcast('resolution', {
    marketId,
    question: market.question,
    resolvedOutcome,
    winners,
  });

  console.log(`[Resolution] Market ${marketId} resolved: ${resolvedOutcome}`);
}

export async function syncMarkets(): Promise<void> {
  console.log('[MarketSync] Starting sync from Polymarket...');
  try {
    const events = await fetchActiveEvents(50);
    let synced = 0;

    for (const event of events) {
      if (!event.markets?.length) continue;
      for (const market of event.markets) {
        await upsertMarket(market, event.id);
        synced++;

        // Broadcast market update
        try {
          const prices = JSON.parse(market.outcomePrices ?? '[]');
          broadcast('market_update', {
            marketId: market.id,
            outcomePrices: prices,
            volume: market.volumeNum ?? market.volume ?? 0,
          });
        } catch {
          // ignore broadcast errors
        }
      }
    }

    // Also fetch direct markets in case some aren't in events
    try {
      const markets = await fetchActiveMarkets(100);
      for (const market of markets) {
        if (market.eventId) {
          await upsertMarket(market, market.eventId);
          synced++;
        }
      }
    } catch (err) {
      console.warn('[MarketSync] Direct market fetch failed:', err);
    }

    await checkResolutions();
    console.log(`[MarketSync] Synced ${synced} markets`);
  } catch (err) {
    console.error('[MarketSync] Sync failed:', err);
  }
}

export function startMarketSync(): void {
  const expr = cronExpression(SYNC_INTERVAL_MS);
  console.log(`[MarketSync] Scheduling sync with cron: ${expr}`);

  // Run immediately on startup
  syncMarkets().catch(console.error);

  cron.schedule(expr, () => {
    syncMarkets().catch(console.error);
  });
}
