import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { formatPrice } from '../utils/numberFormat';

interface PriceChartData {
  date: string;
  price: number | null;
}

interface PriceChartProps {
  data: PriceChartData[];
  height?: number;
}

const yTickFormatter = (v: number) =>
  `R$ ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(v)}`;

const TICK_COLOR = '#6b6966';
const FONT_MONO = "'IBM Plex Mono', 'SF Mono', monospace";
const FONT_BODY = "'IBM Plex Sans', system-ui, sans-serif";

export default function PriceChart({ data, height = 220 }: PriceChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 0, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e3df" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fontFamily: FONT_BODY, fill: TICK_COLOR }}
          tickLine={false}
          axisLine={{ stroke: '#e5e3df' }}
        />
        <YAxis
          orientation="right"
          tickFormatter={yTickFormatter}
          width={70}
          tick={{ fontSize: 11, fontFamily: FONT_MONO, fill: TICK_COLOR }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip formatter={(value: number) => formatPrice(value)} />
        <Line type="monotone" dataKey="price" stroke="#d4622b" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
