import type { EntityName } from '@hakit/core';
import type { LightEntityId } from './Actions/LightOn';

export type BindingType = 'light' | 'door' | 'climate' | 'alarm' | 'presence';
export type DoorDirection = 'in' | 'out' | 'up';

interface BaseBinding {
  modelPartName: string;
  areaId: string;
  areaName: string;
}

export interface LightBinding extends BaseBinding {
  type: 'light';
  haEntity: LightEntityId;
}

export interface DoorBinding extends BaseBinding {
  type: 'door';
  haEntity: EntityName;
  direction: DoorDirection;
  limitDeg: number;
}

export interface ClimateBinding extends BaseBinding {
  type: 'climate';
  haEntity: EntityName;
}

export interface AlarmBinding extends BaseBinding {
  type: 'alarm';
  haEntity: EntityName;
}

export interface PresenceBinding extends BaseBinding {
  type: 'presence';
  haEntity: EntityName;
}

export type ModelBinding = LightBinding | DoorBinding | ClimateBinding | AlarmBinding | PresenceBinding;

export interface UpperFloorConfig {
  modelUrl: string;
  yOffset: number;
}

export interface FloorStackViewerProps {
  groundFloorUrl: string;
  upperFloors: UpperFloorConfig[];
  startY?: number;
  cameraPosition?: [number, number, number];
}

export const defaultCameraPositions: { defaultView: string; floor: string; isometric: [number, number, number] }[] = [
  {
    defaultView: 'Living Room',
    floor: 'Ground Floor',
    isometric: [12, 13, 3],
  },
  {
    defaultView: 'Outside Front',
    floor: 'Ground Floor',
    isometric: [25, 12, 5],
  },
  {
    defaultView: 'Outside Back',
    floor: 'Ground Floor',
    isometric: [-25, 12, -5],
  },
  {
    defaultView: 'Kitchen',
    floor: 'Ground Floor',
    isometric: [-5, 13, 11],
  },
];

interface BindingStorageV1 {
  version: 1;
  bindings: ModelBinding[];
}

export const MODEL_BINDINGS_STORAGE_KEY = 'ha.floorViewer.modelBindings.v1';

export function loadBindingsFromStorage(): ModelBinding[] {
  try {
    const raw = localStorage.getItem(MODEL_BINDINGS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<BindingStorageV1>;
    if (parsed.version !== 1 || !Array.isArray(parsed.bindings)) return [];
    return parsed.bindings;
  } catch {
    return [];
  }
}

export function saveBindingsToStorage(bindings: ModelBinding[]): void {
  const payload: BindingStorageV1 = { version: 1, bindings };
  localStorage.setItem(MODEL_BINDINGS_STORAGE_KEY, JSON.stringify(payload));
}

export function upsertBinding(bindings: ModelBinding[], next: ModelBinding): ModelBinding[] {
  return [...bindings.filter(b => b.modelPartName !== next.modelPartName), next];
}

export function removeBinding(bindings: ModelBinding[], modelPartName: string): ModelBinding[] {
  const target = modelPartName.trim().toLowerCase();
  return bindings.filter(binding => binding.modelPartName.trim().toLowerCase() !== target);
}
