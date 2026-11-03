import './style.css';

export interface HUDData {
  speed: number; rpm: number; gear: number; fuel: number; damage: number;
  hour: number; weather: string; remaining: number; progress: number; score: number;
  grade: number; fps: number; lat: number; lon: number; altitude: number;
  acceleration: number; forces: { drive: number; drag: number; rolling: number; grade: number };
  friction: number; vehicles: number; chunk: number; message: string;
  route: Array<{ x: number; z: number }>; player: { x: number; z: number };
  heading: number; camera: string; paused: boolean;
}
interface Callbacks {
  start: (resume: boolean) => void; pause: () => void; quality: (level: string) => void;
  teleport: (fraction: number) => void; weather: (kind: string) => void; time: (hour: number) => void;
}
const WEATHER: Record<string, string> = {
  CLEAR: 'Céu aberto', PARTLY_CLOUDY: 'Parcialmente nublado', OVERCAST: 'Encoberto',
  LIGHT_RAIN: 'Chuva leve', HEAVY_RAIN: 'Chuva intensa', FOG: 'Neblina',
};
const arrow = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const location = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M19 10c0 6-7 11-7 11S5 16 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.4"/></svg>';
const cloud = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M6 18a4 4 0 0 1-1-7.9A6 6 0 0 1 17 9a4.5 4.5 0 1 1 1 9Z"/></svg>';
const cameraIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 8h5l2-3h5l2 3h4v12H3Z"/><circle cx="12" cy="14" r="4"/></svg>';
const pauseIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6v12M15 6v12"/></svg>';
const controls = [ ['W / ↑', 'Acelerar'], ['S / ↓', 'Freio de serviço'], ['A / D', 'Direção'], ['Espaço', 'Freio de emergência'], ['C', 'Trocar câmera'], ['V', 'Câmera de cabine'], ['U', 'Ligar / desligar som'], ['J', 'Rádio instrumental'], ['R', 'Alternar frente / ré, com o caminhão parado'], ['B', 'Freio motor'], ['H', 'Buzina'], ['L', 'Faróis'], ['Q / E', 'Setas'], ['P / Esc', 'Pausar'], ['M', 'Mapa da viagem'], ['F3', 'Telemetria e ferramentas'] ];

export class UI {
  private root: HTMLDivElement;
  private data?: HUDData;
  private mapOpen = false;
  private debugOpen = false;
  private activeModal = '';
  private frame = 0;
  private directionState?:boolean;
  private audioState='';

