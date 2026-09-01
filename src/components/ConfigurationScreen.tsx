import { useAreas } from '@hakit/core';
import { useMemo, useState } from 'react';
import { useEffect } from 'react';
import { useHass } from '@hakit/core';
import { DropdownMenu } from './ui-components/DropdownMenu';
import { loadViewerLightingSettings, saveViewerLightingSettings, type ViewerLightingSettings } from './FloorViewer/lighting';

interface ConfigurationScreenProps {
  open: boolean;
  onClose: () => void;
}

export const ConfigurationScreen = ({ open, onClose }: ConfigurationScreenProps) => {
  const connection = useHass(state => state.connection) as {
    sendMessagePromise: (message: Record<string, unknown>) => Promise<unknown>;
  } | null;
  const haAreas = useAreas();
  const [selectedArea, setSelectedArea] = useState<string | null>(null);
  const [lightingSettings, setLightingSettings] = useState<ViewerLightingSettings>(() => loadViewerLightingSettings());
  const [isClosing, setIsClosing] = useState(false);
  const [configuredFloorCount, setConfiguredFloorCount] = useState(2);
  const floorViewOptions = useMemo(
    () => ['Ground Floor', 'First Floor', 'Second Floor'].slice(0, configuredFloorCount),
    [configuredFloorCount]
  );

  useEffect(() => {
    let cancelled = false;

    const isLocalHost =
      typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isLocalHost) {
      setConfiguredFloorCount(2);
      return () => {
        cancelled = true;
      };
    }

    const loadConfiguredFloors = async () => {
      if (!connection) return;
      try {
        const result = (await connection.sendMessagePromise({
          type: 'ha_dashboard_persistence/bootstrap',
        })) as { floors?: Array<{ model_path?: string }> };

        if (cancelled) return;

        const count = Array.isArray(result?.floors)
          ? result.floors.filter(f => typeof f?.model_path === 'string' && f.model_path.trim()).length
          : 0;

        setConfiguredFloorCount(Math.max(1, Math.min(3, count || 1)));
      } catch {
        setConfiguredFloorCount(2);
      }
    };

    void loadConfiguredFloors();

    return () => {
      cancelled = true;
    };
  }, [connection]);

  function getEntitiesInArea(areaName: string) {
    const entitiesInArea = haAreas.find(area => area.name === areaName)?.entities || [];
    return entitiesInArea;
  }

  const selectedEntities = useMemo(() => {
    if (!selectedArea) return [];
    return getEntitiesInArea(selectedArea);
  }, [selectedArea, haAreas]);

  const selectedEntityNames = useMemo(() => selectedEntities.map(entity => entity.entity_id), [selectedEntities]);

  function handleClose() {
    if (isClosing) return;
    setIsClosing(true);
    window.setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 240);
  }

  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        zIndex: 380,
        position: 'fixed',
        top: 56,
        left: 0,
        right: 0,
        bottom: 0,
        color: 'white',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 0,
          height: '80%',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          padding: '1rem',
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          borderBottom: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 18px 46px rgba(0, 0, 0, 0.45)',
          overflowY: 'auto',
          transform: isClosing ? 'translateY(-105%)' : 'translateY(0)',
          transition: 'transform 240ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ margin: 0 }}>Configuration</h1>
          <button
            onClick={handleClose}
            aria-label='Close configuration'
            title='Close'
            style={{
              width: 34,
              height: 34,
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.24)',
              background: 'rgba(255,255,255,0.08)',
              color: 'white',
              fontSize: 18,
              lineHeight: 1,
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            x
          </button>
        </div>

        <div
          style={{
            border: '1px solid rgba(255,255,255,0.14)',
            borderRadius: 10,
            padding: '0.75rem',
            backgroundColor: 'rgba(255,255,255,0.04)',
            maxWidth: 420,
          }}
        >
          <h2 style={{ margin: '0 0 0.5rem 0' }}>Scene Lighting</h2>
          <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
            Ambient level: {lightingSettings.ambientLevel}%
            <input
              type='range'
              min={0}
              max={100}
              step={1}
              value={lightingSettings.ambientLevel}
              onChange={event => {
                const ambientLevel = Number(event.target.value);
                const next = { ...lightingSettings, ambientLevel };
                setLightingSettings(next);
                saveViewerLightingSettings(next);
              }}
              style={{ width: '100%', marginTop: 8 }}
            />
          </label>

          <label style={{ display: 'block', marginTop: 12, fontSize: 13, color: 'rgba(255,255,255,0.85)' }}>
            Default floor view
            <DropdownMenu
              selectedValue={
                floorViewOptions[Math.min(lightingSettings.defaultFloorIndex, floorViewOptions.length - 1)] ?? floorViewOptions[0]
              }
              items={floorViewOptions}
              onSelect={label => {
                const defaultFloorIndex = floorViewOptions.indexOf(label);
                const next = {
                  ...lightingSettings,
                  defaultFloorIndex: defaultFloorIndex >= 0 ? defaultFloorIndex : 0,
                };
                setLightingSettings(next);
                saveViewerLightingSettings(next);
              }}
              style={{ marginTop: 6 }}
            />
          </label>
        </div>

        <DropdownMenu
          placeholder='Select an area'
          items={haAreas.map(area => area.name)}
          onSelect={areaName => {
            setSelectedArea(areaName);
          }}
        />

        {selectedArea && (
          <div>
            <p>Attach door and window contacts to model components (optional)</p>
            <p>Make sure you set a hinge point on the glb and use the exact name of the parent component from your modelling tool</p>
            <div style={{ display: 'flex', flexDirection: 'row', gap: '1rem' }}>
              <input type='text' placeholder='Door/Window display name' />
              <input type='text' placeholder='Door/Window model name' />
              <DropdownMenu
                placeholder='Select a sensor'
                items={selectedEntityNames}
                onSelect={entityId => {
                  console.log(`Selected entity ${entityId} for area ${selectedArea}`);
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {selectedArea && (
                <div>
                  <h2>Entities in {selectedArea}</h2>
                  <ul>
                    {selectedEntities.map(entity => (
                      <li key={entity.entity_id}>
                        {entity.entity_id} - {entity.attributes.friendly_name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <button
        type='button'
        onClick={handleClose}
        aria-label='Close configuration panel'
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: '20%',
          border: 'none',
          background: 'rgba(0, 0, 0, 0.34)',
          cursor: 'pointer',
        }}
      />
    </div>
  );
};
