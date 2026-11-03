import * as THREE from 'three';
import type { Route } from '../road/Route';

function board(text: string, color = '#dc973d'): THREE.Mesh {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color; ctx.fillRect(0, 0, 512, 256);
  ctx.strokeStyle = '#282923'; ctx.lineWidth = 16; ctx.strokeRect(13, 13, 486, 230);
  ctx.fillStyle = '#202820'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 50px sans-serif';
  const lines = text.split('\n'); lines.forEach((line, i) => ctx.fillText(line, 256, 128 + (i - (lines.length - 1) / 2) * 65));
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 1.4), new THREE.MeshStandardMaterial({ map: texture, roughness: 0.8, side: THREE.DoubleSide }));
  return mesh;
}

/** Fictional maintenance incidents placed along the real road, not GIS features. */
export class RoadEvents {
  readonly group = new THREE.Group();
  blockage: { s: number; lateral: number } | null = null;
  message = '';
  private eventS = 900;
  private index = 0;
  private readonly coneMaterial = new THREE.MeshStandardMaterial({ color: 0xe17629, roughness: 0.8 });
  private readonly whiteMaterial = new THREE.MeshStandardMaterial({ color: 0xe4ddd0, roughness: 0.75 });
  private readonly darkMaterial = new THREE.MeshStandardMaterial({ color: 0x293036, roughness: 0.85 });
  constructor(private readonly route: Route) { this.group.name = 'Eventos de manutenção'; this.reset(0); }

  reset(s: number): void {
    this.index = Math.max(0, Math.floor(s / 6000));
    this.eventS = this.index * 6000 + 900;
    if (this.eventS < s + 250) this.eventS += 6000;
    this.build();
  }

  private addAt(object: THREE.Object3D, s: number, lateral: number, height = 0): void {
    const sample = this.route.sample(s);
    object.position.copy(sample.position).addScaledVector(sample.right, lateral);
    object.position.y += height;
    object.rotation.y = sample.heading + Math.PI;
    this.group.add(object);
  }

  private build(): void {
    for (const child of [...this.group.children]) {
      child.traverse(node => {
        if (!(node instanceof THREE.Mesh)) return;
        node.geometry.dispose();
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          if (material !== this.coneMaterial && material !== this.whiteMaterial && material !== this.darkMaterial) {
            if (material instanceof THREE.MeshStandardMaterial) material.map?.dispose();
            material.dispose();
          }
        }
      });
      this.group.remove(child);
    }
    if (this.eventS > this.route.length - 200) { this.blockage = null; return; }
    this.blockage = { s: this.eventS, lateral: 1.8 };
    for (const distance of [240, 120]) {
      const sign = new THREE.Group();
      const face = board(distance === 240 ? 'OBRAS\nA 200 m' : 'ATENÇÃO\nPISTA PARCIAL'); face.position.y = 2.1; sign.add(face);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.6, 6), this.darkMaterial); post.position.y = 1.3; sign.add(post);
      this.addAt(sign, this.eventS - distance, 5.7);
    }
    for (let i = 0; i < 18; i++) {
      const cone = new THREE.Group();
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.06, 0.48), this.darkMaterial); base.position.y = 0.03;
      const body = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.7, 8), this.coneMaterial); body.position.y = 0.4;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.13, 0.14, 8), this.whiteMaterial); band.position.y = 0.43;
      cone.add(base, body, band);
      const lateral = i < 6 ? 4.1 - i * 0.72 : i > 13 ? 0.5 + (i - 13) * 0.72 : 0.5;
      this.addAt(cone, this.eventS - 65 + i * 7.5, lateral);
    }
    const machinery = new THREE.Group();
    const yellow = new THREE.MeshStandardMaterial({ color: this.index % 2 ? 0xbab3a0 : 0xcaa439, roughness: 0.75, metalness: 0.15 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.2, 4), yellow); body.position.y = 1.3;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 1.8), this.darkMaterial); cab.position.set(0, 2.5, -0.5);
    machinery.add(body, cab);
    for (const z of [-1.25, 1.25]) for (const x of [-1.1, 1.1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 12), this.darkMaterial); wheel.rotation.z = Math.PI / 2; wheel.position.set(x, 0.65, z); machinery.add(wheel);
    }
    machinery.traverse(n => { if (n instanceof THREE.Mesh) { n.castShadow = true; n.receiveShadow = true; } });
    this.addAt(machinery, this.eventS + 5, 3);
    const finalSign = board('FIM DAS\nOBRAS', '#bdc3a4'); this.addAt(finalSign, this.eventS + 100, 5.8, 2);
  }

  update(_dt: number, playerS: number): void {
    if (playerS > this.eventS + 250 && this.eventS < this.route.length) { this.index++; this.eventS += 6000; this.build(); }
    const distance = this.eventS - playerS;
    this.message = distance > -80 && distance < 280 && this.blockage ? `Obras adiante · reduza e ceda passagem ao tráfego contrário` : '';
    this.group.visible = Math.abs(distance) < 1700;
  }
}
