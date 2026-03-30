import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../services/api';
import {
  NotificationChannel,
  NotificationRule,
  NotificationRuleType,
  LowestInDaysParams,
  BelowThresholdParams,
  PercentageDropParams,
} from '../types';
import { Modal, Button } from '../design-system';
import styles from './NotificationForms.module.css';

interface RuleFormProps {
  rule: NotificationRule | null;
  channels: NotificationChannel[];
  onClose: () => void;
  onSaved: () => void;
}

export function RuleForm({ rule, channels, onClose, onSaved }: RuleFormProps) {
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
        await api.notifications.createRule({ product_id: null, channel_id: chanId, type: ruleType, params });
      }
      onSaved();
    } catch (err) {
      setError(t('notifications.rules.createFailed') + ': ' + (err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={rule ? t('notifications.rules.edit') : t('notifications.rules.add')}
      size="md"
    >
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
            <input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} min="0" step="0.01" required />
          </div>
        )}

        {ruleType === 'percentage_drop' && (
          <>
            <div className={styles.formGroup}>
              <label>{t('notifications.rules.percentage')}</label>
              <input type="number" value={percentage} onChange={(e) => setPercentage(e.target.value)} min="1" max="100" required />
            </div>
            <div className={styles.formGroup}>
              <label>{t('notifications.rules.windowDays')}</label>
              <input type="number" value={windowDays} onChange={(e) => setWindowDays(e.target.value)} min="1" required />
            </div>
          </>
        )}

        {error && <div className="error-message">{error}</div>}

        <div className={styles.modalActions}>
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" variant="primary" disabled={submitting}>
            {submitting ? '...' : t('common.save')}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
