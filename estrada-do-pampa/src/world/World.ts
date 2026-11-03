import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Route } from '../road/Route';

const ROAD_CHUNK = 400;
const TERRAIN_CHUNK = 512;
const UP = new THREE.Vector3(0, 1, 0);

function random(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = Math.imul(state ^ state >>> 16, 0x21f0aaad);
    state = Math.imul(state ^ state >>> 15, 0x735a2d97);
    state ^= state >>> 15;
    return (state >>> 0) / 4294967296;
  };
}

function roadTexture(kind: 'color' | 'normal' | 'roughness'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const data = ctx.createImageData(256, 256);
  const rng = random(293);
  for (let i = 0; i < data.data.length; i += 4) {
    const grain = rng() * 18 - 9;
    if (kind === 'normal') {
      data.data[i] = 128 + grain * 0.24;
      data.data[i + 1] = 128 + grain * 0.24;
      data.data[i + 2] = 255;
    } else {
      const value = kind === 'color' ? 69 + grain : 205 + grain;
      data.data[i] = value;
      data.data[i + 1] = value + (kind === 'color' ? 2 : 0);
      data.data[i + 2] = value + (kind === 'color' ? 1 : 0);
    }
    data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  if (kind === 'color') {
    ctx.strokeStyle = '#393d3b';
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(54, 0); ctx.lineTo(58, 30); ctx.lineTo(56, 55); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  if (kind === 'color') texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/** Neutral microtexture multiplies the green ground material without bleaching it. */
function pastureTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d')!, data = ctx.createImageData(256, 256), rng = random(29371);
  for (let i = 0; i < data.data.length; i += 4) {
    const grain = rng() * 19 - 9;
    data.data[i] = 226 + grain; data.data[i + 1] = 232 + grain;
    data.data[i + 2] = 213 + grain; data.data[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
  for (let i = 0; i < 1500; i++) {
    const x = rng() * 256, y = rng() * 256;
    ctx.strokeStyle = i % 3 ? 'rgba(105,128,71,.11)' : 'rgba(241,244,220,.15)';
    ctx.lineWidth = .55; ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + rng() * 3 - 1.5, y - 1 - rng() * 4); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = 4;
  return texture;
}

function signTexture(lines: string[], background = '#195346'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = background; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#eeeadd'; ctx.lineWidth = 7; ctx.strokeRect(10, 10, 492, 236);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fffef1';
  ctx.font = '600 39px Arial';
  lines.forEach((line, i) => ctx.fillText(line, 256, 128 + (i - (lines.length - 1) / 2) * 57, 465));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function owned<T extends THREE.Material>(material: T): T { material.userData.chunkOwned = true; return material; }

interface Chunk { group: THREE.Group; geometries: THREE.BufferGeometry[]; textures?: THREE.Texture[]; detail?: number }

/** Offline DEM terrain and route mesh; only scenery placement is procedural. */
export class World {
  readonly group = new THREE.Group();
  chunkCount = 0;
  private roads = new Map<number, Chunk>();
  private terrains = new Map<string, Chunk>();
  private asphalt: THREE.MeshStandardMaterial;
  private readonly shoulder = new THREE.MeshStandardMaterial({ color: 0x666459, roughness: 0.98 });
  private readonly yellow = new THREE.MeshStandardMaterial({ color: 0xd8b853, roughness: 0.8 });
  private readonly white = new THREE.MeshStandardMaterial({ color: 0xd9dbca, roughness: 0.85 });
  private readonly terrainMaterial = new THREE.MeshStandardMaterial({ color: 0x769653, vertexColors: true, roughness: 1, metalness: 0, flatShading: false });
  private readonly trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x62594a, roughness: 1 });
  private readonly leafMaterial = new THREE.MeshStandardMaterial({ color: 0x4a6040, roughness: 1 });
  private readonly grassMaterial = new THREE.MeshStandardMaterial({ color: 0x64883e, side: THREE.DoubleSide, roughness: 1 });
  private readonly timber = new THREE.MeshStandardMaterial({ color: 0x888573, roughness: 1 });
  private readonly metal = new THREE.MeshStandardMaterial({ color: 0x9a9a8e, metalness: 0.35, roughness: 0.65 });
  private readonly dark = new THREE.MeshStandardMaterial({ color: 0x393c35, roughness: 0.8 });
  private readonly trunkGeometry = new THREE.CylinderGeometry(0.16, 0.25, 1, 5);
  private readonly crownGeometry = new THREE.IcosahedronGeometry(1, 1);
  private readonly grassGeometry: THREE.BufferGeometry;
  private readonly unitBox = new THREE.BoxGeometry(1, 1, 1);
  private readonly unitPole = new THREE.CylinderGeometry(0.1, 0.12, 1, 5);
  private lastQuality = '';
  private horizon?: Chunk;
  private horizonKey = '';
  private horizonCoverage = '';
  private horizonGeometry?: THREE.BufferGeometry;
  private horizonCells: Array<{ key: string; indices: number[] }> = [];
  private readonly roadExclusions = new Map<string, Array<[number, number, number, number]>>();

  constructor(private readonly route: Route) {
    this.asphalt = new THREE.MeshStandardMaterial({
      color: 0xc0c0b8, map: roadTexture('color'), normalMap: roadTexture('normal'),
      roughnessMap: roadTexture('roughness'), normalScale: new THREE.Vector2(0.3, 0.3),
      roughness: 0.94, metalness: 0.015,
    });
    this.terrainMaterial.map = pastureTexture();
    this.grassGeometry = new THREE.BufferGeometry();
    this.grassGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -0.18, 0, 0, 0.18, 0, 0, 0.04, 0.65, 0, 0, 0, -0.18, 0, 0, 0.18, 0, 0.55, -0.03,
    ], 3));
    this.grassGeometry.computeVertexNormals();
    this.group.name = 'BR-293 · terreno e faixa de domínio';
    // Only nearby line segments matter for roadside vegetation exclusion.
    for (let i = 0; i < route.points.length - 1; i++) {
      const a = route.points[i], b = route.points[i + 1];
      for (let x = Math.floor((Math.min(a.x, b.x) - 20) / 64); x <= Math.floor((Math.max(a.x, b.x) + 20) / 64); x++) {
        for (let z = Math.floor((Math.min(a.z, b.z) - 20) / 64); z <= Math.floor((Math.max(a.z, b.z) + 20) / 64); z++) {
          const key = `${x}:${z}`;
          if (!this.roadExclusions.has(key)) this.roadExclusions.set(key, []);
          this.roadExclusions.get(key)!.push([a.x, a.z, b.x, b.z]);
        }
      }
    }
  }

  setWetness(wet: number): void {
    this.asphalt.roughness = THREE.MathUtils.lerp(0.94, 0.48, wet);
    this.asphalt.color.setScalar(THREE.MathUtils.lerp(0.75, 0.48, wet));
    this.asphalt.metalness = 0.015 + wet * 0.035;
  }

  update(s: number, quality: string): void {
    const level = quality.toUpperCase();
    if (level !== this.lastQuality && this.lastQuality) {
      this.terrains.forEach(chunk => this.remove(chunk));
      this.terrains.clear();
    }
    this.lastQuality = level;
    const radius = level === 'LOW' ? 2 : level === 'ULTRA' ? 4 : 3;
    const roadRadius = level === 'LOW' ? 3 : level === 'ULTRA' ? 7 : 5;
    const centerRoad = Math.floor(s / ROAD_CHUNK);
    for (const [index, chunk] of this.roads) {
      if (Math.abs(index - centerRoad) > roadRadius + 1) { this.remove(chunk); this.roads.delete(index); }
    }
    for (let i = -roadRadius; i <= roadRadius; i++) {
      const index = centerRoad + i;
      if (index >= 0 && index * ROAD_CHUNK < this.route.length && !this.roads.has(index)) {
        const chunk = this.createRoad(index); this.roads.set(index, chunk); this.group.add(chunk.group);
      }
    }
    const position = this.route.sample(s).position;
    const cx = Math.floor(position.x / TERRAIN_CHUNK), cz = Math.floor(position.z / TERRAIN_CHUNK);
    for (const [key, chunk] of this.terrains) {
      const [x, z] = key.split(':').map(Number);
      if (Math.abs(x - cx) > radius || Math.abs(z - cz) > radius || (chunk.detail === 1 && Math.hypot(x - cx, z - cz) < 1.8)) { this.remove(chunk); this.terrains.delete(key); }
    }
    const candidates: { x: number; z: number; distance: number }[] = [];
    for (let x = cx - radius; x <= cx + radius; x++) {
      for (let z = cz - radius; z <= cz + radius; z++) {
        if (!this.terrains.has(`${x}:${z}`)) candidates.push({ x, z, distance: Math.hypot(x - cx, z - cz) });
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    const budget = this.terrains.size ? 2 : 5;
    for (const candidate of candidates.slice(0, budget)) {
      const chunk = this.createTerrain(candidate.x, candidate.z, level, candidate.distance <= 1.8 ? 0 : 1);
      this.terrains.set(`${candidate.x}:${candidate.z}`, chunk); this.group.add(chunk.group);
    }
    const horizonKey = `${cx}:${cz}:${radius}`;
    if (horizonKey !== this.horizonKey) {
      if (this.horizon) this.remove(this.horizon);
      this.horizon = this.createHorizon(cx, cz, radius);
      this.horizonKey = horizonKey; this.group.add(this.horizon.group);
    }
    this.updateHorizonCoverage();
    this.chunkCount = this.roads.size + this.terrains.size + 1;
  }

  private remove(chunk: Chunk): void {
    this.group.remove(chunk.group);
    chunk.geometries.forEach(geometry => geometry.dispose());
    chunk.textures?.forEach(texture => texture.dispose());
    chunk.group.traverse(object => {
      if (object instanceof THREE.InstancedMesh) object.dispose();
      if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.filter(material => material.userData.chunkOwned).forEach(material => material.dispose());
      }
    });
  }

  private ribbon(start: number, end: number, left: number, right: number, lift: number, material: THREE.Material, step = 5): THREE.Mesh {
    const count = Math.max(1, Math.ceil((end - start) / step));
    const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
    for (let i = 0; i <= count; i++) {
      const distance = THREE.MathUtils.lerp(start, end, i / count);
      const sample = this.route.sample(distance);
      for (const lateral of [left, right]) {
        const point = sample.position.clone().addScaledVector(sample.right, lateral);
        positions.push(point.x, point.y + lift, point.z);
        uvs.push(lateral / 7.2, distance / 12);
      }
      if (i < count) { const a = i * 2; indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    // Account for both possible route basis orientations while keeping culling safe.
    const normals = geometry.getAttribute('normal');
    if (normals.getY(0) < 0) {
      for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2], indices[i + 1]];
      geometry.setIndex(indices); geometry.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true;
    mesh.frustumCulled = true;
    return mesh;
  }

  private createRoad(index: number): Chunk {
    const group = new THREE.Group();
    const geometries: THREE.BufferGeometry[] = [], textures: THREE.Texture[] = [];
    const start = index * ROAD_CHUNK, end = Math.min(this.route.length, start + ROAD_CHUNK);
    const strips = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const addRoad = (left: number, right: number, lift: number, material: THREE.Material, from = start, to = end) => {
      const mesh = this.ribbon(from, to, left, right, lift, material);
      if (!strips.has(material)) strips.set(material, []);
      strips.get(material)!.push(mesh.geometry);
    };
    addRoad(-5.4, 5.4, 0.065, this.shoulder);
    addRoad(-3.6, 3.6, 0.1, this.asphalt);
    addRoad(-3.38, -3.25, 0.115, this.white);
    addRoad(3.25, 3.38, 0.115, this.white);
    addRoad(-0.18, -0.07, 0.12, this.yellow);
    if (index % 5 === 2 || index % 5 === 3) addRoad(0.07, 0.18, 0.12, this.yellow);
    else for (let d = start; d < end; d += 12) addRoad(0.07, 0.18, 0.12, this.yellow, d, Math.min(d + 4, end));

    for (const [material, pieces] of strips) {
      const geometry = mergeGeometries(pieces)!;
      pieces.forEach(piece => piece.dispose());
      geometries.push(geometry);
      const mesh = new THREE.Mesh(geometry, material); mesh.receiveShadow = true; group.add(mesh);
    }

    const markers = new THREE.InstancedMesh(this.unitBox, this.white, Math.ceil((end - start) / 40) * 2);
    const matrix = new THREE.Matrix4(); const quat = new THREE.Quaternion(); let markerCount = 0;
    for (let d = start + 8; d < end; d += 40) {
      const sample = this.route.sample(d);
      for (const side of [-1, 1]) {
        const p = sample.position.clone().addScaledVector(sample.right, side * 5.65); p.y += 0.45;
        quat.setFromAxisAngle(UP, sample.heading);
        matrix.compose(p, quat, new THREE.Vector3(0.12, 0.85, 0.11)); markers.setMatrixAt(markerCount++, matrix);
      }
    }
    markers.count = markerCount; markers.castShadow = true; group.add(markers);

    this.createFences(group, start, end);
    this.createPowerLines(group, start, end, geometries);
    if (index % 2 === 0) {
      const distance = start + Math.min(110, (end - start) * 0.5);
      const remaining = Math.max(0, Math.round((this.route.length - distance) / 1000));
      const lines = remaining < 3 ? ['ACESSO A PIRATINI', `${Math.max(1, remaining)} km  ↗`] : ['BR-293  •  OESTE', `Piratini  ${remaining} km`];
      const texture = signTexture(lines); textures.push(texture);
      const sample = this.route.sample(distance), sign = new THREE.Group();
      const boardGeometry = new THREE.BoxGeometry(3.8, 1.9, 0.1); geometries.push(boardGeometry);
      const face = owned(new THREE.MeshStandardMaterial({ map: texture, roughness: 0.72 }));
      const board = new THREE.Mesh(boardGeometry, [this.metal, this.metal, this.metal, this.metal, face, this.metal]);
      board.position.y = 3.2; board.rotation.y = Math.PI; board.castShadow = true; sign.add(board);
      for (const x of [-1.4, 1.4]) { const pole = new THREE.Mesh(this.unitPole, this.metal); pole.position.set(x, 1.8, 0); pole.scale.y = 3.6; pole.castShadow = true; sign.add(pole); }
      sign.position.copy(sample.position).addScaledVector(sample.right, 8.7); sign.rotation.y = sample.heading;
      group.add(sign);
    }
    if (index % 3 === 1) this.createFarm(group, start + 220);
    return { group, geometries, textures };
  }

  private createFences(group: THREE.Group, start: number, end: number): void {
    const count = Math.ceil((end - start) / 12) * 2;
    const posts = new THREE.InstancedMesh(this.unitBox, this.timber, count);
    const wires = new THREE.InstancedMesh(this.unitBox, this.dark, count * 3);
    const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion();
    let pi = 0, wi = 0;
    for (const side of [-1, 1]) {
      for (let d = start; d < end; d += 12) {
        const a = this.route.sample(d), b = this.route.sample(Math.min(end, d + 12));
        const p = a.position.clone().addScaledVector(a.right, side * 18);
        p.y = this.route.terrainHeight(p.x, p.z);
        quaternion.setFromAxisAngle(UP, a.heading);
        matrix.compose(p.clone().add(new THREE.Vector3(0, 0.7, 0)), quaternion, new THREE.Vector3(0.14, 1.4, 0.14)); posts.setMatrixAt(pi++, matrix);
        const q = b.position.clone().addScaledVector(b.right, side * 18);
        q.y = this.route.terrainHeight(q.x, q.z);
        const delta = q.clone().sub(p), center = p.clone().add(q).multiplyScalar(0.5);
        const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), delta.clone().normalize());
        for (const height of [0.45, 0.85, 1.15]) {
          matrix.compose(center.clone().add(new THREE.Vector3(0, height, 0)), orientation, new THREE.Vector3(0.017, 0.017, delta.length())); wires.setMatrixAt(wi++, matrix);
        }
      }
    }
    posts.count = pi; wires.count = wi; posts.castShadow = true; group.add(posts, wires);
  }

  private createPowerLines(group: THREE.Group, start: number, end: number, geometries: THREE.BufferGeometry[]): void {
    const points: THREE.Vector3[] = [];
    for (let d = Math.ceil(start / 80) * 80; d <= end + 80; d += 80) {
      const sample = this.route.sample(Math.min(d, this.route.length));
      const p = sample.position.clone().addScaledVector(sample.right, -23);
      p.y = this.route.terrainHeight(p.x, p.z);
      if (d <= end) {
        const pole = new THREE.Mesh(this.unitPole, this.timber); pole.position.copy(p).add(new THREE.Vector3(0, 4.5, 0)); pole.scale.set(1.1, 9, 1.1); pole.castShadow = true; group.add(pole);
        const arm = new THREE.Mesh(this.unitBox, this.timber); arm.scale.set(2.2, 0.12, 0.14); arm.position.copy(p).add(new THREE.Vector3(0, 8.5, 0)); arm.rotation.y = sample.heading; group.add(arm);
      }
      const top = p.clone().add(new THREE.Vector3(0, 8.5, 0));
      if (points.length) {
        const prev = points[points.length - 1].clone();
        points.push(prev.clone().lerp(top, 0.5).add(new THREE.Vector3(0, -0.6, 0)));
      }
      points.push(top);
    }
    if (points.length > 1) {
      const geometry = new THREE.BufferGeometry().setFromPoints(points); geometries.push(geometry);
      group.add(new THREE.Line(geometry, owned(new THREE.LineBasicMaterial({ color: 0x4f5147, transparent: true, opacity: 0.7 }))));
    }
  }

  private createFarm(group: THREE.Group, distance: number): void {
    const sample = this.route.sample(Math.min(distance, this.route.length));
    const farm = new THREE.Group(); farm.position.copy(sample.position).addScaledVector(sample.right, 85);
    farm.position.y = this.route.terrainHeight(farm.position.x, farm.position.z);
    farm.rotation.y = sample.heading + 0.22;
    const wall = new THREE.Mesh(this.unitBox, owned(new THREE.MeshStandardMaterial({ color: 0xc2bba2, roughness: 0.95 })));
    wall.scale.set(13, 4.5, 8); wall.position.y = 2.25; wall.castShadow = true; wall.receiveShadow = true; farm.add(wall);
    const roof = new THREE.Mesh(this.unitBox, owned(new THREE.MeshStandardMaterial({ color: 0x855b47, roughness: 0.9 })));
    roof.scale.set(14.2, 0.3, 9.2); roof.position.y = 4.65; roof.rotation.x = -0.07; roof.castShadow = true; farm.add(roof);
    for (const x of [-4, 0, 4]) {
      const window = new THREE.Mesh(this.unitBox, this.dark); window.scale.set(1.3, 1.3, 0.06); window.position.set(x, 2.8, 4.04); farm.add(window);
    }
    const shed = new THREE.Mesh(this.unitBox, owned(new THREE.MeshStandardMaterial({ color: 0x878779, metalness: 0.15, roughness: 0.8 })));
    shed.scale.set(15, 5, 22); shed.position.set(-23, 2.5, -12); shed.castShadow = true; farm.add(shed);
    const tank = new THREE.Mesh(this.unitPole, this.metal); tank.scale.set(18, 6, 18); tank.position.set(20, 3, -10); farm.add(tank);
    group.add(farm);
  }

  private createTerrain(cx: number, cz: number, quality: string, detail: number): Chunk {
    const group = new THREE.Group(), geometries: THREE.BufferGeometry[] = [];
    const originX = cx * TERRAIN_CHUNK, originZ = cz * TERRAIN_CHUNK;
    const divisions = quality === 'LOW' ? 12 : detail === 0 ? 24 : 12;
    const geometry = new THREE.PlaneGeometry(TERRAIN_CHUNK, TERRAIN_CHUNK, divisions, divisions);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute('position');
    const colors: number[] = [], color = new THREE.Color();
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i) + originX + TERRAIN_CHUNK / 2;
      const z = position.getZ(i) + originZ + TERRAIN_CHUNK / 2;
      position.setXYZ(i, x, this.route.terrainHeight(x, z) - 0.08, z);
      const patch = (Math.sin(x * 0.013 + Math.cos(z * 0.009)) + Math.sin(z * 0.02 + x * 0.006)) * 0.5;
      const field = Math.sin(x * 0.0009 + z * 0.002) > 0.45;
      color.set(field ? 0xe2e5d0 : 0xd4dfc1);
      color.multiplyScalar(0.92 + patch * 0.09); colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    // Vertical skirts hide T-junctions where neighboring terrain LODs differ.
    const skirtPositions = Array.from(position.array), skirtColors = [...colors], skirtIndices = Array.from(geometry.index!.array);
    const edge: number[] = [];
    for (let x = 0; x < divisions; x++) edge.push(x);
    for (let z = 0; z < divisions; z++) edge.push(z * (divisions + 1) + divisions);
    for (let x = divisions; x > 0; x--) edge.push(divisions * (divisions + 1) + x);
    for (let z = divisions; z > 0; z--) edge.push(z * (divisions + 1));
    for (let i = 0; i < edge.length; i++) {
      const a = edge[i], b = edge[(i + 1) % edge.length], first = skirtPositions.length / 3;
      for (const [vertex, drop] of [[a, 0], [b, 0], [a, 18], [b, 18]]) {
        skirtPositions.push(position.getX(vertex), position.getY(vertex) - drop, position.getZ(vertex));
        skirtColors.push(colors[vertex * 3], colors[vertex * 3 + 1], colors[vertex * 3 + 2]);
      }
      skirtIndices.push(first, first + 1, first + 2, first + 1, first + 3, first + 2);
    }
    // PlaneGeometry's original normal buffer is too small after adding skirts.
    // Reusing it makes strict mobile GPUs reject the entire terrain draw call.
    geometry.deleteAttribute('normal');
    const uvs: number[] = [];
    for (let i = 0; i < skirtPositions.length; i += 3) uvs.push(skirtPositions[i] / 8, skirtPositions[i + 2] / 8);
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(skirtPositions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(skirtColors, 3));
    geometry.setIndex(skirtIndices); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); geometries.push(geometry);
    const terrain = new THREE.Mesh(geometry, this.terrainMaterial); terrain.receiveShadow = true; group.add(terrain);
    this.createVegetation(group, cx, cz, quality, detail);
    return { group, geometries, detail };
  }


  private createHorizon(cx: number, cz: number, _nearRadius: number): Chunk {
    const group = new THREE.Group(), positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
    this.horizonCells = []; this.horizonCoverage = '';
    const outerRadius = 12, grid = 256;
    const minX = (cx - outerRadius) * TERRAIN_CHUNK, minZ = (cz - outerRadius) * TERRAIN_CHUNK;
    const size = (outerRadius * 2 + 1) * TERRAIN_CHUNK, count = size / grid;
    for (let z = 0; z <= count; z++) for (let x = 0; x <= count; x++) {
      const px = minX + x * grid, pz = minZ + z * grid;
      positions.push(px, this.route.terrainHeight(px, pz) - 0.35, pz);
      uvs.push(px / 8, pz / 8);
      const color = new THREE.Color(0xd9e1c8);
      color.multiplyScalar(0.94 + Math.sin(px * 0.0015 + pz * 0.002) * 0.04);
      colors.push(color.r, color.g, color.b);
    }
    for (let z = 0; z < count; z++) for (let x = 0; x < count; x++) {
      const px = minX + (x + 0.5) * grid, pz = minZ + (z + 0.5) * grid;
      const a = z * (count + 1) + x, b = a + count + 1;
      const cellIndices = [a, b, a + 1, a + 1, b, b + 1];
      this.horizonCells.push({ key: `${Math.floor(px / TERRAIN_CHUNK)}:${Math.floor(pz / TERRAIN_CHUNK)}`, indices: cellIndices });
      indices.push(...cellIndices);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals(); this.horizonGeometry = geometry;
    const mesh = new THREE.Mesh(geometry, this.terrainMaterial); group.add(mesh);
    return { group, geometries: [geometry] };
  }

  private updateHorizonCoverage(): void {
    if (!this.horizonGeometry) return;
    const coverage = [...this.terrains.keys()].sort().join('|');
    if (coverage === this.horizonCoverage) return;
    this.horizonCoverage = coverage;
    const indices: number[] = [];
    // A coarse green surface stays visible until each detailed chunk exists.
    // Replacing indices avoids resampling the DEM while mobile streaming catches up.
    for (const cell of this.horizonCells) if (!this.terrains.has(cell.key)) indices.push(...cell.indices);
    this.horizonGeometry.setIndex(indices);
  }

  private closeToRoad(x: number, z: number, minimum: number): boolean {
    const segments = this.roadExclusions.get(`${Math.floor(x / 64)}:${Math.floor(z / 64)}`);
    if (!segments) return false;
    return segments.some(([ax, az, bx, bz]) => {
      const dx = bx - ax, dz = bz - az;
      const t = THREE.MathUtils.clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
      return (x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2 < minimum ** 2;
    });
  }

  private createVegetation(group: THREE.Group, cx: number, cz: number, quality: string, detail: number): void {
    const rng = random(Math.imul(cx + 781, 73856093) ^ Math.imul(cz - 1627, 19349663));
    const count = Math.round((quality === 'LOW' ? 20 : quality === 'ULTRA' ? 95 : 60) * (detail === 0 ? 1 : 0.55));
    const trunks = new THREE.InstancedMesh(this.trunkGeometry, this.trunkMaterial, count);
    const crowns = new THREE.InstancedMesh(this.crownGeometry, this.leafMaterial, count * 3);
    const matrix = new THREE.Matrix4(), quat = new THREE.Quaternion(), color = new THREE.Color();
    let used = 0;
    for (let i = 0; i < count; i++) {
      const x = (cx + rng()) * TERRAIN_CHUNK, z = (cz + rng()) * TERRAIN_CHUNK;
      // Broad open grassland alternates with small clumps rather than a forest carpet.
      const patch = Math.sin(x * 0.008) * Math.cos(z * 0.006) + Math.sin((x + z) * 0.004);
      if (patch < 0.22 && rng() > 0.18) continue;
      if (this.closeToRoad(x, z, 13)) continue;
      const y = this.route.terrainHeight(x, z), height = 4.5 + rng() * 7.5, slender = rng() < 0.24;
      quat.setFromAxisAngle(UP, rng() * Math.PI * 2);
      matrix.compose(new THREE.Vector3(x, y + height * 0.35, z), quat, new THREE.Vector3(0.8, height * 0.7, 0.8)); trunks.setMatrixAt(used, matrix);
      color.setHSL(0.22 + rng() * 0.04, 0.18 + rng() * 0.13, 0.22 + rng() * 0.09);
      for (let crown = 0; crown < 3; crown++) {
        const radius = slender ? height * 0.17 : height * 0.3;
        const px = x + (crown - 1) * radius * 0.55, py = y + height * (0.62 + (crown === 1 ? 0.16 : 0));
        matrix.compose(new THREE.Vector3(px, py, z + (rng() - 0.5) * radius), quat,
          new THREE.Vector3(radius * (0.8 + rng() * 0.4), radius * (slender ? 1.5 : 0.83), radius));
        crowns.setMatrixAt(used * 3 + crown, matrix); crowns.setColorAt(used * 3 + crown, color);
      }
      used++;
    }
    trunks.count = used; crowns.count = used * 3; trunks.castShadow = crowns.castShadow = detail === 0; trunks.receiveShadow = crowns.receiveShadow = true;
    group.add(trunks, crowns);
    if (quality === 'LOW' || detail !== 0) return;
    const grassCount = quality === 'ULTRA' ? 500 : 240;
    const grass = new THREE.InstancedMesh(this.grassGeometry, this.grassMaterial, grassCount);
    let grassUsed = 0;
    for (let i = 0; i < grassCount; i++) {
      const x = (cx + rng()) * TERRAIN_CHUNK, z = (cz + rng()) * TERRAIN_CHUNK;
      if (this.closeToRoad(x, z, 5.8)) continue;
      const y = this.route.terrainHeight(x, z);
      quat.setFromAxisAngle(UP, rng() * Math.PI);
      const scale = 0.7 + rng() * 1.2;
      matrix.compose(new THREE.Vector3(x, y, z), quat, new THREE.Vector3(scale, scale, scale)); grass.setMatrixAt(grassUsed, matrix);
      color.setHSL(0.18 + rng() * 0.035, 0.21 + rng() * 0.1, 0.3 + rng() * 0.1); grass.setColorAt(grassUsed++, color);
    }
    grass.count = grassUsed; grass.receiveShadow = true; group.add(grass);
  }
}
