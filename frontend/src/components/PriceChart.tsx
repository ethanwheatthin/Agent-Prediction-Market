import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';

interface PricePoint {
  t: number;
  p: number;
}

interface PriceChartProps {
  data: PricePoint[];
  outcome?: string;
}

export default function PriceChart({ data, outcome }: PriceChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-arena-muted text-sm">
        No price history available
      </div>
    );
  }

  const chartData = data.map((point) => ({
    time: new Date(point.t * 1000).toLocaleDateString(),
    price: (point.p * 100).toFixed(1),
  }));

  return (
    <div>
      {outcome && <p className="text-xs text-arena-muted mb-2">Price history for: {outcome}</p>}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="time"
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `${v}¢`}
          />
          <Tooltip
            contentStyle={{ background: '#111827', border: '1px solid #1f2937', borderRadius: '8px' }}
            labelStyle={{ color: '#9ca3af' }}
            formatter={(val: number | string) => [`${val}¢`, 'Price']}
          />
          <ReferenceLine y={50} stroke="#374151" strokeDasharray="4 4" />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#6366f1"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#6366f1' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
