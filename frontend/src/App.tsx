import { useState, lazy, Suspense, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Routes, Route, Navigate, useLocation, useNavigate, Link } from 'react-router-dom';
import { Dashboard } from './components/Dashboard';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { Auth } from './components/Auth';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ImportProvider, useImport } from './contexts/ImportContext';
import { X } from 'lucide-react';
import { ProgressBar } from './design-system';
import { AppShell } from './layout/AppShell';
import './App.css';

// Lazy load components that are not on the initial route
const ProductsPage = lazy(() => import('./components/ProductsPage').then(m => ({ default: m.ProductsPage })));
const ProductDetail = lazy(() => import('./components/ProductDetail').then(m => ({ default: m.ProductDetail })));
const Config = lazy(() => import('./components/config').then(m => ({ default: m.Config })));

function ImportProgressBanner() {
  const { t } = useTranslation();
  const { importing, importProgress } = useImport();
  const [dismissed, setDismissed] = useState(false);

  if (!importing || !importProgress || dismissed) return null;

  const percent = importProgress.total > 0
    ? Math.round((importProgress.current / importProgress.total) * 100)
    : 0;

  return (
    <div className="import-progress-bar">
      <ProgressBar value={percent} variant="primary" size="sm" />
      <div className="import-progress-content">
        {importProgress.status === 'starting' && t('products.importStarting')}
        {importProgress.status === 'processing' && (
          <>
            {t('products.importProcessing', {
              current: importProgress.current,
              total: importProgress.total,
            })}
            {importProgress.currentASIN && (
              <span className="import-asin"> ({importProgress.currentASIN})</span>
            )}
          </>
        )}
        {importProgress.status === 'completed' && t('products.importCompleted')}
        <span className="import-stats">
          <span className="progress-stat success">{t('products.importSuccess')}: {importProgress.success}</span>
          <span className="progress-stat skipped">{t('products.importSkipped')}: {importProgress.skipped}</span>
          <span className="progress-stat failed">{t('products.importFailed')}: {importProgress.failed}</span>
        </span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="import-dismiss-btn"
        aria-label={t('common.dismiss')}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function Navigation() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActiveRoute = (path: string) => {
    if (path === '/' && location.pathname === '/') return true;
    return location.pathname.startsWith(path) && path !== '/';
  };

  if (!user) return null;

  return (
    <nav className="navbar" aria-label="Main navigation">
      <div className="nav-brand">
        <Link to="/">{t('app.title')}</Link>
      </div>
      <div className="nav-links">
        <Link
          to="/"
          className={`nav-link ${isActiveRoute('/') ? 'active' : ''}`}
        >
          {t('app.dashboard')}
        </Link>
        <Link
          to="/products"
          className={`nav-link ${isActiveRoute('/products') ? 'active' : ''}`}
        >
          {t('app.products')}
        </Link>
        <Link
          to="/settings"
          className={`nav-link ${isActiveRoute('/settings') ? 'active' : ''}`}
        >
          {t('app.config')}
        </Link>
        {user && user.role === 'ADMIN' && (
          <Link
            to="/settings/admin"
            className={`nav-link ${isActiveRoute('/settings/admin') ? 'active' : ''}`}
          >
            {t('app.admin')}
          </Link>
        )}
        <div className="user-info">
          <Link
            to="/settings"
            className={`username-button ${isActiveRoute('/settings/account') ? 'active' : ''}`}
            title={user.username}
          >
            {user.username}
          </Link>
          <button onClick={logout} className="logout-button">
            {t('app.logout')}
          </button>
        </div>
        <LanguageSwitcher />
      </div>
    </nav>
  );
}

function DashboardWithCategoryClick() {
  const navigate = useNavigate();

  const handleCategoryClick = useCallback((categoryName: string) => {
    navigate(`/products?category=${encodeURIComponent(categoryName)}`);
  }, [navigate]);

  return <Dashboard onCategoryClick={handleCategoryClick} />;
}

function ProductDetailWithNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const from = searchParams.get('from') || '/products';

  const handleBack = useCallback(() => {
    navigate(from);
  }, [navigate, from]);

  const handleNavigate = useCallback((productId: number) => {
    const params = new URLSearchParams();
    params.set('from', location.pathname + location.search);
    navigate(`/products/${productId}?${params.toString()}`);
  }, [navigate, location.pathname, location.search]);

  // Extract product ID from URL
  const productId = useMemo(() => {
    const match = location.pathname.match(/^\/products\/(\d+)$/);
    return match ? parseInt(match[1], 10) : undefined;
  }, [location.pathname]);

  if (productId === undefined) {
    return <Navigate to="/products" replace />;
  }

  return (
    <ProductDetail
      productId={productId}
      onBack={handleBack}
      onNavigate={handleNavigate}
    />
  );
}

function AppContent() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <AppShell>
      <div className="app">
        <Navigation />
        <ImportProgressBanner />

        <a href="#main-content" className="skip-to-content">
          {t('common.skipToContent')}
        </a>

        <main className="main-content" id="main-content" role="main">
          <Suspense fallback={<div className="loading">Loading...</div>}>
            <Routes>
              {/* Dashboard */}
              <Route path="/" element={<DashboardWithCategoryClick />} />

              {/* Products */}
              <Route path="/products" element={<ProductsPage />} />

              {/* Search redirects to products */}
              <Route path="/search" element={<Navigate to="/products" replace />} />

              {/* Product Detail */}
              <Route path="/products/:id" element={<ProductDetailWithNavigation />} />

              {/* Settings/Config */}
              <Route path="/settings/*" element={<Config />} />

              {/* Admin (redirects to settings/admin) */}
              <Route path="/admin" element={<Navigate to="/settings/admin" replace />} />

              {/* Catch all */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    </AppShell>
  );
}

function App() {
  return (
    <AuthProvider>
      <ImportProvider>
        <AppContent />
      </ImportProvider>
    </AuthProvider>
  );
}

export default App;
