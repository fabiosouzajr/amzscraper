import { Router, Response } from 'express';
import { dbService } from '../services/database';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// All routes require authentication
router.use(authenticate);

// GET /api/lists - Get all lists for current user
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const lists = await dbService.getUserLists(req.userId);
    res.json(lists);
  } catch (error) {
    console.error('Error fetching lists:', error);
    res.status(500).json({ error: 'Failed to fetch lists' });
  }
});

// POST /api/lists - Create new list
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { name } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'List name is required' });
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return res.status(400).json({ error: 'List name cannot be empty' });
    }

    try {
      const list = await dbService.createList(req.userId, trimmedName);
      res.status(201).json(list);
    } catch (error: any) {
      if (error.message && error.message.includes('UNIQUE constraint')) {
        return res.status(409).json({ error: 'A list with this name already exists' });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error creating list:', error);
    res.status(500).json({ error: 'Failed to create list' });
  }
});

// PUT /api/lists/:id - Rename list
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const listId = parseInt(req.params.id, 10);
    if (isNaN(listId)) {
      return res.status(400).json({ error: 'Invalid list ID' });
    }

    // Verify list belongs to user
    const list = await dbService.getListById(listId);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    if (list.user_id !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'List name is required' });
    }

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return res.status(400).json({ error: 'List name cannot be empty' });
    }

    try {
      const updated = await dbService.updateList(listId, trimmedName);
      if (!updated) {
        return res.status(404).json({ error: 'List not found' });
      }
      res.json(updated);
    } catch (error: any) {
      if (error.message && error.message.includes('UNIQUE constraint')) {
        return res.status(409).json({ error: 'A list with this name already exists' });
      }
      throw error;
    }
  } catch (error) {
    console.error('Error updating list:', error);
    res.status(500).json({ error: 'Failed to update list' });
  }
});

// DELETE /api/lists/:id - Delete list
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const listId = parseInt(req.params.id, 10);
    if (isNaN(listId)) {
      return res.status(400).json({ error: 'Invalid list ID' });
    }

    // Verify list belongs to user
    const list = await dbService.getListById(listId);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    if (list.user_id !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const deleted = await dbService.deleteList(listId);
    if (!deleted) {
      return res.status(404).json({ error: 'List not found' });
    }

    res.json({ message: 'List deleted successfully' });
  } catch (error) {
    console.error('Error deleting list:', error);
    res.status(500).json({ error: 'Failed to delete list' });
  }
});

// POST /api/lists/:id/products - Add product to list
router.post('/:id/products', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const listId = parseInt(req.params.id, 10);
    if (isNaN(listId)) {
      return res.status(400).json({ error: 'Invalid list ID' });
    }

    const { productId } = req.body;
    if (!productId || typeof productId !== 'number') {
      return res.status(400).json({ error: 'Product ID is required' });
    }

    // Verify list belongs to user
    const list = await dbService.getListById(listId);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    if (list.user_id !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Verify product exists and belongs to user
    const product = await dbService.getProductById(productId, req.userId);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await dbService.addProductToList(productId, listId);
    res.json({ message: 'Product added to list successfully' });
  } catch (error) {
    console.error('Error adding product to list:', error);
    res.status(500).json({ error: 'Failed to add product to list' });
  }
});

// DELETE /api/lists/:id/products/:productId - Remove product from list
router.delete('/:id/products/:productId', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const listId = parseInt(req.params.id, 10);
    const productId = parseInt(req.params.productId, 10);

    if (isNaN(listId) || isNaN(productId)) {
      return res.status(400).json({ error: 'Invalid list ID or product ID' });
    }

    // Verify list belongs to user
    const list = await dbService.getListById(listId);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    if (list.user_id !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    await dbService.removeProductFromList(productId, listId);
    res.json({ message: 'Product removed from list successfully' });
  } catch (error) {
    console.error('Error removing product from list:', error);
    res.status(500).json({ error: 'Failed to remove product from list' });
  }
});

// GET /api/lists/:id/products - Get products in a list
router.get('/:id/products', async (req: AuthRequest, res: Response) => {
  try {
    if (!req.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const listId = parseInt(req.params.id, 10);
    if (isNaN(listId)) {
      return res.status(400).json({ error: 'Invalid list ID' });
    }

    // Verify list belongs to user
    const list = await dbService.getListById(listId);
    if (!list) {
      return res.status(404).json({ error: 'List not found' });
    }

    if (list.user_id !== req.userId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const products = await dbService.getListProducts(listId);
    res.json(products);
  } catch (error) {
    console.error('Error fetching list products:', error);
    res.status(500).json({ error: 'Failed to fetch list products' });
  }
});

export default router;

