import express from 'express';
import cors from 'cors';
import productsRouter from './routes/products';
import pricesRouter from './routes/prices';
import dashboardRouter from './routes/dashboard';
import configRouter from './routes/config';
import authRouter from './routes/auth';
import listsRouter from './routes/lists';
import { schedulerService } from './services/scheduler';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRouter);
app.use('/api/lists', listsRouter);
app.use('/api/products', productsRouter);
app.use('/api/prices', pricesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/config', configRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Start server - listen on all interfaces (0.0.0.0) to allow Tailscale access
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Server accessible on all interfaces (including Tailscale)`);
  
  // Start scheduler for automatic daily updates
  schedulerService.start();
});

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

