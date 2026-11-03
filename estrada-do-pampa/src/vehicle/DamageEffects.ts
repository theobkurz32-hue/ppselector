import * as THREE from 'three';

interface Fragment {position: THREE.Vector3;velocity: THREE.Vector3;spin: THREE.Vector3;rotation: THREE.Euler;life:number;ground:number;size:number}
interface Dust {sprite:THREE.Sprite;velocity:THREE.Vector3;life:number;duration:number}
interface ChangedMesh {mesh:THREE.Mesh;material:THREE.Material | THREE.Material[];geometry:THREE.BufferGeometry}
interface DamageState {overlay:THREE.Group;changed:ChangedMesh[];damage:number}
const FRAGMENT_COUNT=64;
const DUST_COUNT=12;

/** Pooled impact debris and persistent panel/glass damage. Severity is normalized 0–1. */
export class DamageEffects {
  readonly group=new THREE.Group();
  private readonly pieces:THREE.InstancedMesh;
  private readonly fragments:Fragment[]=[];
  private readonly dust:Dust[]=[];
  private readonly vehicles=new Map<THREE.Group,DamageState>();
  private cursor=0;private dustCursor=0;
  private matrix=new THREE.Matrix4();private quaternion=new THREE.Quaternion();

  constructor(){
    this.group.name='Fragmentos e poeira de colisão';
    this.pieces=new THREE.InstancedMesh(new THREE.TetrahedronGeometry(.12),new THREE.MeshStandardMaterial({color:0xb0b4a9,roughness:.64,metalness:.22}),FRAGMENT_COUNT);
    this.pieces.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.pieces.frustumCulled=false;this.group.add(this.pieces);
    for(let i=0;i<FRAGMENT_COUNT;i++){this.fragments.push({position:new THREE.Vector3(),velocity:new THREE.Vector3(),spin:new THREE.Vector3(),rotation:new THREE.Euler(),life:0,ground:0,size:0});this.pieces.setMatrixAt(i,new THREE.Matrix4().makeScale(0,0,0));}
    const pixels=new Uint8Array(32*32*4);
    for(let y=0;y<32;y++)for(let x=0;x<32;x++){const offset=(y*32+x)*4;const radius=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5);pixels[offset]=pixels[offset+1]=pixels[offset+2]=255;pixels[offset+3]=Math.max(0,Math.round((1-radius)**2*160));if(radius>1)pixels[offset+3]=0;}
    const texture=new THREE.DataTexture(pixels,32,32,THREE.RGBAFormat);texture.needsUpdate=true;
    for(let i=0;i<DUST_COUNT;i++){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,color:0x887f69,transparent:true,opacity:0,depthWrite:false}));sprite.visible=false;this.group.add(sprite);this.dust.push({sprite,velocity:new THREE.Vector3(),life:0,duration:1});}
  }

  impact(position:THREE.Vector3,heading:number,severity:number,vehicle?:THREE.Group):void{
    const force=THREE.MathUtils.clamp(severity,0,1);
    const count=Math.round(12+force*38);
    for(let i=0;i<count;i++){
      const index=this.cursor++%FRAGMENT_COUNT,fragment=this.fragments[index];
      fragment.position.copy(position);fragment.position.y+=.5+Math.random()*.7;fragment.ground=position.y-1.1;
      const spread=(Math.random()-.5)*Math.PI*1.6,angle=heading+spread;
      const speed=1.8+Math.random()*(3+force*8);
      fragment.velocity.set(Math.sin(angle)*speed,1.5+Math.random()*(2+force*4),Math.cos(angle)*speed);
      fragment.spin.set(Math.random()*8-4,Math.random()*8-4,Math.random()*8-4);fragment.rotation.set(Math.random()*3,Math.random()*3,0);
      fragment.life=1.5+Math.random()*2;fragment.size=.35+Math.random()*(.6+force);
      this.pieces.setColorAt(index,new THREE.Color(i%5===0?0xc6a477:i%3===0?0x7f9e9d:0x393e3c));
    }
    if(this.pieces.instanceColor)this.pieces.instanceColor.needsUpdate=true;
    for(let i=0;i<4+Math.round(force*5);i++){
      const puff=this.dust[this.dustCursor++%DUST_COUNT];puff.sprite.position.copy(position).add(new THREE.Vector3((Math.random()-.5)*2,.3,(Math.random()-.5)*2));
      puff.velocity.set((Math.random()-.5)*1.5,.3+Math.random()*.5,(Math.random()-.5)*1.5);puff.life=puff.duration=1.3+force*1.2;puff.sprite.visible=true;
    }
    if(vehicle)this.applyDamage(vehicle,Math.max(Number(vehicle.userData.damage)||0,force*65));
  }

  update(dt:number):void{
    for(let i=0;i<this.fragments.length;i++){
      const fragment=this.fragments[i];
      if(fragment.life<=0)continue;
      fragment.life=Math.max(0,fragment.life-dt);fragment.velocity.y-=9.81*dt;fragment.position.addScaledVector(fragment.velocity,dt);
      if(fragment.position.y<fragment.ground+.04){fragment.position.y=fragment.ground+.04;fragment.velocity.y=Math.abs(fragment.velocity.y)*.24;fragment.velocity.x*=.65;fragment.velocity.z*=.65;fragment.spin.multiplyScalar(.7);}
      fragment.rotation.x+=fragment.spin.x*dt;fragment.rotation.y+=fragment.spin.y*dt;fragment.rotation.z+=fragment.spin.z*dt;this.quaternion.setFromEuler(fragment.rotation);
      const scale=fragment.life>0?fragment.size*Math.min(1,fragment.life*2):0;
      this.matrix.compose(fragment.position,this.quaternion,new THREE.Vector3(scale,scale*.65,scale));this.pieces.setMatrixAt(i,this.matrix);
    }
    this.pieces.instanceMatrix.needsUpdate=true;
    for(const puff of this.dust){
      if(puff.life<=0)continue;
      puff.life=Math.max(0,puff.life-dt);puff.sprite.position.addScaledVector(puff.velocity,dt);const progress=1-puff.life/puff.duration;puff.sprite.scale.setScalar(.7+progress*3.4);puff.sprite.material.opacity=Math.sin(progress*Math.PI)*.38;puff.sprite.visible=puff.life>0;
    }
  }

  applyDamage(vehicle:THREE.Group,damage:number):void{
    const amount=THREE.MathUtils.clamp(damage,0,100);
    if(amount<2)return;
    let state=this.vehicles.get(vehicle);
    if(!state){
      const overlay=new THREE.Group();overlay.name='collision-damage';state={overlay,changed:[],damage:0};this.vehicles.set(vehicle,state);vehicle.add(overlay);
      vehicle.userData.resetDamage=()=>this.restore(vehicle);
      vehicle.traverse(object=>{
        if(!(object instanceof THREE.Mesh)||object.parent===overlay)return;
        const materials=Array.isArray(object.material)?object.material:[object.material];
        const candidate=object.userData.damagePanel||object.name.includes('bodywork')||materials.some(material=>material instanceof THREE.MeshStandardMaterial&&material.roughness<.85&&!material.transparent&&(material.emissive.getHex()===0||material.emissiveIntensity<.4)&&material.color.getHSL({h:0,s:0,l:0}).l>.16);
        if(!candidate)return;
        state!.changed.push({mesh:object,material:object.material,geometry:object.geometry});object.material=Array.isArray(object.material)?materials.map(material=>material.clone()):materials[0].clone();
      });
    }
    if(amount<=state.damage+1)return;
    state.damage=amount;vehicle.userData.damage=amount;
    for(const changed of state.changed){
      const originals=Array.isArray(changed.material)?changed.material:[changed.material];const materials=Array.isArray(changed.mesh.material)?changed.mesh.material:[changed.mesh.material];
      materials.forEach((material,index)=>{const original=originals[index];if(material instanceof THREE.MeshStandardMaterial&&original instanceof THREE.MeshStandardMaterial){material.color.copy(original.color).lerp(new THREE.Color(0x504d42),amount/100*.46);material.roughness=Math.min(.97,original.roughness+amount*.003);}});
      if(changed.mesh.userData.damagePanel&&amount>12){
        if(changed.mesh.geometry!==changed.geometry)changed.mesh.geometry.dispose();
        const geometry=changed.geometry.clone();geometry.computeBoundingBox();const bounds=geometry.boundingBox!,span=bounds.max.z-bounds.min.z;const positions=geometry.getAttribute('position');
        for(let i=0;i<positions.count;i++){const z=positions.getZ(i);const front=THREE.MathUtils.smoothstep(z,bounds.max.z-span*.22,bounds.max.z);if(front>0)positions.setXYZ(i,positions.getX(i)*(1-front*.045*amount/100),positions.getY(i)-front*.07*amount/100,z-front*Math.min(.42,span*.1)*amount/100);}
        positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere();changed.mesh.geometry=geometry;
      }
    }
    this.disposeOverlay(state.overlay);
    const player=vehicle.name.includes('Caminhão rodoviário');const bus=vehicle.name.includes('bus');const truck=player||vehicle.name.includes('truck');
    const front=player?3.72:bus?5.82:truck?4.75:2.3;
    const windshield=vehicle.userData.windshield as {x:number;y:number;z:number;width:number;height:number}|undefined;
    const glassY=windshield?.y??(player?2.8:bus?2.5:truck?2.3:1.2);
    const glassX=(windshield?.x??.38)+(windshield?.width??0)*.2,glassZ=windshield?.z??front-.2;
    if(amount>7){
      const points:number[]=[];
      for(let spoke=0;spoke<9;spoke++){const angle=spoke*Math.PI*2/9+.15;let previous=new THREE.Vector3(glassX,glassY+.04,glassZ);for(let j=1;j<=3;j++){const radius=(.08+j*.065)*Math.min(1.5,.6+amount/70);const next=new THREE.Vector3(glassX+Math.cos(angle)*radius,glassY+.04+Math.sin(angle)*radius*.72,glassZ);points.push(previous.x,previous.y,previous.z,next.x,next.y,next.z);previous=next;}}
      const lines=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(points,3)),new THREE.LineBasicMaterial({color:0xb7d0cb,transparent:true,opacity:.65}));state.overlay.add(lines);
    }
    const scuffMaterial=new THREE.MeshStandardMaterial({color:0x343b39,roughness:.95,metalness:.12,side:THREE.DoubleSide});
    for(let i=0;i<4;i++){const scuff=new THREE.Mesh(new THREE.PlaneGeometry(.2+i*.08,.045+amount*.0009),scuffMaterial);scuff.position.set(-.65+i*.26,truck?1.55:.69,front+.012);scuff.rotation.z=-.25+i*.17;state.overlay.add(scuff);}
    if(amount>24){const metal=new THREE.Mesh(new THREE.BoxGeometry(truck?1.6:.9,.11,.16),new THREE.MeshStandardMaterial({color:0x5e6665,roughness:.8,metalness:.55}));metal.position.set(.3,truck?1.03:.46,front+.1);metal.rotation.set(.12,.12,-amount*.0018);state.overlay.add(metal);}
  }

  private disposeOverlay(overlay:THREE.Group){
    const disposed=new Set<THREE.Material>();
    overlay.traverse(object=>{if(object instanceof THREE.Mesh||object instanceof THREE.LineSegments){object.geometry.dispose();const materials=Array.isArray(object.material)?object.material:[object.material];for(const material of materials)if(!disposed.has(material)){material.dispose();disposed.add(material);}}});overlay.clear();
  }
  private restore(vehicle:THREE.Group){
    const state=this.vehicles.get(vehicle);if(!state)return;
    for(const changed of state.changed){const materials=Array.isArray(changed.mesh.material)?changed.mesh.material:[changed.mesh.material];materials.forEach(material=>material.dispose());changed.mesh.material=changed.material;if(changed.mesh.geometry!==changed.geometry)changed.mesh.geometry.dispose();changed.mesh.geometry=changed.geometry;}
    this.disposeOverlay(state.overlay);state.overlay.removeFromParent();vehicle.userData.damage=0;delete vehicle.userData.resetDamage;this.vehicles.delete(vehicle);
  }
  reset(){
    for(const vehicle of [...this.vehicles.keys()])this.restore(vehicle);
    for(let i=0;i<this.fragments.length;i++){this.fragments[i].life=0;this.pieces.setMatrixAt(i,new THREE.Matrix4().makeScale(0,0,0));}this.pieces.instanceMatrix.needsUpdate=true;
    for(const puff of this.dust){puff.life=0;puff.sprite.visible=false;}
  }
}
