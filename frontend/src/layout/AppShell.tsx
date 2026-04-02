import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { LayoutDashboard, Package, Settings, LogOut, List, ChevronDown, ChevronRight } from 'lucide-react';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useAuth } from '../contexts/AuthContext';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { BottomTabBar } from './BottomTabBar';
import { OfflineBanner } from './OfflineBanner';
import { ListsSidebar } from '../components/ListsSidebar';
import styles from './AppShell.module.css';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [listsOpen, setListsOpen] = useState(false);

  const searchParams = new URLSearchParams(location.search);
  const selectedListId = searchParams.get('list') ? parseInt(searchParams.get('list')!) : null;

  const isActiveRoute = (route: string): boolean => {
    if (route === '/' && location.pathname === '/') return true;
    return route !== '/' && location.pathname.startsWith(route);
  };

  const handleListClick = (listId: number | null) => {
    navigate(listId ? `/products?list=${listId}` : '/products');
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
            {/* Dashboard */}
            <Link
              to="/"
              className={`${styles.navItem} ${isActiveRoute('/') ? styles.navItemActive : ''}`}
              title={isTablet ? t('app.dashboard') : undefined}
              aria-current={isActiveRoute('/') ? 'page' : undefined}
            >
              <LayoutDashboard size={18} />
              {!isTablet && <span>{t('app.dashboard')}</span>}
            </Link>

            {/* My Lists — expandable (desktop only) */}
            {!isTablet ? (
              <div className={styles.listsNavSection}>
                <button
                  className={`${styles.navItem} ${styles.listsNavToggle}`}
                  onClick={() => setListsOpen(v => !v)}
                  aria-expanded={listsOpen}
                >
                  <List size={18} />
                  <span className={styles.listsNavLabel}>{t('lists.title')}</span>
                  <span className={styles.listsNavChevron}>
                    {listsOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                </button>
                {listsOpen && (
                  <div className={styles.listsNavPanel}>
                    <ListsSidebar
                      navMode
                      onListClick={handleListClick}
                      selectedListId={selectedListId}
                    />
                  </div>
                )}
              </div>
            ) : (
              <Link
                to="/products"
                className={`${styles.navItem} ${isActiveRoute('/products') && selectedListId !== null ? styles.navItemActive : ''}`}
                title={t('lists.title')}
              >
                <List size={18} />
              </Link>
            )}

            {/* Products */}
            <Link
              to="/products"
              className={`${styles.navItem} ${isActiveRoute('/products') ? styles.navItemActive : ''}`}
              title={isTablet ? t('app.products') : undefined}
              aria-current={isActiveRoute('/products') ? 'page' : undefined}
            >
              <Package size={18} />
              {!isTablet && <span>{t('app.products')}</span>}
            </Link>

            {/* Settings */}
            <Link
              to="/settings"
              className={`${styles.navItem} ${isActiveRoute('/settings') ? styles.navItemActive : ''}`}
              title={isTablet ? t('app.config') : undefined}
              aria-current={isActiveRoute('/settings') ? 'page' : undefined}
            >
              <Settings size={18} />
              {!isTablet && <span>{t('app.config')}</span>}
            </Link>
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
