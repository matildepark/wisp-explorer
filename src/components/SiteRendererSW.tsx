/**
 * SiteRendererSW - Service worker-based site rendering component
 *
 * This component uses a service worker to render wisp sites with:
 * - Clean URLs (/wisp/{did}/{siteName}/path)
 * - Native CSS and script loading
 * - Working relative paths
 * - Proper browser back button
 */

import { useState, useEffect } from 'react';
import { LoadingState } from './LoadingState';
import { ErrorDisplay } from './ErrorDisplay';
import { getSWManager } from '../utils/serviceWorker';
import type { WispDirectory } from '../types/lexicon';

export interface SiteRendererSWProps {
  pdsUrl: string;
  did: string;
  handle: string;
  siteName: string;
  manifest: WispDirectory;
  onBack: () => void;
}

export function SiteRendererSW({
  pdsUrl,
  did,
  handle,
  siteName,
  manifest,
  onBack,
}: SiteRendererSWProps) {
  const [status, setStatus] = useState<'loading' | 'navigating' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSite() {
      const swManager = getSWManager();

      try {
        // Ensure service worker is registered
        if (!swManager.isReady()) {
          setStatus('loading');
          const registered = await swManager.register();

          if (!registered) {
            throw new Error('Failed to register service worker');
          }
        }

        setStatus('navigating');

        // Wait for the service worker to claim this client
        const registration = swManager.getRegistration();
        if (registration) {
          await new Promise<void>((resolve) => {
            if (registration.active && navigator.serviceWorker.controller === registration.active) {
              console.log('[SiteRendererSW] Service worker is active and controlling');
              resolve();
            } else {
              const handler = () => {
                console.log('[SiteRendererSW] Service worker claimed client');
                registration.removeEventListener('controllerchange', handler);
                resolve();
              };
              registration.addEventListener('controllerchange', handler);
              // Timeout after 1 second
              setTimeout(() => {
                registration.removeEventListener('controllerchange', handler);
                resolve();
              }, 1000);
            }
          });
        }

        // Set the manifest in the service worker
        const manifestSet = await swManager.setManifest(manifest, pdsUrl, did, handle, siteName);

        if (!manifestSet) {
          throw new Error('Failed to set manifest in service worker');
        }

        // Store resolver state for back button
        const resolverState = {
          handle,
          did,
          pdsUrl,
          siteName,
        };
        sessionStorage.setItem('wisp_resolver_state', JSON.stringify(resolverState));

        // Wait for service worker to be controlling the page
        console.log('[SiteRendererSW] Waiting for service worker control...');
        await new Promise<void>((resolve) => {
          let checks = 0;
          const maxChecks = 20; // Wait up to 2 seconds

          const checkControl = () => {
            if (navigator.serviceWorker.controller) {
              console.log('[SiteRendererSW] Service worker is controlling the page');
              resolve();
            } else if (checks >= maxChecks) {
              console.warn('[SiteRendererSW] Service worker not controlling after timeout');
              resolve();
            } else {
              checks++;
              setTimeout(checkControl, 100);
            }
          };

          checkControl();
        });

        // Small additional delay to ensure SW is fully ready
        await new Promise(resolve => setTimeout(resolve, 200));

        // Navigate to the wisp site
        // Don't URL encode - DID and siteName are valid in URL paths
        const wispPath = `/wisp/${did}/${siteName}/`;
        console.log('[SiteRendererSW] Navigating to:', wispPath);
        window.location.href = wispPath;

        // Note: The component will unmount as we navigate away
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load site';
        setError(errorMessage);
        setStatus('error');
      }
    }

    loadSite();
  }, [manifest, pdsUrl, did, handle, siteName]);

  if (status === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <ErrorDisplay
            error={error || 'Failed to load site'}
            onRetry={() => window.location.reload()}
            onBack={onBack}
          />
        </div>
      </div>
    );
  }

  const message = status === 'loading'
    ? 'Initializing service worker...'
    : 'Loading site...';

  return <LoadingState stage="loading-site" message={message} />;
}
