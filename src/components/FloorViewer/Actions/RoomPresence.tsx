import type { EntityAttributesProps } from '@hakit/components';
import { useEntity } from '@hakit/core';
import type { EntityName } from '@hakit/core';
import { useEffect } from 'react';
import * as THREE from 'three';

interface RoomPresenceProps {
  gltf: any;
  sensorId: EntityAttributesProps['entity'];
  floorName: string; // Name of the floor mesh in the GLB file
}

function RoomPresence({ gltf, sensorId, floorName }: RoomPresenceProps) {
  const sensor = useEntity(sensorId as EntityName) as { state?: string } | undefined;
  const floor = gltf.nodes[floorName];

  useEffect(() => {
    if (!floor) return;

    const hasPresence = sensor?.state === 'on' || sensor?.state === 'home';

    const applyToMesh = (mesh: THREE.Mesh, active: boolean) => {
      if (!mesh.isMesh) return;

      if (active) {
        if (!mesh.userData.__presenceOriginalMaterial) {
          const originalMaterial = mesh.material as THREE.Material | THREE.Material[];
          mesh.userData.__presenceOriginalMaterial = originalMaterial;
          mesh.material = Array.isArray(originalMaterial) ? originalMaterial.map(material => material.clone()) : originalMaterial.clone();
        }

        const material = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
        const highlightMaterial = (mat: THREE.MeshStandardMaterial) => {
          if (mat.userData.__presenceBoostApplied) return;
          mat.userData.__presenceBoostApplied = true;

          // Keep the same material appearance, only lift brightness slightly.
          mat.color.multiplyScalar(3.18);
          mat.emissiveIntensity = Math.max(0.06, mat.emissiveIntensity);
        };

        if (Array.isArray(material)) {
          material.forEach(highlightMaterial);
        } else {
          highlightMaterial(material);
        }
        return;
      }

      const originalMaterial = mesh.userData.__presenceOriginalMaterial as THREE.Material | THREE.Material[] | undefined;
      if (originalMaterial) {
        mesh.material = originalMaterial;
        delete mesh.userData.__presenceOriginalMaterial;
      }
    };

    floor.traverse((object: THREE.Object3D) => {
      applyToMesh(object as THREE.Mesh, hasPresence);
    });

    return () => {
      floor.traverse((object: THREE.Object3D) => {
        applyToMesh(object as THREE.Mesh, false);
      });
    };
  }, [floor, sensor?.state]);

  return null;
}

export default RoomPresence;
