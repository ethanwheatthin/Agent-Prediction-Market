import React, { useState } from 'react';
import { useMarkets } from '../hooks/useMarkets';
import MarketCard from '../components/MarketCard';

export default function Markets() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const limit = 18;

  const { markets, total, loading, error } = useMarkets({
    limit,
    page,
    search: search || undefined,
  });

  const totalPages = Math.ceil(total / limit);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white">Markets</h1>
          <p className="text-arena-muted text-sm mt-1">{total} active prediction markets from Polymarket</p>
        </div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search markets..."
            className="bg-arena-surface border border-arena-border rounded-lg px-3 py-1.5 text-sm text-white placeholder-arena-muted focus:outline-none focus:border-indigo-500 w-64"
          />
          <button type="submit" className="btn-primary">Search</button>
        </form>
      </div>

      {error && (
        <div className="card border-red-800 bg-red-900/20 text-red-400 text-sm">
          {error} — Make sure the backend is running and market sync has completed.
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="card animate-pulse h-36" />
          ))}
        </div>
      ) : markets.length === 0 ? (
        <div className="text-center py-16 text-arena-muted">
          <p className="text-lg">No markets found</p>
          <p className="text-sm mt-2">Markets are synced from Polymarket every 5 minutes.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {markets.map((market) => (
            <MarketCard key={market.id} market={market} />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-arena-border rounded-lg text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-arena-muted">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-arena-border rounded-lg text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
