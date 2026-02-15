/**
 * ResolverUI component
 *
 * Main landing page for the wisp client with handle/DID input form.
 */

import { useState, useEffect } from 'react';
import { useATProtoResolver } from '../hooks/useATProtoResolver';
import { useSitesFetcher } from '../hooks/useManifestFetcher';
import { InlineLoading } from './LoadingState';
import { InlineError } from './ErrorDisplay';

export interface ResolverUIProps {
  initialHandle?: string;
  onLoad?: (handle: string, siteRkey: string, siteName: string) => void;
}

export function ResolverUI({ initialHandle = '', onLoad }: ResolverUIProps) {
  const [handleInput, setHandleInput] = useState(initialHandle);
  const [debouncedInput, setDebouncedInput] = useState(initialHandle);
  const [selectedSite, setSelectedSite] = useState<{ rkey: string; name: string } | null>(null);

  // Debounce input to avoid excessive resolution requests
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedInput(handleInput.trim());
    }, 500);

    return () => clearTimeout(timer);
  }, [handleInput]);

  // Resolve handle/DID
  const resolverState = useATProtoResolver(debouncedInput || null);

  // Fetch available sites when resolution completes
  const sitesState = useSitesFetcher(
    resolverState.data?.pdsUrl || null,
    resolverState.data?.did || null
  );

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!handleInput.trim()) {
      return;
    }

    if (!resolverState.data || resolverState.error) {
      return;
    }

    if (!sitesState.data || sitesState.data.length === 0) {
      return;
    }

    // Use selected site, or first site if none selected
    const siteInfo = selectedSite || {
      rkey: sitesState.data[0].rkey,
      name: sitesState.data[0].site,
    };

    const handle = resolverState.data.handle || handleInput.trim();

    // Trigger load callback with rkey (for fetching) and name (for URL)
    onLoad?.(handle, siteInfo.rkey, siteInfo.name);
  };

  // Handle input change
  const handleInputChange = (value: string) => {
    setHandleInput(value);
    setSelectedSite(null);
  };

  // Handle site selection
  const handleSiteSelect = (rkey: string, name: string) => {
    setSelectedSite({ rkey, name });
  };

  // Check if can submit
  const canSubmit =
    handleInput.trim() &&
    resolverState.data &&
    !resolverState.loading &&
    !resolverState.error &&
    sitesState.data &&
    sitesState.data.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-indigo-50">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            wisp.place explorer
          </h1>
          <p className="text-gray-600">
            Browse websites from the PDS (unofficial)
          </p>
        </div>

        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-6">
          <form onSubmit={handleSubmit}>
            {/* Input field */}
            <div className="mb-4">
              <label htmlFor="handle" className="block text-sm font-medium text-gray-700 mb-2">
                Handle or DID
              </label>
              <input
                id="handle"
                type="text"
                value={handleInput}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="e.g., mp9.ca, did:plc:abc..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-sky-500 focus:border-sky-500 text-lg"
                autoFocus
              />
            </div>

            {/* Resolution status */}
            {handleInput && (
              <div className="mb-4">
                {resolverState.loading && (
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <InlineLoading message="Resolving..." size="sm" />
                  </div>
                )}

                {resolverState.error && (
                  <InlineError error={resolverState.error} />
                )}

                {resolverState.data && (
                  <div className="bg-sky-50 border border-sky-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-sky-900 truncate">
                          {resolverState.data.handle || 'DID'}
                        </p>
                        <p className="text-xs text-sky-700 font-mono truncate">
                          {resolverState.data.did}
                        </p>
                        <p className="text-xs text-sky-600 truncate">
                          PDS: {resolverState.data.pdsUrl}
                        </p>
                      </div>
                      <div className="ml-2 flex-shrink-0">
                        <span className="text-green-500">✓</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Site selector (if multiple sites) */}
            {resolverState.data && sitesState.data && sitesState.data.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Site ({sitesState.data.length} available)
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {sitesState.data.map((site) => (
                    <button
                      key={site.rkey}
                      type="button"
                      onClick={() => handleSiteSelect(site.rkey, site.site)}
                      className={`px-3 py-2 rounded-lg border text-left transition-colors ${
                        selectedSite?.name === site.site
                          ? 'bg-sky-100 border-sky-500 text-sky-900'
                          : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{site.site}</span>
                        {selectedSite?.name === site.site && (
                          <span className="text-sky-600">✓</span>
                        )}
                      </div>
                      {site.fileCount && (
                        <p className="text-xs text-gray-500 mt-1">
                          {site.fileCount} files
                        </p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full px-6 py-3 bg-sky-500 text-white rounded-lg font-medium hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-lg"
            >
              Load Site
            </button>
          </form>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>
            For more information on wisp.place sites, see {' '}
            <a
              href="https://wisp.place"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-600 hover:text-sky-700"
            >
              wisp.place
            </a>. This explorer is unaffiliated.
          </p>
        </div>
      </div>
    </div>
  );
}
