/**
 * Service Worker Debug Component
 *
 * Displays service worker status for debugging purposes.
 * Only shows in development mode.
 */

import { useState, useEffect } from 'react';

export function ServiceWorkerDebug() {
  const [status, setStatus] = useState<{
    ready: boolean;
    controlled: boolean;
    scope: string | null;
    hasManifest: boolean;
    siteInfo: any;
  }>({
    ready: false,
    controlled: false,
    scope: null,
    hasManifest: false,
    siteInfo: null,
  });

  useEffect(() => {
    const checkStatus = async () => {
      if (!('serviceWorker' in navigator)) {
        setStatus(prev => ({ ...prev, ready: false }));
        return;
      }

      const ready = 'serviceWorker' in navigator;
      const controlled = !!navigator.serviceWorker.controller;
      const registration = await navigator.serviceWorker.getRegistration();
      const scope = registration?.scope || null;

      setStatus(prev => ({ ...prev, ready, controlled, scope }));

      // Check with service worker for manifest status
      if (navigator.serviceWorker.controller) {
        const channel = new MessageChannel();
        channel.port1.onmessage = (event) => {
          setStatus(prev => ({
            ...prev,
            hasManifest: event.data.hasManifest || false,
            siteInfo: event.data.siteInfo,
          }));
        };

        navigator.serviceWorker.controller.postMessage(
          { type: 'GET_STATUS' },
          [channel.port2]
        );
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  // Only show in development
  if (import.meta.env.PROD) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: 0,
      right: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      color: 'white',
      padding: '8px',
      fontSize: '10px',
      fontFamily: 'monospace',
      zIndex: 999999,
      maxWidth: '300px',
      maxHeight: '200px',
      overflow: 'auto',
    }}>
      <div><strong>Service Worker Debug</strong></div>
      <div>Ready: {status.ready ? '✓' : '✗'}</div>
      <div>Controlled: {status.controlled ? '✓' : '✗'}</div>
      <div>Scope: {status.scope || 'none'}</div>
      <div>Has Manifest: {status.hasManifest ? '✓' : '✗'}</div>
      {status.siteInfo && (
        <div>
          <div>DID: {status.siteInfo.did?.substring(0, 20)}...</div>
          <div>Site: {status.siteInfo.siteName}</div>
        </div>
      )}
    </div>
  );
}
