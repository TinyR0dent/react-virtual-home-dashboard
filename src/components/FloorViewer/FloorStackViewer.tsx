import { Component, Suspense, useRef, useCallback, useState, useEffect, useMemo, type MutableRefObject, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Html } from '@react-three/drei';
import { useAreas, useHass } from '@hakit/core';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import * as THREE from 'three';
import DoorOpen from './Actions/DoorOpen';
import LightOn from './Actions/LightOn';
import RoomPresence from './Actions/RoomPresence';
import { ObjectConfigPopup, type ObjectConfigPopupProps } from '../ui-components/ObjectConfigPopup';
import {
  loadViewerLightingSettings,
  mapAmbientLevelToSceneLighting,
  ROOM_ICON_COLORS,
  ROOM_ICON_KEYS,
  saveViewerLightingSettings,
  VIEWER_LIGHTING_CHANGED_EVENT,
  VIEWER_LIGHTING_STORAGE_KEY,
  type RoomIconColor,
  type RoomIconKey,
  type RoomPopupAppearance,
  type ViewerLightingSettings,
} from './lighting';
import {
  defaultCameraPositions,
  loadBindingsFromStorage,
  removeBinding,
  saveBindingsToStorage,
  type DoorBinding,
  type FloorStackViewerProps,
  type LightBinding,
  type ModelBinding,
  type PresenceBinding,
  upsertBinding,
} from './bindings';
import { doorAliases, lightAliases, presenceAliases } from './aliases';
import { ROOM_ICON_BY_KEY, RoomInfoPopup } from '../ui-components/RoomViewPopup';

useGLTF.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

function resolveModelLoadUrl(url: string): string {
  if (!url.startsWith('/local/')) return url;
  return url.split('#')[0].split('?')[0];
}

function ControlsHint() {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    setIsTouch(window.matchMedia('(hover: none) and (pointer: coarse)').matches);
  }, []);

  const hints = isTouch
    ? [
        { keys: 'Drag', action: 'Rotate' },
        { keys: 'Pinch', action: 'Zoom' },
        { keys: 'Up/Down', action: 'Switch floors' },
        { keys: 'Tap Part', action: 'Configure' },
      ]
    : [
        { keys: 'Drag', action: 'Rotate' },
        { keys: 'Scroll', action: 'Zoom' },
        { keys: 'Shift + Scroll', action: 'Switch floors' },
        { keys: 'Click Part', action: 'Configure' },
        { keys: 'Reset', action: 'Reset view' },
      ];

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 0,
        background: 'rgba(0,0,0,0.45)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 24,
        padding: '6px 14px',
        zIndex: 200,
        pointerEvents: 'none',
        userSelect: 'none',
        whiteSpace: 'nowrap',
      }}
    >
      {hints.map((h, i) => (
        <span
          key={h.action}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: 11,
            color: 'rgba(255,255,255,0.55)',
          }}
        >
          {i > 0 && <span style={{ margin: '0 8px', opacity: 0.25, fontSize: 10 }}>|</span>}
          <kbd
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 10,
              fontFamily: 'inherit',
              color: 'rgba(255,255,255,0.8)',
            }}
          >
            {h.keys}
          </kbd>
          <span>{h.action}</span>
        </span>
      ))}
    </div>
  );
}

