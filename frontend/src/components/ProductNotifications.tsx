import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './ProductNotifications.module.css';
import { api } from '../services/api';
import {
  NotificationChannel,
  NotificationRule,
  NotificationRuleType,
  LowestInDaysParams,
  BelowThresholdParams,
  PercentageDropParams,
} from '../types';

interface ProductNotificationsProps {
  productId: number;
}

function formatRuleParams(
  type: NotificationRuleType,
  params: LowestInDaysParams | BelowThresholdParams | PercentageDropParams
): string {
  switch (type) {
    case 'lowest_in_days':
      return `${(params as LowestInDaysParams).days} days`;
    case 'below_threshold':
      return `R$ ${(params as BelowThresholdParams).threshold.toFixed(2)}`;
    case 'percentage_drop': {
      const p = params as PercentageDropParams;
      return `${p.percentage}% / ${p.window_days} days`;
    }
  }
}

// ─── RuleForm ─────────────────────────────────────────────────────────────────

interface RuleFormProps {
  productId: number;
  rule: NotificationRule | null;
  channels: NotificationChannel[];
  onClose: () => void;
  onSaved: () => void;
}

function RuleForm({ productId, rule, channels, onClose, onSaved }: RuleFormProps) {
  const { t } = useTranslation();

  const [ruleType, setRuleType] = useState<NotificationRuleType>(rule?.type ?? 'lowest_in_days');
  const [channelId, setChannelId] = useState(String(rule?.channel_id ?? ''));
  const [days, setDays] = useState(String((rule?.params as LowestInDaysParams)?.days ?? 30));
  const [threshold, setThreshold] = useState(String((rule?.params as BelowThresholdParams)?.threshold ?? 100));
  const [percentage, setPercentage] = useState(String((rule?.params as PercentageDropParams)?.percentage ?? 20));
  const [windowDays, setWindowDays] = useState(String((rule?.params as PercentageDropParams)?.window_days ?? 30));

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildParams = (): LowestInDaysParams | BelowThresholdParams | PercentageDropParams => {
    switch (ruleType) {
      case 'lowest_in_days':
        return { days: parseInt(days, 10) || 30 };
      case 'below_threshold':
        return { threshold: parseFloat(threshold) || 100 };
      case 'percentage_drop':
        return { percentage: parseFloat(percentage) || 20, window_days: parseInt(windowDays, 10) || 30 };
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const params = buildParams();
      const chanId = parseInt(channelId, 10);
      if (rule) {
        await api.notifications.updateRule(rule.id, { channel_id: chanId, type: ruleType, params });
      } else {
        await api.notifications.createRule({ product_id: productId, channel_id: chanId, type: ruleType, params });
      }
      onSaved();
    } catch (err) {
      setError(t('notifications.rules.createFailed') + ': ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <h3>{rule ? t('notifications.rules.edit') : t('notifications.product.addRule')}</h3>
        <form onSubmit={handleSubmit}>
          <div className={styles.formGroup}>
            <label>{t('notifications.rules.type')}</label>
            <select value={ruleType} onChange={(e) => setRuleType(e.target.value as NotificationRuleType)}>
              <option value="lowest_in_days">{t('notifications.rules.ruleTypes.lowestInDays')}</option>
              <option value="below_threshold">{t('notifications.rules.ruleTypes.belowThreshold')}</option>
              <option value="percentage_drop">{t('notifications.rules.ruleTypes.percentageDrop')}</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label>{t('notifications.rules.channel')}</label>
            <select value={channelId} onChange={(e) => setChannelId(e.target.value)} required>
              <option value="">—</option>
              {channels.map((c) => (
                <option key={c.id} value={String(c.id)}>{c.name}</option>
              ))}
            </select>
          </div>

          {ruleType === 'lowest_in_days' && (
            <div className={styles.formGroup}>
              <label>{t('notifications.rules.days')}</label>
              <input type="number" value={days} onChange={(e) => setDays(e.target.value)} min="1" required />
            </div>
          )}

          {ruleType === 'below_threshold' && (
            <div className={styles.formGroup}>
              <label>{t('notifications.rules.threshold')}</label>
              <input
                type="number"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                min="0"
                step="0.01"
                required
              />
            </div>
          )}

          {ruleType === 'percentage_drop' && (
            <>
              <div className={styles.formGroup}>
                <label>{t('notifications.rules.percentage')}</label>
                <input
                  type="number"
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                  min="1"
                  max="100"
                  required
                />
              </div>
              <div className={styles.formGroup}>
                <label>{t('notifications.rules.windowDays')}</label>
                <input
                  type="number"
                  value={windowDays}
                  onChange={(e) => setWindowDays(e.target.value)}
                  min="1"
                  required
                />
              </div>
            </>
          )}

          {error && <div className="error-message">{error}</div>}

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} disabled={submitting}>
              {t('common.cancel')}
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={submitting}>
              {submitting ? '...' : t('common.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── ProductNotifications ─────────────────────────────────────────────────────

export function ProductNotifications({ productId }: ProductNotificationsProps) {
  const { t } = useTranslation();

  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [channels, setChannels] = useState<NotificationChannel[]>([]);
  const [loading, setLoading] = useState(false);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editingRule, setEditingRule] = useState<NotificationRule | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rulesData, channelsData] = await Promise.all([
        api.notifications.getRules(productId),
        api.notifications.getChannels(),
      ]);
      setRules(rulesData);
      setChannels(channelsData);
    } catch (err) {
      console.error('Failed to load product notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [productId]);

  const getChannelName = (channelId: number): string => {
    const ch = channels.find((c) => c.id === channelId);
    return ch ? ch.name : String(channelId);
  };

  const handleToggleRule = async (id: number, enabled: boolean) => {
    try {
      await api.notifications.updateRule(id, { enabled });
      await loadData();
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!window.confirm('Delete this rule?')) return;
    try {
      await api.notifications.deleteRule(id);
      await loadData();
    } catch (err) {
      console.error('Failed to delete rule:', err);
    }
  };

  return (
    <div className={styles.productNotifications}>
      <div className={styles.productNotificationsHeader}>
        <h3>{t('notifications.product.title')}</h3>
        <button
          className={styles.btnSmall}
          onClick={() => { setEditingRule(null); setShowRuleForm(true); }}
        >
          {t('notifications.product.addRule')}
        </button>
      </div>

      {loading ? (
        <div className="loading">...</div>
      ) : rules.length === 0 ? (
        <div className="empty-state">{t('notifications.product.noRules')}</div>
      ) : (
        <table className={styles.notificationsTable}>
          <thead>
            <tr>
              <th>{t('notifications.rules.type')}</th>
              <th>{t('notifications.rules.params')}</th>
              <th>{t('notifications.rules.channel')}</th>
              <th>{t('notifications.rules.enabled')}</th>
              <th>{t('notifications.rules.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td>
                  <span className={`${styles.ruleTypeBadge} ${rule.type === 'lowest_in_days' ? styles.typeLowestInDays : rule.type === 'below_threshold' ? styles.typeBelowThreshold : styles.typePercentageDrop}`}>
                    {t(
                      `notifications.rules.ruleTypes.${
                        rule.type === 'lowest_in_days'
                          ? 'lowestInDays'
                          : rule.type === 'below_threshold'
                          ? 'belowThreshold'
                          : 'percentageDrop'
                      }`
                    )}
                  </span>
                </td>
                <td>{formatRuleParams(rule.type, rule.params)}</td>
                <td>{getChannelName(rule.channel_id)}</td>
                <td>
                  <button
                    className={`${styles.toggleButton} ${rule.enabled ? styles.enabled : styles.disabled}`}
                    onClick={() => handleToggleRule(rule.id, !rule.enabled)}
                  >
                    {rule.enabled ? '✓' : '✗'}
                  </button>
                </td>
                <td>
                  <button
                    className={styles.btnSmall}
                    onClick={() => { setEditingRule(rule); setShowRuleForm(true); }}
                  >
                    {t('notifications.rules.edit')}
                  </button>
                  {' '}
                  <button
                    className={styles.btnSmallDanger}
                    onClick={() => handleDeleteRule(rule.id)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showRuleForm && (
        <RuleForm
          productId={productId}
          rule={editingRule}
          channels={channels}
          onClose={() => { setShowRuleForm(false); setEditingRule(null); }}
          onSaved={() => { setShowRuleForm(false); setEditingRule(null); loadData(); }}
        />
      )}
    </div>
  );
}

export default ProductNotifications;
