#!/usr/bin/env python3
"""Offline terrain preprocessing from AWS/Mapzen Terrarium public elevation tiles.
No Python packages required. Native PNG RGB decoder, bilinear DEM interpolation.
"""
import concurrent.futures, json, math, pathlib, struct, subprocess, zlib
ROOT=pathlib.Path(__file__).resolve().parents[2];CACHE=ROOT/'scripts/gis/cache/dem';OUT=ROOT/'public/maps';ZOOM=12
BOUNDS={'west':-53.04,'east':-52.35,'south':-31.84,'north':-31.60}
def tile_xy(lon,lat):
    return (lon+180)/360*2**ZOOM,(1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*2**ZOOM
def download_tile(key):
    x,y=key;path=CACHE/f'{ZOOM}-{x}-{y}.png'
    if not path.exists():
        url=f'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{ZOOM}/{x}/{y}.png';tmp=path.with_suffix('.tmp')
        subprocess.run(['curl','--fail','--silent','--show-error','--retry','1','--max-time','25',url,'-o',str(tmp)],check=True);tmp.replace(path)
    return key,decode_png(path.read_bytes())
def decode_png(data):
    if data[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('DEM response is not PNG')
    offset=8;compressed=b''
    while offset<len(data):
        length=struct.unpack('>I',data[offset:offset+4])[0];kind=data[offset+4:offset+8];chunk=data[offset+8:offset+8+length];offset+=length+12
        if kind==b'IHDR':width,height,depth,color,_,_,interlace=struct.unpack('>IIBBBBB',chunk)
        if kind==b'IDAT':compressed+=chunk
        if kind==b'IEND':break
    if depth!=8 or color not in (2,6) or interlace:raise ValueError('Unsupported elevation PNG format')
    channels=3 if color==2 else 4;stride=width*channels;raw=zlib.decompress(compressed);previous=bytearray(stride);pixels=[];offset=0
    for _ in range(height):
        filter_type=raw[offset];offset+=1;row=bytearray(raw[offset:offset+stride]);offset+=stride
        for i in range(stride):
            a=row[i-channels] if i>=channels else 0;b=previous[i];c=previous[i-channels] if i>=channels else 0
            if filter_type==1:predict=a
            elif filter_type==2:predict=b
            elif filter_type==3:predict=(a+b)//2
            elif filter_type==4:
                p=a+b-c;pa=abs(p-a);pb=abs(p-b);pc=abs(p-c);predict=a if pa<=pb and pa<=pc else b if pb<=pc else c
            else:predict=0
            row[i]=(row[i]+predict)&255
        pixels.extend(row[i]*256+row[i+1]+row[i+2]/256-32768 for i in range(0,stride,channels));previous=row
    return pixels
TILES={}
def elevation(lon,lat):
    tx,ty=tile_xy(lon,lat);px=tx*256-.5;py=ty*256-.5;ix=math.floor(px);iy=math.floor(py);fx=px-ix;fy=py-iy
    def pixel(x,y):return TILES[x//256,y//256][(y%256)*256+x%256]
    return (pixel(ix,iy)*(1-fx)+pixel(ix+1,iy)*fx)*(1-fy)+(pixel(ix,iy+1)*(1-fx)+pixel(ix+1,iy+1)*fx)*fy

def main():
    CACHE.mkdir(parents=True,exist_ok=True);OUT.mkdir(exist_ok=True)
    west,north=tile_xy(BOUNDS['west'],BOUNDS['north']);east,south=tile_xy(BOUNDS['east'],BOUNDS['south'])
    keys=[(x,y) for x in range(math.floor(west),math.floor(east)+1) for y in range(math.floor(north),math.floor(south)+1)]
    print('Adquirindo/decodificando',len(keys),'tiles DEM Terrarium z12...',flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for key,values in pool.map(download_tile,keys):TILES[key]=values
    width,height=641,281
    values=[round(elevation(BOUNDS['west']+x/(width-1)*(BOUNDS['east']-BOUNDS['west']),BOUNDS['north']-y/(height-1)*(BOUNDS['north']-BOUNDS['south'])),2) for y in range(height) for x in range(width)]
    terrain={'bounds':BOUNDS,'width':width,'height':height,'elevations':values,'metadata':{'source':'Mapzen/AWS Terrain Tiles, Terrarium encoding','zoom':ZOOM,'sampleSpacingMetersApprox':100,'nativePixelMetersApprox':33,'acquiredAt':'2026-11-03','license':'Source-dependent public DEM composite; see DATA_SOURCES.md'}}
    axis=ROOT/'scripts/gis/cache/route-axis.json'
    data=json.loads((axis if axis.exists() else OUT/'route.json').read_text());points=data['points'];dense=[points[0]]
    for a,b in zip(points,points[1:]):
        distance=math.hypot((b['lon']-a['lon'])*111195*math.cos(math.radians(a['lat'])),(b['lat']-a['lat'])*111195)
        steps=max(1,math.ceil(distance/20))
        for i in range(1,steps+1):
            t=i/steps;dense.append({'lat':a['lat']+(b['lat']-a['lat'])*t,'lon':a['lon']+(b['lon']-a['lon'])*t})
    raw=[elevation(p['lon'],p['lat']) for p in dense]
    # 160 m triangular low-pass removes canopy/pixel steps without exaggerating relief.
    for i,p in enumerate(dense):
        samples=[(raw[j],5-abs(i-j)) for j in range(max(0,i-4),min(len(raw),i+5))]
        p['elevation']=round(sum(h*w for h,w in samples)/sum(w for _,w in samples),3)
    data['points']=dense;data['metadata']['elevationSource']='AWS/Mapzen Terrain Tiles Terrarium z12 (public DEM composite)';data['metadata']['elevationProcessing']='bilinear source pixels; axis densified <=20m; triangular smoothing radius80m';data['metadata']['terrainGridMetersApprox']=100
    (OUT/'terrain.json.tmp').write_text(json.dumps(terrain,separators=(',',':')));(OUT/'route.json.tmp').write_text(json.dumps(data,ensure_ascii=False,separators=(',',':')))
    (OUT/'terrain.json.tmp').replace(OUT/'terrain.json');(OUT/'route.json.tmp').replace(OUT/'route.json')
    print('DEM e eixo gravados:',len(dense),'amostras;',round(min(raw),1),'a',round(max(raw),1),'m; grid',width,'x',height,flush=True)
if __name__=='__main__':main()
