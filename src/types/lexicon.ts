/**
 * Lexicon record parsing for place.wisp.fs and place.wisp.subfs
 *
 * These types are adapted from the shared code for the browser client.
 */

/**
 * Represents a file entry in the wisp filesystem
 */
export interface WispFile {
  cid: string; // Blob CID for the file content
  mimeType?: string; // MIME type from manifest
  size?: number; // File size in bytes (optional)
}

/**
 * Represents a directory entry in the wisp filesystem
 */
export interface WispDirectory {
  files?: Record<string, WispFile>; // Files in this directory
  dirs?: Record<string, WispDirectory>; // Subdirectories
}

/**
 * place.wisp.fs record structure (new format)
 */
export interface PlaceWispFsRecord {
  $type: 'place.wisp.fs';
  root?: WispDirectory | WispDirectoryNew; // Root directory (optional, defaults to empty) - can be new format
  site?: string; // Site identifier (used as rkey)
  fileCount?: number; // Number of files in the site
  createdAt?: string; // ISO timestamp of site creation
}

/**
 * Wisp directory node (new format with entries array)
 */
export interface WispDirectoryNew {
  type: 'directory';
  entries?: Array<{
    name: string;
    node: WispFileNode | WispDirectoryNew;
  }>;
}

/**
 * CID object (as deserialized by @atproto/api)
 */
export interface CidObject {
  code: number;
  version: number;
  multihash: Uint8Array;
  bytes: Uint8Array;
  toString(): string;
}

/**
 * Blob reference (either string $link or CID object)
 */
export type BlobRef = {
  $link: string;
} | CidObject;

/**
 * Wisp file node (new format)
 */
export interface WispFileNode {
  type: 'file';
  blob: {
    $type: 'blob';
    ref: BlobRef; // Can be { $link: string } or CID object
    mimeType?: string;
    size?: number;
  };
  base64?: boolean;
  encoding?: string;
  mimeType?: string; // Duplicate at node level
}

/**
 * place.wisp.subfs record structure (for large sites)
 */
export interface PlaceWispSubfsRecord {
  $type: 'place.wisp.subfs';
  directory: WispDirectory | WispDirectoryNew; // Directory subtree (can be either format)
}

/**
 * File lookup result with metadata
 */
export interface FileLookupResult {
  cid: string;
  mimeType: string;
}

/**
 * Path resolution result
 */
export type PathResolution = FileLookupResult | DirectoryLookupResult | null;

export interface DirectoryLookupResult {
  type: 'directory';
  files: Record<string, WispFile>;
  dirs: string[];
}

/**
 * Error types for parsing
 */
export class LexiconParseError extends Error {
  constructor(
    message: string,
    public readonly record?: unknown
  ) {
    super(message);
    this.name = 'LexiconParseError';
  }
}

/**
 * Validate that a record has the correct type
 */
export function validateRecordType(
  record: unknown,
  expectedType: 'place.wisp.fs' | 'place.wisp.subfs'
): boolean {
  if (!record || typeof record !== 'object') {
    return false;
  }
  return (record as { $type?: string }).$type === expectedType;
}

/**
 * Parse a place.wisp.fs record (supports both old and new formats)
 */
export function parsePlaceWispFs(record: unknown): PlaceWispFsRecord {
  if (!validateRecordType(record, 'place.wisp.fs')) {
    throw new LexiconParseError('Invalid place.wisp.fs record type', record);
  }

  const parsed = record as Record<string, unknown>;
  const root = parsed.root;

  if (root !== undefined) {
    // Check if it's the new format (with entries array)
    if (isValidDirectoryNew(root)) {
      return {
        $type: 'place.wisp.fs',
        root: convertDirectoryNewToOld(root as WispDirectoryNew),
      };
    }

    // Check if it's the old format
    if (isValidDirectory(root)) {
      return {
        $type: 'place.wisp.fs',
        root: root as WispDirectory,
      };
    }

    throw new LexiconParseError('Invalid directory structure in place.wisp.fs', record);
  }

  return {
    $type: 'place.wisp.fs',
    root: undefined,
  };
}

/**
 * Validate directory structure (new format)
 */
export function isValidDirectoryNew(dir: unknown): boolean {
  if (!dir || typeof dir !== 'object') {
    return false;
  }

  const d = dir as WispDirectoryNew;
  // Accept both "directory" and "place.wisp.fs#directory"
  if (d.type !== 'directory' && d.type !== 'place.wisp.fs#directory') {
    return false;
  }

  const entries = d.entries;
  if (!entries || !Array.isArray(entries)) {
    return true; // Empty directory is valid
  }

  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || typeof entry.name !== 'string') {
      return false;
    }

    const node = entry.node;
    if (!node || typeof node !== 'object') {
      return false;
    }

    const nodeType = (node as { type: string }).type;
    const isFile = nodeType === 'file' || nodeType === 'place.wisp.fs#file';
    const isDirectory = nodeType === 'directory' || nodeType === 'place.wisp.fs#directory';

    if (isFile) {
      if (!isValidFileNode(node as WispFileNode)) {
        return false;
      }
    } else if (isDirectory) {
      if (!isValidDirectoryNew(node as WispDirectoryNew)) {
        return false;
      }
    } else {
      return false;
    }
  }

  return true;
}

