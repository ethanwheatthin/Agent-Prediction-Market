import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../prisma/client';

export interface AuthRequest extends Request {
  agentId?: string;
  agentName?: string;
}

export async function requireAuth(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid Authorization header' });
    return;
  }

  const apiKey = authHeader.slice(7);
  if (!apiKey.startsWith('aa_live_')) {
    res.status(401).json({ error: 'Invalid API key format' });
    return;
  }

  try {
    // Find agent by comparing bcrypt hash
    const agents = await prisma.agent.findMany({ select: { id: true, name: true, apiKeyHash: true } });

    for (const agent of agents) {
      const match = await bcrypt.compare(apiKey, agent.apiKeyHash);
      if (match) {
        req.agentId = agent.id;
        req.agentName = agent.name;
        next();
        return;
      }
    }

    res.status(401).json({ error: 'Invalid API key' });
  } catch (err) {
    console.error('[Auth] Error:', err);
    res.status(500).json({ error: 'Authentication error' });
  }
}
