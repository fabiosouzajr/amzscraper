import { Router, Request, Response } from 'express';
import { dbService } from '../services/database';
import { scraperService } from '../services/scraper';
import { validateASIN, normalizeASIN } from '../utils/validation';

const router = Router();

// GET /api/products - List all products
router.get('/', async (req: Request, res: Response) => {
  try {
    const products = await dbService.getAllProducts();
    res.json(products);
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// GET /api/products/search?q=... - Search products
router.get('/search', async (req: Request, res: Response) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.status(400).json({ error: 'Search query is required' });
    }
    const products = await dbService.searchProducts(query);
    res.json(products);
  } catch (error) {
    console.error('Error searching products:', error);
    res.status(500).json({ error: 'Failed to search products' });
  }
});

// GET /api/products/:id - Get product with price history
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    const product = await dbService.getProductWithPriceHistory(id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    const priceHistory = await dbService.getPriceHistory(id);
    res.json({ ...product, price_history: priceHistory });
  } catch (error) {
    console.error('Error fetching product:', error);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// POST /api/products - Add new ASIN
router.post('/', async (req: Request, res: Response) => {
  try {
    const { asin } = req.body;
    
    if (!asin) {
      return res.status(400).json({ error: 'ASIN is required' });
    }

    const normalizedASIN = normalizeASIN(asin);
    
    if (!validateASIN(normalizedASIN)) {
      return res.status(400).json({ error: 'Invalid ASIN format' });
    }

    // Check if product already exists
    const existing = await dbService.getProductByASIN(normalizedASIN);
    if (existing) {
      return res.status(409).json({ error: 'Product with this ASIN already exists' });
    }

    // Scrape product data
    await scraperService.initialize();
    const scrapedData = await scraperService.scrapeProduct(normalizedASIN);

    // Save product
    const product = await dbService.addProduct(normalizedASIN, scrapedData.description);
    
    // Save initial price
    await dbService.addPriceHistory(product.id, scrapedData.price);

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
    const deleted = await dbService.deleteProduct(id);
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

