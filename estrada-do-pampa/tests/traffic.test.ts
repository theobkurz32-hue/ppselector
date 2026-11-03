import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { Route } from '../src/road/Route';
import { Traffic } from '../src/traffic/Traffic';

const route = {
  length: 100000,
  sample(s: number) {
    return { position: new THREE.Vector3(0, 30, s), tangent: new THREE.Vector3(0, 0, 1), right: new THREE.Vector3(1, 0, 0), heading: 0, grade: 0, lat: -31.6, lon: -52.4 };
  },
} as unknown as Route;

describe('Tráfego bidirecional', () => {
  it('gera veículos com distância inicial segura e nos dois sentidos', () => {
    const traffic = new Traffic(route); traffic.reset(10000);
    const active = traffic.vehicles.filter(v => v.active);
    expect(active.length).toBeGreaterThanOrEqual(4);
    expect(active.some(v => v.direction < 0)).toBe(true);
    expect(active.some(v => v.direction > 0)).toBe(true);
    expect(active.every(v => Math.abs(v.s - 10000) >= 100)).toBe(true);
  });

  it('freia atrás do jogador parado sem atravessar sua posição', () => {
    const traffic = new Traffic(route); traffic.reset(10000);
    for (const v of traffic.vehicles) v.active = false;
    const follower = traffic.vehicles[0];
    Object.assign(follower, { active: true, s: 9880, lateral: 1.8, direction: 1, speed: 20, desiredSpeed: 22 });
    for (let i = 0; i < 1200; i++) traffic.update(1 / 60, { s: 10000, lateral: 1.8, speed: 0 }, 12, 0);
    expect(follower.speed).toBeLessThan(0.3);
    expect(follower.s).toBeLessThan(9985);
  });

  it('mantém separação em filas e reutiliza um conjunto fixo de meshes', () => {
    const traffic = new Traffic(route); traffic.reset(20000);
    const pool = traffic.vehicles.map(v => v.mesh);
    for (let frame = 0; frame < 3600; frame++) {
      const playerS = 20000 + frame / 60 * 13;
      traffic.update(1 / 60, { s: playerS, lateral: 1.8, speed: 13 }, 18, 0.7, { s: 20900, lateral: 1.8 });
      const active = traffic.vehicles.filter(v => v.active);
      for (let a = 0; a < active.length; a++) for (let b = a + 1; b < active.length; b++) {
        const one = active[a], two = active[b];
        if (one.direction === two.direction && Math.abs(one.lateral - two.lateral) < 2.4) {
          expect(Math.abs(one.s - two.s)).toBeGreaterThanOrEqual((one.length + two.length) * 0.5 + 2.19);
        }
      }
    }
    expect(traffic.vehicles.map(v => v.mesh)).toEqual(pool);
    expect(traffic.vehicles.length).toBe(22);
  });
});


describe('Resposta a impactos', () => {
  it('conserva momento longitudinal e desvia o veículo leve em colisão frontal', () => {
    const traffic = new Traffic(route); traffic.reset(10000);
    for (const vehicle of traffic.vehicles) vehicle.active = false;
    const car = traffic.vehicles[0];
    Object.assign(car, { active: true, s: 10010, lateral: 1.8, direction: -1, speed: 20 });
    const impact = traffic.resolveImpact(car.id, { s: 10000, lateral: 1.8, speed: 20, mass: 38000 });
    expect(impact.energy).toBeGreaterThan(1000000);
    expect(impact.playerSpeed).toBeGreaterThan(0);
    expect(impact.playerSpeed).toBeLessThan(20);
    expect(car.crashVelocity).toBeGreaterThan(0);
    expect(car.crashed).toBe(true);
    expect(car.damage).toBeGreaterThan(50);
    const initialMomentum = 38000 * 20 - 1650 * 20;
    expect(38000 * impact.playerSpeed + 1650 * car.crashVelocity).toBeCloseTo(initialMomentum, 5);
    const start = car.lateral;
    for(let i=0;i<180;i++)traffic.update(1/60, {s:10000,lateral:1.8,speed:0},12,0);
    expect(Math.abs(car.lateral-start)).toBeGreaterThan(1);
    expect(Math.abs(car.spin)).toBeGreaterThan(.1);
  });

  it('produz recuo e dano mesmo quando o caminhão estava parado', () => {
    const traffic = new Traffic(route); traffic.reset(10000);
    const car = traffic.vehicles[0];
    Object.assign(car, {active:true,s:10010,lateral:1.8,direction:-1,speed:15});
    const impact=traffic.resolveImpact(car.id,{s:10000,lateral:1.8,speed:0,mass:38000});
    expect(impact.relativeSpeed).toBe(15);
    expect(impact.playerSpeed).toBeLessThan(0);
    expect(impact.energy).toBeGreaterThan(100000);
    expect(car.damage).toBeGreaterThan(10);
  });
});
