import { Langfuse } from "langfuse";

const LANGFUSE_BASE_URL = process.env.LANGFUSE_BASE_URL || "https://us.cloud.langfuse.com";

/**
 * Create a configured Langfuse client.
 * Reads LANGFUSE_SECRET_KEY and LANGFUSE_PUBLIC_KEY from env vars
 * (injected by Firebase defineSecret).
 */
export function createLangfuse() {
  return new Langfuse({
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    baseUrl: LANGFUSE_BASE_URL,
  });
}
