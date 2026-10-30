/**
 * Procedural Web Audio API sound effects for Padel 3D Pro.
 * Zero external audio files or 404 dependencies.
 */
class PadelAudioController {
  private ctx: AudioContext | null = null;
  public enabled: boolean = true;

  private initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  /**
   * Sound of padel racket striking ball - crisp carbon pop & resonance
   */
  public playRacketHit(power: number = 0.7, shotType: string = 'flat', quality: string = 'GOOD') {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const isPerfect = quality === 'PERFECT';
    const isSmash = shotType === 'smash';

    // 1. Transient Pop Impulse (Sweetspot punch)
    const popOsc = this.ctx.createOscillator();
    const popGain = this.ctx.createGain();

    const startFreq = isPerfect ? 880 : (isSmash ? 620 : 440);
    const endFreq = isPerfect ? 180 : 120;
    popOsc.type = isPerfect ? 'sine' : 'triangle';
    popOsc.frequency.setValueAtTime(startFreq, t);
    popOsc.frequency.exponentialRampToValueAtTime(endFreq, t + (isPerfect ? 0.045 : 0.07));

    const popVol = (isPerfect ? 0.55 : 0.35) * power;
    popGain.gain.setValueAtTime(popVol, t);
    popGain.gain.exponentialRampToValueAtTime(0.001, t + (isPerfect ? 0.06 : 0.08));

    popOsc.connect(popGain);
    popGain.connect(this.ctx.destination);
    popOsc.start(t);
    popOsc.stop(t + 0.09);

    // 2. Carbon Body Thwack Resonance
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const baseFreq = isSmash ? 240 : (shotType === 'slice' ? 180 : 210);
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);

    gain.gain.setValueAtTime(0.35 * power, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(isSmash ? 920 : (isPerfect ? 820 : 680), t);
    filter.Q.setValueAtTime(isPerfect ? 5.5 : 3.5, t);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.15);

    // 3. Crisp perforation air snap
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.04);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseGain = this.ctx.createGain();
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime(isPerfect ? 2200 : 1400, t);

    noiseGain.gain.setValueAtTime((isPerfect ? 0.35 : 0.22) * power, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.ctx.destination);

    noise.start(t);
    noise.stop(t + 0.05);
  }

  /**
   * Ball bouncing on artificial turf
   */
  public playTurfBounce(velocity: number = 5) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const vol = Math.min(0.35, Math.max(0.08, velocity * 0.04));
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(50, t + 0.09);

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.11);
  }

  /**
   * Ball bouncing on tempered glass wall - crisp high-frequency rebound clack
   */
  public playGlassRebound(speed: number = 8) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(650, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.12);

    const vol = Math.min(0.4, Math.max(0.1, speed * 0.035));
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.14);
  }

  /**
   * Ball striking metal wire mesh fence - buzzing metallic rattle
   */
  public playMeshFenceRebound() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'square';
    osc1.frequency.setValueAtTime(320, t);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(480, t);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.19);
    osc2.stop(t + 0.19);
  }

  /**
   * Point won referee whistle & chime
   */
  public playPointWhistle() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, t);
    osc.frequency.linearRampToValueAtTime(2200, t + 0.1);
    osc.frequency.setValueAtTime(2100, t + 0.15);

    gain.gain.setValueAtTime(0.18, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.36);

    // Cheerful Nintendo-style 3-note point chime
    const notes = [659.25, 783.99, 1046.5]; // E5, G5, C6
    notes.forEach((freq, idx) => {
      const nt = t + 0.08 + idx * 0.09;
      const nOsc = this.ctx!.createOscillator();
      const nGain = this.ctx!.createGain();
      nOsc.type = 'triangle';
      nOsc.frequency.setValueAtTime(freq, nt);
      nGain.gain.setValueAtTime(0.16, nt);
      nGain.gain.exponentialRampToValueAtTime(0.001, nt + 0.28);
      nOsc.connect(nGain);
      nGain.connect(this.ctx!.destination);
      nOsc.start(nt);
      nOsc.stop(nt + 0.30);
    });
  }

  /**
   * Match victory cheer
   */
  public playVictoryCheer() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const chords = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C major celebratory fanfare
    chords.forEach((freq, idx) => {
      const t = this.ctx!.currentTime + idx * 0.12;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.22, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain);
      gain.connect(this.ctx!.destination);
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }
}

export const padelAudio = new PadelAudioController();
