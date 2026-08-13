//open door when it's attached door contact sensor entity is open

import type { EntityAttributesProps } from '@hakit/components';
import { useEntity } from '@hakit/core';
import type { EntityName } from '@hakit/core';
import { useFrame } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import * as THREE from 'three';

interface DoorOpenProps {
  gltf: any;
  sensorId: EntityAttributesProps['entity'];
  doorName: string; // Name of the door mesh in the GLB file
  direction?: 'in' | 'out' | 'up';
  limit?: number;
}

function DoorOpen({ gltf, sensorId, doorName, direction, limit }: DoorOpenProps) {
  const sensor = useEntity(sensorId as EntityName) as { state?: string } | undefined;
  const door = gltf.nodes[doorName];
  const hingeNodeRef = useRef<THREE.Object3D | null>(null);
  const closedRotationRef = useRef(0);
  const initialRotationRef = useRef<THREE.Euler | null>(null);

  const resolveHingeNode = (doorNode: THREE.Object3D) => {
    const parent = doorNode.parent;
    if (!parent) return doorNode;

    const parentName = parent.name.toLowerCase();
    const doorNameLower = doorNode.name.toLowerCase();
    const looksLikeHinge = parentName.includes('hinge') || parentName.includes('pivot') || parentName.includes(doorNameLower);
    const smallParentGroup = parent.children.length <= 2;

    // Only rotate parent when it looks like a dedicated hinge wrapper; otherwise rotate the door node itself.
    return looksLikeHinge && smallParentGroup ? parent : doorNode;
  };

  const [ready, setReady] = useState(false);

  // Wait until sensor has a real state
  useEffect(() => {
    if (sensor?.state !== undefined && sensor?.state !== 'unknown') {
      setReady(true);
    }
  }, [sensor?.state]);

  // Use the authored GLTF hierarchy/origin as hinge instead of creating a synthetic pivot.
  useLayoutEffect(() => {
    if (!door) return;

    const hingeNode = resolveHingeNode(door);
    hingeNodeRef.current = hingeNode;
    initialRotationRef.current = hingeNode.rotation.clone();
    closedRotationRef.current = direction === 'up' ? hingeNode.rotation.z : hingeNode.rotation.y;

    return () => {
      if (!hingeNodeRef.current || !initialRotationRef.current) return;
      hingeNodeRef.current.rotation.copy(initialRotationRef.current);
    };
  }, [door, direction]);

  // Single animation loop
  useFrame(() => {
    if (!ready) return;
    const hingeNode = hingeNodeRef.current;
    if (!hingeNode) return;

    const isOpen = sensor?.state === 'on';

    let targetRotation = closedRotationRef.current;
    const openDelta = direction === 'out' ? -Math.PI / 2 : Math.PI / 2;

    if (isOpen) {
      targetRotation = closedRotationRef.current + openDelta;
    }

    if (limit !== undefined) {
      const min = closedRotationRef.current - Math.abs(limit);
      const max = closedRotationRef.current + Math.abs(limit);
      targetRotation = THREE.MathUtils.clamp(targetRotation, min, max);
    }

    if (direction === 'up') {
      hingeNode.rotation.z += (targetRotation - hingeNode.rotation.z) * 0.1;
    } else {
      hingeNode.rotation.y += (targetRotation - hingeNode.rotation.y) * 0.1;
    }
  });

  return null;
}

export default DoorOpen;
