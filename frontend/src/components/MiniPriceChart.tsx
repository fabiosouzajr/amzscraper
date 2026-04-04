import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { PriceHistory } from '../types';
import { formatDateShort } from '../utils/dateFormat';
import { formatPrice } from '../utils/numberFormat';
import styles from './MiniPriceChart.module.css';

interface MiniPriceChartProps {
  priceHistory: PriceHistory[];
  height?: number;
}

export function MiniPriceChart({ priceHistory, height = 100 }: MiniPriceChartProps) {
  if (!priceHistory || priceHistory.length === 0) {
    return null;
  }

  // Prepare data for the chart - take 20 most recent (array is DESC from API), reverse to chronological order
  const recentHistory = priceHistory.slice(0, 20).reverse();
  const chartData = recentHistory.map((ph) => ({
    date: formatDateShort(ph.date),
    price: ph.price
  }));

  // Calculate min and max for Y-axis domain to show variation better
  const prices = chartData.map(d => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const padding = (maxPrice - minPrice) * 0.1 || 1; // 10% padding, minimum 1

  return (
    <div className={styles.miniPriceChart} style={{ height: `${height}px`, width: '100%' }}>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={chartData} margin={{ top: 5, right: 5, left: 5, bottom: 18 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 8.5, fill: 'var(--color-text-tertiary)' }}
            tickLine={false}
            axisLine={false}
            interval="preserveStartEnd"
            angle={-30}
            textAnchor="end"
            height={22}
          />
          <YAxis
            hide
            domain={[minPrice - padding, maxPrice + padding]}
          />
          <Tooltip
            formatter={(value: number) => formatPrice(value)}
            labelStyle={{ fontSize: '11px' }}
            contentStyle={{ fontSize: '12px', padding: '5px' }}
          />
          <Line
            type="monotone"
            dataKey="price"
            stroke="#2563eb"
            strokeWidth={2}
            dot={{ r: 3.5, fill: '#2563eb', stroke: '#fff', strokeWidth: 1.5 }}
            activeDot={{ r: 5, fill: '#1d4ed8', stroke: '#fff', strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
