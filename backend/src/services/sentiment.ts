import { prisma } from '../prisma/client';
import { broadcast } from '../websocket';

type SentimentValue = 'BULLISH' | 'BEARISH' | 'NEUTRAL';

export async function aggregateSentiment(
  marketId: string,
  sentiment: SentimentValue,
  currentPrice: number
): Promise<void> {
  // Get current counts from recent comments (last 50)
  const recentComments = await prisma.comment.findMany({
    where: { marketId, sentiment: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });

  const counts = { bullish: 0, bearish: 0, neutral: 0 };
  for (const c of recentComments) {
    if (c.sentiment === 'BULLISH') counts.bullish++;
    else if (c.sentiment === 'BEARISH') counts.bearish++;
    else if (c.sentiment === 'NEUTRAL') counts.neutral++;
  }

  // Create snapshot
  await prisma.sentimentSnapshot.create({
    data: {
      marketId,
      bullish: counts.bullish,
      bearish: counts.bearish,
      neutral: counts.neutral,
      avgPrice: currentPrice,
    },
  });

  // Broadcast sentiment update
  broadcast('sentiment_update', {
    marketId,
    bullish: counts.bullish,
    bearish: counts.bearish,
    neutral: counts.neutral,
  });
}

export async function getLatestSentiment(marketId: string) {
  return prisma.sentimentSnapshot.findFirst({
    where: { marketId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getSentimentHistory(marketId: string) {
  return prisma.sentimentSnapshot.findMany({
    where: { marketId },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
}
