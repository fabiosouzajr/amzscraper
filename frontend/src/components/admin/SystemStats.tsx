import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { adminApi } from '../../services/api';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#00a651', '#ff9900', '#cc0000'];

export function SystemStats() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await adminApi.getSystemStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to load system stats:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">{t('admin.users.loading')}</div>;
  }

  if (!stats) {
    return <div>{t('admin.users.failedToLoadStats')}</div>;
  }

  // Prepare data for charts
  const userDistributionData = [
    { name: t('admin.stats.admins'), value: stats.total_admins },
    { name: t('admin.stats.regularUsers'), value: stats.total_users - stats.total_admins - stats.disabled_users },
    { name: t('admin.stats.disabledUsers'), value: stats.disabled_users }
  ];

  const overviewData = [
    { name: t('admin.stats.users'), value: stats.total_users },
    { name: t('admin.stats.products'), value: stats.total_products },
    { name: t('admin.stats.priceHistory'), value: stats.total_price_history }
  ];

  return (
    <div className="system-stats">
      <h2>{t('admin.stats.title')}</h2>

      {/* Overview Stats Cards */}
      <div className="stats-overview-grid">
        <div className="stat-card">
          <h4>{t('admin.stats.totalUsers')}</h4>
          <p className="stat-value">{stats.total_users}</p>
          <p className="stat-detail">{stats.active_users} {t('admin.stats.activeUsers')}</p>
        </div>
        <div className="stat-card">
          <h4>{t('admin.stats.totalAdmins')}</h4>
          <p className="stat-value">{stats.total_admins}</p>
        </div>
        <div className="stat-card">
          <h4>{t('admin.stats.disabledUsers')}</h4>
          <p className="stat-value">{stats.disabled_users}</p>
        </div>
        <div className="stat-card">
          <h4>{t('admin.stats.totalProducts')}</h4>
          <p className="stat-value">{stats.total_products}</p>
        </div>
        <div className="stat-card">
          <h4>{t('admin.stats.totalPriceHistory')}</h4>
          <p className="stat-value">{stats.total_price_history}</p>
        </div>
      </div>

      {/* Charts */}
      <div className="stats-charts-grid">
        <div className="chart-card">
          <h3>{t('admin.stats.overviewChart')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={overviewData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#ff9900" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-card">
          <h3>{t('admin.stats.userDistribution')}</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={userDistributionData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {userDistributionData.map((_entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
