import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { PriceHistory } from '../types';

interface MiniPriceChartProps {
  priceHistory: PriceHistory[];
  height?: number;
}

export function MiniPriceChart({ priceHistory, height = 80 }: MiniPriceChartProps) {
  if (!priceHistory || priceHistory.length === 0) {
    return null;
  }

  // Prepare data for the chart - limit to last 20 data points for performance
  const recentHistory = priceHistory.slice(-20);
  const chartData = recentHistory.map((ph) => ({
    date: new Date(ph.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    price: ph.price
  }));

  // Calculate min and max for Y-axis domain to show variation better
  const prices = chartData.map(d => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.1 || 1; // 10% padding, minimum 1

  return (
    <div className="mini-price-chart" style={{ height: `${height}px`, width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
          <XAxis 
            dataKey="date" 
            hide
            tick={{ fontSize: 10 }}
          />
          <YAxis 
            hide
            domain={[minPrice - padding, maxPrice + padding]}
          />
          <Tooltip 
            formatter={(value: number) => `R$ ${value.toFixed(2)}`}
            labelStyle={{ fontSize: '11px' }}
            contentStyle={{ fontSize: '12px', padding: '5px' }}
          />
          <Line 
            type="monotone" 
            dataKey="price" 
            stroke="#2563eb" 
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
