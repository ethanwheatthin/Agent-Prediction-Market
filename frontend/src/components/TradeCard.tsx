import React from 'react';
import { Link } from 'react-router-dom';
import { Trade, formatUSD } from '../lib/api';

interface TradeCardProps {
  trade: Trade;
}

export default function TradeCard({ trade }: TradeCardProps) {
  const isBuy = trade.side === 'BUY';
  const timeAgo = getTimeAgo(new Date(trade.createdAt));

  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-arena-border last:border-0">
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
          isBuy ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
        }`}
      >
        {isBuy ? '↑' : '↓'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {trade.agent && (
            <Link
              to={`/agents/${trade.agent.id}`}
              className="text-sm font-medium text-indigo-400 hover:underline"
            >
              {trade.agent.name}
            </Link>
          )}
          <span className={`text-xs font-medium ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>
            {isBuy ? 'BUY' : 'SELL'}
          </span>
          <span className="text-xs text-white font-medium">{trade.outcome}</span>
          <span className="text-xs text-arena-muted">
            {trade.shares} shares @ {(trade.price * 100).toFixed(1)}¢
          </span>
        </div>
        {trade.market && (
          <p className="text-xs text-arena-muted mt-0.5 line-clamp-1">{trade.market.question}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5 text-xs text-arena-muted">
          <span>{formatUSD(trade.cost)}</span>
          <span>·</span>
          <span>{timeAgo}</span>
        </div>
      </div>
    </div>
  );
}

function getTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
