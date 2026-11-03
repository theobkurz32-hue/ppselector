import * as THREE from 'three';
import type { Route } from '../road/Route';

type State = 'IDLE' | 'APPROACHING_ROAD' | 'CROSSING' | 'FLEEING' | 'STOPPED';
const torsoGeometry = new THREE.SphereGeometry(1, 10, 7);
const smallGeometry = new THREE.SphereGeometry(1, 7, 5);
const limbGeometry = new THREE.CylinderGeometry(0.085, 0.065, 1, 6);
const hoofGeometry = new THREE.BoxGeometry(0.15, 0.12, 0.23);
const hornGeometry = new THREE.ConeGeometry(0.05, 0.25, 6);
const tailGeometry = new THREE.CylinderGeometry(0.025, 0.014, 0.6, 5);
const hoofMaterial = new THREE.MeshStandardMaterial({ color: 0x292b25, roughness: 0.91 });
const hornMaterial = new THREE.MeshStandardMaterial({ color: 0xbcb497, roughness: 0.82 });
const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0x171b16, roughness: 0.2 });
const faceMaterial = new THREE.MeshStandardMaterial({ color: 0xd9cfaf, roughness: 0.93 });
const noseMaterial = new THREE.MeshStandardMaterial({ color: 0x64544b, roughness: 0.85 });

