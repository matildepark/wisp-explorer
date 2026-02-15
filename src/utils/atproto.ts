/**
 * ATProto client utilities for fetching records and blobs
 *
 * This module provides browser-compatible utilities for ATProto operations.
 */

import { createLogger } from './logger';
import type {
  PlaceWispFsRecord,
  PlaceWispSubfsRecord,
  WispDirectory,
} from '../types/lexicon';

const logger = createLogger({ prefix: 'atproto' });

/**
 * Extract domain from a did:web DID
 * @param did - The did:web DID (e.g., "did:web:example.com")
 * @returns The domain (e.g., "example.com")
 */
function extractDomainFromDidWeb(did: string): string {
  if (!did.startsWith('did:web:')) {
    throw new Error(`Not a did:web: ${did}`);
  }
  const domain = did.slice('did:web:'.length);
  // Convert escaped colons back to dots (e.g., "did:web:example%3Acom" -> "example.com")
  return domain.replace(/%3A/gi, ':').replace(/%2F/gi, '/');
}

/**
 * Resolve a handle to a DID using the Bluesky Identity API
 */
export async function resolveHandleToDid(handle: string): Promise<string> {
  // Remove @ prefix if present
  const cleanHandle = handle.startsWith('@') ? handle.slice(1) : handle;

  logger.debug(`Resolving handle '${cleanHandle}' to DID`);

  // Use Bluesky API for handle resolution
  const bskyApiUrl = 'https://api.bsky.app/xrpc/com.atproto.identity.resolveHandle';
  const url = `${bskyApiUrl}?handle=${encodeURIComponent(cleanHandle)}`;

  const response = await fetch(url);

  if (!response.ok) {
    // Try direct DID resolution for DIDs passed as input
    if (cleanHandle.startsWith('did:')) {
      // For did:web, verify by fetching from the domain's .well-known/did.json
      if (cleanHandle.startsWith('did:web:')) {
        logger.debug(`Input appears to be a did:web, verifying via .well-known/did.json`);
        const domain = extractDomainFromDidWeb(cleanHandle);
        const webUrl = `https://${domain}/.well-known/did.json`;
        const webResponse = await fetch(webUrl);
        if (!webResponse.ok) {
          throw new Error(`Failed to verify did:web '${cleanHandle}': ${webResponse.statusText}`);
        }
        const didDocument = await webResponse.json() as { id?: string };
        if (!didDocument?.id || didDocument.id !== cleanHandle) {
          throw new Error(`Invalid DID document for '${cleanHandle}'`);
        }
        logger.debug(`Verified did:web: ${cleanHandle}`);
        return cleanHandle;
      }

      // For other DIDs, try PLC directory
      logger.debug(`Input appears to be a DID, using PLC directory`);
      const plcUrl = import.meta.env.VITE_PLC_DIRECTORY || 'https://plc.directory';
      const plcResponse = await fetch(`${plcUrl}/${cleanHandle}`);
      if (!plcResponse.ok) {
        throw new Error(`Failed to resolve DID '${cleanHandle}': ${plcResponse.statusText}`);
      }
      const didDocument = await plcResponse.json() as { id?: string };
      if (!didDocument?.id || !didDocument.id.startsWith('did:')) {
        throw new Error(`Invalid DID document for '${cleanHandle}'`);
      }
      logger.debug(`Resolved '${cleanHandle}' to DID: ${didDocument.id}`);
      return didDocument.id;
    }

    throw new Error(`Failed to resolve handle '${cleanHandle}': ${response.statusText}`);
  }

  const data = await response.json() as { did?: string };

  if (!data || !data.did || !data.did.startsWith('did:')) {
    throw new Error(`Invalid response for handle '${cleanHandle}'`);
  }

  logger.debug(`Resolved '${cleanHandle}' to DID: ${data.did}`);
  return data.did;
}

/**
 * Extract PDS endpoint from a DID document
 */
