const TOUCH_KEYS:Record<string,string>={w:'KeyW',s:'KeyS',a:'KeyA',d:'KeyD',space:'Space',h:'KeyH'};
interface TouchPress {key:string;element:HTMLElement}

/** Keyboard and independently captured touch pointers can be held together. */
export class Input {
  readonly keys=new Set<string>();
  steer=0;
  reverse=false;
  private readonly keyboardKeys=new Set<string>();
  private readonly pressed=new Set<string>();
  private readonly pointers=new Map<number,TouchPress>();
  private gamepadReverse=false;

  constructor(){
    addEventListener('keydown',event=>{
      if((event.target as HTMLElement)?.matches('input,textarea,select'))return;
      if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','F3','KeyR'].includes(event.code))event.preventDefault();
      if(!event.repeat){this.pressed.add(event.code);if(event.code==='KeyR')this.setReverse(!this.reverse);}
      this.keyboardKeys.add(event.code);this.syncKeys();
    });
    addEventListener('keyup',event=>{this.keyboardKeys.delete(event.code);this.syncKeys();});
    addEventListener('blur',()=>this.releaseAll());
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.releaseAll();});
    document.addEventListener('pampa-action',event=>{if((event as CustomEvent<string>).detail==='reverse')this.setReverse(!this.reverse);});
    document.addEventListener('pointerdown',event=>{
      const element=(event.target as HTMLElement).closest<HTMLElement>('[data-control]');
      if(!element)return;
      event.preventDefault();
      const key=TOUCH_KEYS[element.dataset.control!]??element.dataset.control!;
      this.pointers.set(event.pointerId,{key,element});element.classList.add('is-held');
      try{element.setPointerCapture(event.pointerId);}catch{/* Some embedded browsers do not expose pointer capture. */}
      this.syncKeys();
    },{passive:false});
    for(const name of ['pointerup','pointercancel','lostpointercapture'])document.addEventListener(name,event=>this.releasePointer((event as PointerEvent).pointerId));
  }

  setReverse(reverse:boolean){
    this.reverse=reverse;
    document.dispatchEvent(new CustomEvent('pampa-direction',{detail:reverse}));
  }
  private syncKeys(){this.keys.clear();for(const key of this.keyboardKeys)this.keys.add(key);for(const press of this.pointers.values())this.keys.add(press.key);}
  private releasePointer(id:number){
    const press=this.pointers.get(id);if(!press)return;
    this.pointers.delete(id);
    if(![...this.pointers.values()].some(other=>other.element===press.element))press.element.classList.remove('is-held');
    this.syncKeys();
  }
  private releaseAll(){this.keyboardKeys.clear();for(const press of this.pointers.values())press.element.classList.remove('is-held');this.pointers.clear();this.pressed.clear();this.steer=0;this.syncKeys();}
  take(key:string){const value=this.pressed.has(key);this.pressed.delete(key);return value;}
  read(dt:number){
    const gamepad=navigator.getGamepads?.().find(p=>p!==null),axis=gamepad?.axes[0]??0;
    const reverseButton=gamepad?.buttons[3]?.pressed??false;
    if(reverseButton&&!this.gamepadReverse)this.setReverse(!this.reverse);this.gamepadReverse=reverseButton;
    const target=Math.abs(axis)>.12?axis:(this.keys.has('KeyD')||this.keys.has('ArrowRight')?1:0)-(this.keys.has('KeyA')||this.keys.has('ArrowLeft')?1:0);
    this.steer+=(target-this.steer)*(1-Math.exp(-dt*5));
    return {steer:this.steer,throttle:Math.max(this.keys.has('KeyW')||this.keys.has('ArrowUp')?1:0,gamepad?.buttons[7]?.value??0),brake:Math.max(this.keys.has('KeyS')||this.keys.has('ArrowDown')?1:0,gamepad?.buttons[6]?.value??0),emergency:this.keys.has('Space'),engineBrake:this.keys.has('KeyB'),horn:this.keys.has('KeyH'),reverse:this.reverse};
  }
}
