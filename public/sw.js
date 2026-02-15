/**
 * Wisp Service Worker
 *
 * Intercepts network requests and serves content from ATProto PDS
 * based on the current site's manifest.
 *
 * URL Pattern: /wisp/{did}/{siteName}/{path}
 *
 * This allows wisp sites to work with clean URLs and native browser behavior.
 */

// Import pako for gzip decompression (fallback for browsers without DecompressionStream)
try {
  importScripts('https://unpkg.com/pako@2.1.0/dist/pako.min.js');
  console.log('[Wisp SW] pako loaded successfully');
} catch (error) {
  console.warn('[Wisp SW] Failed to load pako:', error);
}

const WISP_CACHE_NAME = 'wisp-manifest';
const BLOB_CACHE_NAME = 'wisp-blobs';
const MANIFEST_KEY = 'current-manifest';
const SITE_INFO_KEY = 'site-info';

// In-memory manifest for fast lookups
let currentManifest = null;
let currentSiteInfo = null;
let pdsUrl = null;
let did = null;
let currentHandle = null;
let currentSiteName = null;

// IndexedDB for persistent storage
let db = null;

/**
 * Initialize IndexedDB
 */
async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('WispCache', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;

      // Create object stores
      if (!database.objectStoreNames.contains('manifests')) {
        database.createObjectStore('manifests');
      }
      if (!database.objectStoreNames.contains('blobs')) {
        database.createObjectStore('blobs');
      }
    };
  });
}

/**
 * Store manifest in IndexedDB
 */
