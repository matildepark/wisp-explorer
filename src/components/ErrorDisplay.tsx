/**
 * ErrorDisplay component
 *
 * Displays error messages with icons and actionable options.
 */

export interface ErrorDisplayProps {
  error: string;
  type?: 'not-found' | 'network' | 'cors' | 'general' | 'no-wisp-records';
  onRetry?: () => void;
  onBack?: () => void;
  showProxySuggestion?: boolean;
}

const errorIcons: Record<Exclude<ErrorDisplayProps['type'], undefined>, { icon: string; color: string }> = {
  'not-found': { icon: '🔍', color: 'text-amber-500' },
  'network': { icon: '🌐', color: 'text-red-500' },
  'cors': { icon: '🔒', color: 'text-orange-500' },
  'general': { icon: '⚠️', color: 'text-gray-500' },
  'no-wisp-records': { icon: '📁', color: 'text-amber-500' },
};

const errorTitles: Record<Exclude<ErrorDisplayProps['type'], undefined>, string> = {
  'not-found': 'Not Found',
  'network': 'Network Error',
  'cors': 'Connection Error',
  'general': 'Error',
  'no-wisp-records': 'No Site Found',
};

export function ErrorDisplay({
  error,
  type = 'general',
  onRetry,
  onBack,
  showProxySuggestion = false,
}: ErrorDisplayProps) {
  const { icon, color } = errorIcons[type];
  const title = errorTitles[type];

  return (
    <div className="bg-white rounded-lg shadow-lg p-8 max-w-md mx-auto">
      {/* Icon */}
      <div className="flex justify-center mb-4">
        <span className="text-4xl">{icon}</span>
      </div>

      {/* Title and Message */}
      <div className="text-center mb-6">
        <h3 className={`text-xl font-semibold ${color} mb-2`}>{title}</h3>
        <p className="text-gray-600 text-sm leading-relaxed">{error}</p>
      </div>

      {/* Proxy suggestion for CORS errors */}
      {showProxySuggestion && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
          <p className="text-amber-800 text-xs">
            <strong>Note:</strong> Some PDS servers don't support direct browser access.
            Consider using a CORS proxy for this operation.
          </p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3">
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex-1 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors font-medium"
          >
            Try Again
          </button>
        )}
        {onBack && (
          <button
            onClick={onBack}
            className={`px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium ${
              onRetry ? 'flex-1' : 'w-full'
            }`}
          >
            Back to Resolver
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Compact inline error display
 */
export interface InlineErrorProps {
  error: string;
  onDismiss?: () => void;
}

export function InlineError({ error, onDismiss }: InlineErrorProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
      <span className="text-red-500 mt-0.5">⚠️</span>
      <div className="flex-1">
        <p className="text-red-800 text-sm">{error}</p>
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-red-400 hover:text-red-600 transition-colors"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/**
 * Error boundary fallback component
 */
export interface ErrorFallbackProps {
  error: Error;
  resetError?: () => void;
}

export function ErrorFallback({ error, resetError }: ErrorFallbackProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-lg p-8 max-w-lg w-full">
        <div className="text-center mb-6">
          <span className="text-5xl">💥</span>
          <h2 className="text-2xl font-bold text-gray-800 mt-4 mb-2">Something went wrong</h2>
          <p className="text-gray-600">An unexpected error occurred while loading the page.</p>
        </div>

        {error.message && (
          <div className="bg-gray-100 rounded-lg p-4 mb-6">
            <p className="font-mono text-sm text-gray-700 break-all">{error.message}</p>
          </div>
        )}

        {resetError && (
          <div className="flex gap-3">
            <button
              onClick={resetError}
              className="flex-1 px-4 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors font-medium"
            >
              Try Again
            </button>
            <button
              onClick={() => window.location.href = window.location.pathname}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Reset
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
