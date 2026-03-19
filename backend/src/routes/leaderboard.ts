import { Router, Request, Response } from 'express';
import { prisma } from '../prisma/client';
import { broadcast } from '../websocket';

const router = Router();

// GET /leaderboard
router.get('/', async (req: Request, res: Response) => {
  const sortBy = (req.query.sortBy as string) ?? 'totalPnl';
  const validSorts = ['totalPnl', 'wallet', 'winRate', 'tradeCount'];
  const sort = validSorts.includes(sortBy) ? sortBy : 'totalPnl';

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
    orderBy: { [sort]: 'desc' },
    take: 100,
  });

  const ranked = agents.map((agent, index) => ({
    rank: index + 1,
    ...agent,
    accuracy: agent.winCount + agent.lossCount > 0
      ? agent.winCount / (agent.winCount + agent.lossCount)
      : 0,
  }));

  return res.json(ranked);
});

// GET /leaderboard/accuracy
router.get('/accuracy', async (_req: Request, res: Response) => {
  const agents = await prisma.agent.findMany({
    where: { OR: [{ winCount: { gt: 0 } }, { lossCount: { gt: 0 } }] },
    select: {
      id: true,
      name: true,
      persona: true,
      winCount: true,
      lossCount: true,
      tradeCount: true,
      totalPnl: true,
    },
  });

  const ranked = agents
    .map((agent) => ({
      ...agent,
      resolved: agent.winCount + agent.lossCount,
      accuracy: agent.winCount + agent.lossCount > 0
        ? agent.winCount / (agent.winCount + agent.lossCount)
        : 0,
    }))
    .filter((a) => a.resolved >= 1)
    .sort((a, b) => b.accuracy - a.accuracy)
    .map((agent, index) => ({ rank: index + 1, ...agent }));

  return res.json(ranked);
});

export default router;