  constructor(private callbacks: Callbacks) {
    this.root = document.createElement('div');
    this.root.id = 'game-ui';
    this.root.innerHTML = `
      <div class="screen-vignette"></div>
      <section class="orientation-prompt" aria-label="Gire o celular para jogar">
        <div class="rotate-phone" aria-hidden="true">↻</div><div class="eyebrow">ESTRADA DO PAMPA</div>
        <h2>A estrada fica melhor<br>na horizontal.</h2><p>Gire o celular para dirigir com os dois polegares.<br>Direção à esquerda, pedais à direita.</p>
        <button id="landscape-button" class="primary-button">ATIVAR TELA HORIZONTAL ↗</button><small id="orientation-help">Se o navegador não girar a tela, gire o aparelho manualmente.</small>
      </section>
      <section id="main-menu" class="main-menu" aria-label="Menu principal">
        <header class="menu-header"><a class="brand" href="#" aria-label="Estrada do Pampa"><span class="road-shield">BR<span>293</span></span><span>ESTRADA<br><b>DO PAMPA</b></span></a><div class="menu-region"><span class="status-dot"></span>RIO GRANDE DO SUL, BRASIL <span class="region-coordinates">31°46′ S · 52°20′ O</span></div><span class="edition">VIAGEM REAL <i>01</i></span></header>
        <div class="menu-content"><div class="menu-hero"><div class="eyebrow"><span></span> SIMULAÇÃO RODOVIÁRIA</div><h1>O caminho<br>é a <em>viagem.</em></h1><p>O horizonte aberto. O peso da carga.<br>Seu próximo destino, pelas estradas do Pampa.</p><button class="primary-button" id="new-journey">INICIAR VIAGEM ${arrow}</button><button class="continue-button" id="continue-journey">Continuar viagem salva <span>↗</span></button><div class="menu-links"><button data-modal="settings">Configurações</button><span>·</span><button data-modal="controls">Como dirigir</button></div></div>
        <aside class="journey-card"><div class="card-top"><span>SEU ITINERÁRIO</span><span>01 / RS</span></div><div class="route-preview"><canvas id="menu-route" width="500" height="340" aria-label="Traçado real da rota"></canvas><span class="map-label pelotas">PELOTAS</span><span class="map-label piratini">ACESSO A PIRATINI</span><span class="map-north">N ↑</span></div><div class="route-stops"><div><span class="stop-dot"></span><small>PARTIDA</small><strong>Pelotas</strong></div><div class="stop-connector"></div><div><span class="stop-dot destination"></span><small>DESTINO</small><strong>Acesso a Piratini</strong></div></div><div class="route-details"><span><small>RODOVIA</small><b>BR-293</b></span><span><small>DISTÂNCIA</small><b id="route-length">Carregando…</b></span><span><small>AMBIENTE</small><b>Pampa</b></span></div><div class="route-note">${location}<span>Traçado geográfico real · viagem em escala 1:1</span></div></aside></div>
        <footer class="menu-footer"><span>UM DESTINO. MIL HISTÓRIAS PELO CAMINHO.</span><span>WASD para dirigir <i>·</i> C troca a câmera <i>·</i> P pausa</span><span class="version-label">EDIÇÃO WEB / v0.2</span></footer>
      </section>
      <section id="hud" class="hud hidden" aria-label="Painel de condução">
        <div class="hud-route"><span class="mini-shield">293</span><div><small>BR-293 · SENTIDO OESTE</small><strong>Acesso a Piratini ${arrow}</strong></div><div class="distance-to-go"><b id="remaining">—</b><small>ATÉ O DESTINO</small></div></div>
        <div class="hud-environment"><span id="clock">08:00</span><span class="weather-symbol">${cloud}</span><span id="weather">Céu aberto</span><button id="pause-button" class="icon-button" aria-label="Pausar viagem">${pauseIcon}</button></div>
        <div class="drive-tools" aria-label="Câmera e áudio">
          <button data-action="camera" id="cabin-button" aria-label="Dirigir dentro da cabine">${cameraIcon}<span>CABINE</span></button>
          <button data-action="cycle-camera" aria-label="Alternar câmeras"><span class="tool-symbol">↺</span><span>CÂMERAS</span></button>
          <button data-action="audio" id="sound-button" aria-pressed="true" aria-label="Desligar som"><span class="tool-symbol">♪</span><span>SOM</span></button>
          <button data-action="radio" id="radio-button" aria-pressed="false" aria-label="Ligar rádio"><span class="tool-symbol">▤</span><span>RÁDIO</span></button>
          <button id="fullscreen-button" aria-label="Tela cheia"><span class="tool-symbol">⛶</span><span>TELA</span></button>
        </div>
        <div class="journey-progress"><span id="progress-bar"></span></div>
        <div class="hud-map"><div class="minimap-title"><span>ROTA ATUAL</span><button id="open-map" aria-label="Abrir mapa">M <span>↗</span></button></div><canvas id="mini-map" width="480" height="280" aria-label="Minimapa da estrada"></canvas><div class="map-footer"><span id="camera-name">CÂMERA EXTERNA</span><span>C <i>câmera</i></span></div></div>
        <div class="notification hidden" id="notification"><span class="notice-icon">!</span><span id="notification-text"></span></div>
        <div class="driving-panel"><div class="rpm-track"><span id="rpm-fill"></span></div><div class="driving-main"><div class="gear-indicator"><small>AUTO</small><strong id="gear">1</strong><span>MARCHA</span></div><div class="speed-indicator"><strong id="speed">0</strong><span>km/h</span></div><div class="truck-status"><div><span>COMBUSTÍVEL</span><b id="fuel">100%</b></div><div class="fuel-track"><span id="fuel-fill"></span></div><div class="condition-row"><span>CONDIÇÃO</span><b id="condition">100%</b></div></div></div><div class="driving-footer"><span id="rpm">600 RPM</span><span id="grade">0.0% <i>inclinação</i></span><span id="score">0 <i>pontos</i></span></div></div>
        <div class="hud-hints"><span><kbd>W</kbd> Acelerar</span><span><kbd>S</kbd> Frear</span><span><kbd>M</kbd> Mapa</span><span><kbd>F3</kbd> Telemetria</span></div>
        <div class="mobile-controls" aria-label="Controles de direção por toque">
          <div class="steering-controls"><button data-control="a" class="steer-button" aria-label="Virar à esquerda"><span>‹</span><small>ESQUERDA</small></button><button data-control="d" class="steer-button" aria-label="Virar à direita"><span>›</span><small>DIREITA</small></button><button data-control="h" class="horn-button" aria-label="Buzinar">BUZINA</button></div>
          <div class="pedal-controls"><div class="gear-controls"><button data-action="reverse" id="reverse-button" aria-pressed="false" aria-label="Alternar marcha à ré">R<span>RÉ</span></button><button data-control="space" class="parking-button" aria-label="Freio de emergência">P<span>EMERG.</span></button></div><button data-control="s" class="brake-pedal" aria-label="Frear"><span class="pedal-lines">▰</span><b>FREIO</b></button><button data-control="w" class="accelerator-pedal" aria-label="Acelerar"><span class="pedal-lines">≡</span><b>ACELERAR</b><small id="pedal-direction">FRENTE</small></button></div>
        </div>
      </section>
      <section id="pause-screen" class="dialog-backdrop hidden"><div class="pause-card"><div class="eyebrow">UMA PAUSA NO CAMINHO</div><h2>A estrada espera.</h2><p>Seu progresso é salvo automaticamente.</p><button class="primary-button" id="resume">CONTINUAR VIAGEM ${arrow}</button><button class="text-button" data-modal="settings">Configurações</button><button class="text-button" data-modal="controls">Controles</button><button class="text-button" id="return-menu">Voltar ao início</button></div></section>
      <section id="modal" class="dialog-backdrop hidden"><div class="modal-card"><button class="close-modal icon-button" aria-label="Fechar">×</button><div id="modal-content"></div></div></section>
      <section id="map-screen" class="map-screen hidden"><header><div><div class="eyebrow">SUA VIAGEM</div><h2>Pelotas <span>→</span> Acesso a Piratini</h2></div><button id="close-map" class="text-button">FECHAR <kbd>M</kbd></button></header><canvas id="large-map" width="1400" height="750"></canvas><footer><span><i class="legend-line"></i>BR-293 · rota real</span><span><i class="legend-player"></i>Sua posição</span><span id="map-distance"></span></footer><div class="map-attribution">© OpenStreetMap contributors · ODbL</div></section>
      <section id="debug" class="debug-panel hidden"><div class="debug-title">TELEMETRIA <span>F3</span></div><pre id="debug-values"></pre><div class="dev-buttons"><button data-teleport="0">Início</button><button data-teleport="0.5">Meio da rota</button><button data-teleport="0.995">Acesso Piratini</button></div><label>Clima<select id="dev-weather">${Object.entries(WEATHER).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><label>Horário<input id="dev-time" type="range" min="0" max="23.9" step="0.1" value="9"></label></section>
      <section id="finish-screen" class="dialog-backdrop hidden"><div class="finish-card"><div class="arrival-symbol">✓</div><div class="eyebrow">VIAGEM CONCLUÍDA</div><h2>Bem-vindo ao<br>acesso a Piratini.</h2><p>Você atravessou um pedaço do Pampa.</p><div id="finish-stats" class="finish-stats"></div><button id="another-journey" class="primary-button">NOVA VIAGEM ${arrow}</button></div></section>
      <div class="data-credit">© OpenStreetMap contributors</div>`;
    document.body.appendChild(this.root);
    this.on('#new-journey', () => {this.prepareTouchScreen();callbacks.start(false);});
    this.on('#continue-journey', () => {this.prepareTouchScreen();callbacks.start(true);});
    this.on('#another-journey', () => { this.hide('#finish-screen', true); callbacks.start(false); });
    this.on('#pause-button', callbacks.pause);
    this.on('#resume', callbacks.pause);
    this.on('#return-menu', () => { this.setPaused(false); this.setMenu(true); });
    this.on('#open-map', () => this.toggleMap());
    this.on('#close-map', () => this.toggleMap());
    this.on('.close-modal', () => this.closeModal());
    this.root.querySelectorAll<HTMLButtonElement>('[data-modal]').forEach(button => button.addEventListener('click', () => this.openModal(button.dataset.modal!)));
    this.root.querySelectorAll<HTMLButtonElement>('[data-teleport]').forEach(button => button.addEventListener('click', () => callbacks.teleport(Number(button.dataset.teleport))));
    this.get<HTMLSelectElement>('#dev-weather').addEventListener('change', event => callbacks.weather((event.target as HTMLSelectElement).value));
    this.get<HTMLInputElement>('#dev-time').addEventListener('input', event => callbacks.time(Number((event.target as HTMLInputElement).value)));
    this.root.querySelector('.brand')?.addEventListener('click', event => event.preventDefault());
    this.root.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(button=>button.addEventListener('click',()=>document.dispatchEvent(new CustomEvent('pampa-action',{detail:button.dataset.action}))));
    this.on('#landscape-button',()=>void this.enterLandscape());
    this.on('#fullscreen-button',()=>void this.enterLandscape());
    document.addEventListener('pampa-direction',event=>this.setDirection((event as CustomEvent<boolean>).detail));
    this.setAudioState(true,false);this.setDirection(false);
  }

