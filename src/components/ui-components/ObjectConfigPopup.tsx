import { useAreas, useHass } from '@hakit/core';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  attributes?: Record<string, unknown>;
};

type AreaLike = {
  area_id: string;
  name: string;
  entities?: AreaEntityLike[];
};

const NON_DEVICE_ENTITY_DOMAINS = new Set([
  'automation',
  'scene',
  'script',
  'sun',
  'weather',
  'zone',
  'calendar',
  'counter',
  'timer',
  'input_boolean',
  'input_number',
  'input_select',
  'input_text',
  'template',
]);

function isDeviceEntityCandidate(entityId: string): boolean {
  const domain = entityId.split('.')[0] ?? '';
  return domain !== '' && !NON_DEVICE_ENTITY_DOMAINS.has(domain);
}

function isLikelyLightSwitch(entityId: string): boolean {
  if (!entityId.startsWith('switch.')) return false;
  const lower = entityId.toLowerCase();
  const lightLike = /(light|lamp|led)/.test(lower);
  const nonLightLike = /(energy|octopus|tariff|rate|meter|cost|price|consumption)/.test(lower);
  return lightLike && !nonLightLike;
}

function getEntityDomain(entityId: string): string {
  return (entityId.split('.')[0] ?? '').toLowerCase();
}

function getEntityText(entityId: string, attributes?: Record<string, unknown>): string {
  const friendlyName = String(attributes?.friendly_name ?? '');
  return `${entityId} ${friendlyName}`.toLowerCase();
}

function getEntityDeviceClass(attributes?: Record<string, unknown>): string {
  return String(attributes?.device_class ?? '').toLowerCase();
}

function matchesBindingTypeEntity(type: BindingType, entityId: string, attributes?: Record<string, unknown>): boolean {
  const domain = getEntityDomain(entityId);
  const text = getEntityText(entityId, attributes);
  const deviceClass = getEntityDeviceClass(attributes);

  if (type === 'light') {
    return domain === 'light' || isLikelyLightSwitch(entityId);
  }

  if (type === 'door') {
    if (domain !== 'binary_sensor' && domain !== 'sensor') return false;
    const doorClassMatch = ['door', 'window', 'opening', 'garage_door'].includes(deviceClass);
    const doorTextMatch = /(door|window|contact|opening|gate)/.test(text);
    return doorClassMatch || doorTextMatch;
  }

  if (type === 'presence') {
    if (domain !== 'binary_sensor' && domain !== 'sensor') return false;
    const presenceClassMatch = ['motion', 'occupancy', 'presence', 'moving'].includes(deviceClass);
    const presenceTextMatch = /(motion|presence|occupancy|radar|mmwave|pir)/.test(text);
    return presenceClassMatch || presenceTextMatch;
  }

  if (type === 'climate') {
    if (domain === 'climate') return true;
    if (domain !== 'sensor') return false;
    const climateClassMatch = ['temperature', 'humidity', 'moisture'].includes(deviceClass);
    const climateTextMatch = /(temperature|temp|humidity|humid|thermo|dewpoint)/.test(text);
    return climateClassMatch || climateTextMatch;
  }

  if (type === 'alarm') {
    if (domain === 'alarm_control_panel') return true;
    if (domain === 'select' || domain === 'input_select') {
      return /(alarm|security|arm|mode|night|away|home|evening)/.test(text);
    }
    if (domain === 'script' || domain === 'scene' || domain === 'switch') {
      return /(alarm|security|arm|night|away|home|evening)/.test(text);
    }
    return false;
  }

  return false;
}

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

const AREA_TOKEN_ALIASES: Record<string, string> = {
  livin: 'living',
  lounge: 'living',
  bedrm: 'bedroom',
  bathrm: 'bathroom',
  wc: 'bathroom',
  kit: 'kitchen',
};

function normalizeToken(token: string): string {
  const cleaned = token.toLowerCase().trim();
  return AREA_TOKEN_ALIASES[cleaned] ?? cleaned;
}

function tokenizeName(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map(token => normalizeToken(token))
    .filter(Boolean);
}

function inferAreaIdFromPartName(partName: string, areas: AreaLike[]): string {
  const partTokens = new Set(tokenizeName(partName));
  if (partTokens.size === 0) return '';

  let best: { areaId: string; score: number } | null = null;
  for (const area of areas) {
    const areaTokens = tokenizeName(area.name);
    if (areaTokens.length === 0) continue;

    const hits = areaTokens.filter(token => partTokens.has(token)).length;
    if (hits === 0) continue;

    const score = hits / areaTokens.length;
    if (!best || score > best.score) {
      best = { areaId: area.area_id, score };
    }
  }

  return best?.areaId ?? '';
}

