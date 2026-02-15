/**
 * Service Worker Manager for Wisp Client
 *
 * Handles registration, messaging, and state management for the wisp service worker.
 */

type MessageHandler = (data: any) => void;

export interface SiteInfo {
  pdsUrl: string;
  did: string;
  handle: string;
  siteName: string;
}

export interface SWStatus {
  hasManifest: boolean;
  siteInfo: SiteInfo | null;
}

export class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private messageHandlers: Map<string, Set<MessageHandler>> = new Map();
  private ready: boolean = false;

  /**
   * Register the service worker
   */
  async register(): Promise<boolean> {
    if (!('serviceWorker' in navigator)) {
      console.warn('[SW Manager] Service workers not supported');
      return false;
    }

    try {
      // Unregister any existing SW first
      if (navigator.serviceWorker.controller) {
        console.log('[SW Manager] Unregistering existing service worker');
        // Note: We don't explicitly unregister here as it can cause issues
        // Just register a new one which will replace the old one
      }

      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
      });
      console.log('[SW Manager] Service worker registered:', this.registration.scope);
      console.log('[SW Manager] Active service worker:', this.registration.active);
      console.log('[SW Manager] Waiting service worker:', this.registration.waiting);
      console.log('[SW Manager] Installing service worker:', this.registration.installing);

      // Wait for the service worker to be ready
      await navigator.serviceWorker.ready;
      this.ready = true;
      console.log('[SW Manager] Service worker ready');
      console.log('[SW Manager] Controller:', navigator.serviceWorker.controller);

      // Set up message listener
      navigator.serviceWorker.addEventListener('message', this.handleMessage.bind(this));

      // Check if a manifest is already loaded
      const status = await this.getStatus();
      if (status.hasManifest && status.siteInfo) {
        console.log('[SW Manager] Manifest already loaded:', status.siteInfo);
      }

      return true;
    } catch (error) {
      console.error('[SW Manager] Registration failed:', error);
      return false;
    }
  }

  /**
   * Unregister the service worker
   */
  async unregister(): Promise<boolean> {
    if (this.registration) {
      const result = await this.registration.unregister();
      this.registration = null;
      this.ready = false;
      return result;
    }
    return true;
  }

  /**
   * Force update the service worker
   */
  async forceUpdate(): Promise<void> {
    if (this.registration) {
      await this.registration.update();
    }
  }

  /**
   * Clear all caches
   */
  async clearAllCaches(): Promise<void> {
    try {
      // Clear blob cache
      await this.clearCache();

      // Clear manifest
      await this.clearManifest();

      // Clear all browser caches
      const cacheNames = await caches.keys();
      for (const cacheName of cacheNames) {
        await caches.delete(cacheName);
      }

      console.log('[SW Manager] All caches cleared');
    } catch (error) {
      console.error('[SW Manager] Failed to clear caches:', error);
      throw error;
    }
  }

  /**
   * Send a message to the service worker and wait for a response
   */
  private async sendMessage(data: any, timeout = 5000): Promise<any> {
    const controller = navigator.serviceWorker.controller;

    if (!this.ready || !controller) {
      throw new Error('Service worker not ready');
    }

    return new Promise((resolve, reject) => {
      const channel = new MessageChannel();

      const timer = setTimeout(() => {
        reject(new Error('Service worker message timeout'));
        channel.port1.close();
      }, timeout);

      channel.port1.onmessage = (event) => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(event.data);
      };

      controller.postMessage(data, [channel.port2]);
    });
  }

  /**
   * Set the manifest in the service worker
   */
  async setManifest(manifest: any, pdsUrl: string, did: string, handle?: string, siteName?: string): Promise<boolean> {
    try {
      const response = await this.sendMessage({
        type: 'SET_MANIFEST',
        manifest,
        pdsUrl,
        did,
        handle,
        siteName,
      });

      if (response?.success) {
        console.log('[SW Manager] Manifest set successfully');
        return true;
      }

      return false;
    } catch (error) {
      console.error('[SW Manager] Failed to set manifest:', error);
      return false;
    }
  }

  /**
   * Clear the manifest from the service worker
   */
  async clearManifest(): Promise<boolean> {
    try {
      const response = await this.sendMessage({ type: 'CLEAR_MANIFEST' });
      return response?.success || false;
    } catch (error) {
      console.error('[SW Manager] Failed to clear manifest:', error);
      return false;
    }
  }

  /**
   * Clear the blob cache
   */
  async clearCache(): Promise<boolean> {
    try {
      const response = await this.sendMessage({ type: 'CLEAR_CACHE' });
      return response?.success || false;
    } catch (error) {
      console.error('[SW Manager] Failed to clear cache:', error);
      return false;
    }
  }

  /**
   * Get the current status of the service worker
   */
  async getStatus(): Promise<SWStatus> {
    try {
      const response = await this.sendMessage({ type: 'GET_STATUS' });
      return {
        hasManifest: response?.hasManifest || false,
        siteInfo: response?.siteInfo || null,
      };
    } catch (error) {
      console.error('[SW Manager] Failed to get status:', error);
      return {
        hasManifest: false,
        siteInfo: null,
      };
    }
  }

  /**
   * Navigate to a wisp site using the service worker
   * URL pattern: /wisp/{did}/{siteName}/{path}
   */
  async navigateToWisp(did: string, siteName: string, path: string = '/'): Promise<void> {
    const cleanPath = path.replace(/^\//, '');
    // Don't URL encode - DID and siteName are valid in URL paths
    const wispPath = `/wisp/${did}/${siteName}/${cleanPath}`;
    window.location.href = wispPath;
  }

  /**
   * Build a URL for a path within the current wisp site
   */
  buildWispPath(did: string, siteName: string, path: string = '/'): string {
    const cleanPath = path.replace(/^\//, '');
    // Don't URL encode - DID and siteName are valid in URL paths
    return `/wisp/${did}/${siteName}/${cleanPath}`;
  }

  /**
   * Check if a URL is within the wisp site scope
   */
  isWispUrl(url: string): boolean {
    return url.startsWith('/wisp/');
  }

  /**
   * Extract the DID from a wisp URL
   * Pattern: /wisp/{did}/{siteName}/{path}
   */
  extractDID(url: string): string | null {
    const match = url.match(/^\/wisp\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * Extract the site name from a wisp URL
   * Pattern: /wisp/{did}/{siteName}/{path}
   */
  extractSiteName(url: string): string | null {
    const match = url.match(/^\/wisp\/[^/]+\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * Extract the path from a wisp URL
   * Pattern: /wisp/{did}/{siteName}/{path}
   */
  extractPath(url: string): string | null {
    const match = url.match(/^\/wisp\/[^/]+\/[^/]+\/?(.*)$/);
    return match ? (match[1] || '/') : null;
  }

  /**
   * Register a message handler for a specific message type
   */
  on(type: string, handler: MessageHandler): void {
    if (!this.messageHandlers.has(type)) {
      this.messageHandlers.set(type, new Set());
    }
    this.messageHandlers.get(type)!.add(handler);
  }

  /**
   * Unregister a message handler
   */
  off(type: string, handler: MessageHandler): void {
    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Handle incoming messages from the service worker
   */
  private handleMessage(event: MessageEvent): void {
    const { type, data } = event.data;

    const handlers = this.messageHandlers.get(type);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(data);
        } catch (error) {
          console.error('[SW Manager] Handler error:', error);
        }
      });
    }
  }

  /**
   * Check if the service worker is ready
   */
  isReady(): boolean {
    return this.ready && !!navigator.serviceWorker.controller;
  }

  /**
   * Get the registration
   */
  getRegistration(): ServiceWorkerRegistration | null {
    return this.registration;
  }
}

// Singleton instance
let swManager: ServiceWorkerManager | null = null;

/**
 * Get or create the singleton service worker manager
 */
export function getSWManager(): ServiceWorkerManager {
  if (!swManager) {
    swManager = new ServiceWorkerManager();
  }
  return swManager;
}

/**
 * Initialize the service worker (convenience function)
 */
export async function initServiceWorker(): Promise<ServiceWorkerManager> {
  const manager = getSWManager();
  await manager.register();
  return manager;
}
