import * as T from 'three';
import type {Route} from '../road/Route';
interface RoadFeature {properties:{oneway?:string;ref?:string};geometry:{coordinates:number[][]}}
/** Real OSM access topology, including divided one-way arms. Not an invented circle. */
export class Access {
  readonly group=new T.Group();
  private readonly asphalt=new T.MeshStandardMaterial({color:0x3d4140,roughness:.89});
  private readonly verge=new T.MeshStandardMaterial({color:0x6c6a5e,roughness:1});
  private readonly stripe=new T.MeshStandardMaterial({color:0xd5d5c6,roughness:.8});
  constructor(private route:Route){this.group.name='Entroncamento real BR-293 / ERS-702';void this.load().catch(error=>console.warn('Topologia secundária indisponível:',error));}
  update(s:number){this.group.visible=this.route.length-s<2400;}
  private async load(){
    const response=await fetch(`${import.meta.env.BASE_URL}maps/access-topology.geojson`);if(!response.ok)return;
    const data=await response.json() as {features:RoadFeature[]};
    for(const feature of data.features){
      const raw=feature.geometry.coordinates.map(([lon,lat])=>new T.Vector3((lon-this.route.geo[0].lon)*Math.PI/180*6371008.8*Math.cos(this.route.geo[0].lat*Math.PI/180),0,-(lat-this.route.geo[0].lat)*Math.PI/180*6371008.8));
      const points:T.Vector3[]=[];
      for(let i=0;i<raw.length-1;i++){const length=raw[i].distanceTo(raw[i+1]),steps=Math.max(1,Math.ceil(length/5));for(let j=0;j<steps;j++)points.push(raw[i].clone().lerp(raw[i+1],j/steps));}
      points.push(raw.at(-1)!);for(const point of points)point.y=this.route.terrainHeight(point.x,point.z);
      const half=feature.properties.oneway==='yes'?1.8:3.6;
      this.ribbon(points,-half-.65,half+.65,.12,this.verge);this.ribbon(points,-half,half,.15,this.asphalt);
      for(const side of [-1,1])this.ribbon(points,side*(half-.25)-.055,side*(half-.25)+.055,.17,this.stripe);
    }
    const at=this.route.sample(this.route.length-18),sign=new T.Group();
    const textureCanvas=document.createElement('canvas');textureCanvas.width=1024;textureCanvas.height=400;const ctx=textureCanvas.getContext('2d')!;
    ctx.fillStyle='#195348';ctx.fillRect(0,0,1024,400);ctx.strokeStyle='#ececdb';ctx.lineWidth=12;ctx.strokeRect(15,15,994,370);ctx.textAlign='center';ctx.fillStyle='#fffceb';ctx.font='500 64px Arial';ctx.fillText('ACESSO A PIRATINI',512,155);ctx.font='45px Arial';ctx.fillText('ERS-702   ↗',512,270);
    const texture=new T.CanvasTexture(textureCanvas);texture.colorSpace=T.SRGBColorSpace;
    const board=new T.Mesh(new T.PlaneGeometry(5,2),new T.MeshStandardMaterial({map:texture,side:T.DoubleSide,roughness:.75}));board.position.y=3.5;board.rotation.y=Math.PI;sign.add(board);
    for(const x of [-1.8,1.8]){const post=new T.Mesh(new T.CylinderGeometry(.07,.07,4,6),new T.MeshStandardMaterial({color:0xaaaa9c,roughness:.7}));post.position.set(x,2,0);sign.add(post);}
    sign.position.copy(at.position).addScaledVector(at.right,8);sign.rotation.y=at.heading;sign.traverse(n=>{if(n instanceof T.Mesh)n.castShadow=true;});this.group.add(sign);
  }
  private ribbon(points:T.Vector3[],left:number,right:number,lift:number,material:T.Material){
    const positions:number[]=[],indices:number[]=[];
    points.forEach((p,i)=>{const direction=points[Math.min(points.length-1,i+1)].clone().sub(points[Math.max(0,i-1)]).normalize();const side=new T.Vector3(-direction.z,0,direction.x).normalize();for(const offset of [left,right]){const a=p.clone().addScaledVector(side,offset);positions.push(a.x,a.y+lift,a.z);}if(i<points.length-1){const n=i*2;indices.push(n,n+1,n+2,n+1,n+3,n+2);}});
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();
    if(geo.getAttribute('normal').getY(0)<0){for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];geo.setIndex(indices);geo.computeVertexNormals();}
    const mesh=new T.Mesh(geo,material);mesh.receiveShadow=true;this.group.add(mesh);
  }
}
