import Anthropic from '@anthropic-ai/sdk';
import axios from 'axios';

export interface TradeDecision {
  action: 'BUY' | 'SELL' | 'HOLD';
  outcome?: string;
  shares?: number;
  reasoning: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

export async function decideTrade(
  agentName: string,
  agentPersona: string,
  walletBalance: number,
  positions: Array<{ marketId: string; outcome: string; shares: number; avgPrice: number }>,
  market: {
    id: string;
    question: string;
    outcomes: string[];
    outcomePrices: number[];
    volume: number;
    priceHistorySummary: string;
    recentComments: string[];
  }
): Promise<TradeDecision> {
  const prompt = buildPrompt(agentName, agentPersona, walletBalance, positions, market);

  if (anthropic) {
    return decideWithClaude(prompt);
  } else if (process.env.OLLAMA_URL) {
    return decideWithOllama(prompt);
  } else {
    // Fallback: random decision for testing
    return randomDecision(market.outcomes, market.outcomePrices);
  }
}

function buildPrompt(
  agentName: string,
  agentPersona: string,
  walletBalance: number,
  positions: Array<{ marketId: string; outcome: string; shares: number; avgPrice: number }>,
  market: { question: string; outcomes: string[]; outcomePrices: number[]; volume: number; priceHistorySummary: string; recentComments: string[] }
): string {
  const outcomeList = market.outcomes
    .map((o, i) => `  "${o}": ${((market.outcomePrices[i] ?? 0) * 100).toFixed(1)}¢`)
    .join('\n');

  const positionSummary = positions.length > 0
    ? positions.map((p) => `  ${p.outcome} x${p.shares} @ ${(p.avgPrice * 100).toFixed(1)}¢`).join('\n')
    : '  (no open positions)';

  const commentSummary = market.recentComments.length > 0
    ? market.recentComments.slice(0, 3).join('\n')
    : '  (no recent commentary)';

  return `You are ${agentName}, a prediction market trader with persona: ${agentPersona}.
You have $${walletBalance.toFixed(2)} in fake money.

Current portfolio:
${positionSummary}

Market: "${market.question}"
Current prices:
${outcomeList}
24h volume: $${market.volume.toLocaleString()}
Price history: ${market.priceHistorySummary}

Recent agent commentary:
${commentSummary}

Decide:
1. ACTION: BUY / SELL / HOLD
2. OUTCOME: Which outcome to trade (if applicable)
3. SHARES: How many shares (max 25 per trade, must be positive integer)
4. REASONING: 2-3 sentence explanation
5. SENTIMENT: BULLISH / BEARISH / NEUTRAL

Respond ONLY as valid JSON, no markdown:
{"action":"BUY","outcome":"Yes","shares":10,"reasoning":"...","sentiment":"BULLISH"}`;
}

async function decideWithClaude(prompt: string): Promise<TradeDecision> {
  const message = await anthropic!.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0]?.type === 'text' ? message.content[0].text : '{}';
  return parseDecision(text);
}

async function decideWithOllama(prompt: string): Promise<TradeDecision> {
  const url = process.env.OLLAMA_URL ?? 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL ?? 'llama3';

  const res = await axios.post(`${url}/api/generate`, {
    model,
    prompt,
    stream: false,
    format: 'json',
  });

  return parseDecision(res.data?.response ?? '{}');
}

function parseDecision(text: string): TradeDecision {
  try {
    // Extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      action: (['BUY', 'SELL', 'HOLD'].includes(parsed.action) ? parsed.action : 'HOLD') as TradeDecision['action'],
      outcome: parsed.outcome,
      shares: Math.min(25, Math.max(1, Math.round(parsed.shares ?? 5))),
      reasoning: parsed.reasoning ?? 'No reasoning provided',
      sentiment: (['BULLISH', 'BEARISH', 'NEUTRAL'].includes(parsed.sentiment) ? parsed.sentiment : 'NEUTRAL') as TradeDecision['sentiment'],
    };
  } catch {
    return {
      action: 'HOLD',
      reasoning: 'Failed to parse LLM response',
      sentiment: 'NEUTRAL',
    };
  }
}

function randomDecision(outcomes: string[], prices: number[]): TradeDecision {
  const actions: TradeDecision['action'][] = ['BUY', 'SELL', 'HOLD', 'HOLD'];
  const action = actions[Math.floor(Math.random() * actions.length)]!;
  const outcomeIndex = Math.floor(Math.random() * outcomes.length);
  const sentiments: TradeDecision['sentiment'][] = ['BULLISH', 'BEARISH', 'NEUTRAL'];

  return {
    action,
    outcome: action !== 'HOLD' ? outcomes[outcomeIndex] : undefined,
    shares: action !== 'HOLD' ? Math.floor(Math.random() * 10) + 1 : undefined,
    reasoning: `Random ${action.toLowerCase()} decision for testing without LLM configured.`,
    sentiment: sentiments[Math.floor(Math.random() * sentiments.length)]!,
  };
}
