import { useEffect, useMemo, useState } from 'react';
import { ROOM_ICON_COLORS, ROOM_ICON_KEYS, type RoomIconColor, type RoomIconKey, type RoomPopupAppearance } from '../FloorViewer/lighting';
import { Bed, Briefcase, Home, Pencil, Soup, Tv, Waves, type LucideIcon } from 'lucide-react';
import { useEntity, type EntityName } from '@hakit/core';
import { DropdownMenu } from './DropdownMenu';

export const ROOM_ICON_BY_KEY: Record<RoomIconKey, LucideIcon> = {
  home: Home,
  bedroom: Bed,
  kitchen: Soup,
  office: Briefcase,
  bathroom: Waves,
  lounge: Tv,
};

function EntityStatusRow({ entityId, onRemove }: { entityId: string; onRemove?: (entityId: string) => void }) {
  const entity = useEntity(entityId as EntityName) as { state?: string; attributes?: { friendly_name?: string } } | undefined;
  const friendlyName = entity?.attributes?.friendly_name || entityId;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        padding: '8px 10px',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8,
        background: 'rgba(255,255,255,0.04)',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.92)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{friendlyName}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.58)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entityId}</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 12, color: 'rgba(170,220,255,0.95)' }}>{entity?.state ?? 'unknown'}</span>
        {onRemove && (
          <button
            type='button'
            onClick={() => onRemove(entityId)}
            style={{
              border: '1px solid rgba(255,120,120,0.4)',
              background: 'rgba(255,120,120,0.12)',
              color: '#ffd9d9',
              borderRadius: 6,
              padding: '4px 7px',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function RoomStylePicker({
  open,
  selectedIconKey,
  selectedColor,
  onSelectIcon,
  onSelectColor,
  onClose,
}: {
  open: boolean;
  selectedIconKey: RoomIconKey;
  selectedColor: RoomIconColor;
  onSelectIcon: (iconKey: RoomIconKey) => void;
  onSelectColor: (color: RoomIconColor) => void;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 290,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: 'min(440px, 100%)',
          background: 'rgba(12, 16, 22, 0.98)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 12,
          padding: 12,
          color: 'white',
        }}
      >
        <h4 style={{ margin: '0 0 10px 0', fontSize: 14 }}>Room Icon & Color</h4>

        <div style={{ marginBottom: 10, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
          {ROOM_ICON_KEYS.map(iconKey => {
            const Icon = ROOM_ICON_BY_KEY[iconKey];
            const selected = selectedIconKey === iconKey;
            return (
              <button
                key={iconKey}
                type='button'
                onClick={() => onSelectIcon(iconKey)}
                style={{
                  border: selected ? '1px solid rgba(89,183,255,0.6)' : '1px solid rgba(255,255,255,0.2)',
                  background: selected ? 'rgba(89,183,255,0.2)' : 'rgba(255,255,255,0.06)',
                  borderRadius: 8,
                  height: 42,
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  gap: 6,
                  fontSize: 12,
                  textTransform: 'capitalize',
                }}
              >
                <Icon size={14} strokeWidth={2.2} />
                {iconKey}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          {ROOM_ICON_COLORS.map(color => {
            const selected = selectedColor.toUpperCase() === color;
            return (
              <button
                key={color}
                type='button'
                onClick={() => onSelectColor(color)}
                aria-label={`Color ${color}`}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '999px',
                  border: selected ? '2px solid white' : '1px solid rgba(255,255,255,0.45)',
                  background: color,
                  boxShadow: selected ? '0 0 0 2px rgba(255,255,255,0.35)' : 'none',
                  cursor: 'pointer',
                }}
              />
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type='button'
            onClick={onClose}
            style={{
              border: '1px solid rgba(255,255,255,0.24)',
              background: 'rgba(255,255,255,0.08)',
              color: 'white',
              borderRadius: 8,
              padding: '5px 10px',
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export function RoomInfoPopup({
  open,
  baseAreaName,
  areaName,
  roomAppearance,
  availableAreas,
  selectedAreaId,
  entityIds,
  availableEntityIds,
  allAvailableEntityIds,
  allRegistryEntityIds,
  onSelectAreaId,
  onChangeDisplayName,
  onChangeIconKey,
  onChangeColor,
  onAdd,
  onRemove,
  onReset,
  onClose,
}: {
  open: boolean;
  baseAreaName: string;
  areaName: string;
  roomAppearance: RoomPopupAppearance;
  availableAreas: Array<{ areaId: string; areaName: string }>;
  selectedAreaId: string | null;
  entityIds: string[];
  availableEntityIds: string[];
  allAvailableEntityIds: string[];
  allRegistryEntityIds: string[];
  onSelectAreaId: (areaId: string) => void;
  onChangeDisplayName: (displayName: string) => void;
  onChangeIconKey: (iconKey: RoomIconKey) => void;
  onChangeColor: (color: RoomIconColor) => void;
  onAdd: (entityId: string) => void;
  onRemove: (entityId: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const [selectedEntityToAdd, setSelectedEntityToAdd] = useState<string | null>(null);
  const [showAllEntities, setShowAllEntities] = useState(false);
  const [showAbsoluteAllEntities, setShowAbsoluteAllEntities] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [draftDisplayName, setDraftDisplayName] = useState('');
  const [showStylePicker, setShowStylePicker] = useState(false);

  const selectedIconKey: RoomIconKey =
    roomAppearance.iconKey && ROOM_ICON_KEYS.includes(roomAppearance.iconKey) ? roomAppearance.iconKey : 'home';
  const selectedColor: RoomIconColor =
    roomAppearance.color && ROOM_ICON_COLORS.includes(roomAppearance.color) ? roomAppearance.color : '#3B82F6';
  const HeaderIcon = ROOM_ICON_BY_KEY[selectedIconKey];

  useEffect(() => {
    if (!open) {
      setSelectedEntityToAdd(null);
      setShowAllEntities(false);
      setShowAbsoluteAllEntities(false);
      setIsEditingName(false);
      setShowStylePicker(false);
      setDraftDisplayName('');
    }
  }, [open]);

  useEffect(() => {
    setShowAllEntities(false);
    setShowAbsoluteAllEntities(false);
    setSelectedEntityToAdd(null);
  }, [selectedAreaId]);

  useEffect(() => {
    setDraftDisplayName(roomAppearance.displayName ?? '');
  }, [roomAppearance.displayName, selectedAreaId]);

  const allowedDomains = useMemo(() => {
    const domains = availableEntityIds
      .map(entityId => (entityId.split('.')[0] ?? '').trim())
      .filter(Boolean)
      .filter((domain, index, all) => all.indexOf(domain) === index);

    // Sensible fallback when the selected room currently has no entities.
    return domains.length > 0 ? domains : ['light', 'switch', 'climate', 'fan', 'cover', 'lock', 'media_player'];
  }, [availableEntityIds]);

  console.log('checking if RoomInfoPopup should render, open:', open);

  if (!open) {
    return <div style={{ display: 'none' }} />;
  }

  console.log('RoomInfoPopup rendered');

  const candidateEntities = (showAbsoluteAllEntities ? allRegistryEntityIds : showAllEntities ? allAvailableEntityIds : availableEntityIds)
    .filter(Boolean)
    .filter(entityId => {
      if (showAbsoluteAllEntities) return true;
      const domain = entityId.split('.')[0] ?? '';
      return allowedDomains.includes(domain);
    });
  const addableEntities = candidateEntities
    .filter(entityId => !entityIds.includes(entityId))
    .filter((entityId, index, all) => all.indexOf(entityId) === index);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 270,
        background: 'rgba(0, 0, 0, 0.44)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 12,
      }}
    >
      <div
        onClick={event => event.stopPropagation()}
        style={{
          width: 'min(500px, 100%)',
          maxHeight: '70vh',
          overflowY: 'auto',
          background: 'rgba(13, 18, 24, 0.98)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 12,
          padding: 12,
          color: 'white',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type='button'
              onClick={() => setShowStylePicker(true)}
              title='Change room icon and color'
              style={{
                width: 28,
                height: 28,
                borderRadius: '999px',
                border: '1px solid rgba(255,255,255,0.35)',
                background: selectedColor,
                color: 'white',
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
              }}
            >
              <HeaderIcon size={14} strokeWidth={2.3} />
            </button>
            {!isEditingName ? (
              <>
                <h3 style={{ margin: 0, fontSize: 15 }}>{areaName}</h3>
                <button
                  type='button'
                  onClick={() => setIsEditingName(true)}
                  title='Edit display name'
                  style={{
                    width: 24,
                    height: 24,
                    border: '1px solid rgba(255,255,255,0.28)',
                    borderRadius: 6,
                    background: 'rgba(255,255,255,0.08)',
                    color: 'white',
                    display: 'grid',
                    placeItems: 'center',
                    cursor: 'pointer',
                  }}
                >
                  <Pencil size={12} />
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  value={draftDisplayName}
                  onChange={event => setDraftDisplayName(event.target.value)}
                  placeholder={baseAreaName}
                  maxLength={40}
                  style={{
                    height: 28,
                    borderRadius: 6,
                    border: '1px solid rgba(255,255,255,0.25)',
                    background: 'rgba(255,255,255,0.09)',
                    color: 'white',
                    padding: '0 8px',
                    fontSize: 12,
                  }}
                />
                <button
                  type='button'
                  onClick={() => {
                    onChangeDisplayName(draftDisplayName);
                    setIsEditingName(false);
                  }}
                  style={{
                    border: '1px solid rgba(126,232,166,0.5)',
                    background: 'rgba(126,232,166,0.2)',
                    color: '#e8fff0',
                    borderRadius: 6,
                    padding: '4px 8px',
                    fontSize: 11,
                    cursor: 'pointer',
                  }}
                >
                  Save
                </button>
              </div>
            )}
          </div>
          <button
            type='button'
            onClick={onClose}
            style={{
              border: '1px solid rgba(255,255,255,0.22)',
              background: 'rgba(255,255,255,0.08)',
              color: 'white',
              borderRadius: 8,
              padding: '4px 8px',
            }}
          >
            Close
          </button>
        </div>

        <div style={{ marginTop: -4, marginBottom: 10, fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>Linked HA Area: {baseAreaName}</div>

        <div style={{ marginBottom: 10 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
            Zone shown in this popup
          </label>
          <DropdownMenu
            placeholder='Select zone'
            items={availableAreas.map(area => area.areaName)}
            selectedValue={availableAreas.find(area => area.areaId === selectedAreaId)?.areaName ?? null}
            onSelect={selectedAreaName => {
              const selectedArea = availableAreas.find(area => area.areaName === selectedAreaName);
              if (!selectedArea) return;
              onSelectAreaId(selectedArea.areaId);
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <DropdownMenu
              placeholder='Add entity to this room popup'
              items={addableEntities}
              selectedValue={selectedEntityToAdd}
              onSelect={entity => setSelectedEntityToAdd(entity)}
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
            />
          </div>
          <button
            type='button'
            onClick={() => {
              if (!selectedEntityToAdd) return;
              onAdd(selectedEntityToAdd);
              setSelectedEntityToAdd(null);
            }}
            style={{
              border: '1px solid rgba(89,183,255,0.36)',
              background: 'rgba(89,183,255,0.18)',
              color: '#dff1ff',
              borderRadius: 8,
              padding: '0 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Add
          </button>
          <button
            type='button'
            onClick={onReset}
            style={{
              border: '1px solid rgba(255,255,255,0.26)',
              background: 'rgba(255,255,255,0.1)',
              color: 'white',
              borderRadius: 8,
              padding: '0 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Reset
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entityIds.length === 0 ? (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>No entities configured for this room popup.</div>
          ) : (
            entityIds.map(entityId => <EntityStatusRow key={entityId} entityId={entityId} onRemove={onRemove} />)
          )}
        </div>
      </div>

      <RoomStylePicker
        open={showStylePicker}
        selectedIconKey={selectedIconKey}
        selectedColor={selectedColor}
        onSelectIcon={onChangeIconKey}
        onSelectColor={onChangeColor}
        onClose={() => setShowStylePicker(false)}
      />
    </div>
  );
}
