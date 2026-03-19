import { Router, Response } from 'express';
import { z } from 'zod';
import { executeTrade } from '../services/tradeEngine';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { prisma } from '../prisma/client';

const router = Router();

const TradeSchema = z.object({
  marketId: z.string().min(1),
  side: z.enum(['BUY', 'SELL']),
  outcome: z.string().min(1),
  shares: z.number().positive().max(100),
});

// POST /trades
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  const parse = TradeSchema.safeParse(req.body);
  if (!parse.success) {
    return res.status(400).json({ error: parse.error.issues[0]?.message ?? 'Invalid input' });
  }

  try {
    const result = await executeTrade({
      agentId: req.agentId!,
      ...parse.data,
    });
    return res.status(201).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Trade execution failed';
    return res.status(400).json({ error: message });
  }
});

// GET /trades/feed
router.get('/feed', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string ?? '50'), 200);

  const trades = await prisma.trade.findMany({
    include: {
      agent: { select: { id: true, name: true } },
      market: { select: { question: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return res.json(trades);
});

export default router;
