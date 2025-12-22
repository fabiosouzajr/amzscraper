import sqlite3 from 'sqlite3';
import { Product, Category, PriceHistory, ProductWithPrice, PriceDrop } from '../models/types';
import path from 'path';
import fs from 'fs';

// Database path relative to project root
// __dirname is backend/src/services (source) or backend/dist/services (compiled)
// Go up 3 levels to reach project root, then into database folder
const DB_PATH = path.resolve(__dirname, '../../../database/products.db');
const DB_DIR = path.dirname(DB_PATH);

export class DatabaseService {
  private db: sqlite3.Database;

  constructor() {
    // Ensure database directory exists
    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
      console.log(`Created database directory: ${DB_DIR}`);
    }

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

    const createCategoriesTable = `
      CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
      )
    `;

    const createProductCategoriesTable = `
      CREATE TABLE IF NOT EXISTS product_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        level INTEGER NOT NULL,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
        UNIQUE(product_id, category_id, level)
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
      this.db.run(createCategoriesTable);
      this.db.run(createProductCategoriesTable);
      this.db.run(createPriceHistoryTable);
      
      // Create indexes
      this.db.run('CREATE INDEX IF NOT EXISTS idx_product_id ON price_history(product_id)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_asin ON products(asin)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_category_name ON categories(name)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_product_category_product ON product_categories(product_id)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_product_category_category ON product_categories(category_id)');
      this.db.run('CREATE INDEX IF NOT EXISTS idx_product_category_level ON product_categories(level)');
    });
  }

  // Category operations
  async getOrCreateCategory(name: string): Promise<Category> {
    return new Promise((resolve, reject) => {
      // First try to get existing category
      const getSql = 'SELECT * FROM categories WHERE name = ?';
      this.db.get(getSql, [name], (err, row: Category) => {
        if (err) {
          reject(err);
          return;
        }
        
        if (row) {
          resolve(row);
        } else {
          // Create new category
          const insertSql = 'INSERT INTO categories (name) VALUES (?)';
          this.db.run(insertSql, [name], function(insertErr) {
            if (insertErr) {
              reject(insertErr);
            } else {
              resolve({
                id: this.lastID,
                name,
                level: 0 // Will be set when linking to product
              });
            }
          });
        }
      });
    });
  }

  async setProductCategories(productId: number, categoryNames: string[]): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        // Remove existing category associations for this product
        await new Promise<void>((resolveDelete, rejectDelete) => {
          this.db.run('DELETE FROM product_categories WHERE product_id = ?', [productId], (err) => {
            if (err) rejectDelete(err);
            else resolveDelete();
          });
        });

        if (categoryNames.length === 0) {
          resolve();
          return;
        }

        // Get or create categories and link them
        for (let level = 0; level < categoryNames.length; level++) {
          const categoryName = categoryNames[level].trim();
          if (!categoryName) continue;

          const category = await this.getOrCreateCategory(categoryName);
          
          // Link product to category with level
          await new Promise<void>((resolveLink, rejectLink) => {
            const linkSql = 'INSERT OR IGNORE INTO product_categories (product_id, category_id, level) VALUES (?, ?, ?)';
            this.db.run(linkSql, [productId, category.id, level], (err) => {
              if (err) rejectLink(err);
              else resolveLink();
            });
          });
        }
        
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  async getProductCategories(productId: number): Promise<Category[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT c.id, c.name, pc.level
        FROM categories c
        INNER JOIN product_categories pc ON c.id = pc.category_id
        WHERE pc.product_id = ?
        ORDER BY pc.level ASC
      `;
      this.db.all(sql, [productId], (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          const categories: Category[] = (rows || []).map(row => ({
            id: row.id,
            name: row.name,
            level: row.level
          }));
          resolve(categories);
        }
      });
    });
  }

  // Product CRUD operations
  async addProduct(asin: string, description: string, categories?: string[]): Promise<Product> {
    return new Promise(async (resolve, reject) => {
      try {
        const sql = 'INSERT INTO products (asin, description) VALUES (?, ?)';
        const dbService = this; // Capture this for async operations
        this.db.run(sql, [asin, description], async function(err) {
          if (err) {
            reject(err);
            return;
          }
          
          const productId = this.lastID;
          
          // Set categories if provided
          if (categories && categories.length > 0) {
            await dbService.setProductCategories(productId, categories);
          }
          
          // Get product with categories
          const product = await dbService.getProductById(productId);
          if (!product) {
            reject(new Error('Failed to retrieve created product'));
            return;
          }
          
          resolve(product);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async getProductById(id: number): Promise<Product | null> {
    return new Promise(async (resolve, reject) => {
      try {
        const sql = 'SELECT * FROM products WHERE id = ?';
        this.db.get(sql, [id], async (err, row: any) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (!row) {
            resolve(null);
            return;
          }
          
          const categories = await this.getProductCategories(row.id);
          resolve({
            id: row.id,
            asin: row.asin,
            description: row.description,
            categories: categories.length > 0 ? categories : undefined,
            created_at: row.created_at
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async getProductByASIN(asin: string): Promise<Product | null> {
    return new Promise(async (resolve, reject) => {
      try {
        const sql = 'SELECT * FROM products WHERE asin = ?';
        this.db.get(sql, [asin], async (err, row: any) => {
          if (err) {
            reject(err);
            return;
          }
          
          if (!row) {
            resolve(null);
            return;
          }
          
          const categories = await this.getProductCategories(row.id);
          resolve({
            id: row.id,
            asin: row.asin,
            description: row.description,
            categories: categories.length > 0 ? categories : undefined,
            created_at: row.created_at
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async getAllProducts(categoryFilter?: string): Promise<Product[]> {
    return new Promise(async (resolve, reject) => {
      try {
        let sql: string;
        let params: any[];

        if (categoryFilter) {
          // Filter by category name
          sql = `
            SELECT DISTINCT p.id, p.asin, p.description, p.created_at
            FROM products p
            INNER JOIN product_categories pc ON p.id = pc.product_id
            INNER JOIN categories c ON pc.category_id = c.id
            WHERE c.name LIKE ?
            ORDER BY p.created_at DESC
          `;
          params = [`%${categoryFilter}%`];
        } else {
          sql = 'SELECT * FROM products ORDER BY created_at DESC';
          params = [];
        }

        this.db.all(sql, params, async (err, rows: any[]) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Load categories for each product
          const products: Product[] = await Promise.all(
            (rows || []).map(async (row) => {
              const categories = await this.getProductCategories(row.id);
              return {
                id: row.id,
                asin: row.asin,
                description: row.description,
                categories: categories.length > 0 ? categories : undefined,
                created_at: row.created_at
              };
            })
          );
          
          resolve(products);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async searchProducts(query: string, categoryFilter?: string): Promise<Product[]> {
    return new Promise(async (resolve, reject) => {
      try {
        const searchTerm = `%${query}%`;
        let sql: string;
        let params: any[];

        if (categoryFilter) {
          sql = `
            SELECT DISTINCT p.id, p.asin, p.description, p.created_at
            FROM products p
            INNER JOIN product_categories pc ON p.id = pc.product_id
            INNER JOIN categories c ON pc.category_id = c.id
            WHERE (p.description LIKE ? OR p.asin LIKE ?)
            AND c.name LIKE ?
            ORDER BY p.created_at DESC
          `;
          params = [searchTerm, searchTerm, `%${categoryFilter}%`];
        } else {
          sql = 'SELECT * FROM products WHERE description LIKE ? OR asin LIKE ? ORDER BY created_at DESC';
          params = [searchTerm, searchTerm];
        }

        this.db.all(sql, params, async (err, rows: any[]) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Load categories for each product
          const products: Product[] = await Promise.all(
            (rows || []).map(async (row) => {
              const categories = await this.getProductCategories(row.id);
              return {
                id: row.id,
                asin: row.asin,
                description: row.description,
                categories: categories.length > 0 ? categories : undefined,
                created_at: row.created_at
              };
            })
          );
          
          resolve(products);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async getAllCategories(): Promise<Category[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM categories ORDER BY name ASC';
      this.db.all(sql, [], (err, rows: Category[]) => {
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

      this.db.all(sql, [limit], async (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          // Fetch price history and categories for each product
          const dbService = this;
          const drops: PriceDrop[] = await Promise.all(
            rows.map(async (row) => {
              const priceHistory = await dbService.getPriceHistory(row.id);
              const categories = await dbService.getProductCategories(row.id);
              return {
                product: {
                  id: row.id,
                  asin: row.asin,
                  description: row.description,
                  categories: categories.length > 0 ? categories : undefined,
                  created_at: row.created_at
                },
                current_price: row.current_price,
                previous_price: row.previous_price,
                price_drop: row.price_drop,
                price_drop_percentage: row.price_drop_percentage,
                last_updated: row.last_updated,
                price_history: priceHistory
              };
            })
          );
          resolve(drops);
        }
      });
    });
  }

  async getProductCount(): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM products';
      this.db.get(sql, [], (err, row: { count: number } | undefined) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.count : 0);
        }
      });
    });
  }

  getDatabasePath(): string {
    return DB_PATH;
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