function InteractiveFloor({
  url,
  finalY,
  startY,
  progress,
  revealStart,
  revealEnd,
  bindings,
  onModelPartClick,
  onAreaMarkerClick,
  showRoomMarkers,
  roomAppearanceByArea,
  enableHoverHighlights,
}: {
  url: string;
  finalY: number;
  startY: number;
  progress: { value: number };
  revealStart: number;
  revealEnd: number;
  bindings: ModelBinding[];
  onModelPartClick: (partName: string, candidatePartNames: string[]) => void;
  onAreaMarkerClick: (areaId: string, areaName: string) => void;
  showRoomMarkers: boolean;
  roomAppearanceByArea: Record<string, RoomAppearance>;
  enableHoverHighlights: boolean;
}) {
  const resolvedUrl = useMemo(() => resolveModelLoadUrl(url), [url]);
  const gltf = useGLTF(resolvedUrl);
  const floorGltf = useMemo(() => ({ ...gltf, scene: gltf.scene.clone(true) }), [gltf]);
  const floorNodes = useMemo(() => {
    const nodes: Record<string, THREE.Object3D> = {};
    floorGltf.scene.traverse(object => {
      if (!object.name) return;
      if (nodes[object.name]) return;
      nodes[object.name] = object;
    });
    return nodes;
  }, [floorGltf]);
  const actionGltf = useMemo(() => ({ ...floorGltf, nodes: floorNodes }), [floorGltf, floorNodes]);
  const groupRef = useRef<THREE.Group>(null);
  const hoveredGroupRef = useRef<THREE.Object3D | null>(null);

  useFrame(() => {
    if (groupRef.current) {
      if (revealEnd <= revealStart) {
        groupRef.current.position.y = finalY;
        return;
      }

      const t = THREE.MathUtils.clamp((progress.value - revealStart) / (revealEnd - revealStart), 0, 1);
      groupRef.current.position.y = THREE.MathUtils.lerp(startY, finalY, t);
    }
  });

  const doorBindings = bindings.filter(
    (binding): binding is DoorBinding => binding.type === 'door' && Boolean(floorNodes[binding.modelPartName])
  );
  const lightBindings = bindings.filter(
    (binding): binding is LightBinding => binding.type === 'light' && Boolean(floorNodes[binding.modelPartName])
  );
  const presenceBindings = bindings.filter(
    (binding): binding is PresenceBinding => binding.type === 'presence' && Boolean(floorNodes[binding.modelPartName])
  );

  const roomAnchors = useMemo(() => {
    if (!showRoomMarkers)
      return [] as Array<{ areaId: string; areaName: string; position: [number, number, number]; appearance: RoomAppearance }>;

    const grouped = new Map<string, { areaId: string; areaName: string; points: THREE.Vector3[] }>();
    for (const binding of bindings) {
      const node = floorNodes[binding.modelPartName];
      if (!node) continue;

      const existing = grouped.get(binding.areaId) ?? { areaId: binding.areaId, areaName: binding.areaName, points: [] };
      existing.points.push(node.position.clone());
      grouped.set(binding.areaId, existing);
    }

    return [...grouped.values()]
      .filter(group => group.points.length > 0)
      .map(group => {
        const sum = group.points.reduce((acc, point) => acc.add(point), new THREE.Vector3(0, 0, 0));
        const center = sum.multiplyScalar(1 / group.points.length);
        return {
          areaId: group.areaId,
          areaName: group.areaName,
          position: [center.x, center.y + 0.22, center.z] as [number, number, number],
          appearance: roomAppearanceByArea[group.areaId] ?? {},
        };
      });
  }, [bindings, floorNodes, roomAppearanceByArea, showRoomMarkers]);

  const matchesAlias = (partName: string) => {
    const aliasSet = new Set(
      [...doorAliases, ...lightAliases, ...presenceAliases].flatMap(alias => {
        const lower = alias.toLowerCase();
        return [lower, `${lower}s`];
      })
    );

    const tokens = partName
      .toLowerCase()
      .split(/[\s_.-]+/)
      .filter(Boolean);

    return tokens.some(token => {
      if (aliasSet.has(token)) return true;
      if (token.endsWith('s')) {
        return aliasSet.has(token.slice(0, -1));
      }
      return false;
    });
  };

  const getAliasMatchFromObject = (object: THREE.Object3D | null): { partName: string; group: THREE.Object3D } | null => {
    let cursor: THREE.Object3D | null = object;
    while (cursor) {
      if (cursor.name && matchesAlias(cursor.name)) {
        // Prefer the closest alias-matching ancestor to preserve room-level identity.
        return { partName: cursor.name, group: cursor };
      }

      cursor = cursor.parent;
    }

    return null;
  };

  const clearHighlight = () => {
    const group = hoveredGroupRef.current;
    if (!group) {
      document.body.style.cursor = 'default';
      return;
    }

    group.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;

      const originalMaterial = mesh.userData.__hoverOriginalMaterial as THREE.Material | THREE.Material[] | undefined;
      if (originalMaterial) {
        mesh.material = originalMaterial;
        delete mesh.userData.__hoverOriginalMaterial;
      }
    });

    hoveredGroupRef.current = null;
    document.body.style.cursor = 'default';
  };

  const setHighlight = (group: THREE.Object3D) => {
    if (hoveredGroupRef.current === group) return;
    clearHighlight();

    group.traverse(object => {
      const mesh = object as THREE.Mesh;
      if (!mesh.isMesh) return;

      const originalMaterial = mesh.material as THREE.Material | THREE.Material[];
      mesh.userData.__hoverOriginalMaterial = originalMaterial;

      const clonedMaterial = Array.isArray(originalMaterial)
        ? originalMaterial.map(material => material.clone())
        : originalMaterial.clone();
      mesh.material = clonedMaterial;

      const material = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
      const highlightMaterial = (mat: THREE.MeshStandardMaterial) => {
        if (!mat.emissive) return;
        mat.emissive.set('#6ec5ff');
        mat.emissiveIntensity = Math.max(0.9, mat.emissiveIntensity);
      };

      if (Array.isArray(material)) {
        material.forEach(highlightMaterial);
      } else {
        highlightMaterial(material);
      }
    });

    hoveredGroupRef.current = group;
    document.body.style.cursor = 'pointer';
  };

  const handlePartClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (event.delta > 4) return;

    const candidatePartNames: string[] = [];
    let cursor: THREE.Object3D | null = (event.object as THREE.Object3D) ?? null;
    while (cursor) {
      if (cursor.name) candidatePartNames.push(cursor.name);
      cursor = cursor.parent;
    }

    const hit = getAliasMatchFromObject((event.object as THREE.Object3D) ?? null);
    if (hit) {
      onModelPartClick(hit.group.name || hit.partName, candidatePartNames);
      return;
    }

    const partName = event.object?.name;
    if (!partName) return;
    onModelPartClick(partName, candidatePartNames);
  };

  const handlePartHover = (event: ThreeEvent<PointerEvent>) => {
    if (!enableHoverHighlights) {
      clearHighlight();
      return;
    }

    event.stopPropagation();

    const hit = getAliasMatchFromObject((event.object as THREE.Object3D) ?? null);
    if (!hit) {
      clearHighlight();
      return;
    }

    setHighlight(hit.group);
  };

  useEffect(() => {
    if (enableHoverHighlights) return;
    clearHighlight();
  }, [enableHoverHighlights]);

  useEffect(() => {
    return () => {
      clearHighlight();
    };
  }, []);

  return (
    <>
      {doorBindings.map(binding => (
        <DoorOpen
          key={`door-${binding.modelPartName}`}
          gltf={actionGltf}
          sensorId={binding.haEntity}
          doorName={binding.modelPartName}
          direction={binding.direction}
          limit={THREE.MathUtils.degToRad(binding.limitDeg)}
        />
      ))}

      {lightBindings.map(binding => (
        <LightOn
          key={`light-${binding.modelPartName}`}
          gltf={actionGltf}
          lightEntityId={binding.haEntity}
          lightObjectName={binding.modelPartName}
        />
      ))}

      {presenceBindings.map(binding => (
        <RoomPresence
          key={`presence-${binding.modelPartName}`}
          gltf={actionGltf}
          sensorId={binding.haEntity}
          floorName={binding.modelPartName}
        />
      ))}

      <group ref={groupRef}>
        <primitive
          object={floorGltf.scene}
          dispose={null}
          onClick={handlePartClick}
          onPointerOver={enableHoverHighlights ? handlePartHover : undefined}
          onPointerMove={enableHoverHighlights ? handlePartHover : undefined}
          onPointerOut={enableHoverHighlights ? clearHighlight : undefined}
        />

        {roomAnchors.map(anchor => (
          <Html key={`room-anchor-${anchor.areaId}`} position={anchor.position} center>
            {(() => {
              const key: RoomIconKey =
                anchor.appearance.iconKey && ROOM_ICON_KEYS.includes(anchor.appearance.iconKey) ? anchor.appearance.iconKey : 'home';
              const Icon = ROOM_ICON_BY_KEY[key];
              const markerColor =
                anchor.appearance.color &&
                ROOM_ICON_COLORS.includes(anchor.appearance.color.toUpperCase() as (typeof ROOM_ICON_COLORS)[number])
                  ? anchor.appearance.color.toUpperCase()
                  : '#3B82F6';
              return (
                <button
                  type='button'
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    onAreaMarkerClick(anchor.areaId, anchor.areaName);
                  }}
                  title={`Open ${anchor.areaName}`}
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: '999px',
                    border: '1px solid rgba(201, 231, 255, 0.88)',
                    background: `radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.36), ${markerColor})`,
                    color: 'white',
                    fontSize: 14,
                    lineHeight: 1,
                    display: 'grid',
                    placeItems: 'center',
                    boxShadow: '0 6px 18px rgba(0,0,0,0.4), 0 0 0 2px rgba(122, 198, 255, 0.28)',
                    cursor: 'pointer',
                  }}
                >
                  <Icon size={15} strokeWidth={2.2} />
                </button>
              );
            })()}
          </Html>
        ))}
      </group>
    </>
  );
}

