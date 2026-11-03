import * as THREE from 'three';
import type { Route } from '../road/Route';
import { createTrafficVehicle } from './VehicleModel';

type VehicleKind = 'car' | 'suv' | 'bus' | 'truck';
export interface TrafficVehicle {
  id: number;
  s: number;
  lateral: number;
  speed: number;
  direction: number;
  length: number;
  mesh: THREE.Group;
  desiredSpeed: number;
  kind: VehicleKind;
  active: boolean;
  passing: boolean;
  passTarget: number | null;
  caution: number;
  collisionTimer: number;
}
interface Player { s: number; lateral: number; speed: number }
interface Blockage { s: number; lateral: number }
const COLORS = [0xd9d6ca, 0x5d6a6c, 0x9b4036, 0x333d46, 0xb6b3a7, 0x53665a, 0x294b67];
const KINDS: VehicleKind[] = ['car', 'suv', 'car', 'truck', 'car', 'bus', 'car', 'suv'];

/** Road-coordinate traffic simulation; meshes remain in absolute GIS coordinates. */
export class Traffic {
  readonly group = new THREE.Group();
  readonly vehicles: TrafficVehicle[] = [];
  private player: Player = { s: 0, lateral: 1.8, speed: 0 };
  private sequence = 0;
  private spawnClock = 0;

  constructor(private readonly route: Route) {
    this.group.name = 'Tráfego bidirecional';
    for (let i = 0; i < 22; i++) {
      const kind = KINDS[i % KINDS.length];
      const mesh = createTrafficVehicle(kind, COLORS[i % COLORS.length]);
      mesh.visible = false;
      this.group.add(mesh);
      this.vehicles.push({ id: i, s: 0, lateral: 1.8, speed: 0, direction: 1,
        length: kind === 'truck' ? 14 : kind === 'bus' ? 11.5 : 4.8, mesh,
        desiredSpeed: 20, kind, active: false, passing: false, passTarget: null,
        caution: 1.1 + (i % 5) * 0.16, collisionTimer: 0 });
    }
    this.reset(0);
  }

  get count(): number { return this.vehicles.filter(v => v.active).length; }

  reset(s: number): void {
    this.player.s = s;
    this.sequence = 0;
    for (const v of this.vehicles) { v.active = false; v.mesh.visible = false; }
    this.spawn(1, s + 160);
    this.spawn(-1, s + 410);
    this.spawn(1, s + 430);
    this.spawn(-1, s + 770);
    this.spawn(1, s - 150);
    this.spawnClock = 1;
  }

  private spawn(direction: number, s: number): void {
    if (s < 15 || s > this.route.length - 25) return;
    const lateral = direction * 1.8;
    if (Math.abs(s - this.player.s) < 100) return;
    if (this.vehicles.some(v => v.active && Math.abs(v.lateral - lateral) < 2.8 && Math.abs(v.s - s) < 95)) return;
    const v = this.vehicles.find(candidate => !candidate.active);
    if (!v) return;
    v.direction = direction;
    v.s = s;
    v.lateral = lateral;
    v.desiredSpeed = (v.kind === 'truck' ? 15.2 : v.kind === 'bus' ? 19 : 21.5) + ((this.sequence++ * 7) % 6) - 2.5;
    v.speed = v.desiredSpeed;
    v.active = true;
    v.passing = false;
    v.passTarget = null;
    v.collisionTimer = 0;
    v.mesh.visible = true;
    this.place(v);
  }

