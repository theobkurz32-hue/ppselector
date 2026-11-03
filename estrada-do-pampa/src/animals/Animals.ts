import * as THREE from 'three';
import type { Route } from '../road/Route';

type State = 'IDLE' | 'APPROACHING_ROAD' | 'CROSSING' | 'FLEEING' | 'STOPPED';

function cow(): THREE.Group {
  const group = new THREE.Group();
  const hide = new THREE.MeshStandardMaterial({ color: 0x9c7652, roughness: 0.95 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x4b3b2c, roughness: 0.95 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xc5b78d, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.85, 1.75), hide); body.position.set(0, 1.05, 0);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.55, 0.65), hide); head.position.set(0, 1.4, 1.05); head.rotation.x = -0.15;
  const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.25, 0.25), cream); muzzle.position.set(0, 1.19, 1.4);
  group.add(body, head, muzzle);
  for (const x of [-0.28, 0.28]) for (const z of [-0.63, 0.62]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.8, 0.18), dark); leg.position.set(x, 0.43, z); leg.name = 'leg'; group.add(leg);
  }
  for (const x of [-0.31, 0.31]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.16), hide); ear.position.set(x, 1.59, 1.05); group.add(ear);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.25, 6), cream); horn.position.set(x * 0.65, 1.8, 0.96); group.add(horn);
  }
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.025, 0.7, 5), dark); tail.position.set(0, 0.87, -1); tail.rotation.x = 0.28; group.add(tail);
  group.traverse(n => { if (n instanceof THREE.Mesh) { n.castShadow = true; n.receiveShadow = true; } });
  return group;
}

/** A loose rural bovine approaches through the verge; no animal pops into the lane. */
export class Animals {
  readonly group = new THREE.Group();
  message = '';
  state: State = 'IDLE';
  private readonly animal = cow();
  private animalS = 1400;
  private lateral = 12;
  private stateTime = 0;
  private animationTime = 0;
  private cooldown = 0;
  private eventNumber = 0;
  constructor(private readonly route: Route) {
    this.group.name = 'Animais nas propriedades';
    this.group.add(this.animal);
    for (let i = 0; i < 2; i++) {
      const grazing = cow(); grazing.name = 'grazing'; grazing.scale.setScalar(0.9 + i * 0.13); this.group.add(grazing);
    }
    this.reset(0);
  }

  reset(s: number): void {
    this.eventNumber = Math.floor(s / 8500);
    this.animalS = this.eventNumber * 8500 + 1400;
    if (this.animalS < s + 300) this.animalS += 8500;
    this.lateral = 12; this.state = 'IDLE'; this.stateTime = 0; this.cooldown = 0;
    this.place();
  }

  update(dt: number, s: number, speed: number, horn: boolean): void {
    this.animationTime += dt;
    this.stateTime += dt;
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (s > this.animalS + 250) {
      this.animalS += 8500; this.eventNumber++; this.lateral = 12; this.state = 'IDLE'; this.stateTime = 0;
    }
    this.group.visible = this.animalS < this.route.length - 50 && Math.abs(this.animalS - s) < 1200;
    const distance = this.animalS - s;
    if (horn && Math.abs(distance) < 140 && this.state !== 'IDLE') { this.state = 'FLEEING'; this.stateTime = 0; }
    if (this.state === 'IDLE' && distance < 210 && distance > 0) { this.state = 'APPROACHING_ROAD'; this.stateTime = 0; }
    if (this.state === 'APPROACHING_ROAD') {
      this.lateral -= dt * 0.95;
      if (this.lateral <= 5.3) { this.state = this.eventNumber % 3 === 2 ? 'STOPPED' : 'CROSSING'; this.stateTime = 0; }
    } else if (this.state === 'CROSSING') {
      this.lateral -= dt * 1.45;
      if (Math.abs(distance) < 22 && speed > 15 && this.lateral > 2.7) { this.state = 'STOPPED'; this.stateTime = 0; }
      if (this.lateral < -10) { this.state = 'STOPPED'; this.stateTime = 0; }
    } else if (this.state === 'FLEEING') {
      this.lateral += dt * (this.lateral < 0 ? -3.8 : 3.8);
      if (Math.abs(this.lateral) > 14) this.state = 'STOPPED';
    } else if (this.state === 'STOPPED' && this.stateTime > 5 && Math.abs(this.lateral) < 8 && Math.abs(distance) > 45) {
      this.state = 'CROSSING'; this.stateTime = 0;
    }
    this.message = distance > -40 && distance < 190 && this.state !== 'IDLE' && Math.abs(this.lateral) < 10 ? 'Animal próximo à pista · reduza e use a buzina' : '';
    this.place();
  }

  private place(): void {
    const sample = this.route.sample(this.animalS);
    this.animal.position.copy(sample.position).addScaledVector(sample.right, this.lateral);
    this.animal.position.y = this.route.terrainHeight(this.animal.position.x, this.animal.position.z);
    this.animal.rotation.y = sample.heading + (this.state === 'FLEEING' && this.lateral > 0 ? Math.PI / 2 : -Math.PI / 2);
    const moving = this.state === 'APPROACHING_ROAD' || this.state === 'CROSSING' || this.state === 'FLEEING';
    let i = 0;
    for (const child of this.animal.children) if (child.name === 'leg') child.rotation.x = moving ? Math.sin(this.animationTime * 7 + i++ * Math.PI / 2) * 0.22 : 0;
    let n = 0;
    for (const child of this.group.children) if (child.name === 'grazing') {
      child.position.copy(sample.position).addScaledVector(sample.right, 22 + n * 7).addScaledVector(sample.tangent, -18 + n * 23);
      child.position.y = this.route.terrainHeight(child.position.x, child.position.z);
      child.rotation.y = sample.heading + n * 1.7; n++;
    }
  }

  collision(s: number, lateral: number): boolean {
    if (this.cooldown > 0 || Math.abs(s - this.animalS) > 8.5 || Math.abs(lateral - this.lateral) > 1.65) return false;
    this.cooldown = 10;
    this.state = 'FLEEING';
    return true;
  }
}
