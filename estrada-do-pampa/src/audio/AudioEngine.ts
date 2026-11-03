/** Original synthesized diesel, road, rain and pneumatic sounds. No downloads. */
export class AudioEngine {
  private ctx?:AudioContext;private engine?:OscillatorNode;private harmonic?:OscillatorNode;private gain?:GainNode;private wind?:GainNode;private hornNode?:OscillatorNode;private hornGain?:GainNode;private filter?:BiquadFilterNode;enabled=true;
  async start(){
    if(this.ctx){await this.ctx.resume();return;}this.ctx=new AudioContext();const ctx=this.ctx;
    const master=ctx.createGain();master.gain.value=.22;master.connect(ctx.destination);
    this.gain=ctx.createGain();this.gain.gain.value=.1;this.filter=ctx.createBiquadFilter();this.filter.type='lowpass';this.filter.frequency.value=350;this.gain.connect(this.filter);this.filter.connect(master);
    this.engine=ctx.createOscillator();this.engine.type='sawtooth';this.engine.connect(this.gain);this.engine.start();this.harmonic=ctx.createOscillator();this.harmonic.type='triangle';this.harmonic.connect(this.gain);this.harmonic.start();
    const buffer=ctx.createBuffer(1,ctx.sampleRate*2,ctx.sampleRate);const samples=buffer.getChannelData(0);for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
    const noise=ctx.createBufferSource();noise.buffer=buffer;noise.loop=true;this.wind=ctx.createGain();this.wind.gain.value=.01;const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=750;noise.connect(low);low.connect(this.wind);this.wind.connect(master);noise.start();
    this.hornNode=ctx.createOscillator();this.hornNode.type='sawtooth';this.hornNode.frequency.value=145;this.hornGain=ctx.createGain();this.hornGain.gain.value=0;this.hornNode.connect(this.hornGain);this.hornGain.connect(master);this.hornNode.start();
  }
  update(rpm:number,speed:number,throttle:number,wet:number,horn:boolean,paused:boolean){if(!this.ctx||!this.engine)return;const t=this.ctx.currentTime,active=!paused&&this.enabled;
    this.engine.frequency.setTargetAtTime(rpm/30,t,.08);this.harmonic!.frequency.setTargetAtTime(rpm/15,t,.09);this.gain!.gain.setTargetAtTime(active?.13+throttle*.12:0,t,.15);this.filter!.frequency.setTargetAtTime(250+throttle*450,t,.1);this.wind!.gain.setTargetAtTime(active?speed*.002+wet*.13:0,t,.3);this.hornGain!.gain.setTargetAtTime(active&&horn?.65:0,t,.03);
  }
  impact(){if(!this.ctx)return;const ctx=this.ctx,osc=ctx.createOscillator(),g=ctx.createGain();osc.type='triangle';osc.frequency.setValueAtTime(75,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(25,ctx.currentTime+.3);g.gain.setValueAtTime(.3,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.35);osc.connect(g);g.connect(ctx.destination);osc.start();osc.stop(ctx.currentTime+.4);}
}