  private get<T extends HTMLElement = HTMLElement>(selector: string): T { return this.root.querySelector<T>(selector)!; }
  private on(selector: string, callback: () => void): void { this.get(selector).addEventListener('click', callback); }
  private hide(selector: string, hidden: boolean): void { this.get(selector).classList.toggle('hidden', hidden); }
  private set(selector: string, value: string): void { this.get(selector).textContent = value; }
  private km(meters: number): string { return `${(Math.max(0, meters) / 1000).toFixed(1).replace('.', ',')} km`; }

  private prepareTouchScreen(){if(matchMedia('(pointer: coarse)').matches)void this.enterLandscape();}
  private async enterLandscape(){
    const element=document.documentElement as HTMLElement&{webkitRequestFullscreen?:()=>Promise<void>|void};
    try{if(!document.fullscreenElement){if(element.requestFullscreen)await element.requestFullscreen();else await element.webkitRequestFullscreen?.();}}catch{/* Manual rotation remains available on iOS and embedded browsers. */}
    const orientation=screen.orientation as ScreenOrientation&{lock?:(mode:string)=>Promise<void>};
    try{await orientation?.lock?.('landscape');}catch{this.set('#orientation-help','Gire o aparelho manualmente para jogar na horizontal.');}
  }
  setDirection(reverse:boolean):void{
    if(this.directionState===reverse)return;this.directionState=reverse;
    const button=this.get<HTMLButtonElement>('#reverse-button');button.classList.toggle('selected',reverse);button.setAttribute('aria-pressed',String(reverse));button.setAttribute('aria-label',reverse?'Engatar marcha à frente':'Engatar marcha à ré');this.set('#pedal-direction',reverse?'MARCHA À RÉ':'FRENTE');
  }
  setAudioState(enabled:boolean,radio:boolean):void{
    const state=`${enabled}/${radio}`;if(this.audioState===state)return;this.audioState=state;
    const sound=this.get('#sound-button'),station=this.get('#radio-button');sound.setAttribute('aria-pressed',String(enabled));sound.setAttribute('aria-label',enabled?'Desligar som':'Ligar som');sound.classList.toggle('muted',!enabled);sound.querySelector('span:last-child')!.textContent=enabled?'SOM':'MUDO';station.setAttribute('aria-pressed',String(radio));station.setAttribute('aria-label',radio?'Desligar rádio':'Ligar rádio');station.classList.toggle('selected',radio);
  }
  setMenu(open: boolean): void {
    this.hide('#main-menu', !open); this.hide('#hud', open); this.hide('#pause-screen', true);
    if (open) { this.mapOpen = false; this.hide('#map-screen', true); this.hide('#finish-screen', true); }
  }
  setPaused(paused: boolean): void {
    this.hide('#pause-screen', !paused);
    if (!paused) this.closeModal();
  }
  toggleMap(): void {
    this.mapOpen = !this.mapOpen;
    this.hide('#map-screen', !this.mapOpen);
    if (this.data && this.mapOpen) this.drawMap('#large-map', this.data, false);
  }
  toggleDebug(): void {
    this.debugOpen = !this.debugOpen; this.hide('#debug', !this.debugOpen);
  }

