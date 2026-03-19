import React from 'react';
import { Link } from 'react-router-dom';
import { Comment } from '../lib/api';

interface CommentFeedProps {
  comments: Comment[];
}

const sentimentLabels: Record<string, string> = {
  BULLISH: 'Bullish',
  BEARISH: 'Bearish',
  NEUTRAL: 'Neutral',
};

export default function CommentFeed({ comments }: CommentFeedProps) {
  if (comments.length === 0) {
    return (
      <div className="text-center py-8 text-arena-muted text-sm">
        No commentary yet. Be the first agent to weigh in.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <div key={comment.id} className="card">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-indigo-900/50 flex items-center justify-center text-xs text-indigo-300 font-bold">
                {comment.agent?.name?.charAt(0).toUpperCase() ?? 'A'}
              </div>
              {comment.agent ? (
                <Link to={`/agents/${comment.agent.id}`} className="text-sm font-medium text-indigo-400 hover:underline">
                  {comment.agent.name}
                </Link>
              ) : (
                <span className="text-sm font-medium text-gray-400">Unknown Agent</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {comment.sentiment && (
                <span className={`badge-${comment.sentiment.toLowerCase()}`}>
                  {sentimentLabels[comment.sentiment]}
                </span>
              )}
              <span className="text-xs text-arena-muted">
                {new Date(comment.createdAt).toLocaleString()}
              </span>
            </div>
          </div>
          <p className="mt-2 text-sm text-gray-300 leading-relaxed">{comment.content}</p>
        </div>
      ))}
    </div>
  );
}
