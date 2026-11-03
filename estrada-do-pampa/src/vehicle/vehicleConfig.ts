export interface TorquePoint {
  rpm: number;
  torque: number;
}

export interface VehicleConfig {
  mass: number;
  fuelCapacity: number;
  engineTorqueCurve: readonly TorquePoint[];
  idleRpm: number;
  maxRpm: number;
  gearRatios: readonly number[];
  finalDrive: number;
  transmissionEfficiency: number;
  wheelRadius: number;
  Cd: number;
  frontalArea: number;
  Crr: number;
  brakeForce: number;
  engineBrakeForce: number;
  drivenAxleWeightFraction: number;
  maxSteeringAngle: number;
  wheelbase: number;
  suspensionStiffness: number;
  suspensionDamping: number;
  tireFriction: { dry: number; wet: number; dirt: number; mud: number };
}

/** Generic 470 hp tractor / six axle articulated combination. SI units. */
export const vehicleConfig: VehicleConfig = {
  mass: 38000,
  fuelCapacity: 600,
  engineTorqueCurve: [
    { rpm: 600, torque: 650 },
    { rpm: 800, torque: 1500 },
    { rpm: 1000, torque: 2300 },
    { rpm: 1200, torque: 2450 },
    { rpm: 1400, torque: 2400 },
    { rpm: 1600, torque: 2160 },
    { rpm: 1800, torque: 1830 },
    { rpm: 2000, torque: 1320 },
    { rpm: 2200, torque: 0 },
  ],
  idleRpm: 600,
  maxRpm: 2200,
  gearRatios: [14.94, 11.73, 9.04, 7.09, 5.54, 4.35, 3.44, 2.7, 2.08, 1.63, 1.27, 1],
  finalDrive: 3.08,
  transmissionEfficiency: 0.93,
  wheelRadius: 0.51,
  Cd: 0.64,
  frontalArea: 10.3,
  Crr: 0.0065,
  brakeForce: 245000,
  engineBrakeForce: 22500,
  drivenAxleWeightFraction: 0.23,
  maxSteeringAngle: 0.55,
  wheelbase: 4.1,
  suspensionStiffness: 230000,
  suspensionDamping: 23000,
  tireFriction: { dry: 0.78, wet: 0.44, dirt: 0.43, mud: 0.24 },
};

export function engineTorqueAt(rpm: number, curve = vehicleConfig.engineTorqueCurve): number {
  if (curve.length === 0 || !Number.isFinite(rpm)) return 0;
  if (rpm <= curve[0].rpm) return curve[0].torque;
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if (rpm <= b.rpm) return a.torque + (b.torque - a.torque) * (rpm - a.rpm) / (b.rpm - a.rpm);
  }
  return 0;
}
