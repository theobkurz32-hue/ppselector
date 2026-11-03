export class Input {
  keys=new Set<string>();steer=0;private pressed=new Set<string>();
  constructor(){
    addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','F3'].includes(e.code))e.preventDefault();if(!e.repeat)this.pressed.add(e.code);this.keys.add(e.code);});
    addEventListener('keyup',e=>this.keys.delete(e.code));addEventListener('blur',()=>this.keys.clear());
    document.addEventListener('pointerdown',e=>{const control=(e.target as HTMLElement).closest<HTMLElement>('[data-control]')?.dataset.control;if(control){this.keys.add(({w:"KeyW",s:"KeyS",a:"KeyA",d:"KeyD",space:"Space"} as Record<string,string>)[control]??control);(e.target as HTMLElement).setPointerCapture(e.pointerId);}});
    for(const name of ['pointerup','pointercancel'])document.addEventListener(name,e=>{const control=(e.target as HTMLElement).closest<HTMLElement>('[data-control]')?.dataset.control;if(control)this.keys.delete(({w:"KeyW",s:"KeyS",a:"KeyA",d:"KeyD",space:"Space"} as Record<string,string>)[control]??control);});
  }
  take(key:string){const value=this.pressed.has(key);this.pressed.delete(key);return value;}
  read(dt:number){
    const gamepad=navigator.getGamepads?.().find(p=>p!==null);const axis=gamepad?.axes[0]??0;
    const target=Math.abs(axis)>.12?axis:(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0);
    this.steer+=(target-this.steer)*(1-Math.exp(-dt*5));
    return {steer:this.steer,throttle:Math.max(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0,gamepad?.buttons[7]?.value??0),brake:Math.max(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0,gamepad?.buttons[6]?.value??0),emergency:this.keys.has('Space'),engineBrake:this.keys.has('KeyB'),horn:this.keys.has('KeyH')};
  }
}
