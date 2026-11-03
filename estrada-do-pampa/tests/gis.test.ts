import { describe, expect, it } from 'vitest';
import { Route, type RouteData, type TerrainData } from '../src/road/Route';

// Analytic fixtures verify the projection and interpolation, not a fabricated road dataset.
const origin = { lat: -31.7, lon: -52.4, elevation: 30 };
const straight: RouteData = {
  metadata: { purpose: 'analytic test fixture' },
  points: [origin, { ...origin, lon: origin.lon + 0.01, elevation: 40 }, { ...origin, lon: origin.lon + 0.02, elevation: 50 }],
};

describe('GIS metric route', () => {
  it('projects longitude into regional metric coordinates at the correct latitude', () => {
    const route = new Route(straight);
    const expected = 6371008.8 * Math.PI / 180 * Math.cos(origin.lat * Math.PI / 180) * 0.02;
    expect(route.points[2].x).toBeCloseTo(expected, 6);
    expect(route.points[0].x).toBe(0);
    expect(route.points[0].z).toBeCloseTo(0, 10);
    expect(route.length).toBeCloseTo(Math.hypot(expected, 20), 6);
    const halfway = route.sample(route.length / 2);
    expect(halfway.lon).toBeCloseTo(origin.lon + 0.01, 10);
    expect(halfway.lat).toBeCloseTo(origin.lat, 10);
    expect(halfway.position.y).toBeCloseTo(40, 8);
    expect(halfway.grade).toBeCloseTo(20 / expected, 8);
  });

  it('keeps positions continuous and an orthonormal lateral frame along bends', () => {
    const route = new Route({ metadata: {}, points: [origin, { ...origin, lon: origin.lon + 0.002, elevation: 32 }, { ...origin, lon: origin.lon + 0.003, lat: origin.lat + 0.001, elevation: 34 }, { ...origin, lon: origin.lon + 0.004, lat: origin.lat + 0.002, elevation: 33 }] });
    let previous = route.sample(0);
    for (let s = 1; s <= route.length; s++) {
      const sample = route.sample(s);
      expect(sample.position.distanceTo(previous.position)).toBeLessThan(1.001);
      expect(sample.tangent.length()).toBeCloseTo(1, 8);
      expect(sample.right.length()).toBeCloseTo(1, 8);
      expect(sample.right.dot(sample.tangent)).toBeCloseTo(0, 8);
      expect(Number.isFinite(sample.grade)).toBe(true);
      previous = sample;
    }
  });

  it('round-trips road positions and signed lateral offsets', () => {
    const route = new Route(straight);
    const sample = route.sample(route.length * 0.37);
    for (const lateral of [-12, -1.8, 0, 1.8, 12]) {
      const point = sample.position.clone().addScaledVector(sample.right, lateral);
      const projected = route.project(point.x, point.z);
      expect(projected.s).toBeCloseTo(route.length * 0.37, 6);
      expect(projected.lateral).toBeCloseTo(lateral, 6);
      expect(projected.distance).toBeCloseTo(Math.abs(lateral), 6);
    }
    expect(route.sample(-100).position.distanceTo(route.points[0])).toBe(0);
    expect(route.sample(route.length + 100).position.distanceTo(route.points.at(-1)!)).toBe(0);
  });

  it('bilinearly interpolates the DEM while preserving the road bed', () => {
    const grid: TerrainData = { bounds: { west: -52.5, east: -52.3, south: -31.8, north: -31.6 }, width: 2, height: 2, elevations: [100, 200, 0, 100] };
    const route = new Route(straight, grid);
    const p = route.sample(route.length / 2);
    expect(route.terrainHeight(p.position.x, p.position.z)).toBeCloseTo(40, 6);
    const x = (grid.bounds.west - origin.lon) * Math.PI / 180 * 6371008.8 * Math.cos(origin.lat * Math.PI / 180);
    const z = -(grid.bounds.north - origin.lat) * Math.PI / 180 * 6371008.8;
    expect(route.terrainHeight(x, z)).toBeCloseTo(100, 6);
    expect(route.terrainHeight(x, -z)).toBeCloseTo(0, 6);
  });

  it('rejects missing geographic geometry explicitly', () => {
    expect(() => new Route({ metadata: {}, points: [] })).toThrow('Eixo geográfico ausente');
  });
});
