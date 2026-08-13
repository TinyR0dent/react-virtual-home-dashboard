import { Component, Suspense, useMemo, type ReactNode } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, useGLTF, Environment, Center, Bounds, Html, useProgress } from '@react-three/drei';
import * as THREE from 'three';

// Configure Draco decoder so Draco-compressed GLBs load correctly.
// Drei's useGLTF defaults to /draco-gltf/ which often doesn't exist locally;
// the Google CDN version works everywhere with no extra files needed.
useGLTF.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/');

// ─── Error boundary for GLB load failures ─────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}
interface ErrorBoundaryState {
  hasError: boolean;
}

class ModelErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };
  static getDerivedStateFromError(error: unknown) {
    console.error('[FloorPlan] Model failed to load:', error);
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

// ─── GLB model loader ─────────────────────────────────────────────────────────

function FloorModel({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  return <primitive object={scene} dispose={null} />;
}

// ─── Dimmed copy of a floor (rendered as a reference below the active floor) ──

function DimmedFloorModel({ url, yOffset, opacity = 0.28 }: { url: string; yOffset: number; opacity?: number }) {
  const { scene } = useGLTF(url);

  const dimmedScene = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse(child => {
      if (child instanceof THREE.Mesh) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        const dimmed = mats.map(m => {
          const mat = m.clone();
          mat.transparent = opacity < 1;
          mat.opacity = opacity;
          return mat;
        });
        child.material = Array.isArray(child.material) ? dimmed : dimmed[0];
      }
    });
    return clone;
  }, [scene, opacity]);

  return <primitive object={dimmedScene} position={[0, yOffset, 0]} dispose={null} />;
}

// ─── Procedural placeholder (shown until real GLBs are added) ─────────────────

function PlaceholderModel({ index }: { index: number }) {
  const accent = index === 0 ? '#4a90d9' : '#9b59b6';
  return (
    <group>
      {/* Floor slab */}
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[9, 0.1, 6.5]} />
        <meshStandardMaterial color='#1a2332' roughness={0.9} />
      </mesh>

      {/* Room outlines */}
      {[
        { pos: [-2.8, 1.25, -0.75] as [number, number, number], size: [3, 2.5, 4] as [number, number, number] },
        { pos: [1.5, 1.25, -0.75] as [number, number, number], size: [3.5, 2.5, 4] as [number, number, number] },
        { pos: [0, 1.25, 2.5] as [number, number, number], size: [9, 2.5, 1] as [number, number, number] },
      ].map(({ pos, size }, i) => (
        <mesh key={i} position={pos} castShadow>
          <boxGeometry args={size} />
          <meshStandardMaterial color={accent} wireframe opacity={0.7} transparent />
        </mesh>
      ))}

      {/* Solid floor overlay */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <planeGeometry args={[9, 6.5]} />
        <meshStandardMaterial color='#0d1420' transparent opacity={0.25} />
      </mesh>

      <Html center position={[0, 3.5, 0]}>
        <p
          style={{
            color: 'rgba(255,255,255,0.35)',
            fontFamily: 'system-ui, sans-serif',
            fontSize: 11,
            textAlign: 'center',
            margin: 0,
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          Add your .glb model to /public/models/
        </p>
      </Html>
    </group>
  );
}

// ─── Loading indicator ────────────────────────────────────────────────────────

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 8,
          color: 'rgba(255,255,255,0.6)',
          fontFamily: 'system-ui, sans-serif',
          fontSize: 12,
        }}
      >
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
        {progress > 0 && <span>{Math.round(progress)}%</span>}
      </div>
    </Html>
  );
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface FloorPlanSceneProps {
  /** Path relative to /public, e.g. "/models/ground-floor.glb". Omit for placeholder. */
  modelUrl?: string;
  label?: string;
  floorIndex: number;
  /** Initial camera position [x, y, z]. Defaults to isometric [8, 6, 8]. */
  cameraPosition?: [number, number, number];
  /** Y position of this floor's model in scene units. */
  yOffset?: number;
  /** Previous floors to render beneath the active floor. */
  referenceFloors?: Array<{ modelUrl: string; yOffset: number }>;
  /** Opacity for reference floors (0–1). Default 0.28 (dim). Pass 1 for fully visible. */
  referenceOpacity?: number;
}

export function FloorPlanScene({
  modelUrl,
  label,
  floorIndex,
  cameraPosition = [8, 6, 8],
  yOffset = 0,
  referenceFloors,
  referenceOpacity = 0.28,
}: FloorPlanSceneProps) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
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
        <fog attach='fog' args={['#0d1117', 25, 70]} />

        {/* <ambientLight intensity={0.35} /> */}
        {/* <directionalLight
          position={[12, 20, 8]}
          intensity={1.6}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-camera-far={80}
          shadow-camera-left={-20}
          shadow-camera-right={20}
          shadow-camera-top={20}
          shadow-camera-bottom={-20}
        /> */}

        <Suspense fallback={<Loader />}>
          <Environment preset='apartment' background={false} />
          {/* <DisableHDRILighting /> */}

          {/*
           * Single Bounds wraps ALL visible floors so the camera auto-fits
           * the full stacked building on the first-floor slide.
           */}
          <Bounds fit clip observe margin={1.2}>
            {/* Floors below the active one */}
            {referenceFloors?.map((ref, i) => (
              <ModelErrorBoundary key={i} fallback={null}>
                <DimmedFloorModel url={ref.modelUrl} yOffset={ref.yOffset} opacity={referenceOpacity} />
              </ModelErrorBoundary>
            ))}

            {/* Active floor */}
            {modelUrl ? (
              <ModelErrorBoundary
                fallback={
                  <Center>
                    <PlaceholderModel index={floorIndex} />
                  </Center>
                }
              >
                <group position={[0, yOffset, 0]}>
                  <FloorModel url={modelUrl} />
                </group>
              </ModelErrorBoundary>
            ) : (
              <Center>
                <PlaceholderModel index={floorIndex} />
              </Center>
            )}
          </Bounds>
        </Suspense>

        <OrbitControls
          makeDefault
          enablePan={false}
          enableZoom={false}
          touches={{
            ONE: THREE.TOUCH.ROTATE,
            TWO: THREE.TOUCH.DOLLY_ROTATE,
          }}
          minPolarAngle={0}
          maxPolarAngle={Math.PI / 2.1}
          rotateSpeed={0.7}
          dampingFactor={0.06}
          enableDamping
        />
      </Canvas>

      {/* Floor label */}
      {label && (
        <div
          style={{
            position: 'absolute',
            bottom: 36,
            left: 36,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          <p
            style={{
              margin: 0,
              color: 'rgba(255,255,255,0.9)',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: 22,
              fontWeight: 600,
              letterSpacing: '0.03em',
              textShadow: '0 2px 16px rgba(0,0,0,0.9)',
            }}
          >
            {label}
          </p>
        </div>
      )}
    </div>
  );
}
