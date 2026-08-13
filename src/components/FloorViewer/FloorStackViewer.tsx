import { Component, Suspense, useRef, useCallback, useState, useEffect, type ReactNode } from 'react';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Html } from '@react-three/drei';
import { useHass } from '@hakit/core';
import * as THREE from 'three';
import DoorOpen from './Actions/DoorOpen';
import LightOn from './Actions/LightOn';
import RoomPresence from './Actions/RoomPresence';
import { ObjectConfigPopup, type ObjectConfigPopupProps } from '../ui-components/ObjectConfigPopup';
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

function GroundFloor({
  url,
  bindings,
  onModelPartClick,
}: {
  url: string;
  bindings: ModelBinding[];
  onModelPartClick: (partName: string) => void;
}) {
  const gltf = useGLTF(url);
  const hoveredGroupRef = useRef<THREE.Object3D | null>(null);

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
          gltf={gltf}
          sensorId={binding.haEntity}
          doorName={binding.modelPartName}
          direction={binding.direction}
          limit={THREE.MathUtils.degToRad(binding.limitDeg)}
        />
      ))}

      {lightBindings.map(binding => (
        <LightOn
          key={`light-${binding.modelPartName}`}
          gltf={gltf}
          lightEntityId={binding.haEntity}
          lightObjectName={binding.modelPartName}
        />
      ))}

      {presenceBindings.map(binding => (
        <RoomPresence key={`presence-${binding.modelPartName}`} gltf={gltf} sensorId={binding.haEntity} floorName={binding.modelPartName} />
      ))}

      <primitive
        object={gltf.scene}
        dispose={null}
        onClick={handlePartClick}
        onPointerOver={handlePartHover}
        onPointerMove={handlePartHover}
        onPointerOut={clearHighlight}
      />
    </>
  );
}

function CameraResetter({ cameraPosition, resetRef }: { cameraPosition: [number, number, number]; resetRef: { reset: () => void } }) {
  const { camera, controls } = useThree();
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

interface AnimatedFloorProps {
  url: string;
  finalY: number;
  startY: number;
  progress: { value: number };
}

function AnimatedFloor({ url, finalY, startY, progress }: AnimatedFloorProps) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(url);

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.y = THREE.MathUtils.lerp(startY, finalY, progress.value);
    }
  });

  return (
    <group ref={groupRef}>
      <primitive object={scene} dispose={null} />
    </group>
  );
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

function ScrollIndicator({ progress, onSeek, onReset }: { progress: number; onSeek: (p: number) => void; onReset: () => void }) {
  const trackRef = useRef<HTMLDivElement>(null);

  const seekFromPointer = (e: React.PointerEvent) => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const p = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height));
    onSeek(p);
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
      <button style={btnStyle} aria-label='First floor' onClick={() => onSeek(1)}>
        ?
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

      <button style={btnStyle} aria-label='Ground floor' onClick={() => onSeek(0)}>
        ?
      </button>

      <button style={{ ...btnStyle, marginTop: 4, fontSize: 18 }} aria-label='Reset camera' onClick={onReset} title='Reset camera'>
        ?
      </button>
    </div>
  );
}

export { type FloorStackViewerProps, type UpperFloorConfig, defaultCameraPositions } from './bindings';

export function FloorStackViewer({
  groundFloorUrl,
  upperFloors,
  startY = 40,
  cameraPosition = defaultCameraPositions[0].isometric,
}: FloorStackViewerProps) {
  const connection = useHass(state => state.connection) as {
    sendMessagePromise: (message: Record<string, unknown>) => Promise<unknown>;
  } | null;
  const scrollRef = useRef<HTMLDivElement>(null);
  const resetRef = useRef<{ reset: () => void }>({ reset: () => {} }).current;

  const [bindings, setBindings] = useState<ModelBinding[]>(() => loadBindingsFromStorage());
  const [hasLoadedRemote, setHasLoadedRemote] = useState(false);
  const [selectedModelPartName, setSelectedModelPartName] = useState<string | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  const progress = useRef<{ value: number }>({ value: 0 }).current;

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
        })) as { bindings?: unknown };

        if (cancelled) return;

        if (Array.isArray(result?.bindings)) {
          if (result.bindings.length > 0) {
            setBindings(result.bindings as ModelBinding[]);
          }
        }
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
      })
      .catch(() => {
        // Keep local storage as fallback if remote save fails.
      });
  }, [bindings, connection, hasLoadedRemote]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const p = Math.max(0, Math.min(1, el.scrollTop / (el.scrollHeight - el.clientHeight)));
    progress.value = p;
    setScrollProgress(p);
  }, [progress]);

  const onSeek = useCallback((p: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({
      top: p * (el.scrollHeight - el.clientHeight),
      behavior: 'smooth',
    });
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
      const el = scrollRef.current;
      if (!el) return;
      const max = el.scrollHeight - el.clientHeight;
      el.scrollTo({ top: e.deltaY > 0 ? max : 0, behavior: 'smooth' });
    };
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => window.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

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
              camera={{ position: cameraPosition, fov: 45 }}
              shadows
              style={{ touchAction: 'pan-y' }}
              gl={{
                antialias: true,
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: 1.1,
              }}
            >
              <color attach='background' args={['#0d1117']} />

              <Suspense fallback={<Loader />}>
                <Environment preset='apartment' background={false} environmentIntensity={0.2} />

                <GroundFloor url={groundFloorUrl} bindings={bindings} onModelPartClick={partName => setSelectedModelPartName(partName)} />
                <CameraResetter cameraPosition={cameraPosition} resetRef={resetRef} />

                {upperFloors.map((floor, i) => (
                  <FloorErrorBoundary key={i}>
                    <AnimatedFloor url={floor.modelUrl} finalY={floor.yOffset} startY={startY} progress={progress} />
                  </FloorErrorBoundary>
                ))}
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

        <div
          aria-hidden='true'
          style={{
            height: '100svh',
            scrollSnapAlign: 'start',
            scrollSnapStop: 'always',
            pointerEvents: 'none',
          }}
        />

        <div
          aria-hidden='true'
          style={{
            height: '100svh',
            scrollSnapAlign: 'start',
            scrollSnapStop: 'always',
            pointerEvents: 'none',
          }}
        />

        <ScrollIndicator progress={scrollProgress} onSeek={onSeek} onReset={handleReset} />
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
