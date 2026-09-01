export interface ViewerLightingSettings {
  ambientLevel: number;
  defaultFloorIndex: number;
  defaultCameraPosition: [number, number, number] | null;
}

export const VIEWER_LIGHTING_STORAGE_KEY = 'ha.floorViewer.lighting.v1';
export const VIEWER_LIGHTING_CHANGED_EVENT = 'ha-floorviewer-lighting-changed';
export const DEFAULT_VIEWER_LIGHTING_SETTINGS: ViewerLightingSettings = {
  ambientLevel: 45,
  defaultFloorIndex: 0,
  defaultCameraPosition: null,
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

export function loadViewerLightingSettings(): ViewerLightingSettings {
  try {
    const raw = localStorage.getItem(VIEWER_LIGHTING_STORAGE_KEY);
    if (!raw) return DEFAULT_VIEWER_LIGHTING_SETTINGS;

    const parsed = JSON.parse(raw) as Partial<ViewerLightingSettings>;
    const ambient = Number(parsed.ambientLevel);
    const defaultFloorIndex = Number(parsed.defaultFloorIndex);
    const defaultCameraPosition = sanitizeCameraPosition(parsed.defaultCameraPosition);
    if (!Number.isFinite(ambient) && !Number.isFinite(defaultFloorIndex)) return DEFAULT_VIEWER_LIGHTING_SETTINGS;

    return {
      ambientLevel: Number.isFinite(ambient) ? clampAmbientLevel(ambient) : DEFAULT_VIEWER_LIGHTING_SETTINGS.ambientLevel,
      defaultFloorIndex: Number.isFinite(defaultFloorIndex)
        ? clampFloorIndex(defaultFloorIndex)
        : DEFAULT_VIEWER_LIGHTING_SETTINGS.defaultFloorIndex,
      defaultCameraPosition,
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