  private closeModal(): void { this.activeModal = ''; this.hide('#modal', true); }
  private openModal(kind: string): void {
    this.activeModal = kind;
    this.hide('#modal', false);
    const content = this.get('#modal-content');
    if (kind === 'controls') {
      content.innerHTML = `<div class="eyebrow">ASSUMA O VOLANTE</div><h2>Como dirigir</h2><p>Um caminhão pesado precisa de espaço. Antecipe a frenagem e mantenha distância do veículo à frente.</p><div class="controls-grid">${controls.map(([key, action]) => `<div><kbd>${key}</kbd><span>${action}</span></div>`).join('')}</div><div class="settings-note">Celular: use na horizontal, mantenha os pedais pressionados e dirija com o outro polegar. R alterna frente e ré após parar. CABINE coloca você no banco do motorista. SOM e RÁDIO controlam o áudio. Gamepad: gatilho direito acelera, esquerdo freia, analógico esquerdo dirige e Y alterna a ré. A troca de marchas é automática.</div>`;
    } else {
      const saved = localStorage.getItem('pampa-quality') ?? 'HIGH';
      content.innerHTML = `<div class="eyebrow">À SUA MANEIRA</div><h2>Configurações</h2><p>Ajuste o equilíbrio entre qualidade visual e fluidez.</p><label class="setting-label">QUALIDADE GRÁFICA</label><div class="quality-options">${['LOW', 'MEDIUM', 'HIGH', 'ULTRA'].map((level, i) => `<button data-quality="${level}" class="${saved === level ? 'selected' : ''}"><b>${['Baixa', 'Média', 'Alta', 'Ultra'][i]}</b><small>${['Mais desempenho', 'Equilibrada', 'Recomendada', 'Mais detalhes'][i]}</small></button>`).join('')}</div><div class="settings-note">As configurações e o progresso da viagem são salvos neste navegador.<br>Para telemetria, testes de clima e acesso rápido a pontos da rota, pressione <kbd>F3</kbd>.</div><div class="controls-summary"><span>Direção assistida para teclado</span><b>ATIVA</b></div><div class="controls-summary"><span>Transmissão automatizada</span><b>12 MARCHAS</b></div>`;
      content.querySelectorAll<HTMLButtonElement>('[data-quality]').forEach(button => button.addEventListener('click', () => {
        const level = button.dataset.quality!; localStorage.setItem('pampa-quality', level); this.callbacks.quality(level);
        content.querySelectorAll('[data-quality]').forEach(el => el.classList.remove('selected')); button.classList.add('selected');
      }));
    }
  }