async function storeManifest(manifest) {
  if (!db) await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['manifests'], 'readwrite');
    const store = transaction.objectStore('manifests');
    const request = store.put(manifest, MANIFEST_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get manifest from IndexedDB
 */
async function getManifest() {
  if (!db) await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['manifests'], 'readonly');
    const store = transaction.objectStore('manifests');
    const request = store.get(MANIFEST_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Store site info in IndexedDB
 */
async function storeSiteInfo(siteInfo) {
  if (!db) await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['manifests'], 'readwrite');
    const store = transaction.objectStore('manifests');
    const request = store.put(siteInfo, SITE_INFO_KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get site info from IndexedDB
 */
async function getSiteInfo() {
  if (!db) await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['manifests'], 'readonly');
    const store = transaction.objectStore('manifests');
    const request = store.get(SITE_INFO_KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Normalize a path for lookup
 */
function normalizePath(path) {
  if (!path || path === '/' || path === '') {
    return '';
  }
  // Remove leading slash and query/hash
  let normalized = path.replace(/^\//, '').split(/[?#]/)[0];
  // Remove trailing slash
  normalized = normalized.replace(/\/$/, '');
  return normalized;
}

/**
 * Look up a file in the manifest by path
 */
function lookupFile(manifest, path) {
  const normalized = normalizePath(path);

  // Empty path - try index files
  if (normalized === '') {
    const indexFiles = ['index.html', 'index.htm'];
    for (const indexFile of indexFiles) {
      const result = lookupFile(manifest, indexFile);
      if (result) return result;
    }
    return null;
  }

  const segments = normalized.split('/');
  let current = manifest;

  // Navigate through directories
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    if (!current.dirs || !current.dirs[segment]) {
      return null;
    }
    current = current.dirs[segment];
  }

  // Look up the file
  const filename = segments[segments.length - 1];
  const file = current.files?.[filename];

  if (!file) {
    return null;
  }

  return file;
}

/**
 * Look up an index file in a directory
 * Returns the file entry if found, null otherwise
 */
function lookupIndexFile(manifest, dirPath) {
  const normalized = normalizePath(dirPath);
  const segments = normalized.split('/').filter(Boolean);
  let current = manifest;

  // Navigate to the directory
  for (const segment of segments) {
    if (!current.dirs || !current.dirs[segment]) {
      return null; // Not a valid directory path
    }
    current = current.dirs[segment];
  }

  // Try to find index files in this directory
  const indexFiles = ['index.html', 'index.htm'];
  for (const indexFile of indexFiles) {
    if (current.files && current.files[indexFile]) {
      return current.files[indexFile];
    }
  }

  return null;
}

/**
 * Guess MIME type from filename
 */
function guessMimeType(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();

  const mimeTypes = {
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    json: 'application/json',
    xml: 'application/xml',
    txt: 'text/plain',
    md: 'text/markdown',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    pdf: 'application/pdf',
    zip: 'application/zip',
    wasm: 'application/wasm',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    ttf: 'font/ttf',
    otf: 'font/otf',
    woff: 'font/woff',
    woff2: 'font/woff2',
    eot: 'application/vnd.ms-fontobject',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Fetch blob from PDS
 */
async function fetchBlobFromPDS(cid, mimeType) {
  if (!pdsUrl || !did) {
    throw new Error('PDS or DID not configured');
  }

  // Check cache first
  const cached = await getBlob(cid);
  if (cached) {
    return new Response(cached, {
      headers: {
        'Content-Type': mimeType || guessMimeType(cid),
        'Cache-Control': 'public, max-age=3600',
        'X-Wisp-Cache': 'HIT',
      },
    });
  }

  // Fetch from PDS
  const url = `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${did}&cid=${cid}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch blob: ${response.status} ${response.statusText}`);
  }

  // Get the raw data
  const rawArrayBuffer = await response.arrayBuffer();

  // Decompress if needed (wisp blobs are gzip + base64 encoded)
  let decompressedData;

  // Check if it's likely base64-encoded data
  const textDecoder = new TextDecoder();
  const textContent = textDecoder.decode(rawArrayBuffer);

  // Wisp blobs are stored as base64-encoded gzip data
  if (textContent.match(/^[A-Za-z0-9+/]+={0,2}$/) && textContent.length > 50) {
    // It's base64 encoded
    console.log('[Wisp SW] Detected base64-encoded blob, decompressing...');

    // Decode base64
    const binaryString = atob(textContent);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Check if it's gzip compressed (starts with 0x1f 0x8b)
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      // Decompress gzip
      try {
        decompressedData = await decompressGzip(bytes);
      } catch (error) {
        console.error('[Wisp SW] Failed to decompress gzip data:', error);
        throw new Error(`Failed to decompress blob data for CID ${cid}: ${error.message}`);
      }
    } else {
      decompressedData = bytes;
    }
  } else {
    // Not base64, use as-is
    decompressedData = new Uint8Array(rawArrayBuffer);
  }

  // Create blob from decompressed data
  if (decompressedData === undefined) {
    throw new Error(`Failed to decode blob data for CID: ${cid}`);
  }

  const blob = new Blob([decompressedData], { type: mimeType || guessMimeType(cid) });

  // Cache the blob (limit to 5MB to avoid quota issues)
  if (blob.size <= 5 * 1024 * 1024) {
    await storeBlob(cid, blob);
  }

  return new Response(blob, {
    headers: {
      'Content-Type': mimeType || guessMimeType(cid),
      'Cache-Control': 'public, max-age=3600',
      'X-Wisp-Cache': 'MISS',
    },
  });
}

/**
 * Simple gzip decompressor using pako
 * This is a minimal implementation that works in service workers
 *
 * We use a try/catch for DecompressionStream first, and fall back to
 * a simpler approach if it's not available or fails
 */
async function decompressGzip(compressedBytes) {
  try {
    // Try using DecompressionStream if available
    if (self.DecompressionStream) {
      const compressedStream = new ReadableStream({
        start(controller) {
          controller.enqueue(compressedBytes);
          controller.close();
        },
      });

      const decompressionStream = new DecompressionStream('gzip');
      const decompressedStream = compressedStream.pipeThrough(decompressionStream);
      const decompressedResponse = new Response(decompressedStream);
      const decompressedBlob = await decompressedResponse.blob();
      return await decompressedBlob.arrayBuffer();
    } else {
      throw new Error('DecompressionStream not supported');
    }
  } catch (error) {
    console.error('[Wisp SW] DecompressionStream failed, trying pako:', error);

    // Fallback: try to use pako if it's loaded via importScripts
    if (typeof self.pako !== 'undefined' && self.pako.ungzip) {
      try {
        const result = self.pako.ungzip(compressedBytes);
        // Convert Uint8Array to ArrayBuffer
        return result.buffer;
      } catch (pakoError) {
        console.error('[Wisp SW] Pako decompression failed:', pakoError);
        throw new Error(`Pako decompression failed: ${pakoError.message}`);
      }
    }

    console.error('[Wisp SW] No decompression method available');
    throw new Error('No decompression method available (DecompressionStream not supported and pako not loaded)');
  }
}

/**
 * Store blob in IndexedDB cache
 */
async function storeBlob(cid, blob) {
  if (!db) await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['blobs'], 'readwrite');
    const store = transaction.objectStore('blobs');
    const request = store.put(blob, cid);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get blob from IndexedDB cache
 */
async function getBlob(cid) {
  if (!db) await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(['blobs'], 'readonly');
    const store = transaction.objectStore('blobs');
    const request = store.get(cid);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Get the overlay injection script as a string
 */
function getOverlayScript() {
  // The overlay script is inlined here to avoid fetch issues
  return `(function(){'use strict';if(document.getElementById('wisp-overlay-container'))return;const e=document.createElement('div');e.id='wisp-overlay-container';const t=\`
#wisp-overlay-container{pointer-events: none;position:fixed;bottom:16px;left:0;width:100vw;display:flex;justify-content:center;align-items:center;z-index:2147483647;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
#wisp-back-button{pointer-events: all;display:flex;align-items:center;gap:8px;padding:8px 16px;background:rgba(255,255,255,.95);backdrop-filter:blur(4px);box-shadow:0 4px 12px rgba(0,0,0,.15);border-radius:8px;border:1px solid rgba(0,0,0,.1);cursor:pointer;font-size:14px;font-weight:500;color:#374151;transition:all .2s ease;text-decoration:none}
#wisp-back-button:hover{background:#fff;color:#111827;box-shadow:0 6px 16px rgba(0,0,0,.2)}
#wisp-back-button:active{transform:translateY(1px)}
#wisp-back-button svg{width:20px;height:20px}
#wisp-overlay-container #wisp-close-button{position:absolute;top:-8px;right:-8px;width:20px;height:20px;background:#ef4444;color:#fff;border:0;border-radius:50%;cursor:pointer;display:none;align-items:center;justify-content:center;font-size:12px;font-weight:700;line-height:1}
#wisp-overlay-container:hover #wisp-close-button{display:flex}
#wisp-overlay-container #wisp-close-button:hover{background:#dc2626}
\`;const o=document.createElement('style');o.textContent=t,document.head.appendChild(o);const n=document.createElement('a');n.id='wisp-back-button',n.href='/',n.innerHTML=\`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg><span>Back to Resolver</span>\`;const i=document.createElement('button');i.id='wisp-close-button',i.innerHTML='×',i.title='Hide overlay',i.setAttribute('aria-label','Hide overlay'),i.addEventListener('click',function(t){t.preventDefault(),t.stopPropagation(),e.remove()}),e.appendChild(n),e.appendChild(i);function r(){if(window.location.pathname.startsWith('/wisp/')){document.body.appendChild(e),e.style.opacity='0',e.style.transition='opacity .3s ease',requestAnimationFrame(()=>{e.style.opacity='1'});var a=window.location.pathname.split('/');if(a.length>=4){var d=a[2],s=a[3],l='/wisp/'+d+'/'+s+'/';document.addEventListener('click',function c(t){var n=t.target.closest('a');if(n){var h=n.getAttribute('href');if(h&&h.startsWith('/')&&!h.startsWith('//')&&!h.startsWith('/wisp/')){var i=n.getAttribute('target');if(!i||'_blank'!==i){var b=n.getAttribute('download');if(!b){var o=h.includes('://');if(!o){if(n.id==='wisp-back-button'){console.log('[Wisp Overlay] Back button clicked, allowing default navigation to '+h);return}t.preventDefault(),t.stopPropagation();var f=l+h.replace(/^\\//,'');n.href=f,console.log('[Wisp Overlay] Rewrote link: '+h+' -> '+f),window.location.href=f}}}}}},false)}}}'loading'===document.readyState?document.addEventListener('DOMContentLoaded',r):r()})();`;
}

/**
 * Rewrite absolute URLs in CSS to be relative
 */
function rewriteCssUrls(css) {
  // Match url('/path') or url("/path") patterns
  // Also handle data URLs (leave those alone)
  return css.replace(
    /url\(['"]?\/([^'")]+)['"]?\)/g,
    (match, path) => {
      console.log('[Wisp SW] Rewriting CSS URL:', match, '→ url("' + path + '")');
      return 'url("' + path + '")';
    }
  );
}

/**
 * Inject overlay script and base tag into HTML content
 */
function injectOverlayScript(html, sitePath) {
  const overlayScript = getOverlayScript();
  const scriptTag = `<script>${overlayScript}<\/script>`;

  // Use stored DID and siteName for building base URL
  // This ensures the base URL matches what the manifest was set for
  // Note: Don't encodeURIComponent here - the base tag needs raw URL path
  const wispDid = did || 'unknown';
  const wispSiteName = currentSiteName || 'site';

  // The base URL should not be URL-encoded - browsers need the raw URL
  // The DID may contain colons and other special characters, but these are
  // valid in URL paths, so we use them directly
  const baseUrl = `/wisp/${wispDid}/${wispSiteName}/`;

  console.log('[Wisp SW] Injecting base tag:', baseUrl, 'for path:', sitePath);
  console.log('[Wisp SW] Current DID:', wispDid);
  console.log('[Wisp SW] Current siteName:', wispSiteName);

  // Create base tag
  const baseTag = `<base href="${baseUrl}">`;

  let result = html;

  // First, remove any existing base tags to avoid conflicts
  result = result.replace(/<base\s+[^>]*>/gi, '');

  // Rewrite absolute paths to be relative (so they respect the base tag)
  // This handles: href="/..." src="/..." srcset="/..."
  result = result.replace(
    /(<(?:a|link|script|img|source|iframe|embed)\s+[^>]*?(?:href|src|srcset)\s*=\s*['"])(\/[^'"]*)(['"])/gi,
    (match, prefix, path, suffix) => {
      console.log('[Wisp SW] Rewriting absolute path:', path, '→', path.substring(1));
      return prefix + path.substring(1) + suffix;
    }
  );

  // Inject base tag after opening head tag (or create one if missing)
  const headMatch = result.match(/<head[^>]*>/i);
  if (headMatch) {
    // Has a head tag, inject base tag after it
    result = result.replace(/(<head[^>]*>)/i, `$1\n  ${baseTag}`);
    console.log('[Wisp SW] Injected base tag after existing head tag');
  } else {
    const htmlMatch = result.match(/<html[^>]*>/i);
    if (htmlMatch) {
      // No head tag, insert after html opening tag
      result = result.replace(/(<html[^>]*>)/i, `$1\n<head>\n  ${baseTag}\n</head>`);
      console.log('[Wisp SW] Created new head tag with base tag');
    } else {
      // No html tag either, prepend both
      result = `<!DOCTYPE html><html><head>\n  ${baseTag}\n</head><body>` + result + `</body></html>`;
      console.log('[Wisp SW] Created html and head tags with base tag');
    }
  }

  // Inject overlay script before closing body tag
  if (result.includes('</body>')) {
    result = result.replace('</body>', `${scriptTag}\n</body>`);
  } else if (result.includes('<body')) {
    result = result.replace(/(<body[^>]*>)/, `$1\n${scriptTag}`);
  } else {
    // No body tag, append at end
    result = result + scriptTag;
  }

  // Log a snippet of the result to verify base tag is there
  const snippet = result.substring(0, 500);
  console.log('[Wisp SW] HTML snippet (first 500 chars):', snippet);

  return result;
}

/**
 * Handle directory listing request
 */
async function handleDirectoryListing(path) {
  const normalized = normalizePath(path);
  const segments = normalized.split('/');
  let current = currentManifest;

  // Navigate to directory
  for (const segment of segments) {
    if (!segment) continue;
    if (!current.dirs || !current.dirs[segment]) {
      return new Response('Directory not found', { status: 404 });
    }
    current = current.dirs[segment];
  }

  // Generate directory listing HTML
  const files = current.files ? Object.entries(current.files) : [];
  const dirs = current.dirs ? Object.keys(current.dirs) : [];

  let html = `<!DOCTYPE html>
<html>
<head>
  <title>Index of ${path || '/'}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    h1 { border-bottom: 1px solid #ccc; padding-bottom: 0.5rem; }
    ul { list-style: none; padding: 0; }
    li { padding: 0.5rem 0; border-bottom: 1px solid #eee; }
    a { color: #0066cc; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .size { color: #666; margin-left: 1rem; }
  </style>
</head>
<body>
  <h1>Index of ${path || '/'}</h1>
  <ul>`;

  // Parent directory link
  if (segments.length > 0) {
    const parentPath = segments.slice(0, -1).join('/');
    html += `<li><a href="/${parentPath}">../</a></li>`;
  }

  // Directories
  for (const dir of dirs.sort()) {
    const dirPath = [...segments, dir].join('/');
    html += `<li><a href="/${dirPath}/">${dir}/</a></li>`;
  }

  // Files
  for (const [name, file] of files.sort()) {
    const filePath = [...segments, name].join('/');
    html += `<li><a href="/${filePath}">${name}</a></li>`;
  }

  html += `  </ul>
</body>
</html>`;

  // Inject overlay script and base tag
  html = injectOverlayScript(html, path);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-cache',
      'X-Wisp-Overlay': 'injected',
    },
  });
}

/**
 * Handle fetch event
 */
async function handleFetch(event) {
  const url = new URL(event.request.url);
  const path = url.pathname;

  // Only handle requests under /wisp/ path
  if (!path.startsWith('/wisp/')) {
    console.log('[Wisp SW] Non-wisp request, passing through:', path);
    console.log('[Wisp SW] Full URL:', event.request.url);
    return fetch(event.request);
  }

  console.log('[Wisp SW] Intercepting wisp request:', path);
  console.log('[Wisp SW] Full URL:', event.request.url);

  // Extract DID, site name, and actual path from /wisp/{did}/{siteName}/{path}
  // Examples:
  // - /wisp/did:plc:abc123/eidolica/ → did=did:plc:abc123, siteName=eidolica, path=/
  // - /wisp/did:plc:abc123/eidolica/blog.html → did=did:plc:abc123, siteName=eidolica, path=/blog.html

  const wispPathMatch = path.match(/^\/wisp\/([^/]+)\/([^/]+)\/?(.*)?$/);
  if (!wispPathMatch) {
    console.log('[Wisp SW] URL does not match wisp pattern:', path);
    return fetch(event.request);
  }

  const [, requestDid, requestSiteName, actualPath] = wispPathMatch;
  const requestPath = actualPath || '';

  console.log('[Wisp SW] Extracted:', { requestDid, requestSiteName, requestPath });

  // Ensure we have a manifest loaded
  if (!currentManifest) {
    console.log('[Wisp SW] No manifest in memory, trying IndexedDB...');

    // Try to load from IndexedDB
    currentManifest = await getManifest();
    const siteInfo = await getSiteInfo();

    if (siteInfo) {
      pdsUrl = siteInfo.pdsUrl;
      did = siteInfo.did;
      currentHandle = siteInfo.handle;
      currentSiteName = siteInfo.siteName;
      console.log('[Wisp SW] Loaded from IndexedDB:', { pdsUrl, did, currentHandle, currentSiteName });
    }

    if (!currentManifest) {
      return new Response('No manifest loaded. Please load a site first.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  }

  // Verify DID matches (in case of bookmarked URLs)
  if (did && did !== requestDid) {
    console.log('[Wisp SW] DID mismatch:', { stored: did, requested: requestDid });
    return new Response('Site mismatch. Please navigate from the resolver.', {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  // Look up the file in the manifest
  let file = lookupFile(currentManifest, requestPath);

  if (!file) {
    // Check if it's a directory by trying to find an index file
    const indexFile = lookupIndexFile(currentManifest, requestPath);

    if (indexFile) {
      // Directory has an index file, serve it
      file = indexFile;
      console.log('[Wisp SW] Serving index file for directory:', requestPath);
    } else {
      // Check if it's a directory (for listing purposes)
      const segments = requestPath.split('/').filter(Boolean);
      let current = currentManifest;
      let isDirectory = true;

      for (const segment of segments) {
        if (!current.dirs || !current.dirs[segment]) {
          isDirectory = false;
          break;
        }
        current = current.dirs[segment];
      }

      if (isDirectory) {
        // Directory exists but no index file - show directory listing
        console.log('[Wisp SW] No index file for directory:', requestPath, '- showing listing');
        return handleDirectoryListing(requestPath);
      } else {
        // Not a directory, try appending .html extension
        const htmlFile = lookupFile(currentManifest, requestPath + '.html');
        if (htmlFile) {
          file = htmlFile;
        }
      }

      if (!file) {
        return new Response('File not found', {
          status: 404,
          headers: { 'Content-Type': 'text/plain' },
        });
      }
    }
  }

  // Fetch and return the blob
  const response = await fetchBlobFromPDS(file.cid, file.mimeType);

  // If it's HTML, inject the overlay script and base tag
  if (file.mimeType === 'text/html' ||
      (file.mimeType && file.mimeType.startsWith('text/html')) ||
      requestPath.endsWith('.html') ||
      requestPath.endsWith('.htm')) {

    const htmlText = await response.text();
    const htmlWithOverlay = injectOverlayScript(htmlText, path);

    return new Response(htmlWithOverlay, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache', // Don't cache HTML with injected script
        'X-Wisp-Overlay': 'injected',
        'X-Wisp-Base': pdsUrl, // Debug header
      },
    });
  }

  // If it's CSS, rewrite absolute URLs
  if (file.mimeType === 'text/css' ||
      (file.mimeType && file.mimeType.startsWith('text/css')) ||
      requestPath.endsWith('.css')) {

    const cssText = await response.text();
    const cssWithRewrittenUrls = rewriteCssUrls(cssText);

    return new Response(cssWithRewrittenUrls, {
      headers: {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
        'X-Wisp-Rewritten-Urls': 'true',
      },
    });
  }

  return response;
}

/**
 * Handle message from client
 */
async function handleMessage(event) {
  const data = event.data;

  if (data.type === 'SET_MANIFEST') {
    currentManifest = data.manifest;
    pdsUrl = data.pdsUrl;
    did = data.did;
    currentHandle = data.handle || null;
    currentSiteName = data.siteName || null;

    console.log('[Wisp SW] Manifest set:', { did, currentHandle, currentSiteName, pdsUrl });

    // Persist to IndexedDB
    await storeManifest(data.manifest);
    await storeSiteInfo({ pdsUrl, did, handle: currentHandle, siteName: currentSiteName });

    event.ports[0].postMessage({ type: 'MANIFEST_SET', success: true });
  }

  if (data.type === 'CLEAR_MANIFEST') {
    currentManifest = null;
    pdsUrl = null;
    did = null;
    currentHandle = null;
    currentSiteName = null;

    if (db) {
      const transaction = db.transaction(['manifests'], 'readwrite');
      transaction.objectStore('manifests').delete(MANIFEST_KEY);
      transaction.objectStore('manifests').delete(SITE_INFO_KEY);
    }

    event.ports[0].postMessage({ type: 'MANIFEST_CLEARED', success: true });
  }

  if (data.type === 'CLEAR_CACHE') {
    if (db) {
      const transaction = db.transaction(['blobs'], 'readwrite');
      transaction.objectStore('blobs').clear();
    }
    event.ports[0].postMessage({ type: 'CACHE_CLEARED', success: true });
  }

  if (data.type === 'GET_STATUS') {
    event.ports[0].postMessage({
      type: 'STATUS',
      hasManifest: !!currentManifest,
      siteInfo: { pdsUrl, did, handle: currentHandle, siteName: currentSiteName },
    });
  }
}

// Install event
self.addEventListener('install', (event) => {
  console.log('[Wisp SW] Installing...');
  self.skipWaiting();
});

// Activate event
self.addEventListener('activate', (event) => {
  console.log('[Wisp SW] Activating...');

  event.waitUntil(
    Promise.all([
      initDB(),
      // Claim all clients so the SW can intercept requests immediately
      clients.claim(),
    ]).then(() => {
      console.log('[Wisp SW] Activated and claimed all clients');

      // Notify all clients about activation
      return clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
          });
        });
      });
    })
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  event.respondWith(
    handleFetch(event).catch((error) => {
      console.error('[Wisp SW] Fetch error:', error);
      return new Response(`Service Worker Error: ${error.message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    })
  );
});

// Message event
self.addEventListener('message', handleMessage);

console.log('[Wisp SW] Service worker loaded');
