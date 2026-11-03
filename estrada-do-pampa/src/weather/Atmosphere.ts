import * as T from 'three';
import {worldConfig} from '../data/worldConfig';
export type WeatherKind='CLEAR'|'PARTLY_CLOUDY'|'OVERCAST'|'LIGHT_RAIN'|'HEAVY_RAIN'|'FOG';
const states:Record<WeatherKind,{wet:number;cloud:number;fog:number}>={CLEAR:{wet:0,cloud:.08,fog:.00018},PARTLY_CLOUDY:{wet:0,cloud:.4,fog:.00025},OVERCAST:{wet:0,cloud:.9,fog:.0005},LIGHT_RAIN:{wet:.5,cloud:.85,fog:.0012},HEAVY_RAIN:{wet:1,cloud:1,fog:.0028},FOG:{wet:.1,cloud:.7,fog:.006}};
export const weatherLabels:Record<WeatherKind,string>={CLEAR:'Céu aberto',PARTLY_CLOUDY:'Parcialmente nublado',OVERCAST:'Encoberto',LIGHT_RAIN:'Chuva leve',HEAVY_RAIN:'Chuva forte',FOG:'Neblina'};
export class Atmosphere {
  hour=8.2;kind:WeatherKind='PARTLY_CLOUDY';wet=0;cloud=.4;fog=.00025;private timer=0;
  readonly sun=new T.DirectionalLight(0xffecd0,3); readonly ambient=new T.HemisphereLight(0xb7d3e5,0x5c6242,2);
  private sky:T.Mesh;private rain:T.Points;private rainPositions:Float32Array;private stars:T.Points; private moon:T.Mesh;
  private cloudGroup=new T.Group();private sunDisc:T.Mesh;
  constructor(private scene:T.Scene){
    this.sun.castShadow=true;this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.camera.left=-110;this.sun.shadow.camera.right=110;this.sun.shadow.camera.top=110;this.sun.shadow.camera.bottom=-110;this.sun.shadow.camera.near=1;this.sun.shadow.camera.far=700;this.sun.shadow.normalBias=.045;this.sun.shadow.bias=-.0001;
    scene.add(this.sun,this.sun.target,this.ambient);scene.fog=new T.FogExp2(0xbcccd1,.00025);
    this.sky=new T.Mesh(new T.SphereGeometry(6000,32,16),new T.ShaderMaterial({side:T.BackSide,depthWrite:false,uniforms:{top:{value:new T.Color('#4d86ae')},bottom:{value:new T.Color('#d6dbcf')}},vertexShader:'varying vec3 vPos; void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'varying vec3 vPos;uniform vec3 top;uniform vec3 bottom;void main(){float t=pow(clamp(normalize(vPos).y,0.,1.),.55);gl_FragColor=vec4(mix(bottom,top,t),1.);}'}));this.sky.frustumCulled=false;scene.add(this.sky);
    this.sunDisc=new T.Mesh(new T.SphereGeometry(42,16,12),new T.MeshBasicMaterial({color:0xffefc8,fog:false}));scene.add(this.sunDisc);
    this.moon=new T.Mesh(new T.SphereGeometry(23,16,12),new T.MeshBasicMaterial({color:0xcbd4da,fog:false}));scene.add(this.moon);
    const starPositions=new Float32Array(1800*3);for(let i=0;i<1800;i++){const a=i*2.399963,b=Math.acos(1-(i+.5)/1800);starPositions[i*3]=Math.sin(b)*Math.cos(a)*5000;starPositions[i*3+1]=Math.cos(b)*5000;starPositions[i*3+2]=Math.sin(b)*Math.sin(a)*5000;}
    this.stars=new T.Points(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(starPositions,3)),new T.PointsMaterial({color:0xc9dcf5,size:2,sizeAttenuation:false,fog:false,transparent:true}));scene.add(this.stars);
    const cloudCanvas=document.createElement('canvas');cloudCanvas.width=512;cloudCanvas.height=192;const cloudContext=cloudCanvas.getContext('2d')!;
    for(let i=0;i<22;i++){const x=60+(i*89)%390,y=80+Math.sin(i*7.1)*26,r=30+i%5*9;const gradient=cloudContext.createRadialGradient(x,y,0,x,y,r);gradient.addColorStop(0,'rgba(255,255,255,.26)');gradient.addColorStop(.45,'rgba(248,249,246,.16)');gradient.addColorStop(1,'rgba(240,244,242,0)');cloudContext.fillStyle=gradient;cloudContext.fillRect(x-r,y-r,r*2,r*2);}
    const cloudTexture=new T.CanvasTexture(cloudCanvas);cloudTexture.colorSpace=T.SRGBColorSpace;
    const cloudMat=new T.SpriteMaterial({map:cloudTexture,color:0xe5e5dc,transparent:true,opacity:.55,depthWrite:false});
    for(let i=0;i<44;i++){const c=new T.Sprite(cloudMat);c.position.set(Math.sin(i*9.7)*2600,600+Math.sin(i*3)*120,Math.cos(i*4.9)*2600);c.scale.set(440+i%4*80,120+i%3*35,1);this.cloudGroup.add(c);}scene.add(this.cloudGroup);
    this.rainPositions=new Float32Array(1800*6);for(let i=0;i<1800;i++){const x=Math.random()*90-45,y=Math.random()*45,z=Math.random()*90-45;this.rainPositions.set([x,y,z,x-.12,y+.9,z],i*6);}
    this.rain=new T.LineSegments(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(this.rainPositions,3)),new T.LineBasicMaterial({color:0xbcd2dc,transparent:true,opacity:.3,depthWrite:false})) as unknown as T.Points;this.rain.frustumCulled=false;scene.add(this.rain);
  }
  setWeather(kind:string){if(kind in states){this.kind=kind as WeatherKind;this.timer=0;}}
  update(dt:number,player:T.Vector3,latitude:number,longitude:number){
    this.hour=(this.hour+dt*24/worldConfig.dayLength)%24;this.timer+=dt;
    if(this.timer>130+this.hour*5){const kinds=Object.keys(states) as WeatherKind[];this.kind=kinds[Math.floor(Math.random()*kinds.length)];this.timer=0;}
    const state=states[this.kind],blend=1-Math.exp(-dt/18);this.wet+=(state.wet-this.wet)*blend;this.cloud+=(state.cloud-this.cloud)*blend;this.fog+=(state.fog-this.fog)*blend;
    // Solar declination for austral spring; equation of time/longitude correct local solar hour.
    const dec=-14*Math.PI/180,lat=latitude*Math.PI/180,h=(this.hour-12+(longitude+45)/15)*Math.PI/12;
    const up=Math.sin(lat)*Math.sin(dec)+Math.cos(lat)*Math.cos(dec)*Math.cos(h);
    const east=-Math.cos(dec)*Math.sin(h),north=Math.cos(lat)*Math.sin(dec)-Math.sin(lat)*Math.cos(dec)*Math.cos(h);
    const dir=new T.Vector3(east,up,-north).normalize(),day=T.MathUtils.smoothstep(up,-.12,.2),warm=1-T.MathUtils.smoothstep(up,0,.35);
    this.sun.position.copy(player).addScaledVector(dir,300);this.sun.target.position.copy(player);this.sun.intensity=day*3.1*(1-this.cloud*.78);this.sun.color.setRGB(1,.97-warm*.27,.89-warm*.38);this.sun.castShadow=up>0;
    this.ambient.intensity=.14+day*1.7;this.ambient.color.setRGB(.36+day*.35,.45+day*.36,.62+day*.3);
    const top=new T.Color().setRGB(.018+day*(.19-this.cloud*.08),.027+day*(.39-this.cloud*.13),.06+day*(.54-this.cloud*.18));
    const bottom=new T.Color().setRGB(.05+day*.64,.065+day*.68,.09+day*.64);bottom.lerp(new T.Color('#d9bba2'),warm*day*.4);
    const mat=this.sky.material as T.ShaderMaterial;mat.uniforms.top.value.copy(top);mat.uniforms.bottom.value.copy(bottom);this.sky.position.copy(player);
    (this.scene.fog as T.FogExp2).color.copy(bottom);(this.scene.fog as T.FogExp2).density=this.fog;
    this.sunDisc.position.copy(player).addScaledVector(dir,4700);this.sunDisc.visible=up>-.03;this.moon.position.copy(player).addScaledVector(dir,-4600);this.moon.visible=up<.12;
    this.stars.position.copy(player);(this.stars.material as T.PointsMaterial).opacity=1-day;this.stars.visible=day<.8;
    this.cloudGroup.position.copy(player);this.cloudGroup.rotation.y+=dt*.0008;((this.cloudGroup.children[0] as T.Sprite).material as T.SpriteMaterial).opacity=.18+this.cloud*.58;
    ((this.cloudGroup.children[0] as T.Sprite).material as T.SpriteMaterial).color.copy(bottom).lerp(new T.Color(0xffffff),.3);
    this.rain.position.copy(player);this.rain.visible=this.wet>.13&&this.kind!=='FOG';
    if(this.rain.visible){for(let i=0;i<1800;i++){let y=this.rainPositions[i*6+1]-dt*(20+this.wet*10);if(y<0)y+=45;this.rainPositions[i*6+1]=y;this.rainPositions[i*6+4]=y+.65+this.wet*.4;}this.rain.geometry.attributes.position.needsUpdate=true;(this.rain.material as T.LineBasicMaterial).opacity=this.wet*.45;}
  }
}
