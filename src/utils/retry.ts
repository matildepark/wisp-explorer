/**
 * Retry utility for network operations with exponential backoff
 */

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  shouldRetry?: (error: unknown) => boolean;
}

const defaultRetryOptions: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  shouldRetry: (error: unknown) => {
    // Retry on network errors and 5xx errors
    if (error instanceof TypeError) {
      // Network errors (fetch failed)
      return true;
    }
    if (
      error instanceof Error &&
      'status' in error &&
      typeof (error as { status: number }).status === 'number'
    ) {
      const status = (error as { status: number }).status;
      return status >= 500 || status === 429; // 5xx or 429 (rate limit)
    }
    return false;
  },
};

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff
 */
function calculateDelay(
  attempt: number,
  options: Required<RetryOptions>
): number {
  const delay = options.initialDelay * Math.pow(options.backoffFactor, attempt);
  return Math.min(delay, options.maxDelay);
}

/**
 * Execute a function with retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultRetryOptions, ...options };

  let lastError: unknown;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      const isLastAttempt = attempt === opts.maxAttempts - 1;
      const shouldRetry = !isLastAttempt && opts.shouldRetry(error);

      if (!shouldRetry) {
        throw error;
      }

      const delay = calculateDelay(attempt, opts);
      console.warn(
        `Retry attempt ${attempt + 1}/${opts.maxAttempts} after ${delay}ms`,
        { error }
      );

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Create a retryable version of a function
 */
export function retryable<T extends Array<unknown>, U>(
  fn: (...args: T) => Promise<U>,
  options: RetryOptions = {}
): (...args: T) => Promise<U> {
  return (...args: T) => withRetry(() => fn(...args), options);
}
