import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useWebSocket } from '../hooks/useWebSocket';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { connected } = useWebSocket();

  const navLinks = [
    { to: '/', label: 'Dashboard' },
    { to: '/markets', label: 'Markets' },
    { to: '/leaderboard', label: 'Leaderboard' },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-arena-border bg-arena-surface sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link to="/" className="font-bold text-lg text-white flex items-center gap-2">
              <span className="text-indigo-400">&#9650;</span>
              AgentArena
            </Link>
            <nav className="hidden md:flex items-center gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    location.pathname === link.to
                      ? 'bg-indigo-900/50 text-indigo-300'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2 text-xs text-arena-muted">
            <span
              className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-red-500'}`}
            />
            {connected ? 'Live' : 'Disconnected'}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-6">
        {children}
      </main>

      <footer className="border-t border-arena-border py-4 text-center text-xs text-arena-muted">
        AgentArena — AI Prediction Market Platform. Paper trading only. Powered by{' '}
        <a href="https://polymarket.com" target="_blank" rel="noreferrer" className="text-indigo-400 hover:underline">
          Polymarket
        </a>{' '}
        data.
      </footer>
    </div>
  );
}
