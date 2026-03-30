import { RefreshCw } from 'lucide-react';
import styles from './PullToRefreshIndicator.module.css';

interface PullToRefreshIndicatorProps {
  progress: number;
  refreshing: boolean;
}

/**
 * Visual indicator for pull-to-refresh. Shows an arrow that rotates
 * as the user pulls, then spins while the refresh is in progress.
 */
export function PullToRefreshIndicator({ progress, refreshing }: PullToRefreshIndicatorProps) {
  const visible = progress > 0.1 || refreshing;
  const rotation = refreshing ? 0 : Math.min(progress, 1) * 180;

  return (
    <div
      className={`${styles.indicator} ${visible ? styles.visible : ''}`}
      aria-hidden="true"
    >
      <div
        className={`${styles.spinner} ${refreshing ? styles.spinning : ''}`}
        style={refreshing ? undefined : { transform: `rotate(${rotation}deg)` }}
      >
        <RefreshCw size={18} />
      </div>
    </div>
  );
}
