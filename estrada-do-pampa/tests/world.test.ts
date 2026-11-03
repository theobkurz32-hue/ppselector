import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Mesh, MeshStandardMaterial, Raycaster, Vector3 } from 'three';
import routeJson from '../public/maps/route.json';
import terrainJson from '../public/maps/terrain.json';
import { Route } from '../src/road/Route';
import { World } from '../src/world/World';

const route = new Route(routeJson, terrainJson);
const noop = () => {};

beforeAll(() => {
  // Drawing is irrelevant to these geometry regressions; no GPU or DOM is needed.
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag !== 'canvas') throw new Error(`Unexpected element ${tag}`);
      return {
        width: 0, height: 0,
        getContext: () => ({
          createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
          putImageData: noop, fillRect: noop, strokeRect: noop,
          beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop, fillText: noop,
        }),
      };
    },
  });
});
afterAll(() => vi.unstubAllGlobals());

function groundSurfaces(world: World): Mesh[] {
  const surfaces: Mesh[] = [];
  world.group.traverse(object => {
    if (object instanceof Mesh && object.material instanceof MeshStandardMaterial && object.material.vertexColors) surfaces.push(object);
  });
  return surfaces;
}

describe('terrain rendering on strict mobile GPUs', () => {
  it.each(['LOW', 'MEDIUM', 'HIGH', 'ULTRA'])('provides complete vertex buffers and a green ground material at %s', quality => {
    const world = new World(route); world.update(1200, quality);
    const surfaces = groundSurfaces(world);
    expect(surfaces.length).toBeGreaterThan(1);
    for (const mesh of surfaces) {
      const geometry = mesh.geometry, position = geometry.getAttribute('position');
      // A short normal buffer invalidates the whole indexed draw on mobile GPUs.
      for (const name of ['normal', 'color', 'uv']) {
        expect(geometry.getAttribute(name), `${quality} ground lacks ${name}`).toBeDefined();
        expect(geometry.getAttribute(name).count, `${quality} ${name} buffer is truncated`).toBe(position.count);
      }
      let largestIndex = 0;
      for (const index of geometry.index!.array) largestIndex = Math.max(largestIndex, index);
      expect(largestIndex).toBeLessThan(position.count);
      const normals = geometry.getAttribute('normal');
      for (let i = 0; i < normals.count; i++) {
        expect(Number.isFinite(normals.getX(i)) && Number.isFinite(normals.getY(i)) && Number.isFinite(normals.getZ(i))).toBe(true);
      }
      const material = mesh.material as MeshStandardMaterial;
      expect(material.color.g).toBeGreaterThan(material.color.r);
      expect(material.color.g).toBeGreaterThan(material.color.b);
    }
  });

  it('keeps a ground surface around the road before nearby detailed chunks finish streaming', () => {
    const world = new World(route); world.update(1200, 'HIGH');
    world.group.updateMatrixWorld(true);
    const player = route.sample(1200).position, ray = new Raycaster();
    const surfaces = groundSurfaces(world);
    // The first update deliberately builds only a few chunks. The horizon must
    // cover the rest instead of exposing the pale sky through the ground.
    for (const dx of [-713, 291, 713]) for (const dz of [-713, 291, 713]) {
      ray.set(new Vector3(player.x + dx, 1000, player.z + dz), new Vector3(0, -1, 0));
      expect(ray.intersectObjects(surfaces, false).length, `missing ground at ${dx},${dz}`).toBeGreaterThan(0);
    }
  });
});
