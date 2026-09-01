import { Component, Suspense, useRef, useCallback, useState, useEffect, useMemo, type MutableRefObject, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Html } from '@react-three/drei';
import { useHass } from '@hakit/core';
import * as THREE from 'three';
import DoorOpen from './Actions/DoorOpen';
import LightOn from './Actions/LightOn';
import RoomPresence from './Actions/RoomPresence';
import { ObjectConfigPopup, type ObjectConfigPopupProps } from '../ui-components/ObjectConfigPopup';
import {
  loadViewerLightingSettings,
  mapAmbientLevelToSceneLighting,
  saveViewerLightingSettings,
  VIEWER_LIGHTING_CHANGED_EVENT,
  VIEWER_LIGHTING_STORAGE_KEY,
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

useGLTF.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

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
}: {
  url: string;
  finalY: number;
  startY: number;
  progress: { value: number };
  revealStart: number;
  revealEnd: number;
  bindings: ModelBinding[];
  onModelPartClick: (partName: string) => void;
}) {
  const gltf = useGLTF(url);
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

  const doorBindings = bindings.filter((binding): binding is DoorBinding => binding.type === 'door');
  const lightBindings = bindings.filter((binding): binding is LightBinding => binding.type === 'light');
  const presenceBindings = bindings.filter((binding): binding is PresenceBinding => binding.type === 'presence');

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
    let matched: { partName: string; group: THREE.Object3D } | null = null;

    while (cursor) {
      if (cursor.name && matchesAlias(cursor.name)) {
        // Prefer the highest alias-matching ancestor so grouped fixtures are treated as one object.
        matched = { partName: cursor.name, group: cursor };
      }

      cursor = cursor.parent;
    }

    return matched;
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

    const hit = getAliasMatchFromObject((event.object as THREE.Object3D) ?? null);
    if (hit) {
      onModelPartClick(hit.group.name || hit.partName);
      return;
    }

    const partName = event.object?.name;
    if (!partName) return;
    onModelPartClick(partName);
  };

  const handlePartHover = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();

    const hit = getAliasMatchFromObject((event.object as THREE.Object3D) ?? null);
    if (!hit) {
      clearHighlight();
      return;
    }

    setHighlight(hit.group);
  };

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
          onPointerOver={handlePartHover}
          onPointerMove={handlePartHover}
          onPointerOut={clearHighlight}
        />
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

class FloorErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(err: unknown) {
    console.warn('[FloorStack] Floor model failed to load:', err);
    return { failed: true };
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
        +
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
        -
      </button>

      <button style={{ ...btnStyle, marginTop: 4, fontSize: 18 }} aria-label='Reset camera' onClick={onReset} title='Reset camera'>
        R
      </button>
    </div>
  );
}

export { type FloorModelConfig, type FloorStackViewerProps, defaultCameraPositions } from './bindings';

export function FloorStackViewer({ floors, startY = 40, cameraPosition = defaultCameraPositions[0].isometric }: FloorStackViewerProps) {
  const connection = useHass(state => state.connection) as {
    sendMessagePromise: (message: Record<string, unknown>) => Promise<unknown>;
  } | null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<{ reset: () => void }>({ reset: () => {} }).current;

  const floorCount = Math.max(1, floors.length);
  const maxFloorIndex = Math.max(0, floorCount - 1);
  const isMobileDevice = typeof window !== 'undefined' && window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  const [bindings, setBindings] = useState<ModelBinding[]>(() => loadBindingsFromStorage());
  const [hasLoadedRemote, setHasLoadedRemote] = useState(false);
  const [selectedModelPartName, setSelectedModelPartName] = useState<string | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [activeFloorIndex, setActiveFloorIndex] = useState(() => {
    const settings = loadViewerLightingSettings();
    return Math.max(0, Math.min(maxFloorIndex, settings.defaultFloorIndex ?? 0));
  });
  const [lightingSettings, setLightingSettings] = useState<ViewerLightingSettings>(() => loadViewerLightingSettings());
  const [hasMovedCamera, setHasMovedCamera] = useState(false);
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

  useEffect(() => {
    const nextFloor = floors[loadedFloorCount];
    if (!nextFloor) return;

    const preloadId = window.setTimeout(() => {
      useGLTF.preload(nextFloor.modelUrl);
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

  useEffect(() => {
    saveBindingsToStorage(bindings);
  }, [bindings]);

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
          global_config?: { ambient_level?: unknown; default_floor_index?: unknown; default_camera_position?: unknown };
        };

        if (cancelled) return;

        if (Array.isArray(result?.bindings)) {
          if (result.bindings.length > 0) {
            setBindings(result.bindings as ModelBinding[]);
          }
        }

        const ambientLevel = Number(result?.global_config?.ambient_level);
        const configuredDefaultFloorIndex = Number(result?.global_config?.default_floor_index);
        const configuredCameraPosition = result?.global_config?.default_camera_position;
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

  const handleSaveBinding: ObjectConfigPopupProps['onSave'] = useCallback(next => {
    setBindings(prev => upsertBinding(prev, next));
    setSelectedModelPartName(null);
  }, []);

  const handleRemoveBinding: ObjectConfigPopupProps['onRemove'] = useCallback(modelPartName => {
    setBindings(prev => removeBinding(prev, modelPartName));
    setSelectedModelPartName(null);
  }, []);

  const handleClosePopup = useCallback(() => {
    setSelectedModelPartName(null);
  }, []);

  const selectedBinding = selectedModelPartName ? bindings.find(binding => binding.modelPartName === selectedModelPartName) : undefined;

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
                  <FloorErrorBoundary key={`${i}-${floor.modelUrl}`}>
                    <InteractiveFloor
                      url={floor.modelUrl}
                      finalY={floor.yOffset}
                      startY={startY}
                      progress={progress}
                      revealStart={i === 0 || maxFloorIndex === 0 ? 0 : (i - 1) / maxFloorIndex}
                      revealEnd={i === 0 || maxFloorIndex === 0 ? 0 : i / maxFloorIndex}
                      bindings={bindings}
                      onModelPartClick={partName => setSelectedModelPartName(partName)}
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
      </div>

      <ObjectConfigPopup
        open={selectedModelPartName !== null}
        modelPartName={selectedModelPartName ?? ''}
        existingBinding={selectedBinding}
        onSave={handleSaveBinding}
        onRemove={handleRemoveBinding}
        onClose={handleClosePopup}
      />
    </>
  );
}
