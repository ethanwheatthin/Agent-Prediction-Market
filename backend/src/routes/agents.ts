import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../prisma/client';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
const SALT_ROUNDS = parseInt(process.env.API_KEY_SALT_ROUNDS ?? '10');

// POST /agents/register
router.post('/register', async (req: Request, res: Response) => {
  const { name, persona } = req.body;

  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return res.status(400).json({ error: 'Agent name must be at least 2 characters' });
  }

  const trimmedName = name.trim();

  // Check uniqueness
  const existing = await prisma.agent.findUnique({ where: { name: trimmedName } });
  if (existing) {
    return res.status(409).json({ error: 'Agent name already taken' });
  }

  // Generate API key
  const rawKey = `aa_live_${uuidv4().replace(/-/g, '')}`;
  const apiKeyHash = await bcrypt.hash(rawKey, SALT_ROUNDS);

  const agent = await prisma.agent.create({
    data: {
      name: trimmedName,
      persona: persona ?? null,
      apiKeyHash,
    },
  });

  return res.status(201).json({
    agentId: agent.id,
    name: agent.name,
    apiKey: rawKey,
    wallet: agent.wallet,
    message: 'Agent registered successfully. Save your API key — it will not be shown again.',
  });
});

// GET /agents/:id
router.get('/:id', async (req: Request, res: Response) => {
  const agent = await prisma.agent.findUnique({
    where: { id: req.params.id },
    include: {
      positions: {
        include: { market: { select: { question: true, outcomePrices: true, outcomes: true, closed: true } } },
      },
    },
  });

  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const { apiKeyHash: _, ...safeAgent } = agent;
  return res.json(safeAgent);
});

// GET /agents/:id/trades
router.get('/:id/trades', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string ?? '1');
  const limit = Math.min(parseInt(req.query.limit as string ?? '20'), 100);
  const skip = (page - 1) * limit;

  const [trades, total] = await Promise.all([
    prisma.trade.findMany({
      where: { agentId: req.params.id },
      include: { market: { select: { question: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    }),
    prisma.trade.count({ where: { agentId: req.params.id } }),
  ]);

  return res.json({ trades, total, page, limit });
});

// GET /agents/:id/comments
router.get('/:id/comments', async (req: Request, res: Response) => {
  const page = parseInt(req.query.page as string ?? '1');
  const limit = Math.min(parseInt(req.query.limit as string ?? '20'), 100);
  const skip = (page - 1) * limit;

  const [comments, total] = await Promise.all([
    prisma.comment.findMany({
      where: { agentId: req.params.id },
      include: { market: { select: { question: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    }),
    prisma.comment.count({ where: { agentId: req.params.id } }),
  ]);

  return res.json({ comments, total, page, limit });
});

// GET /agents (list all for leaderboard etc)
router.get('/', async (_req: Request, res: Response) => {
  const agents = await prisma.agent.findMany({
    select: {
      id: true,
      name: true,
      persona: true,
      wallet: true,
      totalPnl: true,
      winRate: true,
      tradeCount: true,
      winCount: true,
      lossCount: true,
      createdAt: true,
    },
    orderBy: { totalPnl: 'desc' },
  });
  return res.json(agents);
});

export default router;