function ellipsoid(parent: THREE.Group, material: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, small = false): THREE.Mesh {
  const mesh = new THREE.Mesh(small ? smallGeometry : torsoGeometry, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
}
interface Leg { hip: THREE.Group; knee: THREE.Group; foot: THREE.Mesh; front: boolean; side: number }
interface CowRig { body: THREE.Group; head: THREE.Group; tail: THREE.Group; ears: THREE.Mesh[]; legs: Leg[]; phase: number }
function cow(variant = 0): THREE.Group {
  const group = new THREE.Group(), body = new THREE.Group(); group.add(body);
  const coat = new THREE.MeshStandardMaterial({ color: [0x86583c, 0x514a3b, 0xa7764b][variant % 3], roughness: 0.96 });
  const limb = new THREE.MeshStandardMaterial({ color: [0x6c4a34, 0x4b4438, 0x845c3c][variant % 3], roughness: 0.97 });
  ellipsoid(body, coat, 0, 1.19, -0.06, 0.48, 0.5, 0.99);
  ellipsoid(body, coat, 0, 1.23, -0.64, 0.45, 0.44, 0.42);
  ellipsoid(body, coat, 0, 1.28, 0.55, 0.43, 0.46, 0.42);
  ellipsoid(body, coat, 0, 1.36, 0.81, 0.29, 0.39, 0.34);
  ellipsoid(body, faceMaterial, 0, 1.04, 0.74, 0.24, 0.33, 0.18);
  const head = new THREE.Group(); head.position.set(0, 1.46, 0.86); body.add(head);
  ellipsoid(head, variant === 1 ? coat : faceMaterial, 0, 0.13, 0.21, 0.22, 0.29, 0.33);
  ellipsoid(head, noseMaterial, 0, -0.07, 0.49, 0.23, 0.14, 0.17);
  for (const side of [-1, 1]) {
    ellipsoid(head, eyeMaterial, side * 0.195, 0.22, 0.32, 0.035, 0.043, 0.029, true);
    ellipsoid(head, hoofMaterial, side * 0.1, -0.035, 0.632, 0.037, 0.019, 0.009, true);
    const horn = new THREE.Mesh(hornGeometry, hornMaterial); horn.position.set(side * 0.17, 0.39, 0.08); horn.rotation.z = -side * 0.55; head.add(horn);
  }
  const ears: THREE.Mesh[] = [];
  for (const side of [-1, 1]) { const ear = ellipsoid(head, coat, side * 0.29, 0.27, 0.05, 0.18, 0.048, 0.085, true); ear.rotation.z = side * 0.14; ears.push(ear); }
  const legs: Leg[] = [];
  for (const front of [true, false]) for (const side of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(side * 0.30, 1.0, front ? 0.62 : -0.66); body.add(hip);
    const upper = new THREE.Mesh(limbGeometry, limb); upper.scale.set(1.12, 0.5, 1.12); upper.position.y = -0.25; hip.add(upper);
    const knee = new THREE.Group(); knee.position.y = -0.5; hip.add(knee);
    ellipsoid(knee, limb, 0, 0, 0, 0.082, 0.085, 0.08, true);
    const lower = new THREE.Mesh(limbGeometry, limb); lower.scale.set(0.70, 0.5, 0.70); lower.position.y = -0.25; knee.add(lower);
    const foot = new THREE.Mesh(hoofGeometry, hoofMaterial); foot.position.set(0, -0.5, 0.025); knee.add(foot);
    legs.push({ hip, knee, foot, front, side });
  }
  const tail = new THREE.Group(); tail.position.set(0, 1.37, -1.00); body.add(tail);
  const shaft = new THREE.Mesh(tailGeometry, limb); shaft.position.set(0, -0.29, -0.04); shaft.rotation.x = 0.15; tail.add(shaft);
  ellipsoid(tail, hoofMaterial, 0, -0.61, -0.085, 0.055, 0.12, 0.055, true);
  group.userData.cowRig = { body, head, tail, ears, legs, phase: variant * 1.7 } satisfies CowRig;
  group.traverse(node => { if (node instanceof THREE.Mesh) { node.castShadow = true; node.receiveShadow = true; } });
  animateCow(group, 0, 0, variant, true);
  return group;
}

function animateCow(model: THREE.Group, dt: number, speed: number, time: number, grazing = false): void {
  const rig = model.userData.cowRig as CowRig;
  const moving = speed > 0.05, running = speed > 2.4;
  rig.phase += dt * speed / (running ? 1.8 : 1.25) * Math.PI * 2;
  const bob = moving ? Math.sin(rig.phase * 2) * (running ? 0.027 : 0.012) : Math.sin(time * 1.4) * 0.004;
  rig.body.position.y = bob - (running ? 0.07 : moving ? 0.025 : 0); rig.body.rotation.z = moving ? Math.sin(rig.phase) * 0.018 : 0;
  rig.head.rotation.x = grazing ? 0.65 + Math.sin(time * 0.7) * 0.055 : -0.08 + Math.sin(rig.phase * 2) * (moving ? 0.055 : 0.012);
  rig.head.rotation.y = Math.sin(time * 0.54) * 0.045;
  rig.tail.rotation.x = 0.13 + Math.sin(time * 2.4) * 0.12; rig.tail.rotation.z = Math.sin(time * 2.1) * (running ? 0.32 : 0.15);
  rig.ears.forEach((ear, i) => ear.rotation.z = (i ? 1 : -1) * (0.14 + Math.max(0, Math.sin(time * 3.1 + i * 2)) ** 16 * 0.22));
  for (const leg of rig.legs) {
    const offset = running ? (leg.front === (leg.side < 0) ? 0 : Math.PI) : (leg.front ? (leg.side < 0 ? 0 : Math.PI) : (leg.side < 0 ? Math.PI * 0.5 : Math.PI * 1.5));
    const phase = ((rig.phase + offset) / (Math.PI * 2) % 1 + 1) % 1;
    const stance = running ? 0.5 : 0.62, stride = running ? 0.9 : 0.76;
    let z = 0, lift = 0;
    if (moving) {
      if (phase < stance) z = stride * (0.5 - phase / stance);
      else { const t = (phase - stance) / (1 - stance); z = stride * (-0.5 + t); lift = Math.sin(t * Math.PI) * (running ? 0.20 : 0.12); }
    }
    const y = -0.94 - rig.body.position.y + lift, distance = Math.min(0.999, Math.hypot(y, z)), length = 0.5;
    const direction = Math.atan2(-z, -y), upperOffset = Math.acos(THREE.MathUtils.clamp(distance / (length * 2), -1, 1));
    const bend = Math.PI - Math.acos(THREE.MathUtils.clamp((2 * length * length - distance * distance) / (2 * length * length), -1, 1));
    const sign = leg.front ? 1 : -1;
    leg.hip.rotation.x = direction - sign * upperOffset; leg.knee.rotation.x = sign * bend;
    leg.foot.rotation.x = -leg.hip.rotation.x - leg.knee.rotation.x;
  }
}

/** Rural Hereford-like cattle approach from the verge; feet use a grounded gait. */
export class Animals {
  readonly group = new THREE.Group();
  message = ''; state: State = 'IDLE';
  private readonly animal = cow();
  private animalS = 1400; private lateral = 12; private stateTime = 0; private animationTime = 0; private cooldown = 0; private eventNumber = 0;
  constructor(private readonly route: Route) {
    this.group.name = 'Bovinos das propriedades'; this.group.add(this.animal);
    for (let i = 0; i < 2; i++) { const grazing = cow(i + 1); grazing.name = 'grazing'; grazing.scale.setScalar(0.91 + i * 0.11); this.group.add(grazing); }
    this.reset(0);
  }
  reset(s: number): void {
    this.eventNumber = Math.floor(s / 8500); this.animalS = this.eventNumber * 8500 + 1400;
    if (this.animalS < s + 300) this.animalS += 8500;
    this.lateral = 12; this.state = 'IDLE'; this.stateTime = 0; this.cooldown = 0; this.place();
  }
  update(dt: number, s: number, speed: number, horn: boolean): void {
    this.animationTime += dt; this.stateTime += dt; this.cooldown = Math.max(0, this.cooldown - dt);
    if (s > this.animalS + 250) { this.animalS += 8500; this.eventNumber++; this.lateral = 12; this.state = 'IDLE'; this.stateTime = 0; }
    this.group.visible = this.animalS < this.route.length - 50 && Math.abs(this.animalS - s) < 1200;
    const distance = this.animalS - s;
    if (horn && Math.abs(distance) < 140 && this.state !== 'IDLE') { this.state = 'FLEEING'; this.stateTime = 0; }
    if (this.state === 'IDLE' && distance < 210 && distance > 0) { this.state = 'APPROACHING_ROAD'; this.stateTime = 0; }
    if (this.state === 'APPROACHING_ROAD') {
      this.lateral -= dt * 0.95;
      if (this.lateral <= 5.3) { this.state = this.eventNumber % 3 === 2 ? 'STOPPED' : 'CROSSING'; this.stateTime = 0; }
    } else if (this.state === 'CROSSING') {
      this.lateral -= dt * 1.45;
      if (Math.abs(distance) < 22 && Math.abs(speed) > 15 && this.lateral > 2.7) { this.state = 'STOPPED'; this.stateTime = 0; }
      if (this.lateral < -10) { this.state = 'STOPPED'; this.stateTime = 0; }
    } else if (this.state === 'FLEEING') {
      this.lateral += dt * (this.lateral < 0 ? -3.8 : 3.8);
      if (Math.abs(this.lateral) > 14) this.state = 'STOPPED';
    } else if (this.state === 'STOPPED' && this.stateTime > 5 && Math.abs(this.lateral) < 8 && Math.abs(distance) > 45) { this.state = 'CROSSING'; this.stateTime = 0; }
    this.message = distance > -40 && distance < 190 && this.state !== 'IDLE' && Math.abs(this.lateral) < 10 ? 'Animal próximo à pista · reduza e use a buzina' : '';
    const gaitSpeed = this.state === 'APPROACHING_ROAD' ? 0.95 : this.state === 'CROSSING' ? 1.45 : this.state === 'FLEEING' ? 3.8 : 0;
    animateCow(this.animal, dt, gaitSpeed, this.animationTime);
    let index = 0; for (const child of this.group.children) if (child.name === 'grazing') animateCow(child as THREE.Group, dt, 0, this.animationTime + index++ * 1.9, true);
    this.place();
  }
  private place(): void {
    const sample = this.route.sample(this.animalS);
    this.animal.position.copy(sample.position).addScaledVector(sample.right, this.lateral); this.animal.position.y = this.route.terrainHeight(this.animal.position.x, this.animal.position.z);
    this.animal.rotation.y = sample.heading + (this.state === 'FLEEING' && this.lateral > 0 ? -Math.PI / 2 : Math.PI / 2);
    let n = 0;
    for (const child of this.group.children) if (child.name === 'grazing') {
      child.position.copy(sample.position).addScaledVector(sample.right, 22 + n * 7).addScaledVector(sample.tangent, -18 + n * 23); child.position.y = this.route.terrainHeight(child.position.x, child.position.z); child.rotation.y = sample.heading + n * 1.7; n++;
    }
  }
  collision(s: number, lateral: number): boolean {
    if (this.cooldown > 0 || Math.abs(s - this.animalS) > 8.5 || Math.abs(lateral - this.lateral) > 1.65) return false;
    this.cooldown = 10; this.state = 'FLEEING'; return true;
  }
}
