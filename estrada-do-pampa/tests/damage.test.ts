import {describe,it,expect} from 'vitest';
import * as THREE from 'three';
import {TruckModel} from '../src/vehicle/TruckModel';
import {DamageEffects} from '../src/vehicle/DamageEffects';

describe('Dano visual',()=>{
  it('danifica somente a instância atingida e restaura materiais/forma no reset',()=>{
    const effects=new DamageEffects(),one=new THREE.Group(),two=new THREE.Group();one.name='Tráfego — car';
    const material=new THREE.MeshStandardMaterial({color:0xaabbaa,roughness:.4});
    const geometry=new THREE.BoxGeometry(2,1,4);
    const hit=new THREE.Mesh(geometry,material),intact=new THREE.Mesh(geometry,material);hit.userData.damagePanel=true;
    one.add(hit);two.add(intact);effects.applyDamage(one,75);
    expect(hit.material).not.toBe(material);
    expect(hit.geometry).not.toBe(geometry);
    expect(intact.material).toBe(material);
    expect(intact.geometry).toBe(geometry);
    expect(one.getObjectByName('collision-damage')!.children.length).toBeGreaterThan(0);
    effects.reset();
    expect(hit.material).toBe(material);
    expect(hit.geometry).toBe(geometry);
    expect(one.getObjectByName('collision-damage')).toBeUndefined();
  });

  it('reutiliza a quantidade fixa de fragmentos e deixa efeitos temporários expirarem',()=>{
    const effects=new DamageEffects();const objects=effects.group.children.length;
    for(let i=0;i<20;i++)effects.impact(new THREE.Vector3(0,10,0),0,.9);
    expect(effects.group.children.length).toBe(objects);
    for(let i=0;i<360;i++)effects.update(1/60);
    expect(effects.group.children.filter(object=>object instanceof THREE.Sprite).every(object=>!object.visible)).toBe(true);
    effects.reset();
  });
});


it('mantém os fragmentos do para-brisa do caminhão com coordenadas finitas',()=>{
  const truck=new TruckModel(),effects=new DamageEffects();
  effects.applyDamage(truck.group,75);
  const overlay=truck.group.getObjectByName('collision-damage');
  expect(overlay).toBeDefined();
  overlay!.traverse(object=>{
    if(!(object instanceof THREE.LineSegments||object instanceof THREE.Mesh))return;
    const positions=object.geometry.getAttribute('position');
    expect(Array.from(positions.array).every(Number.isFinite)).toBe(true);
    object.geometry.computeBoundingSphere();
    expect(Number.isFinite(object.geometry.boundingSphere!.radius)).toBe(true);
  });
  effects.reset();
});
