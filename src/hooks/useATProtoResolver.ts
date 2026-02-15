/**
 * React hook for ATProto handle/DID resolution
 *
 * This hook handles the complete resolution chain:
 * - Handle → DID (via PLC Directory)
 * - DID → PDS endpoint (via DID document)
 * - Caching with sessionStorage
 */

import { useState, useEffect, useCallback } from 'react';
import { resolveHandleToDid, getPdsEndpoint } from '../utils/atproto';
import { withRetry } from '../utils/retry';
import type { ResolutionResult } from '../types/atproto';

export interface ResolverState {
  data: ResolutionResult | null;
  loading: boolean;
  error: string | null;
}

const CACHE_KEY_PREFIX = 'wisp_resolver_';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Parse input to determine if it's a handle or DID
 */
function parseInput(input: string): { type: 'handle' | 'did'; value: string } {
  const trimmed = input.trim();

  // Check if it's a DID (starts with did:plc or did:web)
  if (trimmed.startsWith('did:plc:') || trimmed.startsWith('did:web:')) {
    return { type: 'did', value: trimmed };
  }

  // Remove @ prefix if present
  const value = trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;

  // Check for handle format (basic validation)
  if (value.includes('.') && value.length > 0) {
    return { type: 'handle', value };
  }

  // Default to treating as handle
  return { type: 'handle', value };
}

/**
 * Get cache key for a handle or DID
 */
function getCacheKey(handleOrDid: string): string {
  return `${CACHE_KEY_PREFIX}${handleOrDid}`;
}

/**
 * Load from sessionStorage cache
 */
function loadFromCache(handleOrDid: string): ResolutionResult | null {
  try {
    const cached = sessionStorage.getItem(getCacheKey(handleOrDid));
    if (!cached) {
      return null;
    }

    const entry = JSON.parse(cached);
    const now = Date.now();

    // Check if expired
    if (now - entry.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(getCacheKey(handleOrDid));
      return null;
    }

    return entry.data;
  } catch (error) {
    console.warn('Failed to load from cache:', error);
    return null;
  }
}

/**
 * Save to sessionStorage cache
 */
function saveToCache(handleOrDid: string, data: ResolutionResult): void {
  try {
    const entry = {
      data,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(getCacheKey(handleOrDid), JSON.stringify(entry));
  } catch (error) {
    console.warn('Failed to save to cache:', error);
  }
}

/**
 * Clear cache for a specific handle or DID
 */
export function clearResolverCache(handleOrDid?: string): void {
  if (handleOrDid) {
    sessionStorage.removeItem(getCacheKey(handleOrDid));
  } else {
    // Clear all wisp resolver cache
    const keys = Object.keys(sessionStorage);
    for (const key of keys) {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    }
  }
}

/**
 * Custom hook for ATProto resolution
 */
export function useATProtoResolver(input: string | null): ResolverState {
  const [state, setState] = useState<ResolverState>({
    data: null,
    loading: false,
    error: null,
  });

  const resolve = useCallback(async (value: string) => {
    const parsed = parseInput(value);

    // Try cache first
    const cached = loadFromCache(parsed.value);
    if (cached) {
      setState({ data: cached, loading: false, error: null });
      return;
    }

    setState({ data: null, loading: true, error: null });

    try {
      let did: string;
      let handle: string | undefined;

      if (parsed.type === 'handle') {
        handle = parsed.value;
        did = await withRetry(() => resolveHandleToDid(handle!));
      } else {
        did = parsed.value;
      }

      const pdsUrl = await withRetry(() => getPdsEndpoint(did));

      const result: ResolutionResult = {
        handle,
        did,
        pdsUrl,
      };

      // Cache the result
      saveToCache(parsed.value, result);

      setState({ data: result, loading: false, error: null });
    } catch (error) {
      let errorMessage = 'Failed to resolve handle or DID';

      if (error instanceof Error) {
        errorMessage = error.message;

        // Add specific error messages
        if (error.message.includes('Failed to resolve handle')) {
          errorMessage = `Handle '${parsed.value}' not found or does not exist`;
        } else if (error.message.includes('Could not find PDS endpoint')) {
          errorMessage = `No PDS found for this account`;
        } else if (error.message.includes('Failed to fetch')) {
          errorMessage = `Network error. Please check your connection and try again`;
        }
      }

      setState({ data: null, loading: false, error: errorMessage });
    }
  }, []);

  // Resolve when input changes
  useEffect(() => {
    if (!input || !input.trim()) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    resolve(input);
  }, [input, resolve]);

  return state;
}

/**
 * Hook that also provides manual resolve and clear functions
 */
export function useATProtoResolverManual(input: string | null) {
  const state = useATProtoResolver(input);

  return {
    ...state,
    resolve: async (_value: string) => {
      // This will trigger a re-render via the input prop
      // For manual usage, you'd typically update the input state
      throw new Error(
        'Use the input prop instead. See useATProtoResolver for automatic resolution.'
      );
    },
    clear: () => clearResolverCache(input || undefined),
  };
}
