import { Vector3 } from 'three';

export interface GeoPoint {lat:number;lon:number;elevation:number}
export interface RouteData {metadata:Record<string,unknown>;points:GeoPoint[]}
export interface TerrainData {bounds:{west:number;east:number;south:number;north:number};width:number;height:number;elevations:number[]}
export interface RoadSample {position:Vector3;tangent:Vector3;right:Vector3;heading:number;grade:number;lat:number;lon:number}
const EARTH=6371008.8, RAD=Math.PI/180;
/** Local equirectangular metric frame, suitable for this regional corridor. */
export class Route {
  readonly points:Vector3[]; readonly distances:number[]=[0]; readonly length:number;
  readonly metadata:Record<string,unknown>; readonly geo:GeoPoint[];
  private cosLat:number; private bins=new Map<string,number[]>();
  constructor(data:RouteData,private terrain?:TerrainData){
    if(data.points.length<2) throw new Error('Eixo geográfico ausente. Execute o pipeline GIS.');
    this.geo=data.points; this.metadata=data.metadata; this.cosLat=Math.cos(this.geo[0].lat*RAD);
    this.points=data.points.map(p=>new Vector3((p.lon-this.geo[0].lon)*RAD*EARTH*this.cosLat,p.elevation,-(p.lat-this.geo[0].lat)*RAD*EARTH));
    for(let i=1;i<this.points.length;i++)this.distances.push(this.distances[i-1]+this.points[i].distanceTo(this.points[i-1]));
    this.length=this.distances.at(-1)!;
    for(let i=0;i<this.points.length-1;i++){
      const a=this.points[i],b=this.points[i+1];
      for(let x=Math.floor(Math.min(a.x,b.x)/256)-1;x<=Math.floor(Math.max(a.x,b.x)/256)+1;x++)for(let z=Math.floor(Math.min(a.z,b.z)/256)-1;z<=Math.floor(Math.max(a.z,b.z)/256)+1;z++){
        const key=`${x},${z}`;if(!this.bins.has(key))this.bins.set(key,[]);this.bins.get(key)!.push(i);
      }
    }
  }
  sample(distance:number):RoadSample{
    const s=Math.max(0,Math.min(this.length,distance)); let lo=0,hi=this.distances.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(this.distances[mid]<=s)lo=mid;else hi=mid;}
    const span=this.distances[hi]-this.distances[lo],t=span>0?(s-this.distances[lo])/span:0;
    const position=this.points[lo].clone().lerp(this.points[hi],t);
    // Blend neighboring directions; road remains within the measured corridor.
    const prev=this.points[Math.max(0,lo-1)],next=this.points[Math.min(this.points.length-1,hi+1)];
    const tangent=this.points[hi].clone().sub(prev).normalize().lerp(next.clone().sub(this.points[lo]).normalize(),t).normalize();
    const right=new Vector3(-tangent.z,0,tangent.x).normalize();
    const grade=tangent.y/Math.max(.001,Math.hypot(tangent.x,tangent.z));
    return {position,tangent,right,heading:Math.atan2(tangent.x,tangent.z),grade,lat:this.geo[lo].lat+(this.geo[hi].lat-this.geo[lo].lat)*t,lon:this.geo[lo].lon+(this.geo[hi].lon-this.geo[lo].lon)*t};
  }
  project(x:number,z:number):{s:number;lateral:number;distance:number}{
    const nearby=this.bins.get(`${Math.floor(x/256)},${Math.floor(z/256)}`);
    const candidates=nearby??this.points.slice(0,-1).map((_,i)=>i);
    let best=Infinity,s=0,lateral=0;
    for(const i of candidates){const a=this.points[i],b=this.points[i+1],dx=b.x-a.x,dz=b.z-a.z;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));
      const ex=x-a.x-t*dx,ez=z-a.z-t*dz,d=ex*ex+ez*ez;
      if(d<best){best=d;s=this.distances[i]+t*(this.distances[i+1]-this.distances[i]);lateral=(ex*-dz+ez*dx)/Math.hypot(dx,dz);}
    }
    return {s,lateral,distance:Math.sqrt(best)};
  }
  terrainHeight(x:number,z:number):number{
    const near=this.bins.has(`${Math.floor(x/256)},${Math.floor(z/256)}`);
    const p=near||!this.terrain?this.project(x,z):{s:0,lateral:0,distance:1000},road=near||!this.terrain?this.sample(p.s).position.y:0;
    if(!this.terrain)return road; // Explicit profile-only fallback, never invented DEM.
    const g=this.terrain,b=g.bounds;
    const lon=this.geo[0].lon+x/(RAD*EARTH*this.cosLat),lat=this.geo[0].lat-z/(RAD*EARTH);
    const u=Math.max(0,Math.min(g.width-1,(lon-b.west)/(b.east-b.west)*(g.width-1))),v=Math.max(0,Math.min(g.height-1,(b.north-lat)/(b.north-b.south)*(g.height-1)));
    const ix=Math.min(g.width-2,Math.floor(u)),iy=Math.min(g.height-2,Math.floor(v)),fx=u-ix,fy=v-iy;
    const a=g.elevations[iy*g.width+ix],c=g.elevations[(iy+1)*g.width+ix];
    const h=(a*(1-fx)+g.elevations[iy*g.width+ix+1]*fx)*(1-fy)+(c*(1-fx)+g.elevations[(iy+1)*g.width+ix+1]*fx)*fy;
    const blend=Math.min(1,Math.max(0,(p.distance-7)/30));return road*(1-blend)+h*blend;
  }
}
