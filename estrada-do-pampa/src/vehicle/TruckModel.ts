import * as THREE from 'three';

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const tireGeometry = new THREE.CylinderGeometry(0.53, 0.53, 0.29, 16);
tireGeometry.rotateZ(Math.PI / 2);
const rimGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.304, 12);
rimGeometry.rotateZ(Math.PI / 2);
const boltGeometry = new THREE.CylinderGeometry(0.055, 0.055, 0.315, 8);
boltGeometry.rotateZ(Math.PI / 2);
const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x14191b, roughness: 0.94 });
const steelMaterial = new THREE.MeshStandardMaterial({ color: 0x7b878b, roughness: 0.28, metalness: 0.83 });
const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x20282a, roughness: 0.65, metalness: 0.25 });
const paintMaterial = new THREE.MeshStandardMaterial({ color: 0xbcb9a5, roughness: 0.35, metalness: 0.45 });
const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x9ebfc7, transparent: true, opacity: 0.16, roughness: 0.08, metalness: 0.25, depthWrite: false, side: THREE.DoubleSide });
const interiorMaterial = new THREE.MeshStandardMaterial({ color: 0x20282a, roughness: 0.95 });
const cargoMaterial = new THREE.MeshStandardMaterial({ color: 0x4d645a, roughness: 0.7, metalness: 0.14 });
const markerMaterial = new THREE.MeshStandardMaterial({ color: 0xc88a24, emissive: 0xe48c14, emissiveIntensity: 0.3 });

