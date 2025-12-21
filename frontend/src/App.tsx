import { useState } from 'react';
import { Dashboard } from './components/Dashboard';
import { ProductList } from './components/ProductList';
import { ProductSearch } from './components/ProductSearch';
import { ProductDetail } from './components/ProductDetail';
import { Config } from './components/Config';
import { Product } from './types';
import './App.css';

type View = 'dashboard' | 'products' | 'search' | 'detail' | 'config';

function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [initialCategoryFilter, setInitialCategoryFilter] = useState<string>('');

  const handleSelectProduct = (product: Product) => {
    setSelectedProduct(product);
    setCurrentView('detail');
  };

  const handleCategoryClick = (categoryName: string) => {
    setInitialCategoryFilter(categoryName);
    setCurrentView('products');
  };

  return (
    <div className="app">
      <nav className="navbar">
        <div className="nav-brand">Amazon Price Tracker</div>
        <div className="nav-links">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={currentView === 'dashboard' ? 'active' : ''}
          >
            Dashboard
          </button>
          <button
            onClick={() => setCurrentView('products')}
            className={currentView === 'products' ? 'active' : ''}
          >
            Products
          </button>
          <button
            onClick={() => setCurrentView('search')}
            className={currentView === 'search' ? 'active' : ''}
          >
            Search
          </button>
          <button
            onClick={() => setCurrentView('config')}
            className={currentView === 'config' ? 'active' : ''}
          >
            Config
          </button>
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
            <h2>Search Products</h2>
            <ProductSearch onSelectProduct={handleSelectProduct} />
          </div>
        )}
        {currentView === 'detail' && selectedProduct && (
          <ProductDetail
            productId={selectedProduct.id}
            onBack={() => setCurrentView('search')}
          />
        )}
        {currentView === 'config' && <Config />}
      </main>
    </div>
  );
}

export default App;