function CameraResetter({
  cameraPosition,
  resetRef,
  onMovedChange,
  cameraPositionRef,
}: {
  cameraPosition: [number, number, number];
  resetRef: { reset: () => void };
  onMovedChange: (moved: boolean) => void;
  cameraPositionRef: MutableRefObject<[number, number, number]>;
}) {
  const { camera, controls } = useThree();

  useFrame(() => {
    cameraPositionRef.current = [camera.position.x, camera.position.y, camera.position.z];
    const moved = camera.position.distanceTo(new THREE.Vector3(...cameraPosition)) > 0.2;
    onMovedChange(moved);
  });

  resetRef.reset = () => {
    camera.position.set(...cameraPosition);
    const ctrl = controls as unknown as { target: THREE.Vector3; update: () => void } | undefined;
    if (ctrl) {
      ctrl.target.set(0, 2, 0);
      ctrl.update();
    }
  };
  return null;
}

class FloorErrorBoundary extends Component<
  { children: ReactNode; modelUrl: string; onModelError: (modelUrl: string, error: unknown) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError(err: unknown) {
    console.warn('[FloorStack] Floor model failed to load:', err);
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onModelError(this.props.modelUrl, error);
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function Loader() {
  return (
    <Html center>
      <div
        style={{
          width: 32,
          height: 32,
          border: '2px solid rgba(255,255,255,0.15)',
          borderTopColor: 'rgba(255,255,255,0.8)',
          borderRadius: '50%',
          animation: 'floor-spin 0.9s linear infinite',
        }}
      />
    </Html>
  );
}

function ScrollIndicator({
  progress,
  floorCount,
  activeFloorIndex,
  onSeekIndex,
  onReset,
}: {
  progress: number;
  floorCount: number;
  activeFloorIndex: number;
  onSeekIndex: (index: number) => void;
  onReset: () => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  const seekFromPointer = (e: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    const maxIndex = Math.max(0, floorCount - 1);
    const index = maxIndex === 0 ? 0 : Math.round(p * maxIndex);
    onSeekIndex(index);
  };

  const btnStyle: React.CSSProperties = {
    width: 36,
    height: 36,
    border: '1.5px solid rgba(255,255,255,0.25)',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.08)',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    userSelect: 'none',
    WebkitUserSelect: 'none',
    touchAction: 'none',
    backdropFilter: 'blur(6px)',
  };

  return (
    <div
      style={{
        position: 'fixed',
        right: 16,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        zIndex: 200,
        userSelect: 'none',
      }}
    >
      <button
        style={btnStyle}
        aria-label='Next floor'
        onClick={() => onSeekIndex(Math.min(floorCount - 1, activeFloorIndex + 1))}
        disabled={activeFloorIndex >= floorCount - 1}
      >
        <ChevronUp size={16} strokeWidth={2.2} />
      </button>

      <div
        ref={trackRef}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seekFromPointer(e);
        }}
        onPointerMove={e => {
          if (e.buttons !== 1) return;
          seekFromPointer(e);
        }}
        style={{
          position: 'relative',
          width: 36,
          height: 120,
          cursor: 'pointer',
          touchAction: 'none',
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            width: 2,
            height: '100%',
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 1,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: `${(1 - progress) * 100}%`,
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: 'white',
            boxShadow: '0 0 10px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
          }}
        />
      </div>

      <button
        style={btnStyle}
        aria-label='Previous floor'
        onClick={() => onSeekIndex(Math.max(0, activeFloorIndex - 1))}
        disabled={activeFloorIndex <= 0}
      >
        <ChevronDown size={16} strokeWidth={2.2} />
      </button>

      <button style={{ ...btnStyle, marginTop: 4, fontSize: 18 }} aria-label='Reset camera' onClick={onReset} title='Reset camera'>
        <RotateCcw size={15} strokeWidth={2.2} />
      </button>
    </div>
  );
}

type ViewerMode = 'edit' | 'view';

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

type RoomAppearance = RoomPopupAppearance;

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

export { type FloorModelConfig, type FloorStackViewerProps, defaultCameraPositions } from './bindings';

