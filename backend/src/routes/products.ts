import { Router, Request, Response } from 'express';
import { dbService } from '../services/database';
import { scraperService } from '../services/scraper';
import { validateASIN, normalizeASIN } from '../utils/validation';
import { AuthRequest, authenticate } from '../middleware/auth';

const router = Router();

// All product routes require authentication
router.use(authenticate);

// GET /api/products - List all products (with optional category filter and pagination)
// Includes list memberships for the authenticated user
router.get('/', async (req: Request, res: Response) => {
  try {
    const categoryFilter = req.query.category as string | undefined;
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Validate pagination parameters
    const validPage = Math.max(1, page);
    const validPageSize = Math.min(Math.max(1, pageSize), 100); // Max 100 items per page
    const offset = (validPage - 1) * validPageSize;
    
    // Get products and total count
    const [products, totalCount] = await Promise.all([
      dbService.getProductsWithLists(authReq.userId, categoryFilter, validPageSize, offset),
      dbService.getProductsCount(authReq.userId, categoryFilter)
    ]);
    
    const totalPages = Math.ceil(totalCount / validPageSize);
    
    res.json({
      products,
      pagination: {
        page: validPage,
        pageSize: validPageSize,
        totalCount,
        totalPages
      }
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/search?q=... - Search products (with optional category filter)
// Includes list memberships for the authenticated user
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    const categoryFilter = req.query.category as string | undefined;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Get products for this user
    const products = await dbService.searchProducts(authReq.userId, query, categoryFilter);
    
    // Add list memberships
    const productsWithLists = await Promise.all(
      products.map(async (product) => {
        const lists = await dbService.getProductLists(product.id, authReq.userId!);
        return {
          ...product,
          lists: lists.length > 0 ? lists : undefined
        };
      })
    );
    res.json(productsWithLists);
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ error: 'Failed to search products' });
  }
});

// GET /api/products/categories - Get all available categories
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const categories = await dbService.getAllCategories();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// GET /api/products/ids/sorted - Get all product IDs sorted alphabetically
router.get('/ids/sorted', async (req: Request, res: Response) => {
  try {
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const productIds = await dbService.getAllProductIdsSorted(authReq.userId);
    res.json({ productIds });
  } catch (error) {
    console.error('Error fetching sorted product IDs:', error);
    res.status(500).json({ error: 'Failed to fetch product IDs' });
  }
});

// GET /api/products/:id - Get product with price history
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const product = await dbService.getProductWithPriceHistory(id, authReq.userId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const priceHistory = await dbService.getPriceHistory(id);
    
    // Add list memberships
    const lists = await dbService.getProductLists(id, authReq.userId);
    const productWithLists = {
      ...product,
      lists: lists.length > 0 ? lists : undefined,
      price_history: priceHistory
    };
    
    res.json(productWithLists);
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST /api/products - Add new ASIN
router.post('/', async (req: Request, res: Response) => {
  try {
    const { asin } = req.body;
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    if (!asin) {
      return res.status(400).json({ error: 'ASIN is required' });
    }

    const normalizedASIN = normalizeASIN(asin);
    
    if (!validateASIN(normalizedASIN)) {
      return res.status(400).json({ error: 'Invalid ASIN format' });
    }

    // Check if product already exists for this user
    const existing = await dbService.getProductByASIN(authReq.userId, normalizedASIN);
    if (existing) {
      return res.status(409).json({ error: 'Product with this ASIN already exists' });
    }

    // Scrape product data
    await scraperService.initialize();
    const scrapedData = await scraperService.scrapeProduct(normalizedASIN);

    // Save product with categories for this user
    const product = await dbService.addProduct(authReq.userId, normalizedASIN, scrapedData.description, scrapedData.categories);

    // Save initial price (with availability information)
    await dbService.addPriceHistory(
      product.id,
      scrapedData.price,
      scrapedData.available,
      scrapedData.unavailableReason
    );

    res.status(201).json(product);
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: 'Failed to add product: ' + (error instanceof Error ? error.message : 'Unknown error') });
  }
});

// DELETE /api/products/:id - Remove product
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    const authReq = req as AuthRequest;
    
    if (!authReq.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const deleted = await dbService.deleteProduct(id, authReq.userId);
    if (!deleted) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

export default router;

