export const ROOM_ICON_KEYS = ['home', 'bedroom', 'kitchen', 'office', 'bathroom', 'lounge'] as const;
export const ROOM_ICON_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4'] as const;

export type RoomIconKey = (typeof ROOM_ICON_KEYS)[number];
export type RoomIconColor = (typeof ROOM_ICON_COLORS)[number];

export interface RoomPopupAppearance {
  displayName?: string;
  iconKey?: RoomIconKey;
  color?: RoomIconColor;
}

export interface ViewerLightingSettings {
  ambientLevel: number;
  defaultFloorIndex: number;
  defaultCameraPosition: [number, number, number] | null;
  roomPopupEntities: Record<string, string[]>;
  roomPopupAppearance: Record<string, RoomPopupAppearance>;
}

export const VIEWER_LIGHTING_STORAGE_KEY = 'ha.floorViewer.lighting.v1';
export const VIEWER_LIGHTING_CHANGED_EVENT = 'ha-floorviewer-lighting-changed';
export const DEFAULT_VIEWER_LIGHTING_SETTINGS: ViewerLightingSettings = {
  ambientLevel: 45,
  defaultFloorIndex: 0,
  defaultCameraPosition: null,
  roomPopupEntities: {},
  roomPopupAppearance: {},
};

function clampAmbientLevel(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampFloorIndex(value: number): number {
  return Math.max(0, Math.min(2, Math.round(value)));
}

function sanitizeCameraPosition(value: unknown): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [x, y, z] = value.map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  return [x, y, z];
}

function sanitizeRoomPopupEntities(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== 'object') return {};

  const result: Record<string, string[]> = {};
  for (const [areaId, entities] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(entities)) continue;
    const sanitized = entities
      .map(entity => String(entity).trim())
      .filter(Boolean)
      .filter((entity, index, all) => all.indexOf(entity) === index);

    if (sanitized.length > 0) {
      result[areaId] = sanitized;
    }
  }

  return result;
}

function sanitizeHexColor(value: unknown): RoomIconColor | undefined {
  const raw = String(value ?? '').trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(raw)) return undefined;
  const normalized = raw.toUpperCase();
  return ROOM_ICON_COLORS.includes(normalized as RoomIconColor) ? (normalized as RoomIconColor) : undefined;
}

function sanitizeRoomPopupAppearance(value: unknown): Record<string, RoomPopupAppearance> {
  if (!value || typeof value !== 'object') return {};

  const result: Record<string, RoomPopupAppearance> = {};
  for (const [areaId, rawConfig] of Object.entries(value as Record<string, unknown>)) {
    if (!rawConfig || typeof rawConfig !== 'object') continue;

    const config = rawConfig as Record<string, unknown>;
    const displayName = String(config.displayName ?? '').trim();
    const iconKey = String(config.iconKey ?? '')
      .trim()
      .toLowerCase();
    const color = sanitizeHexColor(config.color);

    const next: RoomPopupAppearance = {};
    if (displayName) next.displayName = displayName.slice(0, 40);
    if (ROOM_ICON_KEYS.includes(iconKey as RoomIconKey)) next.iconKey = iconKey as RoomIconKey;
    if (color) next.color = color;

    if (Object.keys(next).length > 0) {
      result[areaId] = next;
    }
  }

  return result;
}

export function loadViewerLightingSettings(): ViewerLightingSettings {
  try {
    const raw = localStorage.getItem(VIEWER_LIGHTING_STORAGE_KEY);
    if (!raw) return DEFAULT_VIEWER_LIGHTING_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<ViewerLightingSettings>;
    const ambient = Number(parsed.ambientLevel);
    const defaultFloorIndex = Number(parsed.defaultFloorIndex);
    const defaultCameraPosition = sanitizeCameraPosition(parsed.defaultCameraPosition);
    const roomPopupEntities = sanitizeRoomPopupEntities(parsed.roomPopupEntities);
    const roomPopupAppearance = sanitizeRoomPopupAppearance(parsed.roomPopupAppearance);
    if (!Number.isFinite(ambient) && !Number.isFinite(defaultFloorIndex)) return DEFAULT_VIEWER_LIGHTING_SETTINGS;

    return {
      ambientLevel: Number.isFinite(ambient) ? clampAmbientLevel(ambient) : DEFAULT_VIEWER_LIGHTING_SETTINGS.ambientLevel,
      defaultFloorIndex: Number.isFinite(defaultFloorIndex)
        ? clampFloorIndex(defaultFloorIndex)
        : DEFAULT_VIEWER_LIGHTING_SETTINGS.defaultFloorIndex,
      defaultCameraPosition,
      roomPopupEntities,
      roomPopupAppearance,
    };
  } catch {
    return DEFAULT_VIEWER_LIGHTING_SETTINGS;
  }
}

export function saveViewerLightingSettings(settings: ViewerLightingSettings): void {
  const next = {
    ambientLevel: clampAmbientLevel(settings.ambientLevel),
    defaultFloorIndex: clampFloorIndex(settings.defaultFloorIndex),
    defaultCameraPosition: sanitizeCameraPosition(settings.defaultCameraPosition),
    roomPopupEntities: sanitizeRoomPopupEntities(settings.roomPopupEntities),
    roomPopupAppearance: sanitizeRoomPopupAppearance(settings.roomPopupAppearance),
  };

  localStorage.setItem(VIEWER_LIGHTING_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(
    new CustomEvent<ViewerLightingSettings>(VIEWER_LIGHTING_CHANGED_EVENT, {
      detail: next,
    })
  );
}

export function mapAmbientLevelToSceneLighting(ambientLevel: number): { environmentIntensity: number; exposure: number } {
  const level = clampAmbientLevel(ambientLevel) / 100;

  return {
    // 0 -> very dark, 100 -> bright ambient fill.
    environmentIntensity: 0.04 + level * 0.24,
    // Lower exposure in darker ambient scenes so device lights pop more.
    exposure: 0.62 + level * 0.5,
  };
}