export function FloorStackViewer({ floors, startY = 40, cameraPosition = defaultCameraPositions[0].isometric }: FloorStackViewerProps) {
  console.log('FSV: start render');
  const connection = useHass(state => state.connection) as {
    sendMessagePromise: (message: Record<string, unknown>) => Promise<unknown>;
  } | null;
  const areas = useAreas() as AreaLike[];
  const scrollRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<{ reset: () => void }>({ reset: () => {} }).current;

  const floorCount = Math.max(1, floors.length);
  const maxFloorIndex = Math.max(0, floorCount - 1);
  const isMobileDevice = typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  console.log('FSV: useState bindings');
  const [bindings, setBindings] = useState<ModelBinding[]>(() => loadBindingsFromStorage());
  console.log('FSV: useState loadedRemote');
  const [hasLoadedRemote, setHasLoadedRemote] = useState(false);
  console.log('FSV: useState selectedModelPartName');
  const [selectedModelPartName, setSelectedModelPartName] = useState<string | null>(null);
  console.log('FSV: useState viewerMode');
  const [viewerMode, setViewerMode] = useState<ViewerMode>('edit');
  console.log('FSV: useState roomPopupArea');
  const [roomPopupArea, setRoomPopupArea] = useState<{ areaId: string } | null>(null);
  console.log('FSV: useState allRegistryEntityIds');
  const [allRegistryEntityIds, setAllRegistryEntityIds] = useState<string[]>([]);
  console.log('FSV: useState allEntityIds');
  const [allEntityIds, setAllEntityIds] = useState<string[]>([]);
  console.log('FSV: useState scrollProgress');
  const [scrollProgress, setScrollProgress] = useState(0);
  console.log('FSV: useState modelLoadErrors');
  const [modelLoadErrors, setModelLoadErrors] = useState<Record<string, string>>({});
  console.log('FSV: useState activeFloorIndex');
  const [activeFloorIndex, setActiveFloorIndex] = useState(() => {
    const settings = loadViewerLightingSettings();
    return Math.max(0, Math.min(maxFloorIndex, settings.defaultFloorIndex ?? 0));
  });
  console.log('FSV: useState lightingSettings');
  const [lightingSettings, setLightingSettings] = useState<ViewerLightingSettings>(() => loadViewerLightingSettings());
  console.log('FSV: useState hasMovedCamera');
  const [hasMovedCamera, setHasMovedCamera] = useState(false);
  console.log('FSV: useState loadedFloorCount');
  const [loadedFloorCount, setLoadedFloorCount] = useState<number>(() => {
    const settings = loadViewerLightingSettings();
    const defaultFloorIndex = Math.max(0, Math.min(maxFloorIndex, settings.defaultFloorIndex ?? 0));
    if (!isMobileDevice) return floorCount;
    // Keep initial mobile decode light but include adjacent floor to preserve reveal animations.
    return Math.max(1, Math.min(floorCount, defaultFloorIndex + 2));
  });

  const progress = useRef<{ value: number }>({ value: 0 }).current;
  const activeFloorIndexRef = useRef(0);
  const programmaticSeekRef = useRef(false);
  const seekRafRef = useRef<number | null>(null);
  const currentCameraPositionRef = useRef<[number, number, number]>(cameraPosition);
  const sceneLighting = useMemo(() => mapAmbientLevelToSceneLighting(lightingSettings.ambientLevel), [lightingSettings.ambientLevel]);
  const renderedFloors = useMemo(() => floors.slice(0, loadedFloorCount), [floors, loadedFloorCount]);
  const resolvedCameraPosition = useMemo<[number, number, number]>(() => {
    return lightingSettings.defaultCameraPosition ?? cameraPosition;
  }, [lightingSettings.defaultCameraPosition, cameraPosition]);

  const defaultFloorIndex = useMemo(
    () => Math.max(0, Math.min(maxFloorIndex, lightingSettings.defaultFloorIndex ?? 0)),
    [lightingSettings.defaultFloorIndex, maxFloorIndex]
  );

  const ensureFloorLoaded = useCallback(
    (index: number) => {
      const targetCount = Math.max(1, Math.min(floorCount, index + 1));
      setLoadedFloorCount(current => (current >= targetCount ? current : targetCount));
    },
    [floorCount]
  );

  useEffect(() => {
    const minimumLoaded = isMobileDevice ? Math.min(floorCount, defaultFloorIndex + 2) : floorCount;
    setLoadedFloorCount(current => {
      const bounded = Math.max(1, Math.min(current, floorCount));
      return Math.max(minimumLoaded, bounded);
    });
  }, [defaultFloorIndex, floorCount, isMobileDevice]);

  useEffect(() => {
    const targetIndex = defaultFloorIndex;
    ensureFloorLoaded(targetIndex);
    setActiveFloorIndex(targetIndex);

    const progressValue = maxFloorIndex === 0 ? 0 : targetIndex / maxFloorIndex;
    progress.value = progressValue;
    setScrollProgress(progressValue);

    const el = scrollRef.current;
    if (!el) return;
    const maxScrollable = Math.max(0, el.scrollHeight - el.clientHeight);
    programmaticSeekRef.current = true;
    el.scrollTo({ top: progressValue * maxScrollable, behavior: 'auto' });
    window.setTimeout(() => {
      programmaticSeekRef.current = false;
    }, 0);
  }, [defaultFloorIndex, ensureFloorLoaded, maxFloorIndex, progress]);

  useEffect(() => {
    return () => {
      if (seekRafRef.current !== null) {
        cancelAnimationFrame(seekRafRef.current);
      }
    };
  }, []);

  console.log('FSV: useEffect preload next floor');
  useEffect(() => {
    const nextFloor = floors[loadedFloorCount];
    if (!nextFloor) return;

    const preloadId = window.setTimeout(() => {
      useGLTF.preload(resolveModelLoadUrl(nextFloor.modelUrl));
    }, 140);

    return () => window.clearTimeout(preloadId);
  }, [floors, loadedFloorCount]);

  useEffect(() => {
    activeFloorIndexRef.current = activeFloorIndex;
  }, [activeFloorIndex]);

  useEffect(() => {
    const onLightingChanged = (event: Event) => {
      const customEvent = event as CustomEvent<ViewerLightingSettings>;
      if (customEvent.detail) {
        setLightingSettings(customEvent.detail);
      }
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key !== VIEWER_LIGHTING_STORAGE_KEY) return;
      setLightingSettings(loadViewerLightingSettings());
    };

    window.addEventListener(VIEWER_LIGHTING_CHANGED_EVENT, onLightingChanged as EventListener);
    window.addEventListener('storage', onStorage);

    return () => {
      window.removeEventListener(VIEWER_LIGHTING_CHANGED_EVENT, onLightingChanged as EventListener);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  console.log('FSV: useEffect save bindings to storage');
  useEffect(() => {
    saveBindingsToStorage(bindings);
  }, [bindings]);

  console.log('FSV: useEffect clean up model load errors');
  useEffect(() => {
    const knownUrls = new Set(floors.map(floor => floor.modelUrl));
    setModelLoadErrors(prev => {
      const next: Record<string, string> = {};
      for (const [url, message] of Object.entries(prev)) {
        if (knownUrls.has(url)) {
          next[url] = message;
        }
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [floors]);

  useEffect(() => {
    let cancelled = false;

    const loadRemoteBindings = async () => {
      if (!connection) {
        setHasLoadedRemote(true);
        return;
      }

      try {
        const result = (await connection.sendMessagePromise({
          type: 'ha_dashboard_persistence/load',
        })) as {
          bindings?: unknown;
          global_config?: {
            ambient_level?: unknown;
            default_floor_index?: unknown;
            default_camera_position?: unknown;
            room_popup_entities?: unknown;
            room_popup_appearance?: unknown;
          };
        };

        if (cancelled) return;

        if (Array.isArray(result?.bindings)) {
          // Remote payload is source of truth in Home Assistant mode.
          // This also clears stale browser-local bindings on fresh installs.
          setBindings(result.bindings as ModelBinding[]);
        }

        const ambientLevel = Number(result?.global_config?.ambient_level);
        const configuredDefaultFloorIndex = Number(result?.global_config?.default_floor_index);
        const configuredCameraPosition = result?.global_config?.default_camera_position;
        const configuredRoomPopupEntities = result?.global_config?.room_popup_entities;
        const configuredRoomPopupAppearance = result?.global_config?.room_popup_appearance;
        const nextRoomPopupEntities: Record<string, string[]> = {};
        if (configuredRoomPopupEntities && typeof configuredRoomPopupEntities === 'object') {
          for (const [areaId, entityIds] of Object.entries(configuredRoomPopupEntities as Record<string, unknown>)) {
            if (!Array.isArray(entityIds)) continue;
            const cleaned = entityIds
              .map(value => String(value).trim())
              .filter(Boolean)
              .filter((value, index, all) => all.indexOf(value) === index);
            if (cleaned.length > 0) {
              nextRoomPopupEntities[areaId] = cleaned;
            }
          }
        }
        const nextRoomPopupAppearance: Record<string, RoomAppearance> = {};
        if (configuredRoomPopupAppearance && typeof configuredRoomPopupAppearance === 'object') {
          for (const [areaId, raw] of Object.entries(configuredRoomPopupAppearance as Record<string, unknown>)) {
            if (!raw || typeof raw !== 'object') continue;
            const appearance = raw as Record<string, unknown>;
            const displayName = String(appearance.display_name ?? appearance.displayName ?? '')
              .trim()
              .slice(0, 40);
            const iconKey = String(appearance.icon_key ?? appearance.iconKey ?? '')
              .trim()
              .toLowerCase() as RoomIconKey;
            const color = String(appearance.color ?? '')
              .trim()
              .toUpperCase();

            const next: RoomAppearance = {};
            if (displayName) next.displayName = displayName;
            if (ROOM_ICON_KEYS.includes(iconKey)) next.iconKey = iconKey;
            if (ROOM_ICON_COLORS.includes(color as RoomIconColor)) next.color = color as RoomIconColor;
            if (Object.keys(next).length > 0) {
              nextRoomPopupAppearance[areaId] = next;
            }
          }
        }
        const isValidCameraPosition =
          Array.isArray(configuredCameraPosition) &&
          configuredCameraPosition.length === 3 &&
          configuredCameraPosition.every(value => Number.isFinite(Number(value)));
        setLightingSettings(prev => {
          const next: ViewerLightingSettings = {
            ambientLevel: Number.isFinite(ambientLevel) ? Math.max(0, Math.min(100, Math.round(ambientLevel))) : prev.ambientLevel,
            defaultFloorIndex: Number.isFinite(configuredDefaultFloorIndex)
              ? Math.max(0, Math.min(2, Math.round(configuredDefaultFloorIndex)))
              : prev.defaultFloorIndex,
            defaultCameraPosition: isValidCameraPosition
              ? [Number(configuredCameraPosition[0]), Number(configuredCameraPosition[1]), Number(configuredCameraPosition[2])]
              : prev.defaultCameraPosition,
            roomPopupEntities: nextRoomPopupEntities,
            roomPopupAppearance: nextRoomPopupAppearance,
          };
          saveViewerLightingSettings(next);
          return next;
        });
      } catch {
        // Integration may not be installed yet; keep local fallback silently.
      } finally {
        if (!cancelled) {
          setHasLoadedRemote(true);
        }
      }
    };

    void loadRemoteBindings();

    return () => {
      cancelled = true;
    };
  }, [connection]);

  console.log('FSV: useEffect save lighting settings to remote');
  useEffect(() => {
    if (!connection || !hasLoadedRemote) return;

    void connection
      .sendMessagePromise({
        type: 'ha_dashboard_persistence/save',
        version: 1,
        bindings,
        global_config: {
          ambient_level: lightingSettings.ambientLevel,
          default_floor_index: lightingSettings.defaultFloorIndex,
          default_camera_position: lightingSettings.defaultCameraPosition,
          room_popup_entities: lightingSettings.roomPopupEntities,
          room_popup_appearance: lightingSettings.roomPopupAppearance,
        },
      })
      .catch(() => {
        // Keep local storage as fallback if remote save fails.
      });
  }, [
    bindings,
    connection,
    hasLoadedRemote,
    lightingSettings.ambientLevel,
    lightingSettings.defaultCameraPosition,
    lightingSettings.defaultFloorIndex,
    lightingSettings.roomPopupEntities,
    lightingSettings.roomPopupAppearance,
  ]);

  const onScroll = useCallback(() => {
    if (programmaticSeekRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const maxScrollable = Math.max(0, el.scrollHeight - el.clientHeight);
    const p = maxScrollable === 0 ? 0 : Math.max(0, Math.min(1, el.scrollTop / maxScrollable));
    progress.value = p;
    setScrollProgress(p);
    const index = maxFloorIndex === 0 ? 0 : Math.round(p * maxFloorIndex);
    setActiveFloorIndex(index);
  }, [maxFloorIndex, progress]);

  const onSeekIndex = useCallback(
    (index: number) => {
      const el = scrollRef.current;
      if (!el) return;
      const clampedIndex = Math.max(0, Math.min(maxFloorIndex, index));
      ensureFloorLoaded(clampedIndex);
      const targetProgress = maxFloorIndex === 0 ? 0 : clampedIndex / maxFloorIndex;
      const startProgress = progress.value;
      const maxScrollable = Math.max(0, el.scrollHeight - el.clientHeight);

      if (seekRafRef.current !== null) {
        cancelAnimationFrame(seekRafRef.current);
      }

      programmaticSeekRef.current = true;
      const durationMs = 260;
      const startTime = performance.now();

      const animate = (now: number) => {
        const t = Math.max(0, Math.min(1, (now - startTime) / durationMs));
        const eased = 1 - Math.pow(1 - t, 3);
        const nextProgress = THREE.MathUtils.lerp(startProgress, targetProgress, eased);

        progress.value = nextProgress;
        setScrollProgress(nextProgress);
        const liveIndex = maxFloorIndex === 0 ? 0 : Math.round(nextProgress * maxFloorIndex);
        setActiveFloorIndex(liveIndex);
        el.scrollTop = nextProgress * maxScrollable;

        if (t < 1) {
          seekRafRef.current = requestAnimationFrame(animate);
          return;
        }

        programmaticSeekRef.current = false;
        setActiveFloorIndex(clampedIndex);
        seekRafRef.current = null;
      };

      seekRafRef.current = requestAnimationFrame(animate);
    },
    [ensureFloorLoaded, maxFloorIndex, progress]
  );

  const handleSetDefaultCameraView = useCallback(() => {
    const nextPosition = currentCameraPositionRef.current;
    setLightingSettings(prev => {
      const next: ViewerLightingSettings = {
        ...prev,
        defaultCameraPosition: [nextPosition[0], nextPosition[1], nextPosition[2]],
      };
      saveViewerLightingSettings(next);
      return next;
    });
    setHasMovedCamera(false);
  }, []);

  const handleReset = useCallback(() => {
    resetRef.reset();
  }, [resetRef]);

  console.log('FSV: useCallback handleSaveBinding');
  const handleSaveBinding: ObjectConfigPopupProps['onSave'] = useCallback(next => {
    setBindings(prev => upsertBinding(prev, next));
    setSelectedModelPartName(null);
  }, []);

  console.log('FSV: useCallback handleRemoveBinding');
  const handleRemoveBinding: ObjectConfigPopupProps['onRemove'] = useCallback(modelPartName => {
    setBindings(prev => removeBinding(prev, modelPartName));
    setSelectedModelPartName(null);
  }, []);

  console.log('FSV: useCallback handleClosePopup');
  const handleClosePopup = useCallback(() => {
    setSelectedModelPartName(null);
  }, []);

  const selectedBinding = selectedModelPartName ? bindings.find(binding => binding.modelPartName === selectedModelPartName) : undefined;

  const areaOptions = useMemo(() => areas.map(area => ({ areaId: area.area_id, areaName: area.name })), [areas]);
  const areaEntityIds = useMemo(
    () =>
      areas
        .flatMap(area => area.entities ?? [])
        .map(entity => entity.entity_id)
        .filter(Boolean)
        .filter(entityId => isDeviceEntityCandidate(entityId))
        .filter((entityId, index, all) => all.indexOf(entityId) === index),
    [areas]
  );
  console.log('FSV: useMemo areaOptions and areaEntityIds');
  const deviceEntityIdSet = useMemo(() => new Set(allEntityIds), [allEntityIds]);
  console.log('FSV: useMemo deviceEntityIdSet');
  const allKnownEntityIds = useMemo(() => {
    if (allEntityIds.length > 0) {
      return allEntityIds;
    }
    return areaEntityIds;
  }, [allEntityIds, areaEntityIds]);
  console.log('FSV: useMemo allKnownEntityIds');
  const selectedRoomPopupBaseAreaName = useMemo(() => {
    if (!roomPopupArea) return 'Room';
    return areaOptions.find(area => area.areaId === roomPopupArea.areaId)?.areaName ?? roomPopupArea.areaId;
  }, [areaOptions, roomPopupArea]);
  console.log('FSV: useMemo selectedRoomPopupBaseAreaName');
  const selectedRoomPopupAppearance = useMemo<RoomAppearance>(() => {
    if (!roomPopupArea) return {};
    return lightingSettings.roomPopupAppearance[roomPopupArea.areaId] ?? {};
  }, [lightingSettings.roomPopupAppearance, roomPopupArea]);
  console.log('FSV: useMemo selectedRoomPopupAppearance');
  const selectedRoomPopupAreaName = useMemo(() => {
    return selectedRoomPopupAppearance.displayName?.trim() || selectedRoomPopupBaseAreaName;
  }, [selectedRoomPopupAppearance.displayName, selectedRoomPopupBaseAreaName]);
  console.log('FSV: useMemo selectedRoomPopupAreaName');
  const selectedRoomPopupConfiguredEntityIds = useMemo(() => {
    if (!roomPopupArea) return [] as string[];

    return bindings
      .filter(binding => binding.areaId === roomPopupArea.areaId)
      .map(binding => binding.haEntity)
      .filter((entityId, index, all) => all.indexOf(entityId) === index);
  }, [bindings, roomPopupArea]);
  console.log('FSV: useMemo selectedRoomPopupConfiguredEntityIds');

  const persistRemoteState = useCallback(async () => {
    if (!connection || !hasLoadedRemote) return;

    await connection.sendMessagePromise({
      type: 'ha_dashboard_persistence/save',
      version: 1,
      bindings,
      global_config: {
        ambient_level: lightingSettings.ambientLevel,
        default_floor_index: lightingSettings.defaultFloorIndex,
        default_camera_position: lightingSettings.defaultCameraPosition,
        room_popup_entities: lightingSettings.roomPopupEntities,
        room_popup_appearance: lightingSettings.roomPopupAppearance,
      },
    });
  }, [bindings, connection, hasLoadedRemote, lightingSettings]);
  console.log('FSV: useCallback persistRemoteState');
  const handleSaveEdits = useCallback(() => {
    void persistRemoteState().catch(() => {
      // Keep local storage as fallback if remote save fails.
    });
  }, [persistRemoteState]);
  console.log('FSV: useCallback handleSaveEdits');

  const handleModelLoadError = useCallback((modelUrl: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setModelLoadErrors(prev => {
      if (prev[modelUrl] === message) return prev;
      return { ...prev, [modelUrl]: message };
    });
  }, []);
  console.log('FSV: useCallback handleModelLoadError');

  const resolveBindingFromCandidates = useCallback(
    (partName: string, candidatePartNames: string[]) => {
      const normalizedChain = [partName, ...candidatePartNames]
        .map(name => name.trim().toLowerCase())
        .filter(Boolean)
        .filter((value, index, all) => all.indexOf(value) === index);

      for (const candidateName of normalizedChain) {
        const hit = bindings.find(binding => binding.modelPartName.trim().toLowerCase() === candidateName);
        if (hit) return hit;
      }

      return undefined;
    },
    [bindings]
  );
  console.log('FSV: useCallback resolveBindingFromCandidates');

  const openRoomPopupByAreaId = useCallback((areaId: string) => {
    setRoomPopupArea({ areaId });
    setSelectedModelPartName(null);
  }, []);
  console.log('FSV: useCallback openRoomPopupByAreaId');

  const handleModelPartClick = useCallback(
    (partName: string, candidatePartNames: string[]) => {
      const hitBinding = resolveBindingFromCandidates(partName, candidatePartNames);

      if (viewerMode === 'edit') {
        setSelectedModelPartName(candidatePartNames[0] ?? partName);
        return;
      }

      if (!hitBinding) return;

      openRoomPopupByAreaId(hitBinding.areaId);
    },
    [openRoomPopupByAreaId, resolveBindingFromCandidates, viewerMode]
  );
  console.log('FSV: useCallback handleModelPartClick');

  const getRoomPopupEntityIds = useCallback(
    (areaId: string, configuredEntityIds: string[]) => {
      const override = lightingSettings.roomPopupEntities[areaId];
      if (Array.isArray(override)) return override;
      return configuredEntityIds;
    },
    [lightingSettings.roomPopupEntities]
  );
  console.log('FSV: useCallback getRoomPopupEntityIds');

  const handleRoomPopupAddEntity = useCallback(
    (entityId: string) => {
      if (!roomPopupArea) return;

      setLightingSettings(prev => {
        const base = prev.roomPopupEntities[roomPopupArea.areaId] ?? selectedRoomPopupConfiguredEntityIds;
        const nextRoomEntities = [...base, entityId].filter((value, index, all) => all.indexOf(value) === index);
        const next = {
          ...prev,
          roomPopupEntities: {
            ...prev.roomPopupEntities,
            [roomPopupArea.areaId]: nextRoomEntities,
          },
        };
        saveViewerLightingSettings(next);
        return next;
      });
    },
    [roomPopupArea, selectedRoomPopupConfiguredEntityIds]
  );
  console.log('FSV: useCallback handleRoomPopupAddEntity');

  const handleRoomPopupRemoveEntity = useCallback(
    (entityId: string) => {
      if (!roomPopupArea) return;

      setLightingSettings(prev => {
        const base = prev.roomPopupEntities[roomPopupArea.areaId] ?? selectedRoomPopupConfiguredEntityIds;
        const nextRoomEntities = base.filter(value => value !== entityId);
        const next = {
          ...prev,
          roomPopupEntities: {
            ...prev.roomPopupEntities,
            [roomPopupArea.areaId]: nextRoomEntities,
          },
        };
        saveViewerLightingSettings(next);
        return next;
      });
    },
    [roomPopupArea, selectedRoomPopupConfiguredEntityIds]
  );
  console.log('FSV: useCallback handleRoomPopupRemoveEntity');

  const handleRoomPopupReset = useCallback(() => {
    if (!roomPopupArea) return;

    setLightingSettings(prev => {
      const nextRoomPopupEntities = { ...prev.roomPopupEntities };
      delete nextRoomPopupEntities[roomPopupArea.areaId];
      const nextRoomPopupAppearance = { ...prev.roomPopupAppearance };
      delete nextRoomPopupAppearance[roomPopupArea.areaId];
      const next = {
        ...prev,
        roomPopupEntities: nextRoomPopupEntities,
        roomPopupAppearance: nextRoomPopupAppearance,
      };
      saveViewerLightingSettings(next);
      return next;
    });
  }, [roomPopupArea]);
  console.log('FSV: useCallback handleRoomPopupReset');

  const updateRoomPopupAppearance = useCallback((areaId: string, updater: (current: RoomAppearance) => RoomAppearance) => {
    setLightingSettings(prev => {
      const current = prev.roomPopupAppearance[areaId] ?? {};
      const nextForArea = updater(current);
      const nextRoomPopupAppearance = { ...prev.roomPopupAppearance };
      if (Object.keys(nextForArea).length === 0) {
        delete nextRoomPopupAppearance[areaId];
      } else {
        nextRoomPopupAppearance[areaId] = nextForArea;
      }
      const next = {
        ...prev,
        roomPopupAppearance: nextRoomPopupAppearance,
      };
      saveViewerLightingSettings(next);
      return next;
    });
  }, []);
  console.log('FSV: useCallback updateRoomPopupAppearance');

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
        // Keep fallback area entities when registry query fails.
      }
    };

    void loadAllEntities();

    return () => {
      cancelled = true;
    };
  }, [connection]);

  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const direction = e.deltaY > 0 ? 1 : -1;
      onSeekIndex(activeFloorIndexRef.current + direction);
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, [onSeekIndex]);

  console.log('FSV: rendering ObjectConfigPopup, open =', viewerMode === 'edit' && selectedModelPartName !== null);
  console.log('FSV: rendering RoomInfoPopup, open =', viewerMode === 'view' && roomPopupArea !== null);

  return (
    <>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={{
          position: 'fixed',
          inset: 0,
          overflowY: 'scroll',
          scrollSnapType: 'y mandatory',
          scrollbarWidth: 'none',
        }}
      >
        <div
          style={{
            position: 'sticky',
            top: 0,
            height: 0,
            overflow: 'visible',
          }}
        >
          <div style={{ height: '100svh' }}>
            <Canvas
              camera={{ position: resolvedCameraPosition, fov: 45 }}
              shadows
              style={{ touchAction: 'pan-y' }}
              gl={{
                antialias: true,
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: sceneLighting.exposure,
              }}
            >
              <color attach='background' args={['#0d1117']} />

              <Suspense fallback={<Loader />}>
                <Environment preset='apartment' background={false} environmentIntensity={sceneLighting.environmentIntensity} />

                {renderedFloors.map((floor, i) => (
                  <FloorErrorBoundary key={`${i}-${floor.modelUrl}`} modelUrl={floor.modelUrl} onModelError={handleModelLoadError}>
                    <InteractiveFloor
                      url={floor.modelUrl}
                      finalY={floor.yOffset}
                      startY={startY}
                      progress={progress}
                      revealStart={i === 0 || maxFloorIndex === 0 ? 0 : (i - 1) / maxFloorIndex}
                      revealEnd={i === 0 || maxFloorIndex === 0 ? 0 : i / maxFloorIndex}
                      bindings={bindings}
                      onModelPartClick={handleModelPartClick}
                      onAreaMarkerClick={(areaId, _areaName) => openRoomPopupByAreaId(areaId)}
                      showRoomMarkers={viewerMode === 'view' && i === activeFloorIndex}
                      roomAppearanceByArea={lightingSettings.roomPopupAppearance}
                      enableHoverHighlights={viewerMode === 'edit'}
                    />
                  </FloorErrorBoundary>
                ))}
                <CameraResetter
                  cameraPosition={resolvedCameraPosition}
                  resetRef={resetRef}
                  onMovedChange={setHasMovedCamera}
                  cameraPositionRef={currentCameraPositionRef}
                />
              </Suspense>

              <OrbitControls
                makeDefault
                target={[0, 2, 0]}
                enablePan={false}
                enableZoom
                touches={{ ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_ROTATE }}
                minPolarAngle={0}
                maxPolarAngle={Math.PI / 2.1}
                rotateSpeed={0.7}
                dampingFactor={0.06}
                enableDamping
              />
            </Canvas>
          </div>
        </div>

        {Array.from({ length: floorCount }, (_, index) => (
          <div
            key={index}
            aria-hidden='true'
            style={{
              height: '100svh',
              scrollSnapAlign: 'start',
              scrollSnapStop: 'always',
              pointerEvents: 'none',
            }}
          />
        ))}

        <ScrollIndicator
          progress={scrollProgress}
          floorCount={floorCount}
          activeFloorIndex={activeFloorIndex}
          onSeekIndex={onSeekIndex}
          onReset={handleReset}
        />

        <div
          style={{
            position: 'fixed',
            left: 14,
            top: 70,
            zIndex: 220,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
          }}
        >
          <button
            type='button'
            onClick={() => {
              setViewerMode('edit');
              setRoomPopupArea(null);
            }}
            style={{
              border: viewerMode === 'edit' ? '1px solid rgba(89,183,255,0.55)' : '1px solid rgba(255,255,255,0.24)',
              background: viewerMode === 'edit' ? 'rgba(89,183,255,0.22)' : 'rgba(0,0,0,0.5)',
              color: 'white',
              borderRadius: 8,
              padding: '7px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Edit Mode
          </button>
          <button
            type='button'
            onClick={() => {
              setViewerMode('view');
              setSelectedModelPartName(null);
            }}
            style={{
              border: viewerMode === 'view' ? '1px solid rgba(89,183,255,0.55)' : '1px solid rgba(255,255,255,0.24)',
              background: viewerMode === 'view' ? 'rgba(89,183,255,0.22)' : 'rgba(0,0,0,0.5)',
              color: 'white',
              borderRadius: 8,
              padding: '7px 10px',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            View Mode
          </button>
          {viewerMode === 'edit' && (
            <button
              type='button'
              onClick={handleSaveEdits}
              style={{
                border: '1px solid rgba(126,232,166,0.5)',
                background: 'rgba(126,232,166,0.2)',
                color: '#e8fff0',
                borderRadius: 8,
                padding: '7px 10px',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Save Edits
            </button>
          )}
        </div>

        {hasMovedCamera && (
          <button
            type='button'
            onClick={handleSetDefaultCameraView}
            style={{
              position: 'fixed',
              right: 64,
              bottom: 84,
              zIndex: 210,
              border: '1px solid rgba(255,255,255,0.24)',
              borderRadius: 10,
              background: 'rgba(10,14,18,0.78)',
              color: 'rgba(255,255,255,0.92)',
              padding: '8px 12px',
              fontSize: 12,
              cursor: 'pointer',
              backdropFilter: 'blur(8px)',
            }}
          >
            Set Default Camera View
          </button>
        )}

        <ControlsHint />

        {Object.keys(modelLoadErrors).length > 0 && (
          <div
            role='alert'
            style={{
              position: 'fixed',
              left: 14,
              bottom: 74,
              zIndex: 240,
              width: 'min(860px, calc(100vw - 28px))',
              maxHeight: '42vh',
              overflow: 'auto',
              border: '1px solid rgba(255, 140, 140, 0.45)',
              borderRadius: 10,
              background: 'rgba(43, 9, 9, 0.92)',
              color: '#ffe7e7',
              padding: '10px 12px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
              backdropFilter: 'blur(7px)',
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>One or more floor models failed to load.</div>
            <div style={{ fontSize: 12, marginBottom: 8, color: 'rgba(255, 230, 230, 0.9)' }}>
              Verify the file path exists in Home Assistant under /www and is referenced as /local/... in integration settings.
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {Object.entries(modelLoadErrors).map(([url, message]) => (
                <div
                  key={url}
                  style={{
                    border: '1px solid rgba(255,255,255,0.18)',
                    borderRadius: 8,
                    padding: '8px 10px',
                    background: 'rgba(0,0,0,0.26)',
                  }}
                >
                  <div style={{ fontSize: 11, color: 'rgba(255, 210, 210, 0.95)', wordBreak: 'break-all' }}>{url}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255, 239, 239, 0.85)', marginTop: 4, wordBreak: 'break-word' }}>{message}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <ObjectConfigPopup
        open={viewerMode === 'edit' && selectedModelPartName !== null}
        modelPartName={selectedModelPartName ?? ''}
        existingBinding={selectedBinding}
        onSave={handleSaveBinding}
        onRemove={handleRemoveBinding}
        onClose={handleClosePopup}
      />

      <RoomInfoPopup
        open={viewerMode === 'view' && roomPopupArea !== null}
        baseAreaName={selectedRoomPopupBaseAreaName}
        areaName={selectedRoomPopupAreaName}
        roomAppearance={selectedRoomPopupAppearance}
        availableAreas={areaOptions}
        selectedAreaId={roomPopupArea?.areaId ?? null}
        entityIds={roomPopupArea ? getRoomPopupEntityIds(roomPopupArea.areaId, selectedRoomPopupConfiguredEntityIds) : []}
        availableEntityIds={
          roomPopupArea
            ? (areas.find(area => area.area_id === roomPopupArea.areaId)?.entities ?? [])
                .map(entity => entity.entity_id)
                .filter(entityId => isDeviceEntityCandidate(entityId))
                .filter(entityId => (allEntityIds.length === 0 ? true : deviceEntityIdSet.has(entityId)))
            : []
        }
        allAvailableEntityIds={allKnownEntityIds}
        allRegistryEntityIds={allRegistryEntityIds}
        onSelectAreaId={areaId => setRoomPopupArea({ areaId })}
        onChangeDisplayName={displayName => {
          if (!roomPopupArea) return;
          const normalized = displayName.trim();
          updateRoomPopupAppearance(roomPopupArea.areaId, current => ({
            ...current,
            displayName: normalized || undefined,
          }));
        }}
        onChangeIconKey={iconKey => {
          if (!roomPopupArea) return;
          updateRoomPopupAppearance(roomPopupArea.areaId, current => ({ ...current, iconKey }));
        }}
        onChangeColor={color => {
          if (!roomPopupArea) return;
          updateRoomPopupAppearance(roomPopupArea.areaId, current => ({ ...current, color }));
        }}
        onAdd={handleRoomPopupAddEntity}
        onRemove={handleRoomPopupRemoveEntity}
        onReset={handleRoomPopupReset}
        onClose={() => setRoomPopupArea(null)}
      />
    </>
  );
}
