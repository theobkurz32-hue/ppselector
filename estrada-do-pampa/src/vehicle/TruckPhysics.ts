import { engineTorqueAt, vehicleConfig, type VehicleConfig } from './vehicleConfig';

export interface DrivingInput {
  throttle: number;
  brake: number;
  emergency: boolean;
  engineBrake: boolean;
}

export interface RoadEnvironment {
  /** Rise/run: 0.05 means a 5% uphill grade. */
  grade: number;
  /** Actual coefficient of tire/road friction, e.g. 0.78 dry or 0.44 wet. */
  friction: number;
  offroad: boolean;
}

const GRAVITY = 9.81;
const AIR_DENSITY = 1.225;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/** Fixed-step force model; presentation and lateral dynamics stay independent. */
export class TruckPhysics {
  readonly config: VehicleConfig;
  speed = 0;
  rpm = 600;
  gear = 1;
  fuel = 100;
  damage = 0;
  distance = 0;
  acceleration = 0;
  brakeTemperature = 25;
  /** Instantaneous liters / 100 km, zero while stationary. */
  consumption = 0;
  totalFuelUsed = 0;
  engineTorque = 0;
  shifting = false;
  forces = { drive: 0, drag: 0, rolling: 0, grade: 0, brake: 0, engineBrake: 0 };
  components = { engine: 0, tires: 0, body: 0, cargo: 0 };

  private shiftTime = 0;
  private shiftCooldown = 0;
  private accelerator = 0;

  constructor(config: Partial<VehicleConfig> = {}) {
    this.config = { ...vehicleConfig, ...config };
    this.rpm = this.config.idleRpm;
  }

  update(dt: number, input: DrivingInput, environment: RoadEnvironment): void {
    if (!Number.isFinite(dt) || dt <= 0) return;
    // Deterministic substeps protect standstill, gearbox and braking integration.
    const duration = Math.min(dt, 0.25);
    const steps = Math.ceil(duration / (1 / 120));
    for (let i = 0; i < steps; i++) this.integrate(duration / steps, input, environment);
  }

  private wheelRpm(gear = this.gear): number {
    const ratio = this.config.gearRatios[gear - 1];
    return this.speed / (2 * Math.PI * this.config.wheelRadius) * 60 * ratio * this.config.finalDrive;
  }

  private changeGear(next: number): void {
    if (next === this.gear) return;
    this.gear = clamp(next, 1, this.config.gearRatios.length);
    this.shiftTime = 0.38;
    this.shiftCooldown = 1.0;
  }

  private automaticGearbox(dt: number, throttle: number, grade: number, engineBrake: boolean): void {
    this.shiftTime = Math.max(0, this.shiftTime - dt);
    this.shiftCooldown = Math.max(0, this.shiftCooldown - dt);
    this.shifting = this.shiftTime > 0;
    if (this.shiftCooldown > 0 || this.shifting) return;
    const coupledRpm = this.wheelRpm();
    const uphillDemand = Math.max(0, grade) * this.config.mass / 38000;
    const upshiftRpm = throttle > 0.8 ? 1770 + Math.min(180, uphillDemand * 1600) : 1450;
    const downshiftRpm = throttle > 0.6 ? 1080 + Math.min(170, uphillDemand * 1800) : 850;
    if (coupledRpm > upshiftRpm && this.gear < this.config.gearRatios.length && !engineBrake) {
      this.changeGear(this.gear + 1);
    } else if (this.gear > 1 && coupledRpm < downshiftRpm) {
      // Reject reductions that would over-rev the engine.
      if (this.wheelRpm(this.gear - 1) < 1950) this.changeGear(this.gear - 1);
    } else if (engineBrake && this.gear > 1 && this.wheelRpm(this.gear - 1) < 1850) {
      this.changeGear(this.gear - 1);
    }
  }

