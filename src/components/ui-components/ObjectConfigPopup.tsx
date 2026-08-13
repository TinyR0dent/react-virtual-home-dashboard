import { useAreas } from '@hakit/core';
import { useEffect, useMemo, useState } from 'react';
import type { EntityName } from '@hakit/core';
import type { LightEntityId } from '../FloorViewer/Actions/LightOn';
import type {
  AlarmBinding,
  BindingType,
  ClimateBinding,
  DoorBinding,
  LightBinding,
  ModelBinding,
  PresenceBinding,
} from '../FloorViewer/bindings';
import { NumberInput } from './NumberInput';
import { DropdownMenu } from './DropdownMenu';
import { doorAliases, lightAliases, presenceAliases } from '../FloorViewer/aliases';

type AreaEntityLike = {
  entity_id: string;
  attributes?: {
    friendly_name?: string;
  };
};

type AreaLike = {
  area_id: string;
  name: string;
  entities?: AreaEntityLike[];
};

export interface ObjectConfigPopupProps {
  open: boolean;
  modelPartName: string;
  existingBinding?: ModelBinding;
  onSave: (binding: ModelBinding) => void;
  onRemove: (modelPartName: string) => void;
  onClose: () => void;
}

const TYPE_OPTIONS: Array<{ label: string; value: BindingType }> = [
  { label: 'Light', value: 'light' },
  { label: 'Door', value: 'door' },
  { label: 'Presence', value: 'presence' },
  { label: 'Climate', value: 'climate' },
  { label: 'Alarm', value: 'alarm' },
];

