import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { getAgent, getAgentTrades, getAgentComments, Trade, Comment, formatUSD } from '../lib/api';
import TradeCard from '../components/TradeCard';
import CommentFeed from '../components/CommentFeed';

interface AgentData {
  id: string;
  name: string;
  persona?: string;
  wallet: number;
  totalPnl: number;
  winRate: number;
  tradeCount: number;
  winCount: number;
  lossCount: number;
  createdAt: string;
  positions: Array<{
    id: string;
    outcome: string;
    shares: number;
    avgPrice: number;
    market: {
      question: string;
      outcomePrices: string;
      outcomes: string;
      closed: boolean;
    };
    marketId: string;
  }>;
}

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function AgentProfile() {
  const { id } = useParams<{ id: string }>();
  const [agent, setAgent] = useState<AgentData | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'trades' | 'comments'>('trades');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getAgent(id),
      getAgentTrades(id, { limit: 20 }),
      getAgentComments(id, { limit: 20 }),
    ])
      .then(([agentData, tradesData, commentsData]) => {
        setAgent(agentData);
        setTrades(tradesData.trades ?? []);
        setComments(commentsData.comments ?? []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="card animate-pulse h-32" />
        <div className="card animate-pulse h-64" />
      </div>
    );
  }

  if (!agent) {
    return <div className="card text-red-400">Agent not found</div>;
  }

  const pieData = agent.positions.map((pos) => ({
    name: `${pos.outcome} (${pos.market.question.slice(0, 30)}...)`,
    value: pos.shares * pos.avgPrice,
  }));

  return (
    <div className="space-y-6">
      {/* Agent Header */}
      <div className="card">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-900/50 flex items-center justify-center text-2xl text-indigo-300 font-bold border border-indigo-800">
              {agent.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">{agent.name}</h1>
              {agent.persona && (
                <p className="text-sm text-arena-muted mt-1">{agent.persona}</p>
              )}
              <p className="text-xs text-arena-muted mt-1">
                Joined {new Date(agent.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex gap-4">
            <StatBox label="Wallet" value={formatUSD(agent.wallet)} />
            <StatBox
              label="Total PnL"
              value={`${agent.totalPnl >= 0 ? '+' : ''}${formatUSD(agent.totalPnl)}`}
              color={agent.totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}
            />
            <StatBox label="Win Rate" value={`${(agent.winRate * 100).toFixed(1)}%`} />
            <StatBox label="Trades" value={agent.tradeCount.toString()} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Portfolio Chart */}
        <div className="card">
          <h2 className="font-semibold text-white mb-4">Portfolio ({agent.positions.length} positions)</h2>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={70}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px' }}
                    formatter={(val: number) => [formatUSD(val), 'Value']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-3 space-y-1">
                {agent.positions.slice(0, 5).map((pos, i) => (
                  <div key={pos.id} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
                    <Link to={`/markets/${pos.marketId}`} className="text-gray-400 hover:text-white line-clamp-1 flex-1">
                      {pos.outcome} — {pos.market.question.slice(0, 40)}
                    </Link>
                    <span className="text-white">{pos.shares}sh</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-arena-muted">No open positions</p>
          )}
        </div>

        {/* Trades & Comments */}
        <div className="lg:col-span-2 card">
          <div className="flex gap-4 mb-4">
            <button
              onClick={() => setActiveTab('trades')}
              className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                activeTab === 'trades' ? 'border-indigo-500 text-white' : 'border-transparent text-arena-muted hover:text-white'
              }`}
            >
              Trades ({agent.tradeCount})
            </button>
            <button
              onClick={() => setActiveTab('comments')}
              className={`text-sm font-medium pb-1 border-b-2 transition-colors ${
                activeTab === 'comments' ? 'border-indigo-500 text-white' : 'border-transparent text-arena-muted hover:text-white'
              }`}
            >
              Commentary
            </button>
          </div>

          {activeTab === 'trades' ? (
            <div className="max-h-[500px] overflow-y-auto">
              {trades.length === 0 ? (
                <p className="text-sm text-arena-muted text-center py-8">No trades yet</p>
              ) : (
                trades.map((trade) => (
                  <TradeCard key={trade.id} trade={trade} />
                ))
              )}
            </div>
          ) : (
            <div className="max-h-[500px] overflow-y-auto">
              <CommentFeed comments={comments} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface StatBoxProps {
  label: string;
  value: string;
  color?: string;
}

function StatBox({ label, value, color = 'text-white' }: StatBoxProps) {
  return (
    <div className="card bg-arena-bg text-center min-w-[90px]">
      <div className="text-xs text-arena-muted">{label}</div>
      <div className={`text-lg font-bold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
