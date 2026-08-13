import { useEffect, useMemo, useState } from 'react';
import { useHass } from '@hakit/core';
import { FloorStackViewer } from './components/FloorViewer';
import type { UpperFloorConfig } from './components/FloorViewer';

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

const fallbackGround = `${base}models/ground-floor.glb?v=${buildId}`;
const fallbackUpper: UpperFloorConfig[] = [
  {
    modelUrl: `${base}models/first-floor.glb?v=${buildId}`,
    yOffset: 2.4,
  },
];

function Dashboard() {
  const connection = useHass(state => state.connection) as {
    sendMessagePromise: (message: Record<string, unknown>) => Promise<unknown>;
  } | null;

  const [groundFloorUrl, setGroundFloorUrl] = useState<string>(fallbackGround);
  const [upperFloors, setUpperFloors] = useState<UpperFloorConfig[]>(fallbackUpper);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  useEffect(() => {
    let cancelled = false;

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

        const floors = Array.isArray(result?.floors)
          ? result.floors.filter(f => typeof f?.model_path === 'string' && f.model_path.trim())
          : [];
        if (floors.length > 0) {
          const [ground, ...upper] = floors;
          setGroundFloorUrl(withBuildId(ground.model_path!.trim()));
          setUpperFloors(
            upper.map(floor => ({
              modelUrl: withBuildId(floor.model_path!.trim()),
              yOffset: Number.isFinite(floor.y_offset) ? Number(floor.y_offset) : 0,
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
  }, [connection]);

  const canRender = useMemo(() => Boolean(groundFloorUrl), [groundFloorUrl]);

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

  return <FloorStackViewer groundFloorUrl={groundFloorUrl} upperFloors={upperFloors} />;
}

export default Dashboard;
