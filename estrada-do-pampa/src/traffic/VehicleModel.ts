import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export type TrafficVehicleKind = 'car' | 'suv' | 'bus' | 'truck';
const box = new THREE.BoxGeometry(1, 1, 1);
const rounded = new RoundedBoxGeometry(1, 1, 1, 1, 0.08);
const tire = new THREE.CylinderGeometry(0.35, 0.35, 0.24, 16);
tire.rotateZ(Math.PI / 2);
const rim = new THREE.CylinderGeometry(0.23, 0.23, 0.246, 12);
rim.rotateZ(Math.PI / 2);
const rubber = new THREE.MeshStandardMaterial({ color: 0x181b1c, roughness: 0.95 });
const metal = new THREE.MeshStandardMaterial({ color: 0xa1a8aa, roughness: 0.3, metalness: 0.8 });
const glass = new THREE.MeshStandardMaterial({ color: 0x263b46, roughness: 0.14, metalness: 0.36 });
const lights = new THREE.MeshStandardMaterial({ color: 0xf3e8cb, emissive: 0xffe4b5, emissiveIntensity: 0.8 });
const bumper = new THREE.MeshStandardMaterial({ color: 0x252d31, roughness: 0.66 });
glass.name = 'vehicle-glass';
const plate = new THREE.MeshStandardMaterial({ color: 0xd6dad4, roughness: 0.6 });
const wheelArch = new THREE.TorusGeometry(0.39, 0.035, 4, 12, Math.PI);
wheelArch.rotateY(Math.PI / 2);

function part(group: THREE.Group, material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, soft = false): THREE.Mesh {
  const mesh = new THREE.Mesh(soft ? rounded : box, material);
  mesh.position.set(x, y, z); mesh.scale.set(w, h, d);
  mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
  return mesh;
}
interface Section { z: number; width: number; bottom: number; top: number }
/** A beveled, tapered automotive shell, rather than a rectangular body. */
function shell(sections: Section[], material: THREE.Material): THREE.Mesh {
  const positions: number[] = [], indices: number[] = [];
  for (const section of sections) {
    const w = section.width / 2, b = section.bottom, t = section.top, r = Math.min(0.09, (t - b) / 3);
    for (const [x, y] of [[-w + r, b], [w - r, b], [w, b + r], [w, t - r], [w - r, t], [-w + r, t], [-w, t - r], [-w, b + r]]) positions.push(x, y, section.z);
  }
  for (let row = 0; row < sections.length - 1; row++) for (let i = 0; i < 8; i++) {
    const a = row * 8 + i, b = row * 8 + (i + 1) % 8, c = a + 8, d = b + 8; indices.push(a, b, c, b, d, c);
  }
  for (let i = 1; i < 7; i++) { indices.push(0, i + 1, i); const n = (sections.length - 1) * 8; indices.push(n, n + i, n + i + 1); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; return mesh;
}
function strut(group: THREE.Group, material: THREE.Material, a: THREE.Vector3, b: THREE.Vector3, width: number): void {
  const mesh = new THREE.Mesh(box, material), delta = b.clone().sub(a);
  mesh.position.copy(a).add(b).multiplyScalar(0.5); mesh.scale.set(width, delta.length(), width); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); group.add(mesh);
}

function mergeStaticParts(group: THREE.Group): void {
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  for (const child of [...group.children]) if (child instanceof THREE.Mesh && child.name !== 'bumper-front' && !Array.isArray(child.material)) {
    if (!batches.has(child.material)) batches.set(child.material, []);
    batches.get(child.material)!.push(child);
  }
  for (const [material, meshes] of batches) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map(mesh => { mesh.updateMatrix(); const geometry=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone(); geometry.deleteAttribute('uv'); return geometry.applyMatrix4(mesh.matrix); });
    const geometry = mergeGeometries(geometries); geometries.forEach(item => item.dispose());
    if (!geometry) continue;
    meshes.forEach(mesh => group.remove(mesh));
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }
}