export async function getPdsEndpoint(did: string): Promise<string> {
  logger.debug(`Getting PDS endpoint for DID: ${did}`);

  // Handle did:web by fetching from the domain's .well-known/did.json
  if (did.startsWith('did:web:')) {
    const domain = extractDomainFromDidWeb(did);
    const webUrl = `https://${domain}/.well-known/did.json`;

    logger.debug(`Fetching did:web document from: ${webUrl}`);

    try {
      const response = await fetch(webUrl);

      if (!response.ok) {
        throw new Error(`Failed to fetch did:web document from '${webUrl}': ${response.statusText}`);
      }

      const didDocument = (await response.json()) as {
        service?: Array<{
          id?: string;
          type?: string;
          serviceEndpoint?: string;
        }>;
      };
      const services = didDocument?.service;

      if (!Array.isArray(services)) {
        throw new Error(`No services found in did:web document for '${did}'`);
      }

      for (const service of services) {
        if (
          service.id === '#atproto_pds' ||
          service.type === 'AtprotoPersonalDataServer'
        ) {
          if (!service.serviceEndpoint) {
            throw new Error(`PDS service found but no endpoint for DID '${did}'`);
          }
          logger.debug(`Found PDS endpoint for did:web: ${service.serviceEndpoint}`);
          return service.serviceEndpoint;
        }
      }

      throw new Error(`Could not find PDS endpoint in did:web document for '${did}'`);
    } catch (error) {
      logger.error(`Failed to get PDS endpoint for did:web '${did}'`, { error });
      throw new Error(`Failed to get PDS endpoint for did:web '${did}': ${error}`);
    }
  }

  // Try PLC directory for did:plc and other DIDs
  const plcUrl = import.meta.env.VITE_PLC_DIRECTORY || 'https://plc.directory';
  const url = `${plcUrl}/${did}`;

  logger.debug(`Fetching DID document from PLC directory: ${url}`);

  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch DID document: ${response.statusText}`);
    }

    const didDocument = (await response.json()) as {
      service?: Array<{
        id?: string;
        type?: string;
        serviceEndpoint?: string;
      }>;
    };
    const services = didDocument?.service;

    if (!Array.isArray(services)) {
      throw new Error(`No services found in DID document for '${did}'`);
    }

    for (const service of services) {
      if (
        service.id === '#atproto_pds' ||
        service.type === 'AtprotoPersonalDataServer'
      ) {
        if (!service.serviceEndpoint) {
          throw new Error(`PDS service found but no endpoint for DID '${did}'`);
        }
        logger.debug(`Found PDS endpoint: ${service.serviceEndpoint}`);
        return service.serviceEndpoint;
      }
    }

    throw new Error(`Could not find PDS endpoint in DID document for '${did}'`);
  } catch (error) {
    logger.error(`Failed to get PDS endpoint for DID '${did}'`, { error });
    throw new Error(`Failed to get PDS endpoint for DID '${did}': ${error}`);
  }
}

/**
 * Fetch a blob from PDS using XRPC
 */
export async function fetchBlob(
  pdsUrl: string,
  did: string,
  cid: string
): Promise<Uint8Array> {
  const url = new URL(`${pdsUrl}/xrpc/com.atproto.sync.getBlob`);
  url.searchParams.set('did', did);
  url.searchParams.set('cid', cid);

  logger.debug(`Fetching blob ${cid} from ${pdsUrl}`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Failed to fetch blob ${cid}: ${response.statusText}`);
  }

  const buffer = await response.arrayBuffer();
  logger.debug(`Successfully fetched blob ${cid} (${buffer.byteLength} bytes)`);
  return new Uint8Array(buffer);
}

/**
 * Fetch place.wisp.fs records from PDS
 */
