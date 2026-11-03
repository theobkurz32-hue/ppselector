import { describe, expect, it } from 'vitest';
import routeJson from '../public/maps/route.json';
import terrainJson from '../public/maps/terrain.json';
import { Route, type RouteData, type TerrainData } from '../src/road/Route';

const data: RouteData = routeJson;
const terrain: TerrainData = terrainJson;
const route = new Route(data, terrain);

describe('cached real BR-293 corridor', () => {
  it('retains OSM provenance and the BR-293 road reference', () => {
    expect(data.metadata.roadRef).toBe('BR-293');
    expect(String(data.metadata.source)).toMatch(/OpenStreetMap/i);
    expect(String(data.metadata.license)).toMatch(/ODbL/i);
    expect(typeof data.metadata.elevationSource).toBe('string');
    expect(String(data.metadata.elevationSource)).toMatch(/DEM|SRTM|Copernicus|Terrarium/i);
    expect(String(data.metadata.elevationSource)).not.toMatch(/pending|placeholder|procedural/i);
  });

  it('runs from the Pelotas BR-116 junction to the ERS-702 access, rather than Piratini city', () => {
    const start = data.points[0], destination = data.points.at(-1)!;
    expect(start.lon).toBeCloseTo(-52.434185, 5);
    expect(start.lat).toBeCloseTo(-31.756707, 5);
    expect(destination.lon).toBeCloseTo(-52.959948, 5);
    expect(destination.lat).toBeCloseTo(-31.699132, 5);
    expect(route.length).toBeGreaterThan(49000);
    expect(route.length).toBeLessThan(53000);
    expect(String(data.metadata.name)).toMatch(/ERS-702/);
  });

  it('has continuous metric geometry with finite coordinates and plausible grades', () => {
    const spans = route.distances.slice(1).map((s, i) => s - route.distances[i]);
    expect(spans.every(span => Number.isFinite(span) && span > 0)).toBe(true);
    // Dense elevation sampling must stay below 100 m; original sparse OSM
    // geometry may contain long surveyed straight sections, bounded to 3 km.
    const denseProfile = data.points.length > route.length / 100;
    expect(Math.max(...spans)).toBeLessThanOrEqual(denseProfile ? 100 : 3000);
    for (let s = 0; s <= route.length; s += 25) {
      const sample = route.sample(s);
      expect([sample.lat, sample.lon, sample.position.x, sample.position.y, sample.position.z].every(Number.isFinite)).toBe(true);
      expect(Math.abs(sample.grade)).toBeLessThan(0.15);
      const next = route.sample(s + 25);
      expect(next.position.distanceTo(sample.position)).toBeLessThanOrEqual(25.001);
    }
  });

  it('contains a non-flat, plausible measured elevation profile', () => {
    const elevations = data.points.map(point => point.elevation);
    expect(elevations.every(Number.isFinite)).toBe(true);
    expect(Math.min(...elevations)).toBeGreaterThanOrEqual(-10);
    expect(Math.max(...elevations)).toBeLessThan(600);
    expect(Math.max(...elevations) - Math.min(...elevations)).toBeGreaterThan(40);
    expect(elevations.some(value => value !== 0)).toBe(true);
  });

  it('ships a complete numeric DEM grid covering the entire corridor', () => {
    expect(Number.isInteger(terrain.width)).toBe(true);
    expect(Number.isInteger(terrain.height)).toBe(true);
    expect(terrain.width).toBeGreaterThan(1);
    expect(terrain.height).toBeGreaterThan(1);
    expect(terrain.elevations.length).toBe(terrain.width * terrain.height);
    expect(terrain.elevations.every(value => Number.isFinite(value) && value >= -20 && value < 1000)).toBe(true);
    expect(terrain.bounds.west).toBeLessThan(terrain.bounds.east);
    expect(terrain.bounds.south).toBeLessThan(terrain.bounds.north);
    for (const point of data.points) {
      expect(point.lon).toBeGreaterThanOrEqual(terrain.bounds.west);
      expect(point.lon).toBeLessThanOrEqual(terrain.bounds.east);
      expect(point.lat).toBeGreaterThanOrEqual(terrain.bounds.south);
      expect(point.lat).toBeLessThanOrEqual(terrain.bounds.north);
    }
  });
});
