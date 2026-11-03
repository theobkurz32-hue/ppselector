import * as T from 'three';
import {Route} from '../road/Route';
import {Input} from '../core/Input';
import {TruckPhysics} from '../vehicle/TruckPhysics';
import {TruckModel} from '../vehicle/TruckModel';
import {World} from '../world/World';
import {Access} from '../world/Access';
import {Traffic} from '../traffic/Traffic';
import {Animals} from '../animals/Animals';
import {RoadEvents} from '../events/RoadEvents';
import {Atmosphere} from '../weather/Atmosphere';
import {AudioEngine} from '../audio/AudioEngine';
import {UI} from '../ui/UI';
import {Cameras} from './Cameras';
import {qualityPresets,type Quality} from '../data/worldConfig';

interface Save {s:number;lateral:number;fuel:number;damage:number;hour:number;score:number;distance:number;components?:TruckPhysics['components'];completed?:boolean}
const angle=(a:number)=>Math.atan2(Math.sin(a),Math.cos(a));
export class Game {
  readonly scene=new T.Scene();readonly renderer:T.WebGLRenderer;readonly physics=new TruckPhysics();readonly input=new Input();
  readonly truck=new TruckModel();readonly cameras=new Cameras();readonly world:World;readonly access:Access;readonly traffic:Traffic;readonly animals:Animals;readonly events:RoadEvents;readonly atmosphere:Atmosphere;readonly ui:UI;readonly audio=new AudioEngine();
  s=60;lateral=1.8;headingError=0;private trailerHeading=0;private roll=0;private rollVelocity=0;private pitch=0;private pitchVelocity=0;
  private quality:Quality='HIGH';private origin=new T.Vector3();private menu=true;private paused=true;private finished=false;private headlights=false;private indicator=0;
  private score=0;private last=0;private saveTimer=0;private notification='';private noteTime=0;private impactCooldown=0;private fps=60;private cameraSample;private routeMap;private passed=new Set<number>();private overtakeCandidates=new Set<number>();private initialS=60;
  constructor(readonly route:Route){
    this.cameraSample=route.sample(this.s);this.routeMap=route.points.filter((_,i)=>i%3===0).map(p=>({x:p.x,z:p.z}));
    this.renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});this.renderer.setSize(innerWidth,innerHeight);this.renderer.setClearColor(0xb8cad1);this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.outputColorSpace=T.SRGBColorSpace;
    this.renderer.domElement.id='game-canvas';document.querySelector('#app')!.appendChild(this.renderer.domElement);
    this.world=new World(route);this.access=new Access(route);this.traffic=new Traffic(route);this.animals=new Animals(route);this.events=new RoadEvents(route);this.atmosphere=new Atmosphere(this.scene);
    this.scene.add(this.access.group,this.world.group,this.traffic.group,this.animals.group,this.events.group,this.truck.group);
    this.ui=new UI({start:resume=>this.start(resume),pause:()=>this.togglePause(),quality:q=>this.setQuality(q),teleport:f=>this.teleport(f),weather:k=>this.atmosphere.setWeather(k),time:h=>this.atmosphere.hour=h});
    this.setQuality(localStorage.getItem('pampa-quality')??'HIGH');this.traffic.reset(this.s);this.events.reset(this.s);this.animals.reset(this.s);this.trailerHeading=this.cameraSample.heading;
    addEventListener('resize',()=>{this.renderer.setSize(innerWidth,innerHeight);this.cameras.resize();});
    addEventListener('blur',()=>{if(!this.paused&&!this.menu&&!this.finished)this.togglePause();});
    addEventListener('pagehide',()=>this.save());
    this.frame=this.frame.bind(this);requestAnimationFrame(this.frame);
    // Read-only diagnostic surface for browser verification and calibration.
    Object.assign(window,{pampa:this});
  }
  private setQuality(q:string){if(!(q in qualityPresets))return;this.quality=q as Quality;const config=qualityPresets[this.quality];this.renderer.setPixelRatio(Math.min(devicePixelRatio,config.ratio));this.renderer.shadowMap.enabled=config.shadows;localStorage.setItem('pampa-quality',q);}
  private start(resume:boolean){
    this.physics.reset();this.s=60;this.initialS=60;this.lateral=1.8;this.headingError=0;this.roll=this.pitch=0;this.rollVelocity=this.pitchVelocity=0;this.score=0;this.saveTimer=0;this.impactCooldown=0;this.passed.clear();this.overtakeCandidates.clear();
    if(resume){try{const saved=JSON.parse(localStorage.getItem('pampa-save')??'null') as Save|null;if(saved&&!saved.completed){const safe=(value:number,min:number,max:number,fallback:number)=>Number.isFinite(value)?T.MathUtils.clamp(value,min,max):fallback;this.s=safe(saved.s,20,this.route.length-25,60);this.initialS=this.s;this.lateral=safe(saved.lateral,-5,5,1.8);this.physics.fuel=safe(saved.fuel,0,100,100);this.physics.damage=safe(saved.damage,0,100,0);for(const key of Object.keys(this.physics.components) as Array<keyof TruckPhysics['components']>)this.physics.components[key]=safe(saved.components?.[key]??this.physics.damage,0,100,0);this.physics.distance=safe(saved.distance,0,1e9,0);this.atmosphere.hour=safe(saved.hour,0,24,8.2);this.score=safe(saved.score,0,1e9,0);}}catch{this.notify('O salvamento não pôde ser lido. Nova viagem iniciada.');}}
    else this.atmosphere.hour=8.2;
    this.trailerHeading=this.route.sample(this.s).heading;this.traffic.reset(this.s);this.events.reset(this.s);this.animals.reset(this.s);this.menu=false;this.paused=false;this.finished=false;this.ui.setMenu(false);this.ui.setPaused(false);this.cameras.reset();void this.audio.start().catch(()=>{});this.notify('Boa viagem. Mantenha a direita e antecipe a frenagem.');
  }
  private togglePause(){if(this.menu||this.finished)return;this.paused=!this.paused;this.ui.setPaused(this.paused);if(this.paused)this.save();else void this.audio.start().catch(()=>{});}
  private teleport(fraction:number){this.s=Math.max(25,Math.min(this.route.length-20,this.route.length*fraction));this.lateral=1.8;this.headingError=0;this.physics.speed=0;this.impactCooldown=0;this.passed.clear();this.overtakeCandidates.clear();this.trailerHeading=this.route.sample(this.s).heading;this.traffic.reset(this.s);this.animals.reset(this.s);this.events.reset(this.s);this.cameras.reset();this.notify('Ferramenta de desenvolvimento: posição alterada.');}
  private notify(message:string){this.notification=message;this.noteTime=6;}
  private save(){if(this.menu)return;const data:Save={s:this.s,lateral:this.lateral,fuel:this.physics.fuel,damage:this.physics.damage,components:{...this.physics.components},hour:this.atmosphere.hour,score:this.score,distance:this.physics.distance,completed:this.finished};try{localStorage.setItem('pampa-save',JSON.stringify(data));}catch{/* Browsers in private mode may deny local persistence. */}}
  private controls(){
    if(this.input.take('KeyC'))this.cameras.next();if(this.input.take('KeyP')||this.input.take('Escape'))this.togglePause();if(this.input.take('KeyM'))this.ui.toggleMap();if(this.input.take('F3'))this.ui.toggleDebug();if(this.input.take('KeyL'))this.headlights=!this.headlights;
    if(this.input.take('KeyQ'))this.indicator=this.indicator===-1?0:-1;if(this.input.take('KeyE'))this.indicator=this.indicator===1?0:1;
  }
  private simulate(dt:number,control:ReturnType<Input['read']>){
    const road=this.route.sample(this.s);const v=this.physics.speed;const offroad=Math.abs(this.lateral)>5.2,friction=offroad?.34:.78-this.atmosphere.wet*.34;
    this.physics.update(dt,control,{grade:road.grade,friction,offroad});
    const steerLimit=.49/(1+this.physics.speed*.19),steer=control.steer*steerLimit;
    const curve=angle(this.route.sample(this.s+8).heading-this.route.sample(this.s-8).heading)/16;
    const yaw=-this.physics.speed/5.2*Math.tan(steer);
    const adhesion=Math.min(1,friction*9.81/Math.max(.1,Math.abs(yaw*this.physics.speed)));
    this.headingError=angle(this.headingError+(yaw*adhesion-curve*this.physics.speed*Math.cos(this.headingError))*dt);
    this.lateral-=Math.sin(this.headingError)*this.physics.speed*dt;
    const ds=Math.max(0,Math.cos(this.headingError))*this.physics.speed*dt;this.s=Math.min(this.route.length,this.s+ds);
    if(Math.abs(this.lateral)>17){this.lateral=Math.sign(this.lateral)*17;this.headingError*=.5;this.physics.speed*=.85;this.notify('Fora da faixa de domínio. Reduza e retorne à pista.');}
    const worldHeading=road.heading+this.headingError;
    this.trailerHeading+=Math.sin(worldHeading-this.trailerHeading)*this.physics.speed/9.5*dt;
    const lateralAccel=yaw*this.physics.speed;
    const rollTarget=T.MathUtils.clamp(-lateralAccel/9.81*.14,-.12,.12);this.rollVelocity+=((rollTarget-this.roll)*18-this.rollVelocity*7)*dt;this.roll+=this.rollVelocity*dt;
    const pitchTarget=-Math.atan(road.grade)-this.physics.acceleration*.008;this.pitchVelocity+=((pitchTarget-this.pitch)*20-this.pitchVelocity*7)*dt;this.pitch+=this.pitchVelocity*dt;
    this.events.update(dt,this.s);this.animals.update(dt,this.s,this.physics.speed,control.horn);this.traffic.update(dt,{s:this.s,lateral:this.lateral,speed:this.physics.speed},this.atmosphere.hour,this.atmosphere.wet,this.events.blockage);
    this.impactCooldown=Math.max(0,this.impactCooldown-dt);
    const collision=this.traffic.collision(this.s,this.lateral),animal=this.animals.collision(this.s,this.lateral);
    const block=this.events.blockage,hitWorks=block&&Math.abs(block.s-this.s)<7&&Math.abs(this.lateral-block.lateral)<1.6;
    const relativeImpact=collision?.relativeSpeed??v;
    if((collision||animal||hitWorks)&&this.impactCooldown<=0&&relativeImpact>.5){this.physics.impact(relativeImpact);this.score=Math.max(0,this.score-400);this.audio.impact();this.notify(animal?'Impacto com animal. Antecipe a parada nas áreas rurais.':'Colisão. Reduza a velocidade e mantenha distância.');this.impactCooldown=3;}
    // Contact separation remains active during the damage cooldown, so a stopped
    // truck cannot be driven through by a queue or by opposing traffic.
    for(const vehicle of this.traffic.vehicles){if(!vehicle.active||Math.abs(vehicle.lateral-this.lateral)>2.25)continue;const delta=vehicle.s-this.s,minGap=vehicle.length*.5+8.1;if(Math.abs(delta)<minGap){vehicle.s=this.s+(delta>=0?1:-1)*minGap;vehicle.speed=0;}}
    this.score+=ds*(offroad?.1:this.physics.speed>22.23?.35:1);
    for(const vehicle of this.traffic.vehicles){if(!vehicle.active){this.passed.delete(vehicle.id);this.overtakeCandidates.delete(vehicle.id);continue;}if(vehicle.direction!==1)continue;if(vehicle.s>this.s+20){this.passed.delete(vehicle.id);this.overtakeCandidates.add(vehicle.id);}if(vehicle.s<this.s-15&&this.overtakeCandidates.has(vehicle.id)&&!this.passed.has(vehicle.id)){this.passed.add(vehicle.id);if(this.lateral<.5&&this.physics.speed<25){this.score+=100;this.notify('Ultrapassagem concluída. Retorne com distância segura.');}}}
    if(this.s>=this.route.length-12){this.finished=true;this.paused=true;this.ui.finish({distance:this.s-this.initialS,score:this.score,damage:this.physics.damage});this.save();}
  }
  private frame(now:number){
    const elapsed=Math.max(.001,(now-(this.last||now-16.7))/1000),dt=Math.min(.1,elapsed);this.last=now;this.fps+=(1/elapsed-this.fps)*.08;this.controls();const control=this.input.read(dt);
    // The menu return button is UI-owned; its visibility determines presentation mode.
    if(!document.querySelector('#main-menu')?.classList.contains('hidden')&&!this.menu){this.menu=true;this.paused=true;}
    if(!this.paused&&!this.menu&&!this.finished){let remaining=dt;while(remaining>0){const step=Math.min(1/60,remaining);this.simulate(step,control);remaining-=step;}this.saveTimer+=dt;if(this.saveTimer>5){this.save();this.saveTimer=0;}}
    this.noteTime=Math.max(0,this.noteTime-dt);this.world.update(this.s,this.quality);this.access.update(this.s);this.world.setWetness(this.atmosphere.wet);
    const road=this.route.sample(this.s),absolute=road.position.clone().addScaledVector(road.right,this.lateral);
    if(Math.abs(this.lateral)>5)absolute.y=this.route.terrainHeight(absolute.x,absolute.z);
    const newOrigin=new T.Vector3(Math.round(absolute.x/256)*256,0,Math.round(absolute.z/256)*256),delta=this.origin.clone().sub(newOrigin);this.cameras.rebase(delta);this.origin.copy(newOrigin);
    for(const group of [this.access.group,this.world.group,this.traffic.group,this.animals.group,this.events.group])group.position.copy(this.origin).negate();
    this.truck.group.position.copy(absolute).sub(this.origin);this.truck.group.rotation.order='YXZ';this.truck.group.rotation.set(this.menu?-Math.atan(road.grade):this.pitch,road.heading+this.headingError,this.roll,'YXZ');
    this.truck.update(dt,this.physics.speed,control.steer*.45,angle(this.trailerHeading-road.heading-this.headingError),control.brake>.1||control.emergency,this.headlights||this.atmosphere.hour<6||this.atmosphere.hour>18,this.indicator);this.truck.setRain(this.atmosphere.wet);
    this.cameraSample={...road,position:absolute};this.cameras.update(dt,this.truck.group,this.cameraSample,this.origin,this.physics.speed,this.menu);
    this.atmosphere.update(this.paused&&!this.menu?0:dt,absolute.clone().sub(this.origin),road.lat,road.lon);
    this.audio.update(this.physics.rpm,this.physics.speed,control.throttle,this.atmosphere.wet,control.horn,this.paused);
    this.ui.update({speed:this.physics.speed,rpm:this.physics.rpm,gear:this.physics.gear,fuel:this.physics.fuel,damage:this.physics.damage,hour:this.atmosphere.hour,weather:this.atmosphere.kind,remaining:this.route.length-this.s,progress:this.s/this.route.length,score:this.score,grade:road.grade,fps:this.fps,lat:road.lat,lon:road.lon,altitude:absolute.y,acceleration:this.physics.acceleration,forces:this.physics.forces,friction:.78-this.atmosphere.wet*.34,vehicles:this.traffic.count,chunk:this.world.chunkCount,message:this.noteTime>0?this.notification:this.animals.message||this.events.message,route:this.routeMap,player:{x:absolute.x,z:absolute.z},heading:road.heading+this.headingError,camera:this.cameras.names[this.cameras.mode],paused:this.paused});
    this.renderer.render(this.scene,this.cameras.camera);requestAnimationFrame(this.frame);
  }
}