export async function fetchWispFsRecords(
  pdsUrl: string,
  did: string
): Promise<Array<{ rkey: string; value: unknown }>> {
  const records: Array<{ rkey: string; value: unknown }> = [];
  let cursor: string | undefined = undefined;

  logger.debug(`Fetching place.wisp.fs records for ${did}`);

  do {
    const url = new URL(`${pdsUrl}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set('repo', did);
    url.searchParams.set('collection', 'place.wisp.fs');
    url.searchParams.set('limit', '100');
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `Failed to list place.wisp.fs records: ${response.statusText}`
      );
    }

    const data = (await response.json()) as {
      records?: Array<{ uri: string; value: unknown }>;
      cursor?: string;
    };

    if (!data.records) {
      break;
    }

    for (const record of data.records) {
      const rkey = record.uri.split('/').pop() || '';
      records.push({ rkey, value: record.value });
    }

    cursor = data.cursor;
  } while (cursor);

  logger.debug(`Fetched ${records.length} place.wisp.fs records`);
  return records;
}

/**
 * Fetch place.wisp.subfs records from PDS
 */
export async function fetchWispSubfsRecords(
  pdsUrl: string,
  did: string
): Promise<Array<{ rkey: string; value: unknown }>> {
  const records: Array<{ rkey: string; value: unknown }> = [];
  let cursor: string | undefined = undefined;

  logger.debug(`Fetching place.wisp.subfs records for ${did}`);

  do {
    const url = new URL(`${pdsUrl}/xrpc/com.atproto.repo.listRecords`);
    url.searchParams.set('repo', did);
    url.searchParams.set('collection', 'place.wisp.subfs');
    url.searchParams.set('limit', '100');
    if (cursor) {
      url.searchParams.set('cursor', cursor);
    }

    const response = await fetch(url.toString());

    if (!response.ok) {
      throw new Error(
        `Failed to list place.wisp.subfs records: ${response.statusText}`
      );
    }

    const data = (await response.json()) as {
      records?: Array<{ uri: string; value: unknown }>;
      cursor?: string;
    };

    if (!data.records) {
      break;
    }

    for (const record of data.records) {
      const rkey = record.uri.split('/').pop() || '';
      records.push({ rkey, value: record.value });
    }

    cursor = data.cursor;
  } while (cursor);

  logger.debug(`Fetched ${records.length} place.wisp.subfs records`);
  return records;
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
 * Fetch all wisp.fs site records (returns metadata, not full content)
 */
export async function fetchWispSites(
  pdsUrl: string,
  did: string
): Promise<WispSiteInfo[]> {
  const fsRecords = await fetchWispFsRecords(pdsUrl, did);

  if (fsRecords.length === 0) {
    logger.warn('No wisp.fs records found');
    return [];
  }

  const sites: WispSiteInfo[] = [];

  for (const { rkey, value } of fsRecords) {
    const parsed = value as PlaceWispFsRecord;
    sites.push({
      rkey,
      site: parsed.site || rkey,
      fileCount: parsed.fileCount,
      createdAt: parsed.createdAt,
    });
  }

  logger.debug(`Found ${sites.length} wisp site(s)`);
  return sites;
}

/**
 * Fetch manifest for a specific site by rkey
 */
export async function fetchWispSiteManifest(
  pdsUrl: string,
  did: string,
  siteRkey: string
): Promise<WispDirectory | null> {
  // Fetch the specific wisp.fs record
  const url = new URL(`${pdsUrl}/xrpc/com.atproto.repo.getRecord`);
  url.searchParams.set('repo', did);
  url.searchParams.set('collection', 'place.wisp.fs');
  url.searchParams.set('rkey', siteRkey);

  logger.debug(`Fetching wisp.fs record for site: ${siteRkey}`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error(`Failed to fetch site '${siteRkey}': ${response.statusText}`);
  }

  const data = await response.json();
  const parsed = data.value as PlaceWispFsRecord;

  if (!parsed.root) {
    logger.warn(`Site '${siteRkey}' has no root directory`);
    return null;
  }

  // Import conversion function
  const { convertDirectoryNewToOld, mergeDirectories } = await import('../types/lexicon');

  // Convert new format to old format if needed
  const rootAsAny = parsed.root as any;
  const isNewFormat = rootAsAny && 'type' in rootAsAny && 'entries' in rootAsAny;
  const rootDir = isNewFormat ? convertDirectoryNewToOld(rootAsAny) : (parsed.root as WispDirectory);

  // Fetch related subfs records (for large sites)
  const subfsRecords = await fetchWispSubfsRecords(pdsUrl, did);

  // Build directories array (all should be old format)
  const directories: WispDirectory[] = [rootDir];

  for (const { value } of subfsRecords) {
    const subfs = value as PlaceWispSubfsRecord;

    // Check if directory is new format (has 'type' and 'entries')
    const dir = subfs.directory as any;
    const isNewFormat = dir && 'type' in dir && 'entries' in dir;

    const subfsDir = isNewFormat
      ? convertDirectoryNewToOld(dir)
      : subfs.directory as WispDirectory;

    directories.push(subfsDir);
  }

  // Merge directories
  const merged = mergeDirectories(...directories);

  logger.debug(`Fetched manifest for site '${siteRkey}' with ${directories.length} directory records`);
  return merged;
}

/**
 * Fetch and merge all wisp.fs and wisp.subfs records into a single directory
 * @deprecated Use fetchWispSites and fetchWispSiteManifest for multi-site support
 */
export async function fetchWispManifest(
  pdsUrl: string,
  did: string
): Promise<WispDirectory | null> {
  const sites = await fetchWispSites(pdsUrl, did);

  if (sites.length === 0) {
    logger.warn('No wisp.fs records found');
    return null;
  }

  // Use the first site if no specific site requested
  const firstSite = sites[0];
  logger.info(`Fetching manifest for site '${firstSite.site}' (first of ${sites.length} sites)`);

  return fetchWispSiteManifest(pdsUrl, did, firstSite.rkey);
}
