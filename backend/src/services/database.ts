import sqlite3 from 'sqlite3';
import { Product, Category, PriceHistory, ProductWithPrice, PriceDrop, User, UserWithPasswordHash, UserList, AuditLog, SystemConfig, UserRole, UserStats, SystemStats } from '../models/types';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcrypt';

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
        user_id INTEGER NOT NULL,
        asin TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, asin)
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
        price REAL,
        available BOOLEAN DEFAULT 1,
        unavailable_reason TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id)
      )
    `;

    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'USER',
        is_disabled INTEGER NOT NULL DEFAULT 0,
        disabled_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CHECK (role IN ('USER', 'ADMIN'))
      )
    `;

    const createUserListsTable = `
      CREATE TABLE IF NOT EXISTS user_lists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, name)
      )
    `;

    const createProductListsTable = `
      CREATE TABLE IF NOT EXISTS product_lists (
        product_id INTEGER NOT NULL,
        list_id INTEGER NOT NULL,
        PRIMARY KEY (product_id, list_id),
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
        FOREIGN KEY (list_id) REFERENCES user_lists(id) ON DELETE CASCADE
      )
    `;

    const createAuditLogTable = `
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        admin_user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT,
        target_id INTEGER,
        details TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (admin_user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;

    const createSystemConfigTable = `
      CREATE TABLE IF NOT EXISTS system_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        description TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_by INTEGER,
        FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
      )
    `;

    this.db.serialize(() => {
      // Create other tables first (users must exist before products due to foreign key)
      this.db.run(createUsersTable);
      this.db.run(createAuditLogTable);
      this.db.run(createCategoriesTable);
      this.db.run(createProductCategoriesTable);
      this.db.run(createUserListsTable);
      this.db.run(createProductListsTable);
      this.db.run(createSystemConfigTable);

      // Check if users table needs migration for role and is_disabled columns
      this.checkAndMigrateUsersTable(() => {
        // Check if price_history table needs migration for availability columns
        this.checkAndMigratePriceHistoryTable(() => {
          // Check if products table needs migration (this will create it if needed)
          this.checkAndMigrateProductsTable(() => {
            // Create indexes after migration is complete
            this.db.run('CREATE INDEX IF NOT EXISTS idx_product_id ON price_history(product_id)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_asin ON products(asin)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_products_user ON products(user_id)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_category_name ON categories(name)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_product_category_product ON product_categories(product_id)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_product_category_category ON product_categories(category_id)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_product_category_level ON product_categories(level)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_user_lists_user ON user_lists(user_id)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_product_lists_product ON product_lists(product_id)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_product_lists_list ON product_lists(list_id)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_audit_log_admin ON audit_log(admin_user_id)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at)');
            this.db.run('CREATE INDEX IF NOT EXISTS idx_audit_log_target ON audit_log(target_type, target_id)');
            this.initializeSystemConfig();
          });
        });
      });
    });
  }

  private checkAndMigratePriceHistoryTable(callback: () => void): void {
    // Check if price_history table has availability columns
    this.db.all("PRAGMA table_info(price_history)", (err, columns: any[]) => {
      if (err) {
        console.error('Error checking price_history table info:', err);
        callback();
        return;
      }

      // Table doesn't exist yet — create it with the final schema directly
      if (!columns || columns.length === 0) {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            price REAL,
            available BOOLEAN DEFAULT 1,
            unavailable_reason TEXT,
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id)
          )
        `, (err) => {
          if (err) {
            console.error('Error creating price_history table:', err);
          }
          callback();
        });
        return;
      }

      const hasAvailable = columns.some(col => col.name === 'available');
      const hasUnavailableReason = columns.some(col => col.name === 'unavailable_reason');
      const priceColumn = columns.find(col => col.name === 'price');
      const hasPriceNullable = priceColumn?.notnull === 0;

      // If we need to make price nullable or add new columns, we need to recreate the table
      const needsRecreation = !hasPriceNullable || !hasAvailable || !hasUnavailableReason;

      if (needsRecreation) {
        console.log('Migrating price_history table: recreating with new schema...');

        // Step 0: Drop leftover temp table from a previous failed migration
        this.db.run('DROP TABLE IF EXISTS price_history_new');

        // Step 1: Create new table with correct schema
        this.db.run(`
          CREATE TABLE price_history_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            price REAL,
            available BOOLEAN DEFAULT 1,
            unavailable_reason TEXT,
            date DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (product_id) REFERENCES products(id)
          )
        `, (err) => {
          if (err) {
            console.error('Error creating new price_history table:', err);
            callback();
            return;
          }

          // Step 2: Copy existing data
          const insertColumns = 'id, product_id, price, available, unavailable_reason, date, created_at';
          const selectColumns = hasAvailable && hasUnavailableReason
            ? 'id, product_id, price, available, unavailable_reason, date, created_at'
            : hasAvailable
            ? 'id, product_id, price, available, NULL, date, created_at'
            : 'id, product_id, price, 1, NULL, date, created_at';

          this.db.run(`
            INSERT INTO price_history_new (${insertColumns})
            SELECT ${selectColumns}
            FROM price_history
          `, (err) => {
            if (err) {
              console.error('Error copying price_history data:', err);
              callback();
              return;
            }

            // Step 3: Drop old table
            this.db.run('DROP TABLE price_history', (err) => {
              if (err) {
                console.error('Error dropping old price_history table:', err);
                callback();
                return;
              }

              // Step 4: Rename new table
              this.db.run('ALTER TABLE price_history_new RENAME TO price_history', (err) => {
                if (err) {
                  console.error('Error renaming price_history table:', err);
                  callback();
                  return;
                }

                console.log('✓ price_history table migration completed successfully.');
                callback();
              });
            });
          });
        });
      } else {
        callback();
      }
    });
  }

  private checkAndMigrateProductsTable(callback: () => void): void {
    // Check if products table exists and if it has user_id column
    this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='products'", (err, row: any) => {
      if (err) {
        console.error('Error checking products table:', err);
        // Create table if it doesn't exist
        this.db.run(`
          CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            asin TEXT NOT NULL,
            description TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, asin)
          )
        `, () => {
          callback();
        });
        return;
      }

      if (row) {
        // Table exists, check if user_id column exists
        this.db.all("PRAGMA table_info(products)", (err, columns: any[]) => {
          if (err) {
            console.error('Error checking table info:', err);
            callback();
            return;
          }

          const hasUserId = columns.some(col => col.name === 'user_id');
          
          if (!hasUserId) {
            console.log('Migrating products table: adding user_id column...');
            this.migrateProductsTable(callback);
          } else {
            // Table already has user_id, just ensure indexes exist
            callback();
          }
        });
      } else {
        // Table doesn't exist, create it
        this.db.run(`
          CREATE TABLE IF NOT EXISTS products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            asin TEXT NOT NULL,
            description TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, asin)
          )
        `, () => {
          callback();
        });
      }
    });
  }

  private migrateProductsTable(callback: () => void): void {
    // SQLite doesn't support adding NOT NULL columns easily, so we need to recreate the table
    // First, check if there are any existing products
    this.db.get("SELECT COUNT(*) as count FROM products", (err, row: any) => {
      if (err) {
        console.error('Error checking product count:', err);
        callback();
        return;
      }

      const productCount = row?.count || 0;
      
      if (productCount > 0) {
        console.warn(`Found ${productCount} existing products without user_id. These will be deleted during migration.`);
        console.warn('If you need to preserve this data, please backup your database first.');
      }

      // Recreate the table with the new schema
      // Step 1: Create new table with correct schema
      this.db.run(`
        CREATE TABLE products_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          asin TEXT NOT NULL,
          description TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE(user_id, asin)
        )
      `, (err) => {
        if (err) {
          console.error('Error creating new products table:', err);
          callback();
          return;
        }

        // Step 2: Drop old table
        this.db.run("DROP TABLE IF EXISTS products", (err) => {
          if (err) {
            console.error('Error dropping old products table:', err);
            callback();
            return;
          }

          // Step 3: Rename new table
          this.db.run("ALTER TABLE products_new RENAME TO products", (err) => {
            if (err) {
              console.error('Error renaming products table:', err);
              callback();
              return;
            }

            console.log('Products table migration completed successfully.');
            callback();
          });
        });
      });
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
  async addProduct(userId: number, asin: string, description: string, categories?: string[]): Promise<Product> {
    return new Promise(async (resolve, reject) => {
      try {
        const sql = 'INSERT INTO products (user_id, asin, description) VALUES (?, ?, ?)';
        const dbService = this; // Capture this for async operations
        this.db.run(sql, [userId, asin, description], async function(err) {
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
          const product = await dbService.getProductById(productId, userId);
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

  async getProductById(id: number, userId: number): Promise<Product | null> {
    return new Promise(async (resolve, reject) => {
      try {
        const sql = 'SELECT * FROM products WHERE id = ? AND user_id = ?';
        this.db.get(sql, [id, userId], async (err, row: any) => {
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

  async getProductByASIN(userId: number, asin: string): Promise<Product | null> {
    return new Promise(async (resolve, reject) => {
      try {
        const sql = 'SELECT * FROM products WHERE user_id = ? AND asin = ?';
        this.db.get(sql, [userId, asin], async (err, row: any) => {
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

  async getAllProducts(userId: number, categoryFilter?: string): Promise<Product[]> {
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
            WHERE p.user_id = ? AND c.name LIKE ?
            ORDER BY p.created_at DESC
          `;
          params = [userId, `%${categoryFilter}%`];
        } else {
          sql = 'SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC';
          params = [userId];
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

  async searchProducts(userId: number, query: string, categoryFilter?: string): Promise<Product[]> {
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
            WHERE p.user_id = ? AND (p.description LIKE ? OR p.asin LIKE ?)
            AND c.name LIKE ?
            ORDER BY p.created_at DESC
          `;
          params = [userId, searchTerm, searchTerm, `%${categoryFilter}%`];
        } else {
          sql = 'SELECT * FROM products WHERE user_id = ? AND (description LIKE ? OR asin LIKE ?) ORDER BY created_at DESC';
          params = [userId, searchTerm, searchTerm];
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

  async deleteProduct(id: number, userId: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      // First delete price history
      this.db.run('DELETE FROM price_history WHERE product_id = ?', [id], (err) => {
        if (err) {
          reject(err);
          return;
        }
        // Then delete product (only if owned by user)
        this.db.run('DELETE FROM products WHERE id = ? AND user_id = ?', [id, userId], function(err) {
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
      const sql = 'SELECT price, available FROM price_history WHERE product_id = ? ORDER BY date DESC LIMIT 1';
      this.db.get(sql, [productId], (err, row: { price: number | null; available: number } | undefined) => {
        if (err) {
          reject(err);
        } else {
          // Only return price if product is available
          resolve(row && row.available ? row.price : null);
        }
      });
    });
  }

  async addPriceHistory(productId: number, price: number | null, available: boolean = true, unavailableReason?: string): Promise<PriceHistory> {
    return new Promise((resolve, reject) => {
      const sql = 'INSERT INTO price_history (product_id, price, available, unavailable_reason) VALUES (?, ?, ?, ?)';
      this.db.run(sql, [productId, price, available ? 1 : 0, unavailableReason || null], function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({
            id: this.lastID,
            product_id: productId,
            price,
            available,
            unavailable_reason: unavailableReason,
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

  async getProductWithPriceHistory(productId: number, userId: number): Promise<ProductWithPrice | null> {
    const product = await this.getProductById(productId, userId);
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

  async getBiggestPriceDrops(userId: number, limit: number = 10): Promise<PriceDrop[]> {
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
        WHERE p.user_id = ?
        AND current.id = (
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

      this.db.all(sql, [userId, limit], async (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          // Fetch price history and categories for each product
          const dbService = this;
          const drops: PriceDrop[] = await Promise.all(
            rows.map(async (row) => {
              const priceHistory = await dbService.getPriceHistory(row.id);
              const categories = await dbService.getProductCategories(row.id);
              // Verify product belongs to user (already filtered in SQL, but double-check)
              const product = await dbService.getProductById(row.id, userId);
              if (!product) {
                return null;
              }
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
          // Filter out null values
          resolve(drops.filter((drop): drop is PriceDrop => drop !== null));
        }
      });
    });
  }

  async getBiggestPriceIncreases(userId: number, limit: number = 10): Promise<PriceDrop[]> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT 
          p.id,
          p.asin,
          p.description,
          p.created_at,
          current.price as current_price,
          previous.price as previous_price,
          (current.price - previous.price) as price_drop,
          ((current.price - previous.price) / previous.price * 100) as price_drop_percentage,
          current.date as last_updated
        FROM products p
        INNER JOIN price_history current ON p.id = current.product_id
        INNER JOIN price_history previous ON p.id = previous.product_id
        WHERE p.user_id = ?
        AND current.id = (
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
        AND previous.price < current.price
        ORDER BY price_drop_percentage DESC
        LIMIT ?
      `;

      this.db.all(sql, [userId, limit], async (err, rows: any[]) => {
        if (err) {
          reject(err);
        } else {
          // Fetch price history and categories for each product
          const dbService = this;
          const increases: PriceDrop[] = await Promise.all(
            rows.map(async (row) => {
              const priceHistory = await dbService.getPriceHistory(row.id);
              const categories = await dbService.getProductCategories(row.id);
              // Verify product belongs to user (already filtered in SQL, but double-check)
              const product = await dbService.getProductById(row.id, userId);
              if (!product) {
                return null;
              }
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
          // Filter out null values
          resolve(increases.filter((increase): increase is PriceDrop => increase !== null));
        }
      });
    });
  }

  async getProductCount(userId: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT COUNT(*) as count FROM products WHERE user_id = ?';
      this.db.get(sql, [userId], (err, row: { count: number } | undefined) => {
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

  // User operations
  async createUser(username: string, password: string): Promise<User> {
    return new Promise(async (resolve, reject) => {
      try {
        const passwordHash = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO users (username, password_hash) VALUES (?, ?)';
        this.db.run(sql, [username, passwordHash], function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve({
            id: this.lastID,
            username,
            role: 'USER',
            is_disabled: false,
            created_at: new Date().toISOString()
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async createAdminUser(username: string, password: string): Promise<User> {
    return new Promise(async (resolve, reject) => {
      try {
        const passwordHash = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO users (username, password_hash, role) VALUES (?, ?, "ADMIN")';
        this.db.run(sql, [username, passwordHash], function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve({
            id: this.lastID,
            username,
            role: 'ADMIN',
            is_disabled: false,
            created_at: new Date().toISOString()
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async setUserRole(userId: number, role: UserRole): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE users SET role = ? WHERE id = ?';
      this.db.run(sql, [role, userId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  async getUserByUsername(username: string): Promise<UserWithPasswordHash | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM users WHERE username = ?';
      this.db.get(sql, [username], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        if (!row) {
          resolve(null);
          return;
        }
        resolve({
          id: row.id,
          username: row.username,
          role: row.role,
          is_disabled: !!row.is_disabled,
          disabled_at: row.disabled_at,
          password_hash: row.password_hash,
          created_at: row.created_at
        });
      });
    });
  }

  async updateUserPassword(userId: number, newPassword: string): Promise<boolean> {
    return new Promise(async (resolve, reject) => {
      try {
        const passwordHash = await bcrypt.hash(newPassword, 10);
        const sql = 'UPDATE users SET password_hash = ? WHERE id = ?';
        this.db.run(sql, [passwordHash, userId], function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(this.changes > 0);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async getUserById(id: number): Promise<User | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT id, username, role, is_disabled, disabled_at, created_at FROM users WHERE id = ?';
      this.db.get(sql, [id], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        if (!row) {
          resolve(null);
          return;
        }
        resolve({
          id: row.id,
          username: row.username,
          role: row.role,
          is_disabled: !!row.is_disabled,
          disabled_at: row.disabled_at,
          created_at: row.created_at
        });
      });
    });
  }

  async getAllUsers(): Promise<User[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT id, username, role, is_disabled, disabled_at, created_at FROM users';
      this.db.all(sql, [], (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows.map(row => ({
          id: row.id,
          username: row.username,
          role: row.role,
          is_disabled: !!row.is_disabled,
          disabled_at: row.disabled_at,
          created_at: row.created_at
        })));
      });
    });
  }

  // List operations
  async createList(userId: number, name: string): Promise<UserList> {
    return new Promise((resolve, reject) => {
      const sql = 'INSERT INTO user_lists (user_id, name) VALUES (?, ?)';
      this.db.run(sql, [userId, name], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          id: this.lastID,
          user_id: userId,
          name,
          created_at: new Date().toISOString()
        });
      });
    });
  }

  async getUserLists(userId: number): Promise<UserList[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM user_lists WHERE user_id = ? ORDER BY name ASC';
      this.db.all(sql, [userId], (err, rows: UserList[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  async getListById(listId: number): Promise<UserList | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM user_lists WHERE id = ?';
      this.db.get(sql, [listId], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        if (!row) {
          resolve(null);
          return;
        }
        resolve({
          id: row.id,
          user_id: row.user_id,
          name: row.name,
          created_at: row.created_at
        });
      });
    });
  }

  async updateList(listId: number, name: string): Promise<UserList | null> {
    return new Promise(async (resolve, reject) => {
      const sql = 'UPDATE user_lists SET name = ? WHERE id = ?';
      const dbService = this;
      this.db.run(sql, [name, listId], async function(err) {
        if (err) {
          reject(err);
          return;
        }
        if (this.changes === 0) {
          resolve(null);
          return;
        }
        const updated = await dbService.getListById(listId);
        resolve(updated);
      });
    });
  }

  async deleteList(listId: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM user_lists WHERE id = ?';
      this.db.run(sql, [listId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  // Product-List operations
  async addProductToList(productId: number, listId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = 'INSERT OR IGNORE INTO product_lists (product_id, list_id) VALUES (?, ?)';
      this.db.run(sql, [productId, listId], (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  async removeProductFromList(productId: number, listId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const sql = 'DELETE FROM product_lists WHERE product_id = ? AND list_id = ?';
      this.db.run(sql, [productId, listId], (err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  async getProductLists(productId: number, userId?: number): Promise<UserList[]> {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT ul.id, ul.user_id, ul.name, ul.created_at
        FROM user_lists ul
        INNER JOIN product_lists pl ON ul.id = pl.list_id
        WHERE pl.product_id = ?
      `;
      const params: any[] = [productId];
      
      if (userId) {
        sql += ' AND ul.user_id = ?';
        params.push(userId);
      }
      
      sql += ' ORDER BY ul.name ASC';
      
      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows || []);
      });
    });
  }

  async getProductsWithLists(userId: number, categoryFilter?: string, limit?: number, offset?: number): Promise<Product[]> {
    return new Promise(async (resolve, reject) => {
      try {
        let sql: string;
        let params: any[];

        if (categoryFilter) {
          sql = `
            SELECT DISTINCT p.id, p.asin, p.description, p.created_at
            FROM products p
            INNER JOIN product_categories pc ON p.id = pc.product_id
            INNER JOIN categories c ON pc.category_id = c.id
            WHERE p.user_id = ? AND c.name LIKE ?
            ORDER BY p.created_at DESC
          `;
          params = [userId, `%${categoryFilter}%`];
        } else {
          sql = 'SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC';
          params = [userId];
        }

        // Add pagination
        if (limit !== undefined) {
          sql += ' LIMIT ?';
          params.push(limit);
          if (offset !== undefined) {
            sql += ' OFFSET ?';
            params.push(offset);
          }
        }

        this.db.all(sql, params, async (err, rows: any[]) => {
          if (err) {
            reject(err);
            return;
          }
          
          // Load categories and lists for each product
          const products: Product[] = await Promise.all(
            (rows || []).map(async (row) => {
              const categories = await this.getProductCategories(row.id);
              const lists = userId ? await this.getProductLists(row.id, userId) : [];
              return {
                id: row.id,
                asin: row.asin,
                description: row.description,
                categories: categories.length > 0 ? categories : undefined,
                lists: lists.length > 0 ? lists : undefined,
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

  async getProductsCount(userId: number, categoryFilter?: string): Promise<number> {
    return new Promise((resolve, reject) => {
      try {
        let sql: string;
        let params: any[];

        if (categoryFilter) {
          sql = `
            SELECT COUNT(DISTINCT p.id) as count
            FROM products p
            INNER JOIN product_categories pc ON p.id = pc.product_id
            INNER JOIN categories c ON pc.category_id = c.id
            WHERE p.user_id = ? AND c.name LIKE ?
          `;
          params = [userId, `%${categoryFilter}%`];
        } else {
          sql = 'SELECT COUNT(*) as count FROM products WHERE user_id = ?';
          params = [userId];
        }

        this.db.get(sql, params, (err, row: { count: number } | undefined) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(row ? row.count : 0);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async getAllProductIdsSorted(userId: number): Promise<number[]> {
    return new Promise((resolve, reject) => {
      try {
        const sql = `
          SELECT id
          FROM products
          WHERE user_id = ?
          ORDER BY LOWER(description) ASC
        `;
        
        this.db.all(sql, [userId], (err, rows: { id: number }[]) => {
          if (err) {
            reject(err);
            return;
          }
          resolve(rows.map(row => row.id));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async getListProducts(listId: number): Promise<Product[]> {
    return new Promise(async (resolve, reject) => {
      try {
        const sql = `
          SELECT p.id, p.asin, p.description, p.created_at
          FROM products p
          INNER JOIN product_lists pl ON p.id = pl.product_id
          WHERE pl.list_id = ?
          ORDER BY p.created_at DESC
        `;
        
        this.db.all(sql, [listId], async (err, rows: any[]) => {
          if (err) {
            reject(err);
            return;
          }
          
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

  private checkAndMigrateUsersTable(callback: () => void): void {
    this.db.all("PRAGMA table_info(users)", (err, columns: any[]) => {
      if (err) {
        console.error('Error checking users table info:', err);
        callback();
        return;
      }

      const columnNames = columns.map(col => col.name);
      const migrations: Array<{ name: string; sql: string }> = [];

      // Add role column if missing
      if (!columnNames.includes('role')) {
        migrations.push({
          name: 'role',
          sql: 'ALTER TABLE users ADD COLUMN role TEXT DEFAULT "USER"'
        });
      }

      // Add is_disabled column if missing
      if (!columnNames.includes('is_disabled')) {
        migrations.push({
          name: 'is_disabled',
          sql: 'ALTER TABLE users ADD COLUMN is_disabled INTEGER DEFAULT 0'
        });
      }

      // Add disabled_at column if missing
      if (!columnNames.includes('disabled_at')) {
        migrations.push({
          name: 'disabled_at',
          sql: 'ALTER TABLE users ADD COLUMN disabled_at DATETIME'
        });
      }

      if (migrations.length === 0) {
        callback();
        return;
      }

      console.log(`Migrating users table with ${migrations.length} column(s)`);
      this.db.serialize(() => {
        migrations.forEach(migration => {
          this.db.run(migration.sql, (err) => {
            if (err) {
              console.error(`Error adding column ${migration.name}:`, err);
            } else {
              console.log(`  Added column ${migration.name}`);
            }
          });
        });
        callback();
      });
    });
  }

  async logAudit(
    adminUserId: number,
    action: string,
    targetType?: string,
    targetId?: number,
    details?: string
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      const sql = `
        INSERT INTO audit_log (admin_user_id, action, target_type, target_id, details)
        VALUES (?, ?, ?, ?, ?)
      `;
      this.db.run(
        sql,
        [adminUserId, action, targetType || null, targetId || null, details || null],
        function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve(this.lastID);
        }
      );
    });
  }

  async getAuditLogs(
    limit: number = 100,
    offset: number = 0,
    targetType?: string,
    adminUserId?: number
  ): Promise<AuditLog[]> {
    return new Promise((resolve, reject) => {
      let sql = `
        SELECT a.*, u.username as admin_username
        FROM audit_log a
        JOIN users u ON a.admin_user_id = u.id
        WHERE 1=1
      `;
      const params: any[] = [];

      if (targetType) {
        sql += ' AND a.target_type = ?';
        params.push(targetType);
      }

      if (adminUserId) {
        sql += ' AND a.admin_user_id = ?';
        params.push(adminUserId);
      }

      sql += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
      params.push(limit, offset);

      this.db.all(sql, params, (err, rows: any[]) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows.map(row => ({
          id: row.id,
          admin_user_id: row.admin_user_id,
          admin_username: row.admin_username,
          action: row.action,
          target_type: row.target_type,
          target_id: row.target_id,
          details: row.details,
          created_at: row.created_at
        })));
      });
    });
  }

  private initializeSystemConfig(): void {
    const defaults = [
      { key: 'quota_max_products', value: '100', description: 'Max products per user' },
      { key: 'quota_max_lists', value: '20', description: 'Max lists per user' },
      { key: 'scheduler_enabled', value: 'true', description: 'Enable automatic price updates' },
      { key: 'scheduler_cron', value: '0 0 * * *', description: 'Cron schedule for price updates' }
    ];

    defaults.forEach(config => {
      const sql = `
        INSERT OR IGNORE INTO system_config (key, value, description)
        VALUES (?, ?, ?)
      `;
      this.db.run(sql, [config.key, config.value, config.description], (err) => {
        if (err) {
          console.error(`Error inserting default system config for key '${config.key}':`, err);
        }
      });
    });
  }

  async getConfig(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT value FROM system_config WHERE key = ?';
      this.db.get(sql, [key], (err, row: any) => {
        if (err) {
          console.error(`Error getting system config for key '${key}':`, err);
          reject(err);
          return;
        }
        resolve(row?.value || null);
      });
    });
  }

  async setConfig(
    key: string,
    value: string,
    updatedBy: number
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const sql = `
        UPDATE system_config
        SET value = ?, updated_at = CURRENT_TIMESTAMP, updated_by = ?
        WHERE key = ?
      `;
      this.db.run(sql, [value, updatedBy, key], function(err) {
        if (err) {
          console.error(`Error setting system config for key '${key}':`, err);
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  async getAllConfig(): Promise<SystemConfig[]> {
    return new Promise((resolve, reject) => {
      const sql = 'SELECT * FROM system_config ORDER BY key';
      this.db.all(sql, [], (err, rows: any[]) => {
        if (err) {
          console.error('Error getting all system config:', err);
          reject(err);
          return;
        }
        resolve(rows.map(row => ({
          key: row.key,
          value: row.value,
          description: row.description,
          updated_at: row.updated_at,
          updated_by: row.updated_by
        })));
      });
    });
  }

  async getUserStats(userId: number): Promise<UserStats> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          COUNT(DISTINCT p.id) as product_count,
          COUNT(DISTINCT l.id) as list_count,
          COUNT(DISTINCT ph.id) as price_history_count
        FROM users u
        LEFT JOIN products p ON u.id = p.user_id
        LEFT JOIN user_lists l ON u.id = l.user_id
        LEFT JOIN price_history ph ON p.id = ph.product_id
        WHERE u.id = ?
        GROUP BY u.id
      `;
      this.db.get(sql, [userId], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          product_count: row?.product_count || 0,
          list_count: row?.list_count || 0,
          price_history_count: row?.price_history_count || 0
        });
      });
    });
  }

  async createUserWithRole(username: string, password: string, role: string): Promise<User> {
    return new Promise(async (resolve, reject) => {
      try {
        // Validate role is a valid UserRole
        if (!['USER', 'ADMIN'].includes(role)) {
          reject(new Error('Invalid role: must be USER or ADMIN'));
          return;
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const sql = 'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)';
        this.db.run(sql, [username, passwordHash, role], function(err) {
          if (err) {
            reject(err);
            return;
          }
          resolve({
            id: this.lastID,
            username,
            role: role as any, // Validated above, will be converted to UserRole by database CHECK constraint
            is_disabled: false,
            created_at: new Date().toISOString()
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async disableUser(userId: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE users SET is_disabled = 1, disabled_at = CURRENT_TIMESTAMP WHERE id = ?';
      this.db.run(sql, [userId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  async enableUser(userId: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const sql = 'UPDATE users SET is_disabled = 0, disabled_at = NULL WHERE id = ?';
      this.db.run(sql, [userId], function(err) {
        if (err) {
          reject(err);
          return;
        }
        resolve(this.changes > 0);
      });
    });
  }

  async getSystemStats(): Promise<SystemStats> {
    return new Promise((resolve, reject) => {
      const sql = `
        SELECT
          (SELECT COUNT(*) FROM users) as total_users,
          (SELECT COUNT(*) FROM users WHERE role = 'ADMIN') as total_admins,
          (SELECT COUNT(*) FROM users WHERE is_disabled = 1) as disabled_users,
          (SELECT COUNT(*) FROM products) as total_products,
          (SELECT COUNT(DISTINCT user_id) FROM products) as active_users,
          (SELECT COUNT(*) FROM price_history) as total_price_history
      `;
      this.db.get(sql, [], (err, row: any) => {
        if (err) {
          reject(err);
          return;
        }
        resolve({
          total_users: row?.total_users || 0,
          total_admins: row?.total_admins || 0,
          disabled_users: row?.disabled_users || 0,
          total_products: row?.total_products || 0,
          active_users: row?.active_users || 0,
          total_price_history: row?.total_price_history || 0
        });
      });
    });
  }
}

// Singleton instance
export const dbService = new DatabaseService();

