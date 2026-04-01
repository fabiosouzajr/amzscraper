// Import logger first to add timestamps to all console output
import './utils/logger';
// Import config (which loads .env)
import { config } from './config';

import express from 'express';
import cors from 'cors';
import productsRouter from './routes/products';
import pricesRouter from './routes/prices';
import dashboardRouter from './routes/dashboard';
import configRouter from './routes/config';
import authRouter from './routes/auth';
import listsRouter from './routes/lists';
import adminRouter from './routes/admin';
import notificationsRouter from './routes/notifications';
import { schedulerService } from './services/scheduler';
import { getAvailablePort } from './utils/portManager';
import { dbService } from './services/database';

async function startServer() {
  const app = express();

  // Middleware
  app.use(cors({
    origin: true,  // Allow all origins in development
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }));
  app.use(express.json());

  // Routes
  app.use('/api/auth', authRouter);
  app.use('/api/lists', listsRouter);
  app.use('/api/products', productsRouter);
  app.use('/api/prices', pricesRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/config', configRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/notifications', notificationsRouter);

  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Get available port with failover support
  let PORT: number;
  try {
    PORT = await getAvailablePort();
  } catch (error) {
    console.error('Failed to get available port:', error);
    process.exit(1);
  }

  // Start server - listen on configured bind address to allow Tailscale access
  const server = app.listen(PORT, config.bindAddress, async () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Server accessible on all interfaces (including Tailscale)`);

    // Wait for DB tables/migrations to finish before starting the scheduler
    await dbService.ready;

    // Ensure initial admin exists (must run after DB is ready)
    const { initialAdminUsername, initialAdminPassword } = config;

    if (initialAdminUsername && initialAdminPassword) {
      try {
        const existingAdmin = await dbService.getUserByUsername(initialAdminUsername);
        if (!existingAdmin) {
          await dbService.createAdminUser(initialAdminUsername, initialAdminPassword);
          console.log(`✓ Initial admin user created: ${initialAdminUsername}`);
        } else if (existingAdmin.role !== 'ADMIN') {
          await dbService.setUserRole(existingAdmin.id, 'ADMIN');
          console.log(`✓ Existing user promoted to admin: ${initialAdminUsername}`);
        }
      } catch (error) {
        console.error('Error ensuring initial admin exists:', error);
      }
    }

    // Start scheduler for automatic daily updates
    schedulerService.start();
  });

  // Handle server errors
  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use`);
    } else {
      console.error('Server error:', err);
    }
    process.exit(1);
  });
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  schedulerService.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  schedulerService.stop();
  process.exit(0);
});

// Start the server
startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

