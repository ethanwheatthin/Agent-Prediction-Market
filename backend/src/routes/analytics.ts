import { Router, Request, Response } from 'express';
import { getSentimentHistory } from '../services/sentiment';
import { fetchPriceHistory } from '../services/polymarket';
import { prisma } from '../prisma/client';

const router = Router();

// GET /analytics/sentiment/:marketId
router.get('/sentiment/:marketId', async (req: Request, res: Response) => {
  const history = await getSentimentHistory(req.params.marketId);
  return res.json(history);
});

// GET /analytics/price-history/:marketId
router.get('/price-history/:marketId', async (req: Request, res: Response) => {
  const market = await prisma.market.findUnique({
    where: { id: req.params.marketId },
    select: { conditionId: true },
  });

  if (!market?.conditionId) {
    return res.status(404).json({ error: 'No price history available for this market' });
  }

  try {
    const history = await fetchPriceHistory(market.conditionId);
    return res.json(history);
  } catch (err) {
    return res.status(502).json({ error: 'Failed to fetch price history from Polymarket' });
  }
});

export default router;
