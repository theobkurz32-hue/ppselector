import * as T from 'three';
import type {RoadSample} from '../road/Route';

export class Cameras {
  readonly camera=new T.PerspectiveCamera(58,innerWidth/innerHeight,.1,6500);
  readonly names=['CABINE','TERCEIRA PESSOA','CINEMATOGRÁFICA','PARA-CHOQUE'];
  mode=1;
  shakeLevel=0;
  private initialized=false;
  private time=0;

  next(){this.mode=(this.mode+1)%4;this.initialized=false;}
  reset(){this.initialized=false;this.shakeLevel=0;}
  shake(intensity:number){this.shakeLevel=Math.min(1,Math.max(this.shakeLevel,intensity));}
  update(dt:number,truck:T.Group,sample:RoadSample,origin:T.Vector3,speed:number,menu:boolean){
    const p=sample.position.clone().sub(origin),forward=sample.tangent,right=sample.right;
    let desired:T.Vector3,target:T.Vector3;
    if(menu){
      desired=p.clone().addScaledVector(right,-17).addScaledVector(forward,21).add(new T.Vector3(0,7,0));
      target=p.clone().addScaledVector(forward,-4).add(new T.Vector3(0,1.8,0));
    }else if(this.mode===0){
      truck.updateMatrixWorld(true);
      desired=truck.localToWorld(new T.Vector3(.65,2.83,1.85));
      const front=new T.Vector3(0,-.035,1).applyQuaternion(truck.quaternion);
      target=desired.clone().addScaledVector(front,80);
    }else if(this.mode===1){
      desired=p.clone().addScaledVector(forward,-25).addScaledVector(right,-1).add(new T.Vector3(0,8,0));
      target=p.clone().addScaledVector(forward,20).add(new T.Vector3(0,2,0));
    }else if(this.mode===2){
      desired=p.clone().addScaledVector(right,15).addScaledVector(forward,-15).add(new T.Vector3(0,5,0));
      target=p.clone().addScaledVector(forward,5).add(new T.Vector3(0,1.5,0));
    }else{
      desired=truck.localToWorld(new T.Vector3(0,.85,4));target=desired.clone().addScaledVector(forward,70);
    }
    if(!this.initialized||this.mode===0||this.mode===3||menu){this.camera.position.copy(desired);this.initialized=true;}
    else this.camera.position.lerp(desired,1-Math.exp(-dt*4));
    this.time+=dt;
    this.shakeLevel=Math.max(0,this.shakeLevel-dt*.75);
    const trauma=this.shakeLevel*this.shakeLevel;
    if(!menu&&trauma>0)this.camera.position.add(new T.Vector3(Math.sin(this.time*67)*.22,Math.sin(this.time*81)*.15,Math.sin(this.time*53)*.12).multiplyScalar(trauma));
    this.camera.lookAt(target);
    if(!menu&&trauma>0)this.camera.rotateZ(Math.sin(this.time*48)*.025*trauma);
    this.camera.fov=this.mode===0?67:58+Math.min(5,Math.abs(speed)*.12);this.camera.updateProjectionMatrix();
  }
  rebase(delta:T.Vector3){this.camera.position.add(delta);}
  resize(){this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
}
