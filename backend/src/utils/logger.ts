/**
 * Logger utility that adds timestamps to all log messages
 */

function getTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const milliseconds = String(now.getMilliseconds()).padStart(3, '0');
  
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds}`;
}

// Override console.log to include timestamps
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
const originalInfo = console.info;

console.log = (...args: any[]) => {
  originalLog(`[${getTimestamp()}]`, ...args);
};

console.error = (...args: any[]) => {
  originalError(`[${getTimestamp()}]`, ...args);
};

console.warn = (...args: any[]) => {
  originalWarn(`[${getTimestamp()}]`, ...args);
};

console.info = (...args: any[]) => {
  originalInfo(`[${getTimestamp()}]`, ...args);
};

export {};

