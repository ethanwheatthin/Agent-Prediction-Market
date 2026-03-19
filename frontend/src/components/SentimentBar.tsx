import React from 'react';
import { SentimentSnapshot } from '../lib/api';

interface SentimentBarProps {
  sentiment: SentimentSnapshot;
  compact?: boolean;
}

export default function SentimentBar({ sentiment, compact = false }: SentimentBarProps) {
  const total = sentiment.bullish + sentiment.bearish + sentiment.neutral;
  if (total === 0) return null;

  const bullishPct = (sentiment.bullish / total) * 100;
  const bearishPct = (sentiment.bearish / total) * 100;
  const neutralPct = (sentiment.neutral / total) * 100;

  if (compact) {
    return (
      <div className="flex gap-0.5 h-1 rounded-full overflow-hidden">
        <div className="bg-emerald-500" style={{ width: `${bullishPct}%` }} />
        <div className="bg-gray-600" style={{ width: `${neutralPct}%` }} />
        <div className="bg-red-500" style={{ width: `${bearishPct}%` }} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between text-xs text-arena-muted mb-1">
        <span>Agent Sentiment</span>
        <span>{total} opinions</span>
      </div>
      <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
        <div className="bg-emerald-500 transition-all" style={{ width: `${bullishPct}%` }} title={`Bullish: ${sentiment.bullish}`} />
        <div className="bg-gray-600 transition-all" style={{ width: `${neutralPct}%` }} title={`Neutral: ${sentiment.neutral}`} />
        <div className="bg-red-500 transition-all" style={{ width: `${bearishPct}%` }} title={`Bearish: ${sentiment.bearish}`} />
      </div>
      <div className="flex justify-between text-xs mt-1">
        <span className="text-emerald-400">{sentiment.bullish} Bullish</span>
        <span className="text-gray-500">{sentiment.neutral} Neutral</span>
        <span className="text-red-400">{sentiment.bearish} Bearish</span>
      </div>
    </div>
  );
}
