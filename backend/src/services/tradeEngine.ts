import { prisma } from '../prisma/client';
import { fetchMarketPrice } from './polymarket';
import { broadcast } from '../websocket';

interface TradeInput {
  agentId: string;
  marketId: string;
  side: 'BUY' | 'SELL';
  outcome: string;
  shares: number;
}

interface TradeResult {
  tradeId: string;
  price: number;
  cost: number;
  newWallet: number;
}

const MAX_SHARES_PER_TRADE = 100;

export async function executeTrade(input: TradeInput): Promise<TradeResult> {
  const { agentId, marketId, side, outcome, shares } = input;

  if (shares <= 0 || shares > MAX_SHARES_PER_TRADE) {
    throw new Error(`Shares must be between 1 and ${MAX_SHARES_PER_TRADE}`);
  }

  // Fetch market
  const market = await prisma.market.findUnique({ where: { id: marketId } });
  if (!market) throw new Error('Market not found');
  if (market.closed) throw new Error('Market is closed');
  if (!market.active) throw new Error('Market is not active');

  // Validate outcome
  let outcomes: string[] = [];
  let outcomePrices: string[] = [];
  try {
    outcomes = JSON.parse(market.outcomes);
    outcomePrices = JSON.parse(market.outcomePrices);
  } catch {
    throw new Error('Invalid market data');
  }

  const outcomeIndex = outcomes.indexOf(outcome);
  if (outcomeIndex === -1) {
    throw new Error(`Invalid outcome. Valid outcomes: ${outcomes.join(', ')}`);
  }

  // Get live price from Polymarket CLOB
  let price: number;
  let clobTokenIds: string[] = [];
  try {
    clobTokenIds = JSON.parse(market.clobTokenIds);
  } catch {
    clobTokenIds = [];
  }

  const tokenId = clobTokenIds[outcomeIndex];
  if (tokenId) {
    const livePrice = await fetchMarketPrice(tokenId);
    price = livePrice ?? parseFloat(outcomePrices[outcomeIndex] ?? '0.5');
  } else {
    price = parseFloat(outcomePrices[outcomeIndex] ?? '0.5');
  }

  if (price <= 0 || price >= 1) {
    // Clamp price to valid range
    price = Math.max(0.01, Math.min(0.99, price));
  }

  const cost = shares * price;

  // Fetch agent
  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent) throw new Error('Agent not found');

  if (side === 'BUY') {
    if (agent.wallet < cost) {
      throw new Error(`Insufficient funds. Need $${cost.toFixed(2)}, have $${agent.wallet.toFixed(2)}`);
    }
  } else {
    // SELL — agent must have enough shares
    const position = await prisma.position.findUnique({
      where: { agentId_marketId_outcome: { agentId, marketId, outcome } },
    });
    if (!position || position.shares < shares) {
      throw new Error(`Insufficient shares to sell`);
    }
  }

  // Execute in a transaction
  const result = await prisma.$transaction(async (tx) => {
    // Create trade record
    const trade = await tx.trade.create({
      data: { agentId, marketId, side, outcome, shares, price, cost },
    });

    let newWallet: number;

    if (side === 'BUY') {
      // Debit wallet
      const updatedAgent = await tx.agent.update({
        where: { id: agentId },
        data: {
          wallet: { decrement: cost },
          tradeCount: { increment: 1 },
        },
      });
      newWallet = updatedAgent.wallet;

      // Update or create position
      const existing = await tx.position.findUnique({
        where: { agentId_marketId_outcome: { agentId, marketId, outcome } },
      });

      if (existing) {
        const newShares = existing.shares + shares;
        const newAvgPrice = (existing.shares * existing.avgPrice + shares * price) / newShares;
        await tx.position.update({
          where: { id: existing.id },
          data: { shares: newShares, avgPrice: newAvgPrice },
        });
      } else {
        await tx.position.create({
          data: { agentId, marketId, outcome, shares, avgPrice: price },
        });
      }
    } else {
      // SELL — credit wallet
      const updatedAgent = await tx.agent.update({
        where: { id: agentId },
        data: {
          wallet: { increment: cost },
          tradeCount: { increment: 1 },
        },
      });
      newWallet = updatedAgent.wallet;

      // Reduce position
      const position = await tx.position.findUnique({
        where: { agentId_marketId_outcome: { agentId, marketId, outcome } },
      });
      if (position) {
        const newShares = position.shares - shares;
        if (newShares <= 0) {
          await tx.position.delete({ where: { id: position.id } });
        } else {
          await tx.position.update({ where: { id: position.id }, data: { shares: newShares } });
        }
      }
    }

    return { tradeId: trade.id, price, cost, newWallet };
  });

  // Broadcast trade event
  broadcast('trade', {
    agentId,
    agentName: agent.name,
    marketId,
    question: market.question,
    side,
    outcome,
    shares,
    price,
  });

  return result;
}
