import { useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { Dashboard } from './components/Dashboard';
import { ProductList } from './components/ProductList';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { Auth } from './components/Auth';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ImportProvider, useImport } from './contexts/ImportContext';
import { Product } from './types';
import './App.css';

const ProductSearch = lazy(() => import('./components/ProductSearch').then(m => ({ default: m.ProductSearch })));
const ProductDetail = lazy(() => import('./components/ProductDetail').then(m => ({ default: m.ProductDetail })));
const Config = lazy(() => import('./components/config').then(m => ({ default: m.Config })));
const AdminPanel = lazy(() => import('./components/AdminPanel').then(m => ({ default: m.AdminPanel })));

type View = 'dashboard' | 'products' | 'search' | 'detail' | 'config' | 'admin';

function ImportProgressBanner() {
  const { t } = useTranslation();
  const { importing, importProgress } = useImport();

  if (!importing || !importProgress) return null;

  const percent = importProgress.total > 0
    ? Math.round((importProgress.current / importProgress.total) * 100)
    : 0;

  return (
    <div className="import-progress-banner">
      <div className="import-progress-banner-inner">
        <div className="import-progress-banner-text">
          {importProgress.status === 'starting' && t('products.importStarting')}
          {importProgress.status === 'processing' && (
            <>
              {t('products.importProcessing', {
                current: importProgress.current,
                total: importProgress.total,
              })}
              {importProgress.currentASIN && (
                <span className="import-banner-asin"> ({importProgress.currentASIN})</span>
              )}
            </>
          )}
          {importProgress.status === 'completed' && t('products.importCompleted')}
        </div>
        <div className="import-progress-banner-bar-wrapper">
          <div className="import-progress-banner-bar" style={{ width: `${percent}%` }} />
        </div>
        <div className="import-progress-banner-stats">
          <span className="progress-stat success">{t('products.importSuccess')}: {importProgress.success}</span>
          <span className="progress-stat skipped">{t('products.importSkipped')}: {importProgress.skipped}</span>
          <span className="progress-stat failed">{t('products.importFailed')}: {importProgress.failed}</span>
        </div>
      </div>
    </div>
  );
}

function AppContent() {
  const { t } = useTranslation();
  const { user, logout, loading } = useAuth();
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [initialCategoryFilter, setInitialCategoryFilter] = useState<string>('');

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
  };

  const handleNavigateProduct = (productId: number) => {
    setSelectedProduct({ id: productId } as Product);
    setCurrentView('detail');
  };

  const handleCategoryClick = (categoryName: string) => {
    setInitialCategoryFilter(categoryName);
    setCurrentView('products');
  };

  if (loading) {
    return <div className="loading">{t('app.loading')}</div>;
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-brand">{t('app.title')}</div>
        <div className="nav-links">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={currentView === 'dashboard' ? 'active' : ''}
          >
            {t('app.dashboard')}
          </button>
          <button
            onClick={() => setCurrentView('products')}
            className={currentView === 'products' ? 'active' : ''}
          >
            {t('app.products')}
          </button>
          <button
            onClick={() => setCurrentView('search')}
            className={currentView === 'search' ? 'active' : ''}
          >
            {t('app.search')}
          </button>
          <button
            onClick={() => setCurrentView('config')}
            className={currentView === 'config' ? 'active' : ''}
          >
            {t('app.config')}
          </button>
          {user && user.role === 'ADMIN' && (
            <button
              onClick={() => setCurrentView('admin')}
              className={currentView === 'admin' ? 'active' : ''}
            >
              {t('app.admin')}
            </button>
          )}
          <div className="user-info">
            <button
              className={`username-button ${currentView === 'config' ? 'active' : ''}`}
              onClick={() => setCurrentView('config')}
              title={user.username}
            >
              {user.username}
            </button>
            <button onClick={logout} className="logout-button">
              {t('app.logout')}
            </button>
          </div>
          <LanguageSwitcher />
        </div>
      </nav>

      <ImportProgressBanner />

      <main className="main-content">
        <Suspense fallback={<div className="loading-spinner" />}>
          {currentView === 'dashboard' && <Dashboard onCategoryClick={handleCategoryClick} />}
          {currentView === 'products' && (
            <ProductList
              initialCategoryFilter={initialCategoryFilter}
              onFilterApplied={() => setInitialCategoryFilter('')}
            />
          )}
          {currentView === 'search' && (
            <div className="search-view">
              <h2>{t('search.title')}</h2>
              <div className="search-layout">
                <div className="search-list-container">
                  <ProductSearch
                    onSelectProduct={handleSelectProduct}
                    selectedProductId={selectedProduct?.id}
                  />
                </div>
                {selectedProduct && (
                  <div className="search-detail-container">
                    <ProductDetail
                      productId={selectedProduct.id}
                      onBack={() => setSelectedProduct(null)}
                      onNavigate={handleNavigateProduct}
                    />
                  </div>
                )}
              </div>
            </div>
          )}
          {currentView === 'detail' && selectedProduct && (
            <ProductDetail
              productId={selectedProduct.id}
              onBack={() => setCurrentView('search')}
              onNavigate={handleNavigateProduct}
            />
          )}
          {currentView === 'config' && <Config />}
          {currentView === 'admin' && <AdminPanel />}
        </Suspense>
      </main>
    </div>
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