  private integrate(dt: number, input: DrivingInput, environment: RoadEnvironment): void {
    const mass = Math.max(8000, this.config.mass);
    const throttleTarget = this.fuel > 0 && this.components.engine < 100 ? clamp(input.throttle, 0, 1) : 0;
    const brake = input.emergency ? 1 : clamp(input.brake, 0, 1);
    // Turbo/clutch engagement introduces a short, continuous torque response.
    this.accelerator += (throttleTarget - this.accelerator) * (1 - Math.exp(-dt * 3.5));
    const throttle = brake > 0.2 ? 0 : this.accelerator;
    this.automaticGearbox(dt, throttle, environment.grade, input.engineBrake);
    const wheelRpm = this.wheelRpm();
    const launchRpm = this.config.idleRpm + throttle * 520;
    const targetRpm = Math.max(wheelRpm, launchRpm);
    this.rpm += (Math.min(targetRpm, this.config.maxRpm + 300) - this.rpm) * (1 - Math.exp(-dt * 10));

    const theta = Math.atan(clamp(environment.grade, -0.4, 0.4));
    const normalForce = mass * GRAVITY * Math.cos(theta);
    const friction = clamp(environment.friction, 0.08, 1.2);
    const tractionLimit = friction * normalForce * this.config.drivenAxleWeightFraction;
    this.engineTorque = engineTorqueAt(this.rpm, this.config.engineTorqueCurve) * throttle * (1 - this.components.engine * 0.006);
    const ratio = this.config.gearRatios[this.gear - 1] * this.config.finalDrive;
    const torqueAtWheels = this.engineTorque * ratio * this.config.transmissionEfficiency / this.config.wheelRadius;
    this.forces.drive = this.shifting || this.rpm >= this.config.maxRpm ? 0 : Math.min(torqueAtWheels, tractionLimit);
    this.forces.drag = 0.5 * AIR_DENSITY * this.config.Cd * this.config.frontalArea * this.speed ** 2;
    this.forces.rolling = this.config.Crr * (environment.offroad ? 4.2 : 1) * normalForce;
    this.forces.grade = mass * GRAVITY * Math.sin(theta);
    const fade = clamp(1 - Math.max(0, this.brakeTemperature - 320) / 500, 0.4, 1);
    this.forces.brake = Math.min(brake * this.config.brakeForce * fade, friction * normalForce);
    const engineBrakingDemand = input.engineBrake ? this.config.engineBrakeForce * Math.min(1.45, this.rpm / 1500) : throttle < 0.02 ? 1800 : 0;
    this.forces.engineBrake = Math.min(engineBrakingDemand, tractionLimit);
    const stoppingForce = this.forces.rolling + this.forces.brake + this.forces.engineBrake;
    const movingForce = this.forces.drive - this.forces.drag - this.forces.grade;
    // A stopped vehicle remains held by static resistance; this forward-only model has no reverse gear.
    const netForce = this.speed > 0.01 ? movingForce - stoppingForce : Math.max(0, movingForce - stoppingForce);
    const previousSpeed = this.speed;
    this.speed = clamp(this.speed + netForce / mass * dt, 0, 45);
    if (this.speed < 0.02 && movingForce <= stoppingForce) this.speed = 0;
    this.acceleration = (this.speed - previousSpeed) / dt;
    this.distance += (previousSpeed + this.speed) * 0.5 * dt;
    const brakePower = this.forces.brake * this.speed;
    this.brakeTemperature += (brakePower / 250000 - (this.brakeTemperature - 25) * 0.008) * dt;

    // Brake-specific fuel consumption ~205 g/kWh, diesel density 0.832 kg/L.
    const powerKw = this.engineTorque * this.rpm * 2 * Math.PI / 60 / 1000;
    const litersPerHour = 1.8 + Math.max(0, powerKw) * 0.205 / 0.832;
    const used = litersPerHour / 3600 * dt;
    this.totalFuelUsed += used;
    this.fuel = Math.max(0, this.fuel - used / this.config.fuelCapacity * 100);
    this.consumption = this.speed > 1 ? litersPerHour / (this.speed * 3.6) * 100 : 0;
  }

  impact(relativeSpeed: number): void {
    const impactSpeed = Math.max(0, Math.abs(relativeSpeed));
    const severity = clamp(impactSpeed ** 2 / 22, 0, 100);
    this.components.body = clamp(this.components.body + severity, 0, 100);
    this.components.engine = clamp(this.components.engine + severity * 0.35, 0, 100);
    this.components.tires = clamp(this.components.tires + severity * 0.25, 0, 100);
    this.components.cargo = clamp(this.components.cargo + severity * 0.65, 0, 100);
    this.damage = (this.components.body + this.components.engine + this.components.tires + this.components.cargo) / 4;
    // Inelastic impulse against a fixed/heavier obstacle; caller determines relative impact velocity.
    this.speed *= 0.28;
  }

  reset(): void {
    this.speed = this.distance = this.acceleration = this.damage = this.totalFuelUsed = this.consumption = 0;
    this.fuel = 100;
    this.gear = 1;
    this.rpm = this.config.idleRpm;
    this.brakeTemperature = 25;
    this.shiftTime = this.shiftCooldown = this.accelerator = 0;
    this.shifting = false;
    this.components = { engine: 0, tires: 0, body: 0, cargo: 0 };
    this.forces = { drive: 0, drag: 0, rolling: 0, grade: 0, brake: 0, engineBrake: 0 };
  }
}
