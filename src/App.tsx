/**
 * Main App component
 *
 * Entry point for the Wisp Client application.
 *
 * Routes:
 * - /: Resolver UI (landing page)
 * - /wisp/{did}/{siteName}/{path}: Handled by service worker - React renders minimal component
 */

import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ResolverUI, SiteRendererSW, ServiceWorkerDebug } from './components';
import { useATProtoResolver } from './hooks/useATProtoResolver';
import { useSitesFetcher, useManifestFetcherManual } from './hooks/useManifestFetcher';

function ResolverWrapper() {
  const location = useLocation();
  const [handle, setHandle] = useState<string>('');
  const [siteRkey, setSiteRkey] = useState<string>('');
  const [siteName, setSiteName] = useState<string>('');
  const [loading, setLoading] = useState<'idle' | 'resolving' | 'fetching'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Check for handle in query params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const handleParam = params.get('handle');
    if (handleParam) setHandle(handleParam);
  }, [location.search]);

  // Resolve handle when provided
  const resolver = useATProtoResolver(handle || null);

  // Fetch sites list when resolved (for validation)
  useSitesFetcher(
    resolver.data?.pdsUrl || null,
    resolver.data?.did || null
  );

  // Fetch manifest when site is selected
  const manifestState = useManifestFetcherManual(
    resolver.data?.pdsUrl || null,
    resolver.data?.did || null,
    siteRkey || undefined
  );

  // Handle loading a site
  const handleLoad = async (loadedHandle: string, loadedSiteRkey: string, loadedSiteName: string) => {
    setHandle(loadedHandle);
    setSiteRkey(loadedSiteRkey);
    setSiteName(loadedSiteName);
    setLoading('resolving');

    // The resolver and manifest fetchers will automatically trigger
    // We'll wait for them and then navigate
  };

  // Handle navigate to wisp
  useEffect(() => {
    if (loading === 'resolving' && resolver.data && !resolver.loading) {
      if (resolver.error) {
        setError(resolver.error);
        setLoading('idle');
        return;
      }
      setLoading('fetching');
    }

    if (loading === 'fetching' && manifestState.data && !manifestState.loading) {
      if (manifestState.error) {
        setError(manifestState.error);
        setLoading('idle');
        return;
      }

      // Success - trigger navigation via SiteRendererSW
    }
  }, [loading, resolver, manifestState]);

  // Handle back/cancel
  const handleBack = () => {
    setHandle('');
    setSiteRkey('');
    setSiteName('');
    setLoading('idle');
    setError(null);
  };

  // Show resolver UI
  if (!handle || loading === 'idle') {
    return (
      <ResolverUI
        initialHandle={handle}
        onLoad={handleLoad}
      />
    );
  }

  // Show loading state
  if (resolver.loading || manifestState.loading) {
    const stage = resolver.loading ? 'resolving' : 'fetchingManifest';
    const message = resolver.loading
      ? `Resolving ${handle}...`
      : manifestState.loading
      ? 'Fetching site manifest...'
      : 'Loading...';

    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 to-blue-100 flex items-center justify-center p-8">
        <div className="max-w-md mx-auto">
          {stage === 'resolving' && (
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="flex items-center justify-center mb-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
              </div>
              <p className="text-center text-gray-600">{message}</p>
              <button
                onClick={handleBack}
                className="mt-6 w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          )}
          {stage === 'fetchingManifest' && (
            <div className="bg-white rounded-lg shadow-lg p-8">
              <div className="flex items-center justify-center mb-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
              </div>
              <p className="text-center text-gray-600 mb-2">{message}</p>
              {manifestState.recordCount !== undefined && (
                <p className="text-center text-sm text-gray-500">
                  Found {manifestState.recordCount} files
                </p>
              )}
              <button
                onClick={handleBack}
                className="mt-6 w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-medium"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show error state
  if (error || resolver.error || manifestState.error) {
    const errorMessage = error || resolver.error || manifestState.error;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-2xl w-full">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-red-100 p-2 rounded-full">
                <svg
                  className="w-6 h-6 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900">Error</h2>
            </div>
            <p className="text-gray-600 mb-6">{errorMessage}</p>
            <div className="flex gap-3">
              <button
                onClick={handleBack}
                className="flex-1 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors font-medium"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render the site using service worker
  if (resolver.data && manifestState.data) {
    return (
      <SiteRendererSW
        pdsUrl={resolver.data.pdsUrl}
        did={resolver.data.did}
        handle={handle}
        siteName={siteName}
        manifest={manifestState.data}
        onBack={handleBack}
      />
    );
  }

  return null;
}

/**
 * SiteRouteWrapper - Minimal wrapper for /wisp/* routes
 *
 * The service worker handles the actual content serving.
 * This component renders nothing (or minimal UI) so the service worker
 * can intercept and serve the site content.
 */
function SiteRouteWrapper() {
  const location = useLocation();

  useEffect(() => {
    console.log('[App] Site route:', location.pathname);

    // Check if service worker has a manifest loaded
    // If not, the user might have bookmarked a /wisp/ URL
    // We should redirect to the resolver
    const checkSW = async () => {
      if (navigator.serviceWorker && navigator.serviceWorker.controller) {
        // Send a message to check status
        const channel = new MessageChannel();
        const timeout = setTimeout(() => {
          channel.port1.close();
          // No response, redirect to resolver
          window.location.href = '/';
        }, 1000);

        channel.port1.onmessage = (event) => {
          clearTimeout(timeout);
          channel.port1.close();

          if (!event.data.hasManifest) {
            // No manifest loaded, redirect to resolver
            console.log('[App] No manifest in SW, redirecting to resolver');
            window.location.href = '/';
          }
        };

        navigator.serviceWorker.controller.postMessage(
          { type: 'GET_STATUS' },
          [channel.port2]
        );
      }
    };

    checkSW();
  }, [location.pathname]);

  // Render nothing - service worker serves the content
  return null;
}

function App() {
  return (
    <>
      <Routes>
        {/* Resolver UI - handles / */}
        <Route path="/" element={<ResolverWrapper />} />

        {/* Wisp routes - handled by service worker */}
        {/* Pattern: /wisp/{did}/{siteName}/* */}
        <Route path="/wisp/:did/:siteName/*" element={<SiteRouteWrapper />} />

        {/* Catch-all - redirect to resolver */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Debug component - only shows in development */}
      <ServiceWorkerDebug />
    </>
  );
}

export default App;
