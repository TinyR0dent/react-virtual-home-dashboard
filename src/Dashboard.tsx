import { useEffect, useMemo, useState } from 'react';
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

function withBuildId(url: string): string {
  if (!url) return url;
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

  return <FloorStackViewer floors={floors} />;
}

export default Dashboard;
