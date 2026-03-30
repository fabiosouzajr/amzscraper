import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Package, Settings, LogOut } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useAuth } from '../contexts/AuthContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { BottomTabBar } from './BottomTabBar';
import { OfflineBanner } from './OfflineBanner';
import styles from './AppShell.module.css';

const NAV_ITEMS = [
  { icon: LayoutDashboard, labelKey: 'app.dashboard', route: '/' },
  { icon: Package, labelKey: 'app.products', route: '/products' },
  { icon: Settings, labelKey: 'app.config', route: '/settings' },
] as const;

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  const isActiveRoute = (route: string): boolean => {
    if (route === '/' && location.pathname === '/') return true;
    return route !== '/' && location.pathname.startsWith(route);
  };

  if (!user) {
    return <>{children}</>;
  }

  return (
    <div
      className={[
        styles.shell,
        isMobile ? styles.shellMobile : '',
        isTablet ? styles.shellTablet : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!isMobile && (
        <aside className={styles.sidebar}>
          <div className={styles.brand}>
            <Link to="/" className={styles.brandLink}>
              {isTablet ? (
                <Package size={22} aria-label={t('app.title')} />
              ) : (
                <span className={styles.brandText}>{t('app.title')}</span>
              )}
            </Link>
          </div>

          <nav className={styles.nav} aria-label="Main navigation">
            {NAV_ITEMS.map(({ icon: Icon, labelKey, route }) => {
              const active = isActiveRoute(route);
              return (
                <Link
                  key={route}
                  to={route}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                  title={isTablet ? t(labelKey) : undefined}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon size={18} />
                  {!isTablet && <span>{t(labelKey)}</span>}
                </Link>
              );
            })}
          </nav>

          <div className={styles.sidebarFooter}>
            {!isTablet && (
              <span className={styles.username} title={user.username}>
                {user.username}
              </span>
            )}
            <button
              onClick={logout}
              className={styles.logoutBtn}
              title={t('app.logout')}
              aria-label={t('app.logout')}
            >
              <LogOut size={16} />
              {!isTablet && <span>{t('app.logout')}</span>}
            </button>
            {!isTablet && <LanguageSwitcher />}
          </div>
        </aside>
      )}

      <div className={styles.content}>
        <OfflineBanner />
        {children}
      </div>

      {isMobile && <BottomTabBar />}
    </div>
  );
}
