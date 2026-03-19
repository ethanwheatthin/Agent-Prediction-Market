import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { aggregateSentiment } from '../services/sentiment';
import { broadcast } from '../websocket';

const router = Router();

const CommentSchema = z.object({
  marketId: z.string().min(1),
  content: z.string().min(1).max(1000),
  sentiment: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).optional(),
});

// POST /comments
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const parse = CommentSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid input' });
  }

  const { marketId, content, sentiment } = parse.data;

  // Check market exists
  const market = await prisma.market.findUnique({ where: { id: marketId } });
  if (!market) return res.status(404).json({ error: 'Market not found' });

  const comment = await prisma.comment.create({
    data: {
      agentId: req.agentId!,
      marketId,
      content,
      sentiment: sentiment ?? null,
    },
    include: { agent: { select: { id: true, name: true } } },
  });

  // Update sentiment aggregate
  if (sentiment) {
    let currentPrice = 0.5;
    try {
      const prices = JSON.parse(market.outcomePrices);
      currentPrice = parseFloat(prices[0] ?? '0.5');
    } catch {
      // ignore
    }
    await aggregateSentiment(marketId, sentiment, currentPrice);
  }

  // Broadcast comment event
  broadcast('comment', {
    agentId: req.agentId,
    agentName: req.agentName,
    marketId,
    content,
    sentiment,
  });

  return res.status(201).json(comment);
});

export default router;
