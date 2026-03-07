import net from 'net';

/**
 * Utility to find an available port with failover support
 * @param primaryPort - Primary port to try first (from PORT env var, default 3000)
 * @param fallbackPort - Fallback port to try if primary is in use (from PORT_FALLBACK env var, default 3001)
 * @returns A Promise that resolves to an available port
 */
export async function getAvailablePort(
  primaryPort: number = parseInt(process.env.PORT || '3000', 10),
  fallbackPort: number = parseInt(process.env.PORT_FALLBACK || '3001', 10)
): Promise<number> {
  // Validate port numbers
  if (isNaN(primaryPort) || primaryPort < 1 || primaryPort > 65535) {
    throw new Error(`Invalid primary port: ${primaryPort}`);
  }
  if (isNaN(fallbackPort) || fallbackPort < 1 || fallbackPort > 65535) {
    throw new Error(`Invalid fallback port: ${fallbackPort}`);
  }

  // Try primary port first
  const primaryAvailable = await isPortAvailable(primaryPort);
  if (primaryAvailable) {
    console.log(`Port ${primaryPort} is available, using it`);
    return primaryPort;
  }

  console.warn(`Port ${primaryPort} is already in use, trying fallback port ${fallbackPort}`);

  // Try fallback port
  const fallbackAvailable = await isPortAvailable(fallbackPort);
  if (fallbackAvailable) {
    console.log(`Fallback port ${fallbackPort} is available, using it`);
    return fallbackPort;
  }

  throw new Error(
    `Neither primary port ${primaryPort} nor fallback port ${fallbackPort} is available. ` +
    `Please specify a different port using PORT or PORT_FALLBACK environment variables.`
  );
}

/**
 * Check if a port is available
 * @param port - Port number to check
 * @returns A Promise that resolves to true if port is available
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        resolve(false);
      } else {
        // Some other error, assume port is not available
        resolve(false);
      }
    });

    server.once('listening', () => {
      server.close();
      resolve(true);
    });

    server.listen(port, '0.0.0.0');
  });
}
