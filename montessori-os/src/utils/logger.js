// Minimal logger that only outputs in development builds
// Swap implementation later to integrate with a remote error monitor (e.g., Sentry)

const isDev = import.meta?.env?.DEV === true;

export const logger = {
  info: (...args) => {
    if (isDev) console.info(...args);
  },
  warn: (...args) => {
    if (isDev) console.warn(...args);
  },
  error: (...args) => {
    if (isDev) console.error(...args);
  },
};

export default logger;

