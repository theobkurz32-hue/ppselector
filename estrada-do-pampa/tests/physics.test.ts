import { describe, expect, it } from 'vitest';
import { TruckPhysics, type DrivingInput, type RoadEnvironment } from '../src/vehicle/TruckPhysics';
import { engineTorqueAt } from '../src/vehicle/vehicleConfig';

const coast: DrivingInput = { throttle: 0, brake: 0, emergency: false, engineBrake: false };
const fullThrottle: DrivingInput = { ...coast, throttle: 1 };
const dry: RoadEnvironment = { grade: 0, friction: 0.78, offroad: false };
function simulate(truck: TruckPhysics, seconds: number, input = fullThrottle, environment = dry) {
  for (let t = 0; t < seconds; t += 1 / 60) truck.update(1 / 60, input, environment);
}

function stoppingDistance(mass: number, friction: number) {
  const truck = new TruckPhysics({ mass });
  truck.speed = 80 / 3.6;
  for (let i = 0; i < 6000 && truck.speed > 0; i++) truck.update(1 / 120, { ...coast, brake: 1 }, { ...dry, friction });
  expect(truck.speed).toBe(0);
  return truck.distance;
}

describe('heavy truck force model', () => {
  it('has a torque plateau and declining high-rpm torque', () => {
    expect(engineTorqueAt(1200)).toBe(2450);
    expect(engineTorqueAt(700)).toBeLessThan(engineTorqueAt(1000));
    expect(engineTorqueAt(2000)).toBeLessThan(engineTorqueAt(1400));
    expect(engineTorqueAt(2300)).toBe(0);
  });

  it('accelerates a loaded combination progressively and shifts automatically', () => {
    const truck = new TruckPhysics();
    simulate(truck, 10);
    expect(truck.speed * 3.6).toBeGreaterThan(8);
    expect(truck.speed * 3.6).toBeLessThan(45);
    expect(truck.gear).toBeGreaterThan(1);
    simulate(truck, 70);
    expect(truck.speed * 3.6).toBeGreaterThan(65);
    expect(truck.rpm).toBeLessThan(2300);
    expect(truck.fuel).toBeLessThan(100);
  });

  it('loses speed uphill and gains speed downhill with identical throttle', () => {
    const hill = new TruckPhysics();
    const valley = new TruckPhysics();
    hill.speed = valley.speed = 20;
    hill.gear = valley.gear = 10;
    simulate(hill, 5, coast, { ...dry, grade: 0.05 });
    simulate(valley, 5, coast, { ...dry, grade: -0.05 });
    expect(hill.speed).toBeLessThan(20);
    expect(valley.speed).toBeGreaterThan(20);
    expect(hill.forces.grade).toBeGreaterThan(0);
    expect(valley.forces.grade).toBeLessThan(0);
  });

  it('accelerates less with cargo at road speed', () => {
    const empty = new TruckPhysics({ mass: 17000 });
    const loaded = new TruckPhysics({ mass: 44000 });
    empty.speed = loaded.speed = 16;
    empty.gear = loaded.gear = 9;
    simulate(empty, 8);
    simulate(loaded, 8);
    expect(empty.speed).toBeGreaterThan(loaded.speed + 1);
  });

  it('requires more braking distance loaded and on wet pavement', () => {
    const emptyDry = stoppingDistance(17000, 0.78);
    const loadedDry = stoppingDistance(44000, 0.78);
    const loadedWet = stoppingDistance(44000, 0.44);
    expect(loadedDry).toBeGreaterThan(emptyDry * 1.25);
    expect(loadedWet).toBeGreaterThan(loadedDry * 1.2);
  });

  it('retarder slows a downhill truck and static brakes hold without reversing', () => {
    const free = new TruckPhysics();
    const retarded = new TruckPhysics();
    free.speed = retarded.speed = 20;
    free.gear = retarded.gear = 10;
    simulate(free, 10, coast, { ...dry, grade: -0.04 });
    simulate(retarded, 10, { ...coast, engineBrake: true }, { ...dry, grade: -0.04 });
    expect(retarded.speed).toBeLessThan(free.speed - 2);
    const held = new TruckPhysics();
    simulate(held, 3, { ...coast, brake: 1 }, { ...dry, grade: -0.1 });
    expect(held.speed).toBe(0);
  });

  it('scales aerodynamic drag quadratically and damage with impact energy', () => {
    const slow = new TruckPhysics();
    const fast = new TruckPhysics();
    slow.speed = 10;
    fast.speed = 20;
    slow.update(1 / 120, coast, dry);
    fast.update(1 / 120, coast, dry);
    expect(fast.forces.drag / slow.forces.drag).toBeCloseTo(4, 0);
    slow.impact(5);
    fast.impact(10);
    expect(fast.damage / slow.damage).toBeCloseTo(4);
    expect(fast.components.cargo).toBeGreaterThan(0);
  });
});
