import {describe,expect,it} from 'vitest';
import {TruckPhysics,type DrivingInput,type RoadEnvironment} from '../src/vehicle/TruckPhysics';

const dry:RoadEnvironment={grade:0,friction:.78,offroad:false};
const reverse:DrivingInput={throttle:1,brake:0,emergency:false,engineBrake:false,reverse:true};
const forward:DrivingInput={...reverse,reverse:false};
function simulate(truck:TruckPhysics,seconds:number,input:DrivingInput=reverse,environment=dry){
  for(let i=0;i<Math.ceil(seconds*120);i++)truck.update(1/120,input,environment);
}

describe('reverse gear and signed truck dynamics',()=>{
  it('engages R, reverses progressively and limits maneuvering speed',()=>{
    const truck=new TruckPhysics();
    simulate(truck,10);
    expect(truck.gear).toBe(-1);
    expect(truck.speed).toBeLessThan(-1);
    expect(truck.speed).toBeGreaterThanOrEqual(-truck.config.reverseMaxSpeed);
    expect(truck.distance).toBeGreaterThan(10);
    expect(truck.fuel).toBeLessThan(100);
    expect(Number.isFinite(truck.consumption)).toBe(true);
    expect(truck.consumption).toBeGreaterThan(0);
    expect(truck.forces.drive).toBeLessThanOrEqual(0);
  });

  it('service brakes stop negative velocity without propelling the truck forward',()=>{
    const truck=new TruckPhysics();
    simulate(truck,6);
    const beforeDistance=truck.distance;
    simulate(truck,3,{...reverse,throttle:0,brake:1});
    expect(truck.speed).toBe(0);
    expect(truck.distance).toBeGreaterThan(beforeDistance);
    expect(truck.gear).toBe(-1);
    expect(truck.brakeTemperature).toBeGreaterThan(25);
  });

  it('brakes to a stop before allowing a moving truck to select the opposite direction',()=>{
    const truck=new TruckPhysics();
    truck.speed=18;truck.gear=10;
    truck.update(1/60,reverse,dry);
    expect(truck.directionChanging).toBe(true);
    expect(truck.gear).toBe(10);
    expect(truck.speed).toBeGreaterThan(0);
    expect(truck.forces.drive).toBe(0);
    expect(truck.forces.brake).toBeGreaterThan(0);
    simulate(truck,8);
    expect(truck.gear).toBe(-1);
    expect(truck.speed).toBeLessThan(0);
    truck.update(1/60,forward,dry);
    expect(truck.directionChanging).toBe(true);
    expect(truck.gear).toBe(-1);
    simulate(truck,8,forward);
    expect(truck.gear).toBeGreaterThan(0);
    expect(truck.speed).toBeGreaterThan(0);
  });

  it('keeps gravity referenced to the road, so reversing downhill gains speed',()=>{
    const descending=new TruckPhysics();const climbing=new TruckPhysics();
    descending.speed=climbing.speed=-2;descending.gear=climbing.gear=-1;
    const coast={...reverse,throttle:0};
    simulate(descending,1,coast,{...dry,grade:.04});
    simulate(climbing,1,coast,{...dry,grade:-.04});
    expect(descending.forces.grade).toBeGreaterThan(0);
    expect(climbing.forces.grade).toBeLessThan(0);
    expect(descending.speed).toBeLessThan(-2);
    expect(climbing.speed).toBeGreaterThan(-2);
  });

  it('cannot generate reverse torque with an empty fuel tank and resets to D',()=>{
    const truck=new TruckPhysics();truck.fuel=0;
    simulate(truck,4);
    expect(truck.gear).toBe(-1);
    expect(truck.forces.drive).toBe(0);
    expect(truck.speed).toBe(0);
    truck.reset();
    expect(truck.gear).toBe(1);
    expect(truck.directionChanging).toBe(false);
    expect(truck.speed).toBe(0);
  });
});
