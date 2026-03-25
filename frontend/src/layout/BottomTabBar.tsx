import { Link, useLocation } from 'react-router-dom';
import { Home, Package, Settings, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import styles from './BottomTabBar.module.css';

interface Tab {
  icon: LucideIcon;
  labelKey: string;
  route: string;
}

const TABS: Tab[] = [
  { icon: Home, labelKey: 'app.dashboard', route: '/' },
  { icon: Package, labelKey: 'app.products', route: '/products' },
  { icon: Settings, labelKey: 'app.config', route: '/settings' },
];

export function BottomTabBar() {
  const { t } = useTranslation();
  const location = useLocation();

  const isActiveRoute = (route: string): boolean => {
    if (route === '/' && location.pathname === '/') return true;
    return route !== '/' && location.pathname.startsWith(route);
  };

  return (
    <nav className={styles.bottomTabBar} aria-label="Mobile navigation">
      {TABS.map(({ icon: Icon, labelKey, route }) => {
        const active = isActiveRoute(route);
        return (
          <Link
            key={route}
            to={route}
            className={`${styles.tab} ${active ? styles.tabActive : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <Icon size={22} />
            <span className={styles.tabLabel}>{t(labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