/** Reused wheels and trim keep rounded, detailed traffic inexpensive. Front is +Z. */
export function createTrafficVehicle(kind: TrafficVehicleKind, color: number): THREE.Group {
  const group = new THREE.Group(); group.name = `Tráfego — ${kind}`;
  const body = new THREE.MeshStandardMaterial({ color, roughness: 0.29, metalness: 0.48 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xa72219, emissive: 0xff180c, emissiveIntensity: 0.35 });
  const large = kind === 'bus' || kind === 'truck';
  const width = large ? 2.45 : kind === 'suv' ? 1.96 : 1.82;
  const length = kind === 'bus' ? 11.5 : kind === 'truck' ? 13 : kind === 'suv' ? 4.75 : 4.5, half = width / 2;
  const chassis = part(group, bumper, 0, large ? 0.7 : 0.45, 0, width * 0.87, 0.22, length * 0.93); chassis.name = 'chassis';
  if (kind === 'bus') {
    const coach = part(group, body, 0, 1.98, 0, width, 2.75, length, true); coach.name = 'bodywork';
    const windshield = part(group, glass, 0, 2.48, length / 2 + 0.012, width * 0.9, 1.17, 0.03, true); windshield.rotation.x = -0.055;
    part(group, bumper, 0, 1.2, length / 2 + 0.03, width * 0.65, 0.29, 0.045);
    part(group, body, 0, 3.32, 0.2, width * 0.96, 0.12, length * 0.92, true);
    for (const side of [-1, 1]) {
      for (let z = -4.65; z < 4.7; z += 1.18) part(group, glass, side * (half + 0.012), 2.5, z, 0.03, 1.02, 1.05, true);
      part(group, metal, side * (half + 0.02), 1.54, 0, 0.03, 0.055, length * 0.94);
      part(group, bumper, side * (half + 0.022), 1.12, -2.5, 0.028, 0.33, 2.8);
      for (let z = -3.7; z <= 3.5; z += 2.4) part(group, metal, side * (half + 0.024), 1.5, z, 0.025, 0.1, 0.3);
    }
    part(group, bumper, 0, 3.48, -1.2, 1.6, 0.27, 2.5, true);
  } else if (kind === 'truck') {
    const cabZ = 4.9;
    const cabin = part(group, body, 0, 1.94, cabZ, width, 2.62, 3.1, true); cabin.name = 'bodywork';
    const windshield = part(group, glass, 0, 2.53, length / 2 + 0.013, width * 0.88, 0.99, 0.03); windshield.rotation.x = -0.07;
    part(group, bumper, 0, 1.57, length / 2 + 0.03, 1.8, 0.62, 0.04, true);
    for (let y = 1.36; y < 1.85; y += 0.11) part(group, metal, 0, y, length / 2 + 0.06, 1.55, 0.025, 0.035);
    const cargo = new THREE.MeshStandardMaterial({ color: 0xb6b6a4, roughness: 0.67, metalness: 0.15 });
    part(group, cargo, 0, 2.22, -1.5, 2.43, 3.0, 8.8, true);
    for (const side of [-1, 1]) {
      part(group, glass, side * (half + 0.012), 2.5, cabZ, 0.03, 0.93, 2.35);
      part(group, metal, side * 1.1, 0.88, cabZ - 0.1, 0.32, 0.14, 1.5);
      for (let z = -5.55; z < 2.7; z += 1.1) part(group, metal, side * 1.226, 2.2, z, 0.026, 2.9, 0.035);
      part(group, bumper, side * 1.08, 0.95, -2, 0.08, 0.12, 4.9);
    }
    part(group, metal, 0, 2.18, -5.94, 2.36, 2.85, 0.05);
    for (const x of [-0.8, 0, 0.8]) part(group, bumper, x, 2.19, -5.98, 0.04, 2.65, 0.035);
  } else {
    const suv = kind === 'suv', roof = suv ? 1.84 : 1.49;
    const bodyShell = shell([
      { z: -length / 2, width: width * 0.88, bottom: 0.46, top: 0.88 },
      { z: -length * 0.35, width, bottom: 0.41, top: 1.0 },
      { z: length * 0.31, width, bottom: 0.41, top: 0.99 },
      { z: length / 2, width: width * 0.88, bottom: 0.48, top: 0.83 },
    ], body); bodyShell.name = 'bodywork'; group.add(bodyShell);
    const cab = shell([
      { z: -1.55, width: width * 0.83, bottom: 0.89, top: 1.03 },
      { z: -0.88, width: width * 0.77, bottom: 0.94, top: roof },
      { z: 0.45, width: width * 0.77, bottom: 0.94, top: roof - 0.015 },
      { z: 1.18, width: width * 0.86, bottom: 0.93, top: 1.03 },
    ], glass); group.add(cab);
    part(group, body, 0, roof, -0.24, width * 0.79, 0.085, 1.45, true);
    for (const side of [-1, 1]) {
      const x = side * width * 0.391;
      strut(group, body, new THREE.Vector3(side * width * 0.43, 0.99, 1.18), new THREE.Vector3(x, roof - 0.02, 0.46), 0.055);
      strut(group, body, new THREE.Vector3(side * width * 0.419, 0.98, -1.54), new THREE.Vector3(x, roof - 0.02, -0.88), 0.08);
      part(group, bumper, x, (roof + 0.96) / 2, -0.16, 0.045, roof - 0.96, 0.065);
      part(group, metal, side * (half + 0.007), 0.98, -0.15, 0.018, 0.025, 2.22);
      for (const z of [-0.65, 0.59]) part(group, metal, side * (half + 0.018), 0.86, z, 0.025, 0.045, 0.19, true);
      part(group, body, side * (half + 0.11), 1.13, 0.93, 0.23, 0.15, 0.25, true);
      part(group, glass, side * (half + 0.12), 1.13, 0.81, 0.17, 0.11, 0.012);
      part(group, bumper, side * (half + 0.014), 0.47, -0.05, 0.04, suv ? 0.15 : 0.07, 2.7);
      if (suv) part(group, metal, side * 0.59, roof + 0.09, -0.21, 0.045, 0.06, 1.65);
    }
    part(group, bumper, 0, 0.72, length / 2 + 0.027, width * 0.45, 0.2, 0.035, true);
    for (let y = 0.65; y < 0.8; y += 0.06) part(group, metal, 0, y, length / 2 + 0.049, width * 0.36, 0.012, 0.012);
  }
  const frontBumper = part(group, bumper, 0, large ? 0.86 : 0.52, length / 2 + 0.025, width * 0.94, large ? 0.19 : 0.14, 0.14, true); frontBumper.name = 'bumper-front';
  part(group, bumper, 0, large ? 0.83 : 0.52, -length / 2 - 0.025, width * 0.94, 0.15, 0.12, true);
  part(group, plate, 0, large ? 0.87 : 0.59, length / 2 + 0.105, 0.39, 0.095, 0.018);
  part(group, plate, 0, large ? 0.86 : 0.61, -length / 2 - 0.10, 0.39, 0.095, 0.018);
  for (const side of [-1, 1]) {
    part(group, lights, side * width * 0.345, large ? 1.12 : 0.86, length / 2 + 0.05, width * 0.225, large ? 0.17 : 0.135, 0.055, true);
    part(group, tail, side * width * 0.365, large ? 1.1 : 0.88, -length / 2 - 0.05, width * 0.19, 0.18, 0.055, true);
    if (large) {
      part(group, bumper, side * (half + 0.22), 2.58, length / 2 - 0.42, 0.3, 0.58, 0.16, true);
      strut(group, metal, new THREE.Vector3(side * half, 2.8, length / 2 - 0.45), new THREE.Vector3(side * (half + 0.23), 2.8, length / 2 - 0.45), 0.045);
    }
  }
  const axles = large ? [length * 0.35, -length * 0.32, ...(kind === 'truck' ? [-length * 0.22] : [])] : [length * 0.31, -length * 0.30];
  const wheels: THREE.Group[] = [], frontWheels: THREE.Group[] = [];
  for (const z of axles) for (const side of [-1, 1]) {
    const pivot = new THREE.Group(), spin = new THREE.Group(), scale = large ? 1.48 : kind === 'suv' ? 1.1 : 1;
    pivot.position.set(side * (half - 0.055), 0.35 * scale, z); spin.scale.setScalar(scale); pivot.add(spin); group.add(pivot);
    const wheel = new THREE.Mesh(tire, rubber); wheel.castShadow = true; spin.add(wheel);
    const hub = new THREE.Mesh(rim, metal); spin.add(hub);
    for (let i = 0; i < 5; i++) {
      const angle = i / 5 * Math.PI * 2;
      const spoke = new THREE.Mesh(box, bumper); spoke.position.set(side * 0.125, Math.cos(angle) * 0.12, Math.sin(angle) * 0.12); spoke.scale.set(0.007, 0.035, 0.18); spoke.rotation.x = -angle; spin.add(spoke);
    }
    const arch = new THREE.Mesh(wheelArch, bumper); arch.position.copy(pivot.position); arch.position.x += side * 0.035; arch.scale.setScalar(scale); group.add(arch);
    mergeStaticParts(spin); spin.name = 'wheel-spin'; wheels.push(spin); if (z === axles[0]) frontWheels.push(pivot);
  }
  mergeStaticParts(group);
  group.traverse(node => {if(node instanceof THREE.Mesh){if(node.material === glass){node.name='glass';node.userData.glass=true;}else if(node.material === body){node.name='bodywork';node.userData.damagePanel=true;}}});
  group.userData.wheels = wheels; group.userData.frontWheels = frontWheels; group.userData.wheelRadius = large ? 0.518 : kind === 'suv' ? 0.385 : 0.35;
  group.userData.windshield = {x:0,y:kind==='truck'?2.53:kind==='bus'?2.48:kind==='suv'?1.435:1.26,z:large?length/2+.035:.84,width:width*.83,height:large?1.0:.7};
  group.userData.brakeMaterial = tail; group.userData.vehicleKind = kind; group.userData.damage = 0;
  return group;
}

export function updateTrafficVehicle(mesh: THREE.Group, speed: number, steering: number, braking: boolean, dt: number): void {
  const radius = Number(mesh.userData.wheelRadius) || 0.35;
  for (const wheel of (mesh.userData.wheels ?? []) as THREE.Group[]) wheel.rotation.x += speed / radius * dt;
  for (const pivot of (mesh.userData.frontWheels ?? []) as THREE.Group[]) pivot.rotation.y = THREE.MathUtils.clamp(steering, -0.35, 0.35);
  const material = mesh.userData.brakeMaterial as THREE.MeshStandardMaterial | undefined;
  if (material) material.emissiveIntensity = braking ? 2.6 : 0.35;
}