/**
 * Extract CID string from blob ref
 * Handles both { $link: string } format and CID objects
 */
export function extractCidFromRef(ref: BlobRef): string {
  // Check if it's a CID object (has code, version, multihash, etc.)
  if ('code' in ref && 'version' in ref && typeof (ref as any).toString === 'function') {
    return (ref as any).toString();
  }
  // Otherwise it should be { $link: string }
  if ('$link' in ref && typeof ref.$link === 'string') {
    return ref.$link;
  }
  throw new Error('Invalid blob ref format');
}

/**
 * Validate file node (new format)
 */
export function isValidFileNode(node: unknown): boolean {
  if (!node || typeof node !== 'object') {
    return false;
  }

  const f = node as WispFileNode;
  // Accept both "file" and "place.wisp.fs#file"
  if (f.type !== 'file' && f.type !== 'place.wisp.fs#file') {
    return false;
  }

  const blob = f.blob;
  if (!blob || typeof blob !== 'object') {
    return false;
  }

  const ref = blob.ref;
  if (!ref || typeof ref !== 'object') {
    return false;
  }

  try {
    const cid = extractCidFromRef(ref);
    if (!cid || cid.length === 0) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

/**
 * Convert new directory format to old format
 */
export function convertDirectoryNewToOld(dirNew: WispDirectoryNew): WispDirectory {
  const dir: WispDirectory = { files: {}, dirs: {} };

  if (!dirNew.entries || dirNew.entries.length === 0) {
    return dir;
  }

  dir.files = {};
  dir.dirs = {};

  for (const entry of dirNew.entries) {
    const node = entry.node as { type: string };
    const nodeType = node.type;

    if (nodeType === 'file' || nodeType === 'place.wisp.fs#file') {
      const fileNode = entry.node as WispFileNode;

      // Extract CID from blob.ref (handles both CID objects and { $link: string })
      const cid = extractCidFromRef(fileNode.blob.ref);

      // Get MIME type from either node level or blob level
      const mimeType = fileNode.mimeType || fileNode.blob.mimeType || 'application/octet-stream';

      dir.files![entry.name] = {
        cid,
        mimeType,
        size: fileNode.blob.size,
      };
    } else if (nodeType === 'directory' || nodeType === 'place.wisp.fs#directory') {
      const dirNode = entry.node as WispDirectoryNew;
      dir.dirs![entry.name] = convertDirectoryNewToOld(dirNode);
    }
  }

  return dir;
}

/**
 * Count files in a directory (recursive)
 */
export function countFiles(dir: WispDirectory): number {
  let count = 0;
  if (dir.files) {
    count += Object.keys(dir.files).length;
  }
  if (dir.dirs) {
    for (const subDir of Object.values(dir.dirs)) {
      count += countFiles(subDir);
    }
  }
  return count;
}

/**
 * Parse a place.wisp.subfs record
 */
export function parsePlaceWispSubfs(record: unknown): PlaceWispSubfsRecord {
  if (!validateRecordType(record, 'place.wisp.subfs')) {
    throw new LexiconParseError('Invalid place.wisp.subfs record type', record);
  }

  const parsed = record as Record<string, unknown>;
  const directory = parsed.directory;

  if (!isValidDirectory(directory)) {
    throw new LexiconParseError('Invalid directory structure in place.wisp.subfs', record);
  }

  return {
    $type: 'place.wisp.subfs',
    directory: directory as WispDirectory,
  };
}

/**
 * Validate a directory structure recursively
 */
export function isValidDirectory(dir: unknown): boolean {
  if (!dir || typeof dir !== 'object') {
    return false;
  }

  const d = dir as WispDirectory;
  const { files, dirs } = d;

  // If both are undefined, it's an empty directory (valid)
  if (files === undefined && dirs === undefined) {
    return true;
  }

  // Validate files if present
  if (files !== undefined) {
    if (typeof files !== 'object' || files === null) {
      return false;
    }
    for (const fileEntry of Object.values(files)) {
      if (!isValidFileEntry(fileEntry)) {
        return false;
      }
    }
  }

  // Validate dirs if present
  if (dirs !== undefined) {
    if (typeof dirs !== 'object' || dirs === null) {
      return false;
    }
    for (const subDir of Object.values(dirs)) {
      if (!isValidDirectory(subDir)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Validate a file entry
 */
export function isValidFileEntry(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') {
    return false;
  }

  const e = entry as WispFile;
  if (typeof e.cid !== 'string' || e.cid.length === 0) {
    return false;
  }

  if (e.mimeType !== undefined && typeof e.mimeType !== 'string') {
    return false;
  }

  if (e.size !== undefined && typeof e.size !== 'number') {
    return false;
  }

  return true;
}

/**
 * Get an empty directory structure
 */
export function createEmptyDirectory(): WispDirectory {
  return {};
}

/**
 * Merge multiple directories into one
 * Later directories override earlier ones for conflicting entries
 */
export function mergeDirectories(
  ...directories: (WispDirectory | null | undefined)[]
): WispDirectory {
  const result: WispDirectory = {};

  for (const dir of directories) {
    if (!dir) continue;

    // Merge files
    if (dir.files) {
      result.files = { ...result.files, ...dir.files };
    }

    // Merge directories recursively
    if (dir.dirs) {
      result.dirs = result.dirs || {};
      for (const [name, subDir] of Object.entries(dir.dirs)) {
        if (result.dirs[name]) {
          // Recursively merge subdirectories
          result.dirs[name] = mergeDirectories(result.dirs[name], subDir);
        } else {
          result.dirs[name] = subDir;
        }
      }
    }
  }

  return result;
}

/**
 * Normalize a file path
 * - Remove leading/trailing slashes
 * - Remove duplicate slashes
 * - Handle parent directory references (..) and current directory (.)
 */
export function normalizePath(path: string): string {
  const normalized = path.trim();

  // Split into segments
  const segments = normalized.split('/').filter(s => s !== '' && s !== '.');

  const result: string[] = [];
  for (const segment of segments) {
    if (segment === '..') {
      // Go up one level if possible
      result.pop();
    } else {
      result.push(segment);
    }
  }

  return result.join('/');
}

/**
 * Look up a file or directory by path
 */
export function lookupPath(directory: WispDirectory, path: string): PathResolution {
  const normalizedPath = normalizePath(path);

  // Empty path or '/' refers to root directory
  if (normalizedPath === '') {
    return {
      type: 'directory',
      files: directory.files || {},
      dirs: Object.keys(directory.dirs || {}),
    };
  }

  const segments = normalizedPath.split('/');
  let currentDir: WispDirectory = directory;

  // Debug
  console.debug('lookupPath:', { path, normalizedPath, segments });

  // Traverse to the target directory
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];

    if (!currentDir.dirs || !currentDir.dirs[segment]) {
      console.debug('Directory not found at segment:', segment);
      return null; // Directory not found
    }

    currentDir = currentDir.dirs[segment];
  }

  const lastSegment = segments[segments.length - 1];

  console.debug('Last segment:', lastSegment);
  console.debug('Current dir files:', Object.keys(currentDir.files || {}));
  console.debug('Current dir dirs:', Object.keys(currentDir.dirs || {}));

  // Check if it's a file
  if (currentDir.files && currentDir.files[lastSegment]) {
    const file = currentDir.files[lastSegment];
    console.debug('File found:', file);
    return {
      cid: file.cid,
      mimeType: file.mimeType || 'application/octet-stream',
    };
  }

  // Check if it's a directory
  if (currentDir.dirs && currentDir.dirs[lastSegment]) {
    const subDir = currentDir.dirs[lastSegment];
    return {
      type: 'directory',
      files: subDir.files || {},
      dirs: Object.keys(subDir.dirs || {}),
    };
  }

  console.debug('Not found');
  return null; // Not found
}

/**
 * Get the MIME type for a file extension (fallback)
 */
export function getMimeTypeFromExtension(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  const mimeTypes: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    json: 'application/json',
    xml: 'application/xml',
    txt: 'text/plain',
    md: 'text/markdown',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ico: 'image/x-icon',
    bmp: 'image/bmp',
    tiff: 'image/tiff',
    webm: 'video/webm',
    mp4: 'video/mp4',
    mpeg: 'video/mpeg',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    ogg: 'audio/ogg',
    pdf: 'application/pdf',
    zip: 'application/zip',
    gz: 'application/gzip',
    wasm: 'application/wasm',
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
    eot: 'application/vnd.ms-fontobject',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Check if a path refers to an index file
 */
export function isIndexPath(path: string): boolean {
  const normalized = normalizePath(path);
  return normalized === 'index.html' || normalized === 'index.htm';
}

/**
 * Get the path for a directory's index file
 */
export function getIndexForPath(path: string): string {
  const normalized = normalizePath(path);
  if (normalized === '') {
    return 'index.html';
  }
  return `${normalized}/index.html`;
}
