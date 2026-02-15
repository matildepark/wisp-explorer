/**
 * React hook for fetching wisp manifests from PDS
 *
 * This hook handles fetching and parsing place.wisp.fs records
 * from the ATProto PDS with caching support.
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchWispManifest, fetchWispSites, fetchWispSiteManifest } from '../utils/atproto';
import { withRetry } from '../utils/retry';
import type { WispDirectory } from '../types/lexicon';
import type { WispSiteInfo } from '../types/atproto';

export interface ManifestFetcherState {
  data: WispDirectory | null;
  loading: boolean;
  error: string | null;
  recordCount?: number;
}

export interface SitesFetcherState {
  data: WispSiteInfo[];
  loading: boolean;
  error: string | null;
}

const CACHE_KEY_PREFIX = 'wisp_manifest_';
const SITES_CACHE_KEY_PREFIX = 'wisp_sites_';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Get cache key for a DID and optional site rkey
 */
function getCacheKey(did: string, siteRkey?: string): string {
  return siteRkey
    ? `${CACHE_KEY_PREFIX}${did}_${siteRkey}`
    : `${CACHE_KEY_PREFIX}${did}`;
}

/**
 * Get cache key for sites list
 */
function getSitesCacheKey(did: string): string {
  return `${SITES_CACHE_KEY_PREFIX}${did}`;
}

/**
 * Load manifest from sessionStorage cache
 */
function loadFromCache(did: string, siteRkey?: string): { manifest: WispDirectory; recordCount: number } | null {
  try {
    const cached = sessionStorage.getItem(getCacheKey(did, siteRkey));
    if (!cached) {
      return null;
    }

    const entry = JSON.parse(cached);
    const now = Date.now();

    // Check if expired
    if (now - entry.timestamp > CACHE_TTL) {
      sessionStorage.removeItem(getCacheKey(did, siteRkey));
      return null;
    }

    return {
      manifest: entry.data,
      recordCount: entry.recordCount || 0,
    };
  } catch (error) {
    console.warn('Failed to load manifest from cache:', error);
    return null;
  }
}

/**
 * Save manifest to sessionStorage cache
 */
function saveToCache(
  did: string,
  manifest: WispDirectory,
  recordCount: number = 0,
  siteRkey?: string
): void {
  try {
    const entry = {
      data: manifest,
      recordCount,
      timestamp: Date.now(),
    };
    sessionStorage.setItem(getCacheKey(did, siteRkey), JSON.stringify(entry));
  } catch (error) {
    console.warn('Failed to save manifest to cache:', error);
  }
}

/**
 * Clear manifest cache for a specific DID and optional site
 */
export function clearManifestCache(did?: string, siteRkey?: string): void {
  if (did) {
    if (siteRkey) {
      sessionStorage.removeItem(getCacheKey(did, siteRkey));
    } else {
      // Clear all manifests for this DID
      const keys = Object.keys(sessionStorage);
      for (const key of keys) {
        if (key.startsWith(`${CACHE_KEY_PREFIX}${did}`)) {
          sessionStorage.removeItem(key);
        }
      }
    }
  } else {
    // Clear all wisp manifest cache
    const keys = Object.keys(sessionStorage);
    for (const key of keys) {
      if (key.startsWith(CACHE_KEY_PREFIX)) {
        sessionStorage.removeItem(key);
      }
    }
  }
}

/**
 * Estimate size of a manifest (for cache size tracking)
 */
export function estimateManifestSize(manifest: WispDirectory | null): number {
  if (!manifest) {
    return 0;
  }

  const jsonString = JSON.stringify(manifest);
  return new Blob([jsonString]).size;
}

/**
 * Count total files and directories in manifest
 */
export function countManifestEntries(manifest: WispDirectory | null): {
  files: number;
  directories: number;
} {
  if (!manifest) {
    return { files: 0, directories: 0 };
  }

  let files = 0;
  let directories = 0;

  function traverse(dir: WispDirectory) {
    if (dir.files) {
      files += Object.keys(dir.files).length;
    }

    if (dir.dirs) {
      directories += Object.keys(dir.dirs).length;
      for (const subdir of Object.values(dir.dirs)) {
        traverse(subdir);
      }
    }
  }

  traverse(manifest);

  return { files, directories };
}

/**
 * Custom hook for fetching wisp manifests
 */
export function useManifestFetcher(
  pdsUrl: string | null,
  did: string | null,
  siteRkey?: string | null
): ManifestFetcherState {
  const [state, setState] = useState<ManifestFetcherState>({
    data: null,
    loading: false,
    error: null,
    recordCount: undefined,
  });

  const fetchManifest = useCallback(async () => {
    if (!pdsUrl || !did) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    // Try cache first
    const cached = loadFromCache(did, siteRkey || undefined);
    if (cached) {
      const { manifest, recordCount } = cached;
      setState({ data: manifest, loading: false, error: null, recordCount });
      return;
    }

    setState({ data: null, loading: true, error: null, recordCount: undefined });

    try {
      let manifest: WispDirectory | null;

      if (siteRkey) {
        // Fetch specific site
        manifest = await withRetry(() => fetchWispSiteManifest(pdsUrl, did, siteRkey));
      } else {
        // Fetch default (first) site
        manifest = await withRetry(() => fetchWispManifest(pdsUrl, did));
      }

      if (!manifest) {
        setState({
          data: null,
          loading: false,
          error: `No wisp records found for this account. Make sure the account has published a site to wisp.place.`,
        });
        return;
      }

      // Count entries for stats
      const { files, directories } = countManifestEntries(manifest);
      const recordCount = files + directories;

      // Cache the manifest
      saveToCache(did, manifest, recordCount, siteRkey || undefined);

      setState({ data: manifest, loading: false, error: null, recordCount });
    } catch (error) {
      let errorMessage = 'Failed to fetch manifest';

      if (error instanceof Error) {
        errorMessage = error.message;

        // Add specific error messages
        if (error.message.includes('Failed to list place.wisp.fs records')) {
          errorMessage = `No wisp.fs records found for this account`;
        } else if (error.message.includes('Failed to list place.wisp.subfs records')) {
          errorMessage = `No wisp.subfs records found for this account`;
        } else if (error.message.includes('Network error')) {
          errorMessage = `Network error. Please check your connection and try again`;
        } else if (error.message.includes('CORS')) {
          errorMessage = `CORS error. The PDS may not support direct browser access. Try using a proxy.`;
        }
      }

      setState({ data: null, loading: false, error: errorMessage, recordCount: undefined });
    }
  }, [pdsUrl, did, siteRkey]);

  // Fetch when pdsUrl, did, or siteRkey changes
  useEffect(() => {
    fetchManifest();
  }, [fetchManifest]);

  return state;
}

