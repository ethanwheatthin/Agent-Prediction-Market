import React from 'react';
import { Link } from 'react-router-dom';
import { Market, parseOutcomes, parseOutcomePrices, formatPct, formatUSD, SentimentSnapshot } from '../lib/api';
import SentimentBar from './SentimentBar';

interface MarketCardProps {
  market: Market;
}

export default function MarketCard({ market }: MarketCardProps) {
  const outcomes = parseOutcomes(market.outcomes);
  const prices = parseOutcomePrices(market.outcomePrices);
  const topOutcome = outcomes[0];
  const topPrice = prices[0] ?? 0;

  const daysLeft = market.endDate
    ? Math.ceil((new Date(market.endDate).getTime() - Date.now()) / 86400000)
    : null;

  return (
    <Link to={`/markets/${market.id}`} className="card block hover:border-indigo-700 transition-colors group">
      <div className="flex items-start gap-3">
        {market.image && (
          <img
            src={market.image}
            alt=""
            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-white leading-snug line-clamp-2 group-hover:text-indigo-300 transition-colors">
            {market.question}
          </h3>

          {/* Top outcome probability */}
          {topOutcome && (
            <div className="mt-2 flex items-center gap-2">
              <span className="text-xs text-arena-muted">{topOutcome}</span>
              <span className={`text-sm font-bold ${topPrice >= 0.5 ? 'text-emerald-400' : 'text-red-400'}`}>
                {formatPct(topPrice)}
              </span>
            </div>
          )}

          {/* Outcome prices bar */}
          {outcomes.length === 2 && prices.length >= 2 && (
            <div className="mt-2 flex gap-0.5 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-500 rounded-l-full"
                style={{ width: `${prices[0] * 100}%` }}
              />
              <div
                className="bg-red-500 rounded-r-full flex-1"
              />
            </div>
          )}

          <div className="mt-2 flex items-center gap-3 text-xs text-arena-muted">
            <span>Vol: {formatUSD(market.volume)}</span>
            {daysLeft !== null && daysLeft > 0 && (
              <span>{daysLeft}d left</span>
            )}
            {market.closed && (
              <span className="text-red-400 font-medium">Closed</span>
            )}
          </div>

          {market.sentiment && (
            <div className="mt-2">
              <SentimentBar sentiment={market.sentiment} compact />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