function block(parent: THREE.Object3D, material: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number): THREE.Mesh {
  const mesh = new THREE.Mesh(boxGeometry, material);
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  mesh.castShadow = material !== glassMaterial;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

/** Generic six-axle articulated road tractor. All dimensions are in metres. */
export class TruckModel {
  readonly group = new THREE.Group();
  readonly trailer = new THREE.Group();
  readonly cabin = new THREE.Group();
  private readonly wheels: THREE.Group[] = [];
  private readonly steeringAxle: THREE.Group[] = [];
  private readonly steeringWheel = new THREE.Group();
  private readonly headlights: THREE.SpotLight[] = [];
  private readonly lamps = new THREE.MeshStandardMaterial({ color: 0xf3e5bd, emissive: 0xffe4ae, emissiveIntensity: 0.2 });
  private readonly brakeLamps = new THREE.MeshStandardMaterial({ color: 0xa51e13, emissive: 0xff2311, emissiveIntensity: 0.2 });
  private readonly leftIndicator = new THREE.MeshStandardMaterial({ color: 0x9c5d0f, emissive: 0xffa322, emissiveIntensity: 0 });
  private readonly rightIndicator = this.leftIndicator.clone();
  private readonly wipers: THREE.Group[] = [];
  private elapsed = 0;
  private lastSpeed = 0;

  constructor() {
    this.group.name = 'Caminhão rodoviário — seis eixos';
    this.group.userData.windshield = {x:0,y:2.8,z:3.425,width:2.23,height:1.21};
    this.group.add(this.cabin);
    this.cabin.name = 'Cabine com interior';
    this.trailer.position.z = -1.2;
    this.trailer.name = 'Carreta articulada — quinta roda';
    this.group.add(this.trailer);
    this.buildTractor();
    this.buildCabin();
    this.buildTrailer();
    this.setRain(0);
  }

  private addAxle(parent: THREE.Object3D, z: number, steering = false, dual = false): void {
    block(parent, darkMaterial, 0, 0.54, z, 2.1, 0.16, 0.2);
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 1.05, 0.53, z);
      parent.add(pivot);
      if (steering) this.steeringAxle.push(pivot);
      const rolling = new THREE.Group();
      pivot.add(rolling);
      this.wheels.push(rolling);
      const tire = new THREE.Mesh(tireGeometry, tireMaterial);
      tire.castShadow = true;
      rolling.add(tire);
      const rim = new THREE.Mesh(rimGeometry, steelMaterial);
      rolling.add(rim);
      const hub = new THREE.Mesh(boltGeometry, darkMaterial);
      rolling.add(hub);
      if (dual) {
        const inner = new THREE.Mesh(tireGeometry, tireMaterial);
        inner.position.x = -side * 0.3;
        inner.castShadow = true;
        rolling.add(inner);
      }
      block(parent, darkMaterial, side * 1.07, 1.1, z, 0.46, 0.08, 1.24);
    }
  }

  private buildTractor(): void {
    block(this.group, darkMaterial, -0.6, 0.95, 0.2, 0.16, 0.3, 6.4);
    block(this.group, darkMaterial, 0.6, 0.95, 0.2, 0.16, 0.3, 6.4);
    block(this.group, darkMaterial, 0, 1.14, -1.25, 1.2, 0.12, 1.5);
    block(this.group, steelMaterial, -0.98, 0.95, 0.2, 0.5, 0.6, 1.5);
    block(this.group, darkMaterial, 0.98, 0.95, 0.15, 0.5, 0.6, 1.35);
    for (const side of [-1, 1]) {
      block(this.group, steelMaterial, side * 1.16, 0.58, 2, 0.25, 0.12, 1.05);
      block(this.group, steelMaterial, side * 1.16, 0.88, 1.8, 0.25, 0.12, 0.68);
    }
    this.addAxle(this.group, 2.55, true);
    this.addAxle(this.group, -0.55, false, true);
    this.addAxle(this.group, -1.85, false, true);
    // Compressed air tanks, rear mudflaps and coiled service lines.
    for (const side of [-1, 1]) {
      block(this.group, tireMaterial, side * 1, 0.45, -2.45, 0.56, 0.65, 0.07);
      block(this.group, steelMaterial, side * 0.6, 1.2, -0.4, 0.32, 0.32, 0.8);
    }
    const hose = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 5, 20), new THREE.MeshStandardMaterial({ color: 0x9c3025 }));
    hose.position.set(0.3, 1.6, -0.25);
    this.group.add(hose);
  }

  private buildCabin(): void {
    const cab = this.cabin;
    block(cab, paintMaterial, 0, 1.62, 2.04, 2.45, 0.98, 2.95);
    block(cab, paintMaterial, 0, 2.63, 0.64, 2.42, 1.85, 0.42);
    block(cab, paintMaterial, 0, 3.51, 1.98, 2.48, 0.2, 3.02);
    block(cab, paintMaterial, 0, 3.72, 1.65, 2.22, 0.25, 2.15);
    block(cab, darkMaterial, 0, 1.12, 3.55, 2.5, 0.26, 0.2);
    block(cab, paintMaterial, 0, 1.55, 3.53, 2.45, 0.7, 0.1).userData.damagePanel = true;
    block(cab, darkMaterial, 0, 1.58, 3.6, 1.56, 0.65, 0.06);
    for (let row = 0; row < 5; row++) block(cab, steelMaterial, 0, 1.34 + row * 0.12, 3.645, 1.5, 0.025, 0.025);
    for (const side of [-1, 1]) {
      block(cab, paintMaterial, side * 1.18, 2.76, 3.35, 0.14, 1.34, 0.15).rotation.x = -0.12;
      block(cab, paintMaterial, side * 1.18, 2.77, 1.02, 0.12, 1.36, 0.16);
      block(cab, darkMaterial, side * 1.225, 2.14, 2.6, 0.03, 0.07, 1.4);
      block(cab, glassMaterial, side * 1.227, 2.8, 2.17, 0.018, 1.13, 2.1);
      block(cab, darkMaterial, side * 1.25, 1.95, 1.2, 0.04, 0.08, 0.32);
      block(cab, darkMaterial, side * 1.41, 2.92, 3.3, 0.4, 0.05, 0.06);
      block(cab, darkMaterial, side * 1.56, 2.72, 3.23, 0.22, 0.67, 0.22);
      block(cab, steelMaterial, side * 1.56, 2.75, 3.105, 0.18, 0.51, 0.015);
      block(cab, this.lamps, side * 0.97, 1.31, 3.67, 0.35, 0.17, 0.06);
      block(cab, side < 0 ? this.leftIndicator : this.rightIndicator, side * 1.13, 1.59, 3.66, 0.17, 0.09, 0.07);
      block(cab, this.lamps, side * 0.8, 3.63, 3.01, 0.15, 0.07, 0.06);
      const light = new THREE.SpotLight(0xffedce, 8500, 180, 0.35, 0.55, 2);
      light.position.set(side * 0.97, 1.35, 3.7);
      const target = new THREE.Object3D();
      target.position.set(side * 0.6, 0, 60);
      cab.add(target);
      light.target = target;
      cab.add(light);
      this.headlights.push(light);
      const wiper = new THREE.Group();
      wiper.position.set(side * 0.55, 2.16, 3.46);
      block(wiper, darkMaterial, 0, 0.34, 0, 0.025, 0.72, 0.02).rotation.z = side * 0.3;
      block(wiper, darkMaterial, -side * 0.08, 0.66, 0, 0.025, 0.4, 0.022).rotation.z = side * 0.3;
      cab.add(wiper);
      this.wipers.push(wiper);
    }
    const windshield = block(cab, glassMaterial, 0, 2.79, 3.44, 2.23, 1.21, 0.018);
    windshield.rotation.x = -0.12;
    block(cab, darkMaterial, 0, 3.35, 3.49, 2.3, 0.11, 0.16);
    // Interior visible from the driver's seat.
    block(cab, interiorMaterial, 0, 2.12, 2.97, 2.15, 0.26, 0.78);
    block(cab, interiorMaterial, 0, 2.31, 3.15, 2.1, 0.2, 0.35);
    block(cab, interiorMaterial, 0.64, 2.37, 3.04, 0.7, 0.28, 0.14).rotation.x = -0.18;
    const instrument = new THREE.MeshBasicMaterial({ color: 0x789f8d });
    for (const x of [0.45, 0.78]) {
      const gauge = new THREE.Mesh(new THREE.CircleGeometry(0.105, 20), instrument);
      gauge.position.set(x, 2.42, 2.96);
      gauge.rotation.y = Math.PI;
      cab.add(gauge);
    }
    block(cab, instrument, 0.04, 2.34, 2.96, 0.18, 0.07, 0.01);
    for (const x of [-0.65, 0.65]) {
      block(cab, interiorMaterial, x, 1.78, 1.48, 0.63, 0.15, 0.67);
      block(cab, interiorMaterial, x, 2.2, 1.15, 0.63, 0.95, 0.18);
    }
    this.steeringWheel.position.set(0.65, 2.4, 2.93);
    this.steeringWheel.rotation.x = -0.6;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.026, 8, 28), interiorMaterial);
    this.steeringWheel.add(ring);
    for (let i = 0; i < 3; i++) {
      const spoke = block(this.steeringWheel, darkMaterial, 0, -0.12, 0, 0.045, 0.25, 0.04);
      const pivot = new THREE.Group();
      this.steeringWheel.remove(spoke);
      pivot.add(spoke);
      pivot.rotation.z = i * Math.PI * 2 / 3;
      this.steeringWheel.add(pivot);
    }
    block(this.steeringWheel, interiorMaterial, 0, 0, 0, 0.16, 0.14, 0.06);
    cab.add(this.steeringWheel);
  }

  private buildTrailer(): void {
    const trailer = this.trailer;
    block(trailer, darkMaterial, -0.64, 1.12, -5.5, 0.16, 0.28, 12.7);
    block(trailer, darkMaterial, 0.64, 1.12, -5.5, 0.16, 0.28, 12.7);
    block(trailer, steelMaterial, 0, 1.35, -5.5, 2.52, 0.18, 12.9);
    block(trailer, cargoMaterial, 0, 2.72, -5.5, 2.5, 2.6, 12.9);
    block(trailer, new THREE.MeshStandardMaterial({ color: 0xa8ada6, roughness: 0.72, metalness: 0.15 }), 0, 4.04, -5.5, 2.52, 0.05, 12.9);
    const railMaterial = new THREE.MeshStandardMaterial({ color: 0x3d5047, roughness: 0.65, metalness: 0.25 });
    for (const side of [-1, 1]) {
      for (let z = 0.7; z > -11.9; z -= 0.7) block(trailer, railMaterial, side * 1.257, 2.7, z, 0.025, 2.52, 0.04);
      block(trailer, steelMaterial, side * 1.26, 1.59, -5.5, 0.025, 0.05, 12.7);
      block(trailer, darkMaterial, side * 1.1, 0.75, -5, 0.07, 0.09, 4.1);
      for (let z = -1; z > -11.8; z -= 2.5) block(trailer, markerMaterial, side * 1.275, 1.5, z, 0.035, 0.075, 0.13);
      block(trailer, darkMaterial, side * 0.7, 0.83, -2, 0.14, 0.8, 0.14);
    }
    const doors = new THREE.MeshStandardMaterial({ color: 0x88938a, roughness: 0.65, metalness: 0.25 });
    block(trailer, doors, 0, 2.71, -11.975, 2.44, 2.54, 0.04);
    block(trailer, darkMaterial, 0, 2.71, -12.01, 0.025, 2.54, 0.025);
    for (const x of [-0.8, 0.8]) block(trailer, steelMaterial, x, 2.65, -12.02, 0.04, 2.35, 0.05);
    block(trailer, steelMaterial, 0, 0.79, -12.1, 2.4, 0.18, 0.18);
    block(trailer, this.brakeLamps, -0.9, 1.16, -12.08, 0.5, 0.14, 0.05);
    block(trailer, this.brakeLamps, 0.9, 1.16, -12.08, 0.5, 0.14, 0.05);
    block(trailer, new THREE.MeshStandardMaterial({ color: 0xd7d6bf }), 0, 1.12, -12.09, 0.55, 0.16, 0.02);
    for (const z of [-8.4, -9.7, -11]) this.addAxle(trailer, z, false, true);
    for (const side of [-1, 1]) block(trailer, tireMaterial, side * 1.03, 0.44, -11.65, 0.65, 0.6, 0.08);
    if (typeof document !== 'undefined') {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 256;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#d9d9c4';
        context.font = '700 156px sans-serif';
        context.textAlign = 'center';
        context.fillText('PAMPA', 512, 162);
        context.font = '24px sans-serif';
        context.fillText('T R A N S P O R T E S   R O D O V I Á R I O S', 512, 218);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        const decalMaterial = new THREE.MeshStandardMaterial({ map: texture, transparent: true, roughness: 0.8, depthWrite: false });
        for (const side of [-1, 1]) {
          const decal = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.3), decalMaterial);
          decal.position.set(side * 1.28, 2.9, -5.2);
          decal.rotation.y = side * Math.PI / 2;
          trailer.add(decal);
        }
      }
    }
  }

  update(dt: number, speed: number, steering: number, articulation: number, brake: boolean, headlights: boolean, indicator: number): void {
    this.elapsed += dt;
    for (const wheel of this.wheels) wheel.rotation.x += speed / 0.53 * dt;
    for (const axle of this.steeringAxle) axle.rotation.y = steering;
    this.steeringWheel.rotation.z = -steering * 5;
    this.trailer.rotation.y = THREE.MathUtils.clamp(articulation, -1.25, 1.25);
    const acceleration = dt > 0 ? (speed - this.lastSpeed) / dt : 0;
    this.lastSpeed = speed;
    const smoothing = 1 - Math.exp(-dt * 5);
    this.cabin.rotation.x = THREE.MathUtils.lerp(this.cabin.rotation.x, THREE.MathUtils.clamp(-acceleration * 0.007, -0.025, 0.025), smoothing);
    this.cabin.rotation.z = THREE.MathUtils.lerp(this.cabin.rotation.z, THREE.MathUtils.clamp(steering * Math.abs(speed) * 0.014, -0.045, 0.045), smoothing);
    this.cabin.position.y = Math.sin(this.elapsed * 8) * Math.min(0.012, Math.abs(speed) * 0.0006);
    this.lamps.emissiveIntensity = headlights ? 2 : 0.18;
    this.brakeLamps.emissiveIntensity = brake ? 2.5 : 0.15;
    const flashing = Math.sin(this.elapsed * 8) > 0 ? 2 : 0;
    this.leftIndicator.emissiveIntensity = indicator < 0 ? flashing : 0;
    this.rightIndicator.emissiveIntensity = indicator > 0 ? flashing : 0;
    for (const light of this.headlights) light.visible = headlights;
  }

  /** Called by the weather system; motion stays independent from engine speed. */
  setRain(intensity: number): void {
    const sweep = intensity > 0.05 ? -0.8 + Math.sin(this.elapsed * (2 + intensity * 3)) * 0.65 : -1.42;
    for (const wiper of this.wipers) wiper.rotation.z = sweep;
  }
}
