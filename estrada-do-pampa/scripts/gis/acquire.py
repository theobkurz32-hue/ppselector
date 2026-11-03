#!/usr/bin/env python3
"""Acquire an OSM-derived BR-293 axis, retaining cache for offline regeneration.
Uses public OSRM because Overpass endpoints may be unavailable. Never invents an axis.
"""
import argparse, json, math, pathlib, subprocess, sys, xml.etree.ElementTree as ET
ROOT=pathlib.Path(__file__).resolve().parents[2]
CACHE=ROOT/'scripts/gis/cache'; OUT=ROOT/'public/maps'
URL='https://router.project-osrm.org/route/v1/driving/-52.392,-31.753;-53.104,-31.448?overview=full&geometries=geojson&steps=true'
ACCESS='https://www.openstreetmap.org/api/0.6/map?bbox=-52.965,-31.704,-52.955,-31.694'
def download(url,path):
    tmp=path.with_suffix(path.suffix+'.tmp')
    result=subprocess.run(['curl','--fail','--silent','--show-error','--max-time','40',url,'-o',str(tmp)])
    if result.returncode:
        tmp.unlink(missing_ok=True)
        if not path.exists(): raise RuntimeError('Aquisição falhou e não existe cache: '+str(path))
        print('API indisponível; preservando cache existente:',path.name)
    else:tmp.replace(path)
def process_access(path):
    root=ET.parse(path).getroot()
    nodes={int(n.attrib['id']):[float(n.attrib['lon']),float(n.attrib['lat'])] for n in root.findall('node')};features=[]
    def add(way,tags,points):
        if len(points)>1:features.append({'type':'Feature','properties':{'osmWay':way.attrib['id'],**tags},'geometry':{'type':'LineString','coordinates':points}})
    for way in root.findall('way'):
        tags={t.attrib['k']:t.attrib['v'] for t in way.findall('tag')}
        if tags.get('highway') not in ['trunk','trunk_link','primary','primary_link']:continue
        kept=[]
        for node in way.findall('nd'):
            point=nodes.get(int(node.attrib['ref']))
            if point is None:continue
            distance=math.hypot((point[0]+52.9601)*94600,(point[1]+31.6992)*111195)
            if distance<1200:kept.append(point)
            elif kept:add(way,tags,kept);kept=[]
        add(way,tags,kept)
    (OUT/'access-topology.geojson').write_text(json.dumps({'type':'FeatureCollection','features':features},separators=(',',':')))
def acquire(refresh=False):
    CACHE.mkdir(parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
    raw=CACHE/'osrm-pelotas-piratini.json'
    if refresh or not raw.exists():download(URL,raw)
    source=json.loads(raw.read_text());steps=source['routes'][0]['legs'][0]['steps']
    # Select the BR-293-only road section after the common BR-116 section.
    candidates=[s for s in steps if s.get('ref')=='BR-293']
    if not candidates:raise RuntimeError('Snapshot sem ref BR-293; inspecione os dados. Cache local não será substituído.')
    step=max(candidates,key=lambda s:s['distance']);coords=step['geometry']['coordinates']
    start,end=coords[0],coords[-1]
    if not(-52.46<start[0]<-52.41 and -52.98<end[0]<-52.94):raise RuntimeError('Extremos inesperados; revisão GIS necessária.')
    existing=OUT/'route.json'
    metadata={'name':'BR-293: Pelotas (entroncamento BR-116) → acesso a Piratini (ERS-702)','source':'OpenStreetMap via OSRM public routing service','sourceUrl':URL,'acquiredAt':'2026-11-03','license':'ODbL 1.0','roadRef':'BR-293','lengthSourceMeters':step['distance'],'start':{'name':'Entroncamento BR-116 / BR-293','lon':start[0],'lat':start[1]},'destination':{'name':'Entroncamento BR-293 / ERS-702 — acesso a Piratini','lon':end[0],'lat':end[1]},'validation':'OSM ref BR-293; quilometragem SNV e projeto executivo da rotatória ainda não conferidos'}
    geo={'type':'FeatureCollection','features':[{'type':'Feature','properties':metadata,'geometry':step['geometry']}]}
    (OUT/'route.geojson').write_text(json.dumps(geo,ensure_ascii=False,separators=(',',':')))
    # Raw profile remains separate: elevation preprocessing commits route.json only on success.
    (CACHE/'route-axis.json').write_text(json.dumps({'metadata':metadata,'points':[{'lon':c[0],'lat':c[1],'elevation':0} for c in coords]},ensure_ascii=False,separators=(',',':')))
    access=CACHE/'piratini-access.osm'
    if refresh or not access.exists():download(ACCESS,access)
    process_access(access)
    print('Eixo OSM disponível:',len(coords),'nós,',round(step['distance']/1000,2),'km. Cache preservado.')
    return CACHE/'route-axis.json'
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--refresh',action='store_true');args=parser.parse_args()
    try:
        axis=acquire(args.refresh)
        terrain_script=ROOT/'scripts/gis/terrain.py'
        if terrain_script.exists():subprocess.run([sys.executable,str(terrain_script)],check=True,cwd=ROOT)
        else:print('Execute o processador DEM documentado em DATA_SOURCES.md. route.json existente preservado.')
    except (RuntimeError,KeyError,subprocess.CalledProcessError) as error:
        print('Falha GIS:',error,file=sys.stderr);sys.exit(1)
