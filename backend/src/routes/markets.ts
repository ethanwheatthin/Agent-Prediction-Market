import { Router, Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { syncMarkets } from '../services/marketSync';
import { fetchPriceHistory } from '../services/polymarket';
import { getSentimentHistory, getLatestSentiment } from '../services/sentiment';

const router = Router();

// GET /markets
router.get('/', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string ?? '1');
  const limit = Math.min(parseInt(req.query.limit as string ?? '20'), 100);
  const skip = (page - 1) * limit;
  const search = req.query.search as string | undefined;
  const active = req.query.active !== 'false';

  const where: Record<string, unknown> = { active };
  if (search) {
    where.question = { contains: search, mode: 'insensitive' };
  }

  const [markets, total] = await Promise.all([
    prisma.market.findMany({
      where,
      orderBy: { volume: 'desc' },
      take: limit,
      skip,
      select: {
        id: true,
        eventId: true,
        question: true,
        description: true,
        outcomes: true,
        outcomePrices: true,
        volume: true,
        liquidity: true,
        active: true,
        closed: true,
        endDate: true,
        image: true,
        icon: true,
        lastSyncedAt: true,
      },
    }),
    prisma.market.count({ where }),
  ]);

  // Add sentiment summary to each market
  const marketsWithSentiment = await Promise.all(
    markets.map(async (market) => {
      const sentiment = await getLatestSentiment(market.id);
      return { ...market, sentiment };
    })
  );

  return res.json({ markets: marketsWithSentiment, total, page, limit });
});

// GET /markets/:id
router.get('/:id', async (req: Request, res: Response) => {
  const market = await prisma.market.findUnique({
    where: { id: req.params.id },
    include: {
      positions: {
        include: { agent: { select: { id: true, name: true } } },
      },
      _count: { select: { comments: true, trades: true } },
    },
  });

  if (!market) return res.status(404).json({ error: 'Market not found' });

  // Fetch price history from Polymarket CLOB
  let priceHistory: unknown[] = [];
  if (market.conditionId) {
    try {
      priceHistory = await fetchPriceHistory(market.conditionId);
    } catch {
      // ignore
    }
  }

  // Get sentiment history
  const sentimentHistory = await getSentimentHistory(market.id);
  const latestSentiment = await getLatestSentiment(market.id);

  return res.json({
    ...market,
    priceHistory,
    sentimentHistory,
    latestSentiment,
  });
});

// GET /markets/:id/comments
router.get('/:id/comments', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string ?? '1');
  const limit = Math.min(parseInt(req.query.limit as string ?? '20'), 100);
  const skip = (page - 1) * limit;

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: { marketId: req.params.id },
      include: { agent: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    }),
    prisma.comment.count({ where: { marketId: req.params.id } }),
  ]);

  return res.json({ comments, total, page, limit });
});

// GET /markets/:id/sentiment
router.get('/:id/sentiment', async (req: Request, res: Response) => {
  const history = await getSentimentHistory(req.params.id);
  const latest = await getLatestSentiment(req.params.id);
  return res.json({ history, latest });
});

// POST /markets/sync (admin trigger)
router.post('/sync', async (_req: Request, res: Response) => {
  try {
    // Run sync in background
    syncMarkets().catch(console.error);
    return res.json({ message: 'Market sync triggered' });
  } catch (err) {
    return res.status(500).json({ error: 'Sync failed' });
  }
});

export default router;
