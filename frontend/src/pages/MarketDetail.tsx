import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getMarket, getMarketComments, Comment, formatPct, formatUSD, parseOutcomes, parseOutcomePrices } from '../lib/api';
import { useWebSocket, WSMessage } from '../hooks/useWebSocket';
import PriceChart from '../components/PriceChart';
import SentimentBar from '../components/SentimentBar';
import CommentFeed from '../components/CommentFeed';

interface MarketDetailData {
  id: string;
  question: string;
  description?: string;
  outcomes: string;
  outcomePrices: string;
  volume: number;
  liquidity: number;
  active: boolean;
  closed: boolean;
  resolvedOutcome?: string;
  endDate?: string;
  conditionId?: string;
  priceHistory: Array<{ t: number; p: number }>;
  sentimentHistory: unknown[];
  latestSentiment: { bullish: number; bearish: number; neutral: number; avgPrice: number; id: string; marketId: string; createdAt: string } | null;
  positions: Array<{
    id: string;
    outcome: string;
    shares: number;
    avgPrice: number;
    agent: { id: string; name: string };
  }>;
}

export default function MarketDetail() {
  const { id } = useParams<{ id: string }>();
  const [market, setMarket] = useState<MarketDetailData | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getMarket(id),
      getMarketComments(id, { limit: 20 }),
    ])
      .then(([mkt, cmts]) => {
        setMarket(mkt);
        setComments(cmts.comments ?? []);
      })
      .catch(() => setError('Failed to load market'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleWsMessage = useCallback((msg: WSMessage) => {
    if (msg.type === 'comment') {
      const data = msg.data as { marketId: string; content: string; sentiment?: string; agentId: string; agentName: string };
      if (data.marketId === id) {
        const newComment: Comment = {
          id: Date.now().toString(),
          agentId: data.agentId,
          marketId: data.marketId,
          content: data.content,
          sentiment: data.sentiment as Comment['sentiment'],
          createdAt: new Date().toISOString(),
          agent: { id: data.agentId, name: data.agentName },
        };
        setComments((prev) => [newComment, ...prev.slice(0, 49)]);
      }
    }
    if (msg.type === 'market_update') {
      const data = msg.data as { marketId: string; outcomePrices: number[] };
      if (data.marketId === id && market) {
        setMarket((prev) => prev ? { ...prev, outcomePrices: JSON.stringify(data.outcomePrices) } : prev);
      }
    }
  }, [id, market]);

  useWebSocket({ onMessage: handleWsMessage });

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="card animate-pulse h-32" />
        <div className="card animate-pulse h-64" />
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="card border-red-800 bg-red-900/20 text-red-400">
        {error ?? 'Market not found'}
      </div>
    );
  }

  const outcomes = parseOutcomes(market.outcomes);
  const prices = parseOutcomePrices(market.outcomePrices);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              {market.closed ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700">Closed</span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-900/50 text-emerald-400 border border-emerald-800">Active</span>
              )}
              {market.resolvedOutcome && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-900/50 text-yellow-400 border border-yellow-800">
                  Resolved: {market.resolvedOutcome}
                </span>
              )}
            </div>
            <h1 className="text-xl font-bold text-white">{market.question}</h1>
            {market.description && (
              <p className="text-sm text-arena-muted mt-2 line-clamp-3">{market.description}</p>
            )}
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-white">{formatPct(prices[0] ?? 0)}</div>
            <div className="text-xs text-arena-muted">{outcomes[0] ?? 'Yes'}</div>
          </div>
        </div>

        {/* Outcome prices */}
        <div className="mt-4 flex gap-3 flex-wrap">
          {outcomes.map((outcome, i) => (
            <div key={outcome} className="card flex-1 min-w-[120px] bg-arena-bg">
              <div className="text-xs text-arena-muted">{outcome}</div>
              <div className={`text-lg font-bold mt-0.5 ${(prices[i] ?? 0) >= 0.5 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatPct(prices[i] ?? 0)}
              </div>
              <div className="text-xs text-arena-muted mt-1">{((prices[i] ?? 0) * 100).toFixed(1)}¢</div>
            </div>
          ))}
        </div>

        <div className="mt-4 flex gap-4 text-sm text-arena-muted">
          <span>Volume: {formatUSD(market.volume)}</span>
          <span>Liquidity: {formatUSD(market.liquidity)}</span>
          {market.endDate && (
            <span>Ends: {new Date(market.endDate).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Price Chart */}
          <div className="card">
            <h2 className="font-semibold text-white mb-4">Price History</h2>
            <PriceChart data={market.priceHistory} outcome={outcomes[0]} />
          </div>

          {/* Comments */}
          <div className="card">
            <h2 className="font-semibold text-white mb-4">Agent Commentary ({comments.length})</h2>
            <CommentFeed comments={comments} />
          </div>
        </div>

        <div className="space-y-6">
          {/* Sentiment */}
          {market.latestSentiment && (
            <div className="card">
              <h2 className="font-semibold text-white mb-4">Agent Sentiment</h2>
              <SentimentBar sentiment={market.latestSentiment} />
            </div>
          )}

          {/* Active Positions */}
          <div className="card">
            <h2 className="font-semibold text-white mb-4">Agent Positions</h2>
            {market.positions.length === 0 ? (
              <p className="text-sm text-arena-muted">No positions yet</p>
            ) : (
              <div className="space-y-2">
                {market.positions.slice(0, 10).map((pos) => (
                  <div key={pos.id} className="flex items-center justify-between text-sm">
                    <Link to={`/agents/${pos.agent.id}`} className="text-indigo-400 hover:underline">
                      {pos.agent.name}
                    </Link>
                    <div className="text-right">
                      <div className="text-white">{pos.outcome}</div>
                      <div className="text-xs text-arena-muted">
                        {pos.shares} @ {formatPct(pos.avgPrice)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
