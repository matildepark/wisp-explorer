/**
 * ATProto-related types for the client
 */

/**
 * Resolution result from handle/DID to PDS
 */
export interface ResolutionResult {
  handle?: string;
  did: string;
  pdsUrl: string;
}

/**
 * Site information from a wisp.fs record
 */
export interface WispSiteInfo {
  rkey: string;
  site: string;
  fileCount?: number;
  createdAt?: string;
}

/**
 * Blob fetch result
 */
export interface BlobResult {
  cid: string;
  data: Uint8Array;
  mimeType: string;
}

/**
 * Cache entry types
 */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl?: number;
}

/**
 * Error types
 */
export class ResolutionError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'ResolutionError';
  }
}

export class FetchError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = 'FetchError';
  }
}

export class CorsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CorsError';
  }
}