  update(dt: number, player: Player, hour: number, wet: number, blockage: Blockage | null = null): void {
    this.player = player;
    const step = Math.min(dt, 0.06);
    const density = hour < 5 ? 7 : hour < 9 ? 12 : hour < 17 ? 13 : hour < 21 ? 17 : 9;
    this.spawnClock -= step;
    if (this.spawnClock <= 0 && this.count < density) {
      const direction = this.sequence % 3 === 0 ? 1 : -1;
      this.spawn(direction, player.s + (direction > 0 ? 720 + this.sequence % 4 * 105 : 980 + this.sequence % 3 * 75));
      if (this.sequence % 4 === 0) this.spawn(1, player.s - 280);
      this.spawnClock = 2.3;
    }
    const active = this.vehicles.filter(v => v.active);
    const accelerations = new Map<number, number>();
    for (const v of active) {
      v.collisionTimer = Math.max(0, v.collisionTimer - step);
      if (Math.abs(v.s - player.s) > 1600 || v.s < 0 || v.s > this.route.length) {
        v.active = false; v.mesh.visible = false; continue;
      }
      const ahead = this.route.sample(Math.min(this.route.length, v.s + v.direction * 45));
      const behind = this.route.sample(Math.max(0, v.s - v.direction * 30));
      let angle = ahead.heading - behind.heading;
      angle = Math.atan2(Math.sin(angle), Math.cos(angle));
      const curveSpeed = Math.max(8, Math.min(28, Math.sqrt(2.4 / Math.max(0.003, Math.abs(angle) / 75))));
      let target = Math.min(v.desiredSpeed * (1 - wet * 0.17), curveSpeed);
      let gap = Infinity;
      let leaderSpeed = target;
      let leaderId: number | null = null;
      const laneTarget = v.passing ? -v.direction * 1.8 : v.direction * 1.8;
      for (const other of active) {
        if (other === v || !other.active || Math.abs(other.lateral - laneTarget) > 2.4) continue;
        const delta = (other.s - v.s) * v.direction;
        if (delta > 0 && delta - (v.length + other.length) * 0.5 < gap) {
          gap = Math.max(0.3, delta - (v.length + other.length) * 0.5);
          leaderSpeed = other.direction === v.direction ? other.speed : -other.speed;
          leaderId = other.id;
        }
      }
      const playerDelta = (player.s - v.s) * v.direction;
      if (Math.abs(player.lateral - laneTarget) < 2.5 && playerDelta > 0) {
        const playerGap = playerDelta - v.length * 0.5 - 9;
        if (playerGap < gap) { gap = Math.max(0.3, playerGap); leaderSpeed = player.speed * v.direction; }
      }
      if (blockage && Math.abs(blockage.lateral - laneTarget) < 2.6) {
        const blockDelta = (blockage.s - v.s) * v.direction - v.length * 0.5 - 16;
        if (blockDelta > -10 && blockDelta < gap) { gap = Math.max(0.3, blockDelta); leaderSpeed = 0; }
      }
      const desiredGap = 7 + v.speed * v.caution * (1 + wet * 0.5) + Math.max(0, v.speed * (v.speed - leaderSpeed) / 5.5);
      const free = 1.05 * (1 - Math.pow(v.speed / Math.max(1, target), 4));
      let acceleration = free - 1.7 * Math.pow(desiredGap / Math.max(1, gap), 2);
      acceleration = THREE.MathUtils.clamp(acceleration, -5.8 * (1 - wet * 0.27), 1.05);
      accelerations.set(v.id, acceleration);
      // Passing is restricted to clear, almost straight road and a generous opposing gap.
      if (!v.passing && v.kind === 'car' && gap < 55 && gap > 20 && target > leaderSpeed + 5 && Math.abs(angle) < 0.09 && (!blockage || Math.abs(blockage.s - v.s) > 300)) {
        const opposingSafe = !active.some(o => o !== v && o.direction !== v.direction && Math.abs(o.s - v.s) < 650);
        const otherLaneSafe = !active.some(o => o !== v && Math.abs(o.lateral + v.direction * 1.8) < 2 && Math.abs(o.s - v.s) < 100);
        const playerSafe = Math.abs(player.s - v.s) > 150;
        if (opposingSafe && otherLaneSafe && playerSafe && leaderId !== null) { v.passing = true; v.passTarget = leaderId; }
      }
      if (v.passing) {
        const needReturn = active.some(o => o.direction !== v.direction && Math.abs(o.s - v.s) < 350);
        const homeClear = !active.some(o => o !== v && o.direction === v.direction && Math.abs(o.s - v.s) < 35);
        const passedVehicle = active.find(o => o.id === v.passTarget);
        const passed = !passedVehicle || (v.s - passedVehicle.s) * v.direction > 40;
        if (homeClear && (needReturn || passed)) { v.passing = false; v.passTarget = null; }
      }
    }
    for (const v of active) {
      if (!v.active) continue;
      v.speed = Math.max(0, v.speed + (accelerations.get(v.id) ?? 0) * step);
      v.s += v.speed * v.direction * step;
      const desiredLateral = (v.passing ? -1 : 1) * v.direction * 1.8;
      v.lateral = THREE.MathUtils.damp(v.lateral, desiredLateral, 1.15, step);
    }
    // A final positional constraint prevents a braking queue from interpenetrating.
    for (const direction of [-1, 1]) {
      const queue = active.filter(v => v.active && v.direction === direction).sort((a, b) => (b.s - a.s) * direction);
      for (let i = 1; i < queue.length; i++) {
        const leader = queue[i - 1], follower = queue[i];
        if (Math.abs(leader.lateral - follower.lateral) > 2.5) continue;
        const minGap = (leader.length + follower.length) * 0.5 + 2.2;
        if ((leader.s - follower.s) * direction < minGap) {
          follower.s = leader.s - direction * minGap;
          follower.speed = Math.min(follower.speed, leader.speed);
        }
      }
    }
    for (const v of active) if (v.active) this.place(v);
  }

  private place(v: TrafficVehicle): void {
    const sample = this.route.sample(v.s);
    v.mesh.position.copy(sample.position).addScaledVector(sample.right, v.lateral);
    v.mesh.position.y += 0.04;
    v.mesh.rotation.set(-Math.atan(sample.grade) * v.direction, sample.heading + (v.direction < 0 ? Math.PI : 0), 0, 'YXZ');
  }

  collision(s: number, lateral: number): { relativeSpeed: number; id: number } | null {
    for (const v of this.vehicles) {
      if (!v.active || v.collisionTimer > 0 || Math.abs(v.lateral - lateral) > 2.25) continue;
      if (Math.abs(v.s - s) < v.length * 0.5 + 8) {
        v.collisionTimer = 2.2;
        const relativeSpeed = Math.abs(this.player.speed - v.speed * v.direction);
        v.speed *= 0.35;
        return { relativeSpeed, id: v.id };
      }
    }
    return null;
  }
}
