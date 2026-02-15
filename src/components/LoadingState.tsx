/**
 * LoadingState component
 *
 * Displays loading indicators with progress stages for the resolution process.
 */

export interface LoadingStateProps {
  stage?: 'resolving' | 'fetching-manifest' | 'loading-site' | 'general';
  message?: string;
  progress?: {
    current: number;
    total: number;
  };
}

const stageMessages: Record<string, string> = {
  resolving: 'Resolving handle...',
  'fetching-manifest': 'Fetching manifest...',
  'loading-site': 'Loading site files...',
  general: 'Loading...',
};

export function LoadingState({ stage = 'general', message, progress }: LoadingStateProps) {
  const displayMessage = message || stageMessages[stage];

  return (
    <div className="flex flex-col items-center justify-center py-12">
      {/* Spinner */}
      <div className="relative mb-4">
        <div className="w-12 h-12 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
      </div>

      {/* Message */}
      <p className="text-gray-600 text-sm font-medium mb-2">{displayMessage}</p>

      {/* Progress indicator (optional) */}
      {progress && (
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{progress.current}</span>
          <span className="text-gray-300">/</span>
          <span>{progress.total}</span>
          <span className="ml-1">files</span>
        </div>
      )}
    </div>
  );
}

/**
 * Compact inline loading indicator
 */
export interface InlineLoadingProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function InlineLoading({ message, size = 'sm' }: InlineLoadingProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-6 h-6 border-2',
    lg: 'w-8 h-8 border-3',
  };

  return (
    <div className="flex items-center gap-2">
      <div className={`${sizeClasses[size]} border-gray-300 border-t-gray-600 rounded-full animate-spin`} />
      {message && <span className="text-gray-600 text-sm">{message}</span>}
    </div>
  );
}

/**
 * Skeleton screen for content placeholder
 */
export interface SkeletonProps {
  className?: string;
  lines?: number;
}

export function Skeleton({ className = '', lines = 3 }: SkeletonProps) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-gray-200 rounded animate-pulse"
          style={{
            width: i === lines - 1 ? '60%' : '100%',
          }}
        />
      ))}
    </div>
  );
}
