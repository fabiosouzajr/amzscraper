import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dashboard } from './components/Dashboard';
import { ProductList } from './components/ProductList';
import { ProductSearch } from './components/ProductSearch';
import { ProductDetail } from './components/ProductDetail';
import { Config } from './components/Config';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { Auth } from './components/Auth';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Product } from './types';
import './App.css';

type View = 'dashboard' | 'products' | 'search' | 'detail' | 'config';

function AppContent() {
  const { t } = useTranslation();
  const { user, logout, loading } = useAuth();
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [initialCategoryFilter, setInitialCategoryFilter] = useState<string>('');

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    // Don't change view - stay in search view to show side by side
  };

  const handleNavigateProduct = (productId: number) => {
    // Create a minimal product object with just the ID for navigation
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
          <div className="user-info">
            <span className="username">{user.username}</span>
            <button onClick={logout} className="logout-button">
              {t('app.logout')}
            </button>
          </div>
          <LanguageSwitcher />
        </div>
      </nav>

      <main className="main-content">
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
      </main>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

