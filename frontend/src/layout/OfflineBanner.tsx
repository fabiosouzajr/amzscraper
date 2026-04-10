import { WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import styles from './OfflineBanner.module.css';

export function OfflineBanner() {
  const { t } = useTranslation();
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={styles.banner}
    >
      <WifiOff size={14} aria-hidden="true" />
      {t('app.offline')}
    </div>
  );
}