export function ObjectConfigPopup({ open, modelPartName, existingBinding, onSave, onRemove, onClose }: ObjectConfigPopupProps) {
  const areas = useAreas() as AreaLike[];
  const connection = useHass(state => state.connection) as {
    sendMessagePromise: (message: Record<string, unknown>) => Promise<unknown>;
  } | null;

  const [partName, setPartName] = useState(modelPartName);
  const [areaId, setAreaId] = useState('');
  const [type, setType] = useState<BindingType>('light');
  const [haEntity, setHaEntity] = useState('');
  const [allRegistryEntityIds, setAllRegistryEntityIds] = useState<string[]>([]);
  const [allEntityIds, setAllEntityIds] = useState<string[]>([]);
  const [showAllEntities, setShowAllEntities] = useState(false);
  const [showAbsoluteAllEntities, setShowAbsoluteAllEntities] = useState(false);
  const [doorDirection, setDoorDirection] = useState<'in' | 'out' | 'up'>('in');
  const [doorLimitDeg, setDoorLimitDeg] = useState(45);
  const [hasManualAreaSelection, setHasManualAreaSelection] = useState(false);
  const initializedFormKeyRef = useRef<string | null>(null);

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
    if (!open) {
      initializedFormKeyRef.current = null;
      return;
    }

    const formKey = JSON.stringify({
      modelPartName,
      existingModelPartName: existingBinding?.modelPartName ?? '',
      existingAreaId: existingBinding?.areaId ?? '',
      existingType: existingBinding?.type ?? '',
      existingEntity: existingBinding?.haEntity ?? '',
      existingDirection: existingBinding?.type === 'door' ? existingBinding.direction : '',
      existingLimit: existingBinding?.type === 'door' ? existingBinding.limitDeg : '',
    });

    if (initializedFormKeyRef.current === formKey) return;
    initializedFormKeyRef.current = formKey;

    const initialPartName = existingBinding?.modelPartName ?? modelPartName;
    setPartName(initialPartName);
    setAreaId(existingBinding?.areaId ?? inferAreaIdFromPartName(initialPartName, areas));
    setType(existingBinding?.type ?? inferTypeFromModelPartName(initialPartName));
    setHaEntity(existingBinding?.haEntity ?? '');
    setDoorDirection(existingBinding?.type === 'door' ? existingBinding.direction : 'in');
    setDoorLimitDeg(existingBinding?.type === 'door' ? existingBinding.limitDeg : 45);
    setShowAllEntities(false);
    setShowAbsoluteAllEntities(false);
    setHasManualAreaSelection(false);
  }, [open, modelPartName, existingBinding, areas]);

  useEffect(() => {
    if (!open) return;
    if (existingBinding) return;
    if (hasManualAreaSelection) return;
    if (areaId !== '') return;

    const inferred = inferAreaIdFromPartName(partName, areas);
    if (inferred) {
      setAreaId(inferred);
    }
  }, [areaId, areas, existingBinding, hasManualAreaSelection, open, partName]);

  useEffect(() => {
    let cancelled = false;

    const loadAllEntities = async () => {
      if (!connection) return;
      try {
        const registry = (await connection.sendMessagePromise({
          type: 'config/entity_registry/list',
        })) as Array<{ entity_id?: unknown; device_id?: unknown }>;

        if (cancelled || !Array.isArray(registry)) return;

        const rawIds = registry
          .map(item => String(item?.entity_id ?? '').trim())
          .filter(Boolean)
          .filter((entityId, index, all) => all.indexOf(entityId) === index);
        setAllRegistryEntityIds(rawIds);

        const ids = registry
          .filter(item => String(item?.device_id ?? '').trim() !== '')
          .map(item => String(item?.entity_id ?? '').trim())
          .filter(Boolean)
          .filter(entityId => isDeviceEntityCandidate(entityId))
          .filter((entityId, index, all) => all.indexOf(entityId) === index);

        setAllEntityIds(ids);
      } catch {
        // Fallback to area-scoped entities only.
      }
    };

    void loadAllEntities();

    return () => {
      cancelled = true;
    };
  }, [connection]);

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

  const deviceEntityIdSet = useMemo(() => new Set(allEntityIds), [allEntityIds]);

  const areaEntities = useMemo(() => {
    if (!selectedArea?.entities) return [];

    if (allEntityIds.length > 0) {
      return selectedArea.entities.filter(entity => deviceEntityIdSet.has(entity.entity_id));
    }

    return selectedArea.entities.filter(entity => isDeviceEntityCandidate(entity.entity_id));
  }, [allEntityIds.length, deviceEntityIdSet, selectedArea]);

  const filteredEntities = useMemo(() => {
    const matching = areaEntities.filter(entity => {
      return matchesBindingTypeEntity(type, entity.entity_id, entity.attributes);
    });

    return matching;
  }, [areaEntities, type]);

  const selectableEntityIds = useMemo(() => {
    if (showAbsoluteAllEntities) {
      return allRegistryEntityIds;
    }

    if (!showAllEntities) {
      return filteredEntities.map(entity => entity.entity_id);
    }

    const base = allRegistryEntityIds.length > 0 ? allRegistryEntityIds : allEntityIds;

    return base.filter(entityId => {
      return matchesBindingTypeEntity(type, entityId);
    });
  }, [allEntityIds, allRegistryEntityIds, filteredEntities, showAbsoluteAllEntities, showAllEntities, type]);

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
                  setHasManualAreaSelection(true);
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
                  items={selectableEntityIds}
                  onSelect={entityId => setHaEntity(entityId)}
                  placeholder='Select entity'
                  searchable
                  searchPlaceholder='Search entities...'
                  footerActionLabel={!showAllEntities ? 'Entity not in area' : undefined}
                  onFooterAction={
                    !showAllEntities
                      ? () => {
                          setShowAllEntities(true);
                          setShowAbsoluteAllEntities(false);
                        }
                      : undefined
                  }
                  footerActions={
                    showAllEntities && !showAbsoluteAllEntities
                      ? [
                          {
                            label: 'Show all entities',
                            onAction: () => setShowAbsoluteAllEntities(true),
                          },
                        ]
                      : undefined
                  }
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
