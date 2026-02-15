/**
 * MIME type utilities
 */

/**
 * Comprehensive MIME type mapping by file extension
 */
export const MIME_TYPES: Record<string, string> = {
  // Text files
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  mjs: 'text/javascript',
  cjs: 'text/javascript',
  json: 'application/json',
  xml: 'application/xml',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  ts: 'text/typescript',

  // Images
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  avif: 'image/avif',

  // Videos
  mp4: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  wmv: 'video/x-ms-wmv',
  flv: 'video/x-flv',
  mkv: 'video/x-matroska',
  m4v: 'video/mp4',
  mpeg: 'video/mpeg',
  mpg: 'video/mpeg',

  // Audio
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  flac: 'audio/flac',
  aac: 'audio/aac',
  m4a: 'audio/mp4',
  wma: 'audio/x-ms-wma',
  mid: 'audio/midi',
  midi: 'audio/midi',

  // Fonts
  ttf: 'font/ttf',
  otf: 'font/otf',
  woff: 'font/woff',
  woff2: 'font/woff2',
  eot: 'application/vnd.ms-fontobject',

  // Archives
  zip: 'application/zip',
  gz: 'application/gzip',
  tar: 'application/x-tar',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  bz2: 'application/x-bzip2',

  // Documents
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation',
  rtf: 'application/rtf',
  epub: 'application/epub+zip',

  // Web
  wasm: 'application/wasm',
  swf: 'application/x-shockwave-flash',
  manifest: 'text/cache-manifest',
  map: 'application/json',

  // Other
  bin: 'application/octet-stream',
  exe: 'application/x-msdownload',
  dll: 'application/x-msdownload',
  so: 'application/octet-stream',
  dmg: 'application/x-apple-diskimage',
  iso: 'application/x-iso9660-image',
  img: 'application/octet-stream',
  apk: 'application/vnd.android.package-archive',
};

/**
 * Get MIME type from file extension
 */
export function getMimeType(filename: string): string {
  if (!filename) {
    return 'application/octet-stream';
  }

  // Handle query strings in URLs
  const cleanFilename = filename.split('?')[0].split('#')[0];
  const ext = cleanFilename.split('.').pop()?.toLowerCase() || '';

  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Check if a MIME type is text-based
 */
export function isTextMimeType(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml'
  );
}

/**
 * Check if a MIME type is an image
 */
export function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

/**
 * Check if a MIME type is a video
 */
export function isVideoMimeType(mimeType: string): boolean {
  return mimeType.startsWith('video/');
}

/**
 * Check if a MIME type is an audio
 */
export function isAudioMimeType(mimeType: string): boolean {
  return mimeType.startsWith('audio/');
}

/**
 * Get charset for text MIME types
 */
export function getCharset(mimeType: string): string {
  if (isTextMimeType(mimeType)) {
    return 'utf-8';
  }
  return '';
}

/**
 * Get content type string with charset if applicable
 */
export function getContentType(mimeType: string): string {
  const charset = getCharset(mimeType);
  return charset ? `${mimeType}; charset=${charset}` : mimeType;
}