export function ObjectConfigPopup({ open, modelPartName, existingBinding, onSave, onRemove, onClose }: ObjectConfigPopupProps) {
  const areas = useAreas() as AreaLike[];

  const [partName, setPartName] = useState(modelPartName);
  const [areaId, setAreaId] = useState('');
  const [type, setType] = useState<BindingType>('light');
  const [haEntity, setHaEntity] = useState('');
  const [doorDirection, setDoorDirection] = useState<'in' | 'out' | 'up'>('in');
  const [doorLimitDeg, setDoorLimitDeg] = useState(45);

  function inferTypeFromModelPartName(name: string): BindingType {
    const lowerName = name.toLowerCase();
    const splitName = lowerName.split(/[\s_-]+/); // Split by spaces, underscores, or hyphens
    const words = new Set(splitName);
    if (Array.from(words).some(word => doorAliases.includes(word))) return 'door';
    if (Array.from(words).some(word => lightAliases.includes(word))) return 'light';
    if (Array.from(words).some(word => presenceAliases.includes(word))) return 'presence';
    if (lowerName.includes('thermostat') || lowerName.includes('climate')) return 'climate';
    if (lowerName.includes('alarm') || lowerName.includes('security')) return 'alarm';
    return 'light'; // Default fallback
  }

  useEffect(() => {
    if (!open) return;
    const initialPartName = existingBinding?.modelPartName ?? modelPartName;
    setPartName(existingBinding?.modelPartName ?? modelPartName);
    setAreaId(existingBinding?.areaId ?? '');
    setType(existingBinding?.type ?? inferTypeFromModelPartName(initialPartName));
    setHaEntity(existingBinding?.haEntity ?? '');
    setDoorDirection(existingBinding?.type === 'door' ? existingBinding.direction : 'in');
    setDoorLimitDeg(existingBinding?.type === 'door' ? existingBinding.limitDeg : 45);
  }, [open, modelPartName, existingBinding]);

  useEffect(() => {
    if (!open) return;
    if (existingBinding) return;
    setType(inferTypeFromModelPartName(partName));
  }, [partName, existingBinding, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const selectedArea = useMemo(() => areas.find(area => area.area_id === areaId), [areas, areaId]);

  const areaEntities = useMemo(() => {
    if (!selectedArea?.entities) return [];
    return selectedArea.entities;
  }, [selectedArea]);

  const filteredEntities = useMemo(() => {
    const domainsByType: Record<BindingType, string[]> = {
      light: ['light', 'switch'],
      door: ['binary_sensor', 'sensor', 'input_boolean'],
      presence: ['binary_sensor', 'sensor', 'input_boolean'],
      climate: ['climate'],
      alarm: ['alarm_control_panel'],
    };

    const allowDomains = domainsByType[type];
    const matching = areaEntities.filter(entity => {
      const domain = entity.entity_id.split('.')[0] ?? '';
      return allowDomains.includes(domain);
    });

    // If nothing matches a strict domain filter, show all entities to avoid dead-end UX.
    return matching.length > 0 ? matching : areaEntities;
  }, [areaEntities, type]);

  if (!open) return null;

  const canSave = partName.trim() !== '' && areaId !== '' && haEntity !== '';

  const handleSave = () => {
    if (!canSave) return;

    const areaName = selectedArea?.name ?? areaId;
    const common = {
      modelPartName: partName.trim(),
      areaId,
      areaName,
    };

    if (type === 'light') {
      const binding: LightBinding = {
        ...common,
        type: 'light',
        haEntity: haEntity as LightEntityId,
      };
      onSave(binding);
      return;
    }

    if (type === 'door') {
      const binding: DoorBinding = {
        ...common,
        type: 'door',
        haEntity: haEntity as EntityName,
        direction: doorDirection,
        limitDeg: doorLimitDeg,
      };
      onSave(binding);
      return;
    }

    if (type === 'climate') {
      const binding: ClimateBinding = {
        ...common,
        type: 'climate',
        haEntity: haEntity as EntityName,
      };
      onSave(binding);
      return;
    }

    if (type === 'presence') {
      const binding: PresenceBinding = {
        ...common,
        type: 'presence',
        haEntity: haEntity as EntityName,
      };
      onSave(binding);
      return;
    }

    const binding: AlarmBinding = {
      ...common,
      type: 'alarm',
      haEntity: haEntity as EntityName,
    };
    onSave(binding);
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 260,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 340,
          background: 'rgba(15, 20, 26, 0.97)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 12,
          padding: 14,
          color: 'rgba(255,255,255,0.9)',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
        onClick={event => event.stopPropagation()}
      >
        <h4 style={{ margin: '0 0 10px 0', fontSize: 14, fontWeight: 600 }}>Object Config</h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
            Model Part Name
            <input
              value={partName}
              onChange={event => setPartName(event.target.value)}
              style={{
                marginTop: 4,
                width: '100%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 6,
                color: 'white',
                padding: '7px 8px',
                fontSize: 12,
              }}
            />
          </label>

          <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
            Area
            <DropdownMenu
              placeholder='Select area'
              items={areas.map(area => area.name)}
              selectedValue={selectedArea?.name ?? null}
              onSelect={areaName => {
                const area = areas.find(a => a.name === areaName);
                if (area) {
                  setAreaId(area.area_id);
                  setHaEntity('');
                }
              }}
              style={{
                marginTop: 4,
                width: '100%',
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.16)',
                borderRadius: 6,
                color: 'white',
                padding: '7px 8px',
                fontSize: 12,
              }}
            />
          </label>

          {areaId !== '' && (
            <>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                Type
                <DropdownMenu
                  selectedValue={TYPE_OPTIONS.find(option => option.value === type)?.label ?? null}
                  items={TYPE_OPTIONS.map(option => option.label)}
                  onSelect={typeLabel => {
                    const selectedType = TYPE_OPTIONS.find(option => option.label === typeLabel)?.value;
                    if (!selectedType) return;
                    setType(selectedType);
                    setHaEntity('');
                  }}
                  placeholder='Select type'
                  style={inputStyle}
                />
              </label>

              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                HA Entity
                <DropdownMenu
                  selectedValue={haEntity || null}
                  items={filteredEntities.map(entity => entity.entity_id)}
                  onSelect={entityId => setHaEntity(entityId)}
                  placeholder='Select entity'
                  style={inputStyle}
                />
              </label>
            </>
          )}
        </div>

        {areaId !== '' && type && (
          <div style={{ marginTop: 15, display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'flex-start' }}>
            <h4 style={{ margin: '0 0 10px 0', fontSize: 14, fontWeight: 600 }}>Type Specifics</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {type === 'door' && (
                <>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                    Direction
                    <DropdownMenu
                      selectedValue={doorDirection}
                      items={['in', 'out']}
                      onSelect={direction => setDoorDirection(direction as 'in' | 'out')}
                      placeholder='Select direction'
                      style={{
                        marginTop: 4,
                        width: '100%',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.16)',
                        borderRadius: 6,
                        color: 'white',
                        padding: '7px 8px',
                        fontSize: 12,
                      }}
                    />
                  </label>
                  <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)' }}>
                    Limit Degrees
                    <NumberInput value={doorLimitDeg} onChange={setDoorLimitDeg} style={inputStyle} min={0} max={180} step={1} />
                  </label>
                </>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          {existingBinding && (
            <button
              onClick={() => onRemove(modelPartName)}
              style={{
                background: 'rgba(255, 105, 105, 0.18)',
                border: '1px solid rgba(255, 105, 105, 0.3)',
                borderRadius: 6,
                color: '#ffd8d8',
                padding: '6px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Remove
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.16)',
              borderRadius: 6,
              color: 'rgba(255,255,255,0.88)',
              padding: '6px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            disabled={!canSave}
            onClick={handleSave}
            style={{
              background: canSave ? 'rgba(89, 183, 255, 0.28)' : 'rgba(255,255,255,0.04)',
              border: canSave ? '1px solid rgba(89, 183, 255, 0.42)' : '1px solid rgba(255,255,255,0.1)',
              borderRadius: 6,
              color: canSave ? '#d9efff' : 'rgba(255,255,255,0.45)',
              padding: '6px 10px',
              fontSize: 12,
              cursor: canSave ? 'pointer' : 'not-allowed',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  marginTop: 4,
  width: '100%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.16)',
  borderRadius: 6,
  color: 'white',
  padding: '7px 8px',
  fontSize: 12,
};
