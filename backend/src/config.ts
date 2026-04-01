import 'dotenv/config';
import path from 'path';

export interface AppConfig {
  // Server
  port: number;
  portFallback: number;
  bindAddress: string;

  // Security
  jwtSecret: string;
  jwtExpiresIn: string;
  bcryptRounds: number;

  // Database
  dbPath: string;

  // Admin bootstrap (legacy -- deprecated, use setup flow)
  initialAdminUsername: string | null;
  initialAdminPassword: string | null;

  // Environment
  nodeEnv: 'development' | 'production' | 'test';
  isProduction: boolean;
}

function loadConfig(): AppConfig {
  const nodeEnv = (process.env.NODE_ENV || 'development') as AppConfig['nodeEnv'];
  const isProduction = nodeEnv === 'production';

  // JWT_SECRET: required in production, warned in development
  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  if (isProduction && jwtSecret === 'your-secret-key-change-in-production') {
    console.error('FATAL: JWT_SECRET is set to the insecure default. Set a real JWT_SECRET for production.');
    process.exit(1);
  }
  if (jwtSecret === 'your-secret-key-change-in-production') {
    console.warn('WARNING: Using default JWT_SECRET. Set JWT_SECRET env var for production.');
  }

  // Port validation
  const port = parseInt(process.env.PORT || '3000', 10);
  const portFallback = parseInt(process.env.PORT_FALLBACK || '3001', 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`FATAL: Invalid PORT value: "${process.env.PORT}". Must be 1-65535.`);
    process.exit(1);
  }
  if (isNaN(portFallback) || portFallback < 1 || portFallback > 65535) {
    console.error(`FATAL: Invalid PORT_FALLBACK value: "${process.env.PORT_FALLBACK}". Must be 1-65535.`);
    process.exit(1);
  }

  // Database path: configurable via DB_PATH, default relative to project root
  const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../database/products.db');

  return {
    port,
    portFallback,
    bindAddress: process.env.BIND_ADDRESS || '0.0.0.0',
    jwtSecret,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10', 10),
    dbPath,
    initialAdminUsername: process.env.INITIAL_ADMIN_USERNAME || null,
    initialAdminPassword: process.env.INITIAL_ADMIN_PASSWORD || null,
    nodeEnv,
    isProduction,
  };
}

export const config = loadConfig();
