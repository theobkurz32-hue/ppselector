import * as THREE from 'three';

export type TrafficVehicleKind = 'car' | 'suv' | 'bus' | 'truck';
const box = new THREE.BoxGeometry(1, 1, 1);
const tire = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 10);
tire.rotateZ(Math.PI / 2);
const rim = new THREE.CylinderGeometry(0.19, 0.19, 0.225, 8);
rim.rotateZ(Math.PI / 2);
const rubber = new THREE.MeshStandardMaterial({ color: 0x161a1b, roughness: 0.94 });
const metal = new THREE.MeshStandardMaterial({ color: 0x879298, roughness: 0.35, metalness: 0.75 });
const glass = new THREE.MeshStandardMaterial({ color: 0x20353f, roughness: 0.19, metalness: 0.4 });
const lights = new THREE.MeshStandardMaterial({ color: 0xf7ebc9, emissive: 0xffe9c2, emissiveIntensity: 0.65 });
const taillight = new THREE.MeshStandardMaterial({ color: 0xac281a, emissive: 0xff2210, emissiveIntensity: 0.5 });
const bumper = new THREE.MeshStandardMaterial({ color: 0x30393d, roughness: 0.7 });

function part(group: THREE.Group, material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number): THREE.Mesh {
  const mesh = new THREE.Mesh(box, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

/** Shared primitive geometry keeps the traffic fleet inexpensive. Front is +Z. */
export function createTrafficVehicle(kind: TrafficVehicleKind, color: number): THREE.Group {
  const group = new THREE.Group();
  group.name = `Tráfego — ${kind}`;
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.4 });
  const large = kind === 'bus' || kind === 'truck';
  const width = large ? 2.45 : kind === 'suv' ? 1.9 : 1.8;
  const length = kind === 'bus' ? 11.5 : kind === 'truck' ? 9.2 : kind === 'suv' ? 4.6 : 4.3;
  const half = width / 2;
  part(group, bumper, 0, 0.54, 0, width * 0.9, 0.3, length * 0.93);
  if (kind === 'bus') {
    part(group, body, 0, 1.85, 0, width, 2.65, length);
    part(group, glass, 0, 2.35, length / 2 + 0.01, width * 0.92, 1.1, 0.025);
    for (const side of [-1, 1]) {
      for (let z = -4.4; z < 4.6; z += 1.13) part(group, glass, side * (half + 0.01), 2.4, z, 0.025, 0.94, 1.02);
      part(group, metal, side * (half + 0.015), 1.4, 0, 0.025, 0.08, length * 0.96);
    }
    part(group, bumper, 0, 3.3, -1.5, 1.45, 0.3, 2);
  } else if (kind === 'truck') {
    part(group, body, 0, 1.75, 3.25, width, 2.45, 2.7);
    part(group, glass, 0, 2.3, 4.61, width * 0.88, 0.85, 0.025);
    const cargo = new THREE.MeshStandardMaterial({ color: 0xa0a393, roughness: 0.78 });
    part(group, cargo, 0, 2.1, -1.22, 2.43, 2.85, 5.75);
    for (const side of [-1, 1]) {
      part(group, glass, side * (half + 0.01), 2.3, 3.25, 0.025, 0.82, 2.2);
      for (let z = -3.8; z < 1.3; z += 0.6) part(group, metal, side * 1.22, 2.1, z, 0.025, 2.8, 0.025);
    }
  } else {
    const roofHeight = kind === 'suv' ? 1.8 : 1.4;
    part(group, body, 0, 0.68, 0, width, 0.64, length);
    part(group, glass, 0, 1.1, -0.2, width * 0.84, roofHeight - 0.75, 2.2);
    part(group, body, 0, roofHeight, -0.25, width * 0.86, 0.1, 2.25);
    for (const side of [-1, 1]) {
      for (const z of [-1.25, 0.1, 0.9]) part(group, body, side * width * 0.43, (roofHeight + 0.8) / 2, z, 0.06, roofHeight - 0.75, 0.075);
      part(group, body, side * (half + 0.1), 1.05, 0.8, 0.22, 0.15, 0.3);
      part(group, metal, side * (half + 0.005), 0.82, -0.35, 0.025, 0.035, 0.23);
    }
  }
  part(group, bumper, 0, 0.54, length / 2 + 0.02, width * 0.95, 0.16, 0.08);
  part(group, bumper, 0, 0.54, -length / 2 - 0.02, width * 0.95, 0.16, 0.08);
  for (const side of [-1, 1]) {
    part(group, lights, side * width * 0.35, large ? 0.95 : 0.8, length / 2 + 0.05, width * 0.23, 0.13, 0.05);
    part(group, taillight, side * width * 0.36, large ? 0.95 : 0.79, -length / 2 - 0.05, width * 0.2, 0.14, 0.05);
  }
  const axleZ = large ? [length * 0.35, -length * 0.3, ...(kind === 'truck' ? [-length * 0.17] : [])] : [1.35, -1.35];
  for (const z of axleZ) for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(tire, rubber);
    wheel.position.set(side * (half - 0.06), 0.34 * (large ? 1.45 : 1), z);
    wheel.scale.setScalar(large ? 1.45 : 1);
    wheel.castShadow = true;
    group.add(wheel);
    const hub = new THREE.Mesh(rim, metal);
    hub.position.copy(wheel.position);
    hub.scale.copy(wheel.scale);
    group.add(hub);
  }
  return group;
}
