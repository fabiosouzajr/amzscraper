import { useMediaQuery } from '../hooks/useMediaQuery';
import { useAuth } from '../contexts/AuthContext';
import { BottomTabBar } from './BottomTabBar';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const { user } = useAuth();

  return (
    <div
      className={`app-shell ${isMobile ? 'app-shell--mobile' : ''} ${styles.appShell} ${isMobile ? styles.appShellMobile : ''}`}
    >
      <div className={isMobile ? styles.mobileContent : undefined}>
        {children}
      </div>
      {isMobile && user && <BottomTabBar />}
    </div>
  );
}
