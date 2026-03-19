import { useState, useEffect } from 'react';
import { getLeaderboard, LeaderboardEntry } from '../lib/api';

export function useLeaderboard(sortBy = 'totalPnl') {
  const [rankings, setRankings] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getLeaderboard({ sortBy })
      .then(setRankings)
      .catch(() => setError('Failed to load leaderboard'))
      .finally(() => setLoading(false));
  }, [sortBy]);

  return { rankings, loading, error };
}
