import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useHass } from '@hakit/core';
import { FloorStackViewer } from './components/FloorViewer';
import type { FloorModelConfig } from './components/FloorViewer';

const base = import.meta.env.BASE_URL;
const buildId = import.meta.env.VITE_BUILD_ID ?? 'dev';

interface FloorBootstrapItem {
  id?: string;
  name?: string;
  model_path?: string;
  y_offset?: number;
}

interface BootstrapPayload {
  floors?: FloorBootstrapItem[];
}

interface ViewerErrorBoundaryProps {
  children: ReactNode;
  onError: (error: unknown) => void;
}

interface ViewerErrorBoundaryState {
  hasError: boolean;
}

class ViewerErrorBoundary extends Component<ViewerErrorBoundaryProps, ViewerErrorBoundaryState> {
  state: ViewerErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(_: unknown): ViewerErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onError(error);
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

function formatUnknownError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function stripHashAndQuery(url: string): string {
  return url.split('#')[0].split('?')[0];
}

async function probeModelUrl(url: string): Promise<{ ok: true; url: string } | { ok: false; reason: string }> {
  const sanitized = stripHashAndQuery(url);
  const candidates = [url, sanitized].filter((value, index, all) => all.indexOf(value) === index);

  for (const candidate of candidates) {
    try {
      const headResponse = await fetch(candidate, { method: 'HEAD', cache: 'no-store' });
      if (headResponse.ok) {
        return { ok: true, url: candidate };
      }

      // Some static file servers do not support HEAD; try a regular GET in that case.
      if (headResponse.status === 405 || headResponse.status === 501) {
        const getResponse = await fetch(candidate, { method: 'GET', cache: 'no-store' });
        if (getResponse.ok) {
          return { ok: true, url: candidate };
        }
      }
    } catch {
      // Try next candidate before failing this URL.
    }
  }

  return { ok: false, reason: `Not reachable: ${url}` };
}

function withBuildId(url: string): string {
  if (!url) return url;
  if (url.startsWith('/local/')) return url;
  return url.includes('?') ? `${url}&v=${buildId}` : `${url}?v=${buildId}`;
}

function normalizeHaModelPath(rawPath: string): string {
  const path = rawPath.trim();
  if (!path) return path;

  // Accept Home Assistant filesystem-like paths and map them to HTTP /local/*.
  if (path.startsWith('/config/www/')) {
    return `/local/${path.slice('/config/www/'.length)}`;
  }
  if (path.startsWith('config/www/')) {
    return `/local/${path.slice('config/www/'.length)}`;
  }
  if (path.startsWith('/www/')) {
    return `/local/${path.slice('/www/'.length)}`;
  }
  if (path.startsWith('www/')) {
    return `/local/${path.slice('www/'.length)}`;
  }

  return path;
}

function resolveModelUrl(rawUrl: string): string {
  const modelUrl = normalizeHaModelPath(rawUrl);
  if (!modelUrl) return modelUrl;

  if (modelUrl.startsWith('/local/')) {
    return modelUrl.split('#')[0].split('?')[0];
  }

  const isLocalHost =
    typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  if (isLocalHost && modelUrl.startsWith('/local/')) {
    const fileName = modelUrl.split('/').filter(Boolean).pop();
    if (fileName) {
      return withBuildId(`${base}models/${fileName}`);
    }
  }

  return withBuildId(modelUrl);
}

const MAX_FLOORS = 3;
const DEFAULT_FLOOR_HEIGHT = 2.4;

const fallbackFloors: FloorModelConfig[] = [
  {
    modelUrl: `${base}models/ground-floor.glb?v=${buildId}`,
    yOffset: 0,
  },
  {
    modelUrl: `${base}models/first-floor.glb?v=${buildId}`,
    yOffset: DEFAULT_FLOOR_HEIGHT,
  },
];

function Dashboard() {
  const connection = useHass(state => state.connection) as {
    sendMessagePromise: (message: Record<string, unknown>) => Promise<unknown>;
  } | null;

  const [floors, setFloors] = useState<FloorModelConfig[]>(fallbackFloors);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [uiFatalError, setUiFatalError] = useState<string | null>(null);
  const [isModelPreflightRunning, setIsModelPreflightRunning] = useState(false);
  const [modelPreflightError, setModelPreflightError] = useState<string | null>(null);

  const isLocalHost =
    typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  useEffect(() => {
    let cancelled = false;

    if (isLocalHost) {
      setFloors(fallbackFloors);
      setIsBootstrapping(false);
      return () => {
        cancelled = true;
      };
    }

    const loadBootstrap = async () => {
      if (!connection) {
        setIsBootstrapping(false);
        return;
      }

      try {
        const result = (await connection.sendMessagePromise({
          type: 'ha_dashboard_persistence/bootstrap',
        })) as BootstrapPayload;

        if (cancelled) return;

        const configuredFloors = Array.isArray(result?.floors)
          ? result.floors.filter(f => typeof f?.model_path === 'string' && f.model_path.trim())
          : [];
        if (configuredFloors.length > 0) {
          setFloors(
            configuredFloors.slice(0, MAX_FLOORS).map((floor, index) => ({
              modelUrl: resolveModelUrl(floor.model_path!),
              yOffset: Number.isFinite(floor.y_offset) ? Number(floor.y_offset) : index * DEFAULT_FLOOR_HEIGHT,
            }))
          );
        }
      } catch {
        // If integration bootstrap is unavailable, keep local development fallback.
      } finally {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      }
    };

    void loadBootstrap();

    return () => {
      cancelled = true;
    };
  }, [connection, isLocalHost]);

  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      const message = event.error ? formatUnknownError(event.error) : event.message;
      if (!message) return;
      if (!message.includes('Could not load') && !message.includes('.glb')) return;
      setUiFatalError(message);
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = formatUnknownError(event.reason);
      if (!message) return;
      if (!message.includes('Could not load') && !message.includes('.glb')) return;
      setUiFatalError(message);
    };

