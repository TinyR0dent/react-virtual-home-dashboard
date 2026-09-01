import { useEntity } from '@hakit/core';
import { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import type { EntityAttributesProps } from '@hakit/components';
import type { EntityName } from '@hakit/core';

export type LightEntityId = Extract<EntityAttributesProps['entity'], `light.${string}` | `switch.${string}`>;

interface LightOnProps {
  gltf: { nodes?: Record<string, THREE.Object3D>; scene?: THREE.Object3D };
  lightEntityId: LightEntityId; // Entity ID for the light
  lightObjectName: string; // Name of the light mesh in the GLB file
}

const missingMeshWarnings = new Set<string>();

function LightOn({ gltf, lightEntityId, lightObjectName }: LightOnProps) {
  const light = useEntity(lightEntityId as EntityName) as
    { state?: string; attributes?: { brightness?: number; hs_color?: [number, number] } } | undefined;
  const lightMesh = gltf.nodes?.[lightObjectName] ?? gltf.scene?.getObjectByName?.(lightObjectName);

  const pointLight = useRef<THREE.PointLight>(null);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (light?.state !== undefined && light?.state !== 'unknown') {
      setReady(true);
    }
  }, [light?.state]);

  useEffect(() => {
    if (!lightMesh || !pointLight.current) return;

    const worldPos = new THREE.Vector3();
    lightMesh.getWorldPosition(worldPos);

    pointLight.current.position.copy(worldPos);
  }, [lightMesh]);

  useEffect(() => {
    if (lightMesh) return;
    const warningKey = `${lightEntityId}::${lightObjectName}`;
    if (missingMeshWarnings.has(warningKey)) return;
    missingMeshWarnings.add(warningKey);
    console.warn(`[LightOn] Light mesh "${lightObjectName}" not found in GLTF for entity "${lightEntityId}".`);
  }, [lightEntityId, lightMesh, lightObjectName]);

  useFrame(() => {
    if (!pointLight.current) return;
    if (!lightMesh) return;

    const worldPos = new THREE.Vector3();
    lightMesh.getWorldPosition(worldPos);
    pointLight.current.position.copy(worldPos);

    if (!ready || !light) return;

    const isOn = light.state === 'on';

    const normalized = light.attributes?.brightness ?? 255;
    const reduced = normalized * 0.05;
    const targetIntensity = isOn ? reduced * 1.2 : 0;

    const targetColor = isOn
      ? light.attributes?.hs_color
        ? new THREE.Color().setHSL(light.attributes.hs_color[0] / 360, light.attributes.hs_color[1] / 100, 0.5)
        : '#fff8e7'
      : '#000000';

    pointLight.current.intensity += (targetIntensity - pointLight.current.intensity) * 0.15;
    pointLight.current.color = new THREE.Color(targetColor);
  });

  if (!lightMesh) return null;

  return (
    <pointLight
      ref={pointLight}
      distance={4}
      decay={2.5}
      color={
        light?.attributes?.hs_color
          ? new THREE.Color().setHSL(light.attributes.hs_color[0] / 360, light.attributes.hs_color[1] / 100, 0.5)
          : '#fff8e7'
      } // light colour or warm white
      intensity={0} // start off
    />
  );
}

export default LightOn;
