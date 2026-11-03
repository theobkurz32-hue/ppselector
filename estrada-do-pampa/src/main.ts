import {Route,type RouteData,type TerrainData} from './road/Route';
import {Game} from './game/Game';

const app=document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML='<div id="loading" style="position:fixed;inset:0;background:#152123;color:#e8e7dc;display:grid;place-content:center;font:16px system-ui;z-index:100;text-align:center"><h1 style="font-weight:400;letter-spacing:.12em">ESTRADA DO PAMPA</h1><p>Preparando a BR-293…</p></div>';
async function boot(){
  const routeResponse=await fetch(`${import.meta.env.BASE_URL}maps/route.json`);if(!routeResponse.ok)throw new Error('Cache geográfico indisponível. Consulte README e execute npm run gis.');
  const data=await routeResponse.json() as RouteData;
  let terrain:TerrainData|undefined;try{const response=await fetch(`${import.meta.env.BASE_URL}maps/terrain.json`);if(response.ok)terrain=await response.json() as TerrainData;}catch{console.warn('DEM não disponível; usando apenas perfil altimétrico documentado.');}
  const route=new Route(data,terrain);new Game(route);document.querySelector('#loading')?.remove();
}
boot().catch((error:unknown)=>{console.error(error);const loading=document.querySelector('#loading');if(loading){loading.replaceChildren();const title=document.createElement('h1');title.textContent='Não foi possível iniciar';const description=document.createElement('p');description.textContent=error instanceof Error?error.message:String(error);loading.append(title,description);}});