  update(data: HUDData): void {
    this.data = data;
    this.set('#speed', Math.round(Math.abs(data.speed) * 3.6).toString());
    this.set('#rpm', `${Math.round(data.rpm)} RPM`);
    this.set('#gear', data.gear < 0 ? 'R' : data.gear.toString());
    this.set('#fuel', `${Math.round(data.fuel)}%`);
    this.set('#condition', `${Math.round(100 - data.damage)}%`);
    this.set('#grade', `${data.grade >= 0 ? '+' : ''}${(data.grade * 100).toFixed(1)}% inclinação`);
    this.set('#score', `${Math.round(data.score).toLocaleString('pt-BR')} pontos`);
    this.set('#remaining', this.km(data.remaining));
    const hour = ((data.hour % 24) + 24) % 24;
    this.set('#clock', `${Math.floor(hour).toString().padStart(2, '0')}:${Math.floor((hour % 1) * 60).toString().padStart(2, '0')}`);
    this.set('#weather', WEATHER[data.weather] ?? data.weather);
    this.set('#camera-name', data.camera.toUpperCase());
    this.get('#cabin-button').classList.toggle('selected',data.camera.toUpperCase()==='CABINE');
    this.get('#rpm-fill').style.width = `${Math.min(100, data.rpm / 2300 * 100)}%`;
    this.get('#fuel-fill').style.width = `${data.fuel}%`;
    this.get('#progress-bar').style.width = `${Math.max(0, Math.min(1, data.progress)) * 100}%`;
    this.get('#speed').classList.toggle('too-fast', data.speed * 3.6 > 80);
    this.hide('#notification', !data.message);
    this.set('#notification-text', data.message);
    this.set('#route-length', this.km(data.remaining / Math.max(0.001, 1 - data.progress)));
    if (this.frame++ % 6 === 0) {
      this.drawMap('#mini-map', data, true);
      if (!this.get('#main-menu').classList.contains('hidden')) this.drawMap('#menu-route', data, false, true);
      if (this.mapOpen) { this.drawMap('#large-map', data, false); this.set('#map-distance', `${this.km(data.remaining)} até o destino`); }
      if (this.debugOpen) this.set('#debug-values', [
        `FPS         ${data.fps.toFixed(0)}`,
        `Posição     ${data.player.x.toFixed(1)} / ${data.player.z.toFixed(1)} m`,
        `Lat / Lon   ${data.lat.toFixed(6)} / ${data.lon.toFixed(6)}`,
        `Altitude    ${data.altitude.toFixed(1)} m`,
        `Inclinação  ${(data.grade * 100).toFixed(2)} %`,
        `Velocidade  ${(data.speed * 3.6).toFixed(1)} km/h`,
        `Aceleração  ${data.acceleration.toFixed(3)} m/s²`,
        `Motor       ${data.rpm.toFixed(0)} RPM / ${data.gear}ª marcha`,
        `Força roda  ${data.forces.drive.toFixed(0)} N`,
        `Drag        ${data.forces.drag.toFixed(0)} N`,
        `Rolamento   ${data.forces.rolling.toFixed(0)} N`,
        `Rampa       ${data.forces.grade.toFixed(0)} N`,
        `Aderência   μ ${data.friction.toFixed(2)}`,
        `Chunk       ${data.chunk}`,
        `Veículos    ${data.vehicles}`,
      ].join('\n'));
    }
  }

