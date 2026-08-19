/** One-shot retries to find the main composer; never a standing 400ms poll. */
export const COMPOSER_ANCHOR_RETRY_MS = [200, 800, 2000] as const
