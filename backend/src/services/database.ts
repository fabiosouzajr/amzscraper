import sqlite3 from 'sqlite3';
import { Product, PriceHistory, ProductWithPrice, PriceDrop } from '../models/types';
import path from 'path';

// Database path relative to project root
// __dirname is backend/src/services (source) or backend/dist/services (compiled)
// Go up 3 levels to reach project root, then into database folder
const DB_PATH = path.resolve(__dirname, '../../../database/products.db');

export class DatabaseService {
  private db: sqlite3.Database;

  constructor() {
    this.db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('Connected to SQLite database');
        this.initializeTables();
      }
    });
  }

  private initializeTables(): void {
    const createProductsTable = `
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        asin TEXT UNIQUE NOT NULL,
        description TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createPriceHistoryTable = `
      CREATE TABLE IF NOT EXISTS price_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        price REAL NOT NULL,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `;

    this.db.serialize(() => {
      this.db.run(createProductsTable);
      this.db.run(createPriceHistoryTable);
      this.db.run('CREATE INDEX IF NOT EXISTS idx_product_id ON price_history(product_id)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_asin ON products(asin)');
    });
  }

  // Product CRUD operations
  async addProduct(asin: string, description: string): Promise<Product> {
    return new Promise((resolve, reject) => {
      const sql = 'INSERT INTO products (asin, description) VALUES (?, ?)';
      this.db.run(sql, [asin, description], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            asin,
            description,
            created_at: new Date().toISOString()
          });
        }
      });
    });
  }

  async getProductById(id: number): Promise<Product | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM products WHERE id = ?';
      this.db.get(sql, [id], (err, row: Product) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  async getProductByASIN(asin: string): Promise<Product | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM products WHERE asin = ?';
      this.db.get(sql, [asin], (err, row: Product) => {
        if (err) {
          reject(err);
        } else {
          resolve(row || null);
        }
      });
    });
  }

  async getAllProducts(): Promise<Product[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM products ORDER BY created_at DESC';
      this.db.all(sql, [], (err, rows: Product[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async searchProducts(query: string): Promise<Product[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM products WHERE description LIKE ? OR asin LIKE ? ORDER BY created_at DESC';
      const searchTerm = `%${query}%`;
      this.db.all(sql, [searchTerm, searchTerm], (err, rows: Product[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async deleteProduct(id: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // First delete price history
      this.db.run('DELETE FROM price_history WHERE product_id = ?', [id], (err) => {
        if (err) {
          reject(err);
          return;
        }
        // Then delete product
        this.db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve(this.changes > 0);
          }
        });
      });
    });
  }

  // Price history operations
  async getLastPrice(productId: number): Promise<number | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT price FROM price_history WHERE product_id = ? ORDER BY date DESC LIMIT 1';
      this.db.get(sql, [productId], (err, row: { price: number } | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.price : null);
        }
      });
    });
  }

  async addPriceHistory(productId: number, price: number): Promise<PriceHistory> {
    return new Promise((resolve, reject) => {
      const sql = 'INSERT INTO price_history (product_id, price) VALUES (?, ?)';
      this.db.run(sql, [productId, price], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            product_id: productId,
            price,
            date: new Date().toISOString(),
            created_at: new Date().toISOString()
          });
        }
      });
    });
  }

  async getPriceHistory(productId: number): Promise<PriceHistory[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM price_history WHERE product_id = ? ORDER BY date ASC';
      this.db.all(sql, [productId], (err, rows: PriceHistory[]) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      });
    });
  }

  async getProductWithPriceHistory(productId: number): Promise<ProductWithPrice | null> {
    const product = await this.getProductById(productId);
    if (!product) {
      return null;
    }

    const priceHistory = await this.getPriceHistory(productId);
    const currentPrice = priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].price : undefined;
    const previousPrice = priceHistory.length > 1 ? priceHistory[priceHistory.length - 2].price : undefined;
    const priceDrop = currentPrice && previousPrice ? previousPrice - currentPrice : undefined;
    const priceDropPercentage = currentPrice && previousPrice && previousPrice > 0
      ? ((previousPrice - currentPrice) / previousPrice) * 100
      : undefined;

    return {
      ...product,
      current_price: currentPrice,
      previous_price: previousPrice,
      price_drop: priceDrop,
      price_drop_percentage: priceDropPercentage,
      last_updated: priceHistory.length > 0 ? priceHistory[priceHistory.length - 1].date : undefined
    };
  }

  async getBiggestPriceDrops(limit: number = 10): Promise<PriceDrop[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          p.id,
          p.asin,
          p.description,
          p.created_at,
          current.price as current_price,
          previous.price as previous_price,
          (previous.price - current.price) as price_drop,
          ((previous.price - current.price) / previous.price * 100) as price_drop_percentage,
          current.date as last_updated
        FROM products p
        INNER JOIN price_history current ON p.id = current.product_id
        INNER JOIN price_history previous ON p.id = previous.product_id
        WHERE current.id = (
          SELECT id FROM price_history 
          WHERE product_id = p.id 
          ORDER BY date DESC LIMIT 1
        )
        AND previous.id = (
          SELECT id FROM price_history 
          WHERE product_id = p.id 
          AND id != current.id
          ORDER BY date DESC LIMIT 1
        )
        AND previous.price > current.price
        ORDER BY price_drop_percentage DESC
        LIMIT ?
      `;

      this.db.all(sql, [limit], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const drops: PriceDrop[] = rows.map(row => ({
            product: {
              id: row.id,
              asin: row.asin,
              description: row.description,
              created_at: row.created_at
            },
            current_price: row.current_price,
            previous_price: row.previous_price,
            price_drop: row.price_drop,
            price_drop_percentage: row.price_drop_percentage,
            last_updated: row.last_updated
          }));
          resolve(drops);
        }
      });
    });
  }

  close(): void {
    this.db.close((err) => {
      if (err) {
        console.error('Error closing database:', err);
      } else {
        console.log('Database connection closed');
      }
    });
  }
}

// Singleton instance
export const dbService = new DatabaseService();