  private drawMap(selector: string, data: HUDData, local: boolean, decorative = false): void {
    const canvas = this.get<HTMLCanvasElement>(selector);
    const ctx = canvas.getContext('2d'); if (!ctx || data.route.length < 2) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const point of data.route) { minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x); minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z); }
    if (local) { minX = data.player.x - 950; maxX = data.player.x + 950; minZ = data.player.z - 560; maxZ = data.player.z + 560; }
    const padding = local ? 8 : Math.min(w, h) * 0.15;
    const scale = Math.min((w - 2 * padding) / Math.max(1, maxX - minX), (h - 2 * padding) / Math.max(1, maxZ - minZ));
    const ox = (w - (maxX - minX) * scale) / 2, oz = (h - (maxZ - minZ) * scale) / 2;
    const px = (x: number) => ox + (x - minX) * scale;
    const py = (z: number) => oz + (z - minZ) * scale;
    // Map coordinates follow the game's projected north/south axes, without inventing side roads.
    ctx.strokeStyle = 'rgba(177,193,162,.06)'; ctx.lineWidth = 1;
    for (let x = 20; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 20; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const path = () => { ctx.beginPath(); data.route.forEach((point, i) => i === 0 ? ctx.moveTo(px(point.x), py(point.z)) : ctx.lineTo(px(point.x), py(point.z))); };
    path(); ctx.lineWidth = local ? 17 : 9; ctx.strokeStyle = 'rgba(193,205,169,.09)'; ctx.stroke();
    path(); ctx.lineWidth = local ? 4 : 2.5; ctx.strokeStyle = decorative ? '#b5bc92' : '#d7b97d'; ctx.stroke();
    if (!local) {
      for (const [i, point] of [data.route[0], data.route[data.route.length - 1]].entries()) {
        ctx.beginPath(); ctx.arc(px(point.x), py(point.z), decorative ? 5 : 7, 0, Math.PI * 2); ctx.fillStyle = i === 0 ? '#d7b97d' : '#e5e4d3'; ctx.fill();
        ctx.beginPath(); ctx.arc(px(point.x), py(point.z), decorative ? 11 : 14, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(225,222,190,.25)'; ctx.lineWidth = 1; ctx.stroke();
      }
    }
    if (!decorative) {
      ctx.save(); ctx.translate(px(data.player.x), py(data.player.z)); ctx.rotate(Math.PI - data.heading);
      ctx.shadowColor = '#e6bb78'; ctx.shadowBlur = 15;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 4); ctx.lineTo(-7, 8); ctx.closePath(); ctx.fillStyle = '#ffcc85'; ctx.fill(); ctx.restore();
    }
    if (local) { ctx.fillStyle = '#a3b5a2'; ctx.font = '18px monospace'; ctx.fillText('N ↑', w - 55, 30); }
  }

  finish(stats: { distance: number; score: number; damage: number }): void {
    this.hide('#hud', true); this.hide('#pause-screen', true); this.hide('#finish-screen', false);
    this.get('#finish-stats').innerHTML = `<div><b>${this.km(stats.distance)}</b><span>PERCORRIDOS</span></div><div><b>${Math.round(stats.score).toLocaleString('pt-BR')}</b><span>PONTOS</span></div><div><b>${Math.round(100 - stats.damage)}%</b><span>CONDIÇÃO</span></div>`;
  }
}