/**
 * Hook for fetching the list of available sites
 */
export function useSitesFetcher(pdsUrl: string | null, did: string | null): SitesFetcherState {
  const [state, setState] = useState<SitesFetcherState>({
    data: [],
    loading: false,
    error: null,
  });

  useEffect(() => {
    const fetchSites = async () => {
      if (!pdsUrl || !did) {
        setState({ data: [], loading: false, error: null });
        return;
      }

      // Try cache first
      try {
        const cached = sessionStorage.getItem(getSitesCacheKey(did));
        if (cached) {
          const entry = JSON.parse(cached);
          const now = Date.now();
          if (now - entry.timestamp <= CACHE_TTL) {
            setState({ data: entry.data, loading: false, error: null });
            return;
          }
        }
      } catch (error) {
        console.warn('Failed to load sites from cache:', error);
      }

      setState({ data: [], loading: true, error: null });

      try {
        const sites = await withRetry(() => fetchWispSites(pdsUrl, did));

        // Cache the sites list
        sessionStorage.setItem(
          getSitesCacheKey(did),
          JSON.stringify({ data: sites, timestamp: Date.now() })
        );

        setState({ data: sites, loading: false, error: null });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to fetch sites';
        setState({ data: [], loading: false, error: errorMessage });
      }
    };

    fetchSites();
  }, [pdsUrl, did]);

  return state;
}

/**
 * Hook that provides manual refresh capability
 */
export function useManifestFetcherManual(
  pdsUrl: string | null,
  did: string | null,
  siteRkey?: string | null
) {
  const [state, setState] = useState<ManifestFetcherState>({
    data: null,
    loading: false,
    error: null,
    recordCount: undefined,
  });

  const fetchManifest = useCallback(async () => {
    if (!pdsUrl || !did) {
      setState({ data: null, loading: false, error: null });
      return;
    }

    // Try cache first
    const cached = loadFromCache(did, siteRkey || undefined);
    if (cached) {
      const { manifest, recordCount } = cached;
      setState({ data: manifest, loading: false, error: null, recordCount });
      return;
    }

    setState({ data: null, loading: true, error: null, recordCount: undefined });

    try {
      let manifest: WispDirectory | null;

      if (siteRkey) {
        manifest = await withRetry(() => fetchWispSiteManifest(pdsUrl, did, siteRkey));
      } else {
        manifest = await withRetry(() => fetchWispManifest(pdsUrl, did));
      }

      if (!manifest) {
        setState({
          data: null,
          loading: false,
          error: `No wisp records found for this account. Make sure the account has published a site to wisp.place.`,
        });
        return;
      }

      // Count entries for stats
      const { files, directories } = countManifestEntries(manifest);
      const recordCount = files + directories;

      // Cache the manifest
      saveToCache(did, manifest, recordCount, siteRkey || undefined);

      setState({ data: manifest, loading: false, error: null, recordCount });
    } catch (error) {
      let errorMessage = 'Failed to fetch manifest';

      if (error instanceof Error) {
        errorMessage = error.message;

        // Add specific error messages
        if (error.message.includes('Failed to list place.wisp.fs records')) {
          errorMessage = `No wisp.fs records found for this account`;
        } else if (error.message.includes('Failed to list place.wisp.subfs records')) {
          errorMessage = `No wisp.subfs records found for this account`;
        } else if (error.message.includes('Network error')) {
          errorMessage = `Network error. Please check your connection and try again`;
        } else if (error.message.includes('CORS')) {
          errorMessage = `CORS error. The PDS may not support direct browser access. Try using a proxy.`;
        }
      }

      setState({ data: null, loading: false, error: errorMessage, recordCount: undefined });
    }
  }, [pdsUrl, did, siteRkey]);

  // Fetch on mount and when pdsUrl/did/siteRkey changes
  useEffect(() => {
    fetchManifest();
  }, [fetchManifest]);

  const refresh = useCallback(() => {
    // Clear cache for this DID and refetch
    if (did) {
      clearManifestCache(did, siteRkey || undefined);
    }
    fetchManifest();
  }, [did, siteRkey, fetchManifest]);

  return {
    ...state,
    refresh,
    clear: () => clearManifestCache(did || undefined, siteRkey || undefined),
    getStats: () => {
      if (state.data) {
        return {
          entries: countManifestEntries(state.data),
          size: estimateManifestSize(state.data),
        };
      }
      return null;
    },
  };
}