    window.addEventListener('error', onWindowError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onWindowError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    if (isBootstrapping)
      return () => {
        cancelled = true;
      };

    const runModelPreflight = async () => {
      setIsModelPreflightRunning(true);
      setModelPreflightError(null);

      const checks = await Promise.all(floors.map(floor => probeModelUrl(floor.modelUrl)));
      if (cancelled) return;

      const failures = checks
        .map((result, index) => ({
          result,
          originalUrl: floors[index]?.modelUrl ?? 'unknown',
        }))
        .filter(item => item.result.ok === false) as Array<{ result: { ok: false; reason: string }; originalUrl: string }>;

      if (failures.length > 0) {
        const details = failures.map(failure => `- ${failure.originalUrl}`).join('\n');
        setModelPreflightError(`One or more model URLs are unreachable:\n${details}`);
      }

      setIsModelPreflightRunning(false);
    };

    void runModelPreflight();

    return () => {
      cancelled = true;
    };
  }, [floors, isBootstrapping]);

  const canRender = useMemo(() => floors.length > 0 && floors.every(floor => Boolean(floor.modelUrl)), [floors]);

  if (isBootstrapping) {
    return null;
  }

  if (!canRender) {
    return (
      <div style={{ padding: 16, color: 'white' }}>
        No floor models configured yet. Open the HA Dashboard Persistence integration options and set at least a ground floor GLB path.
      </div>
    );
  }

  if (isModelPreflightRunning) {
    return <div style={{ padding: 16, color: 'white' }}>Checking floor model URLs...</div>;
  }

  if (modelPreflightError) {
    return (
      <div
        style={{
          minHeight: '100vh',
          width: '100%',
          padding: 20,
          boxSizing: 'border-box',
          background: 'linear-gradient(160deg, #0c1d3c 0%, #142f5f 46%, #1a3f74 100%)',
          color: '#eaf2ff',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: '0 auto',
            background: 'rgba(8, 17, 34, 0.72)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h2 style={{ margin: '0 0 8px 0', fontSize: 18 }}>Unable to load floor model</h2>
          <p style={{ margin: '0 0 10px 0', color: 'rgba(234,242,255,0.9)', fontSize: 13 }}>
            Model preflight failed before 3D rendering started.
          </p>
          <pre
            style={{
              margin: 0,
              padding: 10,
              borderRadius: 8,
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: '#ffdcdc',
              fontSize: 12,
            }}
          >
            {modelPreflightError}
          </pre>
        </div>
      </div>
    );
  }

  if (uiFatalError) {
    return (
      <div
        style={{
          minHeight: '100vh',
          width: '100%',
          padding: 20,
          boxSizing: 'border-box',
          background: 'linear-gradient(160deg, #0c1d3c 0%, #142f5f 46%, #1a3f74 100%)',
          color: '#eaf2ff',
          fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 960,
            margin: '0 auto',
            background: 'rgba(8, 17, 34, 0.72)',
            border: '1px solid rgba(255,255,255,0.18)',
            borderRadius: 12,
            padding: 16,
          }}
        >
          <h2 style={{ margin: '0 0 8px 0', fontSize: 18 }}>Unable to load floor model</h2>
          <p style={{ margin: '0 0 10px 0', color: 'rgba(234,242,255,0.9)', fontSize: 13 }}>
            Check that model paths in integration options use /local/... and that files exist in /config/www.
          </p>
          <pre
            style={{
              margin: 0,
              padding: 10,
              borderRadius: 8,
              overflowX: 'auto',
              whiteSpace: 'pre-wrap',
              background: 'rgba(0,0,0,0.35)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: '#ffdcdc',
              fontSize: 12,
            }}
          >
            {uiFatalError}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <ViewerErrorBoundary
      onError={error => {
        setUiFatalError(formatUnknownError(error));
      }}
    >
      <FloorStackViewer floors={floors} />
    </ViewerErrorBoundary>
  );
}

export default Dashboard;
