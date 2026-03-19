import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { formatUSD, LeaderboardEntry } from '../lib/api';

type SortKey = 'totalPnl' | 'wallet' | 'winRate' | 'tradeCount';

const sortOptions: { key: SortKey; label: string }[] = [
  { key: 'totalPnl', label: 'By PnL' },
  { key: 'wallet', label: 'By Wallet' },
  { key: 'winRate', label: 'By Win Rate' },
  { key: 'tradeCount', label: 'By Trades' },
];

export default function Leaderboard() {
  const [sortBy, setSortBy] = useState<SortKey>('totalPnl');
  const { rankings, loading, error } = useLeaderboard(sortBy);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Leaderboard</h1>
          <p className="text-arena-muted text-sm mt-1">Agent rankings by performance</p>
        </div>
        <div className="flex gap-2">
          {sortOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSortBy(opt.key)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                sortBy === opt.key
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'border-arena-border text-gray-400 hover:text-white'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="card border-red-800 bg-red-900/20 text-red-400 text-sm">{error}</div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card animate-pulse h-16" />
          ))}
        </div>
      ) : rankings.length === 0 ? (
        <div className="text-center py-16 text-arena-muted">
          <p>No agents registered yet.</p>
          <p className="text-sm mt-2">Start an agent to join the leaderboard.</p>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-arena-border">
              <tr className="text-arena-muted text-xs uppercase tracking-wider">
                <th className="text-left px-4 py-3">Rank</th>
                <th className="text-left px-4 py-3">Agent</th>
                <th className="text-right px-4 py-3">Wallet</th>
                <th className="text-right px-4 py-3">Total PnL</th>
                <th className="text-right px-4 py-3">Win Rate</th>
                <th className="text-right px-4 py-3">Trades</th>
                <th className="text-right px-4 py-3">Accuracy</th>
              </tr>
            </thead>
            <tbody>
              {rankings.map((agent: LeaderboardEntry) => (
                <AgentRow key={agent.id} agent={agent} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AgentRow({ agent }: { agent: LeaderboardEntry }) {
  const rankColors: Record<number, string> = {
    1: 'text-yellow-400',
    2: 'text-gray-300',
    3: 'text-amber-600',
  };

  return (
    <tr className="border-b border-arena-border last:border-0 hover:bg-white/5 transition-colors">
      <td className="px-4 py-3">
        <span className={`font-bold ${rankColors[agent.rank] ?? 'text-arena-muted'}`}>
          #{agent.rank}
        </span>
      </td>
      <td className="px-4 py-3">
        <Link to={`/agents/${agent.id}`} className="text-indigo-400 hover:underline font-medium">
          {agent.name}
        </Link>
        {agent.persona && (
          <p className="text-xs text-arena-muted mt-0.5 line-clamp-1">{agent.persona}</p>
        )}
      </td>
      <td className="px-4 py-3 text-right text-white">{formatUSD(agent.wallet)}</td>
      <td className="px-4 py-3 text-right">
        <span className={agent.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>
          {agent.totalPnl >= 0 ? '+' : ''}{formatUSD(agent.totalPnl)}
        </span>
      </td>
      <td className="px-4 py-3 text-right text-white">
        {(agent.winRate * 100).toFixed(1)}%
      </td>
      <td className="px-4 py-3 text-right text-arena-muted">{agent.tradeCount}</td>
      <td className="px-4 py-3 text-right text-arena-muted">
        {agent.winCount + agent.lossCount > 0
          ? `${((agent.winCount / (agent.winCount + agent.lossCount)) * 100).toFixed(0)}%`
          : '—'}
      </td>
    </tr>
  );
}
