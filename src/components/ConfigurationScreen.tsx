import { useAreas } from '@hakit/core';
import { useMemo, useState } from 'react';
import { DropdownMenu } from './ui-components/DropdownMenu';

interface ConfigurationScreenProps {
  open: boolean;
  onClose: () => void;
}

export const ConfigurationScreen = ({ open, onClose }: ConfigurationScreenProps) => {
  const haAreas = useAreas();
  const [selectedArea, setSelectedArea] = useState<string | null>(null);

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
    onClose();
  }

  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        padding: '1rem',
        zIndex: 380,
        position: 'fixed',
        top: 56,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.84)',
        color: 'white',
        overflowY: 'auto',
      }}
    >
      <h1>Configuration Screen</h1>
      <button onClick={handleClose}>Close</button>
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
  );
};
