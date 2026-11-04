/**
 * Procedural Web Audio API sound engine for Padel Pals.
 * Zero external audio files or 404 dependencies.
 * Full 3D spatial audio (PannerNode), crowd procedural synthesis,
 * referee whistle, dynamic rally murmur, and browser autoplay unlock.
 */

import { Vector3D } from './types';

export class PadelAudioController {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private crowdMurmurGain: GainNode | null = null;
  private murmurSource: AudioNode | null = null;

  public enabled: boolean = true;
  public sfxVolume: number = 0.85;
  public musicVolume: number = 0.55;

  private isMusicPlaying: boolean = false;
  private musicInterval: any = null;
  private musicStep: number = 0;
  private isUnlocked: boolean = false;

  constructor() {
    this.setupAutoplayUnlock();
  }

  /**
   * Browser autoplay policy compliance: unlock context on first interaction
   */
  private setupAutoplayUnlock() {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      this.initCtx();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().then(() => {
          this.isUnlocked = true;
        }).catch(() => {});
      } else if (this.ctx && this.ctx.state === 'running') {
        this.isUnlocked = true;
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };

    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
  }

  public initCtx() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();

        // Main SFX bus
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
        this.sfxGain.connect(this.ctx.destination);

        // Music bus
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
        this.musicGain.connect(this.ctx.destination);

        // Continuous crowd murmur bus
        this.initCrowdMurmur();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public setSfxVolume(val: number) {
    this.sfxVolume = Math.max(0, Math.min(1, val));
    if (this.sfxGain && this.ctx) {
      this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);
    }
  }

  public setMusicVolume(val: number) {
    this.musicVolume = Math.max(0, Math.min(1, val));
    if (this.musicGain && this.ctx) {
      this.musicGain.gain.setValueAtTime(this.musicVolume, this.ctx.currentTime);
    }
  }

  private getSfxDestination(): AudioNode {
    return this.sfxGain || (this.ctx ? this.ctx.destination : (null as any));
  }

  /**
   * Spatial Audio: Keep AudioListener aligned with 3D camera
   */
  public updateListener(cameraPos: Vector3D, cameraForward: Vector3D, cameraUp?: Vector3D) {
    if (!this.ctx || !this.enabled) return;
    const listener = this.ctx.listener;
    const up = cameraUp || { x: 0, y: 1, z: 0 };

    if (listener.positionX) {
      listener.positionX.setValueAtTime(cameraPos.x, this.ctx.currentTime);
      listener.positionY.setValueAtTime(cameraPos.y, this.ctx.currentTime);
      listener.positionZ.setValueAtTime(cameraPos.z, this.ctx.currentTime);
      listener.forwardX.setValueAtTime(cameraForward.x, this.ctx.currentTime);
      listener.forwardY.setValueAtTime(cameraForward.y, this.ctx.currentTime);
      listener.forwardZ.setValueAtTime(cameraForward.z, this.ctx.currentTime);
      listener.upX.setValueAtTime(up.x, this.ctx.currentTime);
      listener.upY.setValueAtTime(up.y, this.ctx.currentTime);
      listener.upZ.setValueAtTime(up.z, this.ctx.currentTime);
    } else if ((listener as any).setPosition) {
      // Legacy WebAudio fallback
      (listener as any).setPosition(cameraPos.x, cameraPos.y, cameraPos.z);
      (listener as any).setOrientation(
        cameraForward.x,
        cameraForward.y,
        cameraForward.z,
        up.x,
        up.y,
        up.z
      );
    }
  }

  /**
   * Helper: Create 3D Spatial PannerNode
   */
  private createPanner(pos?: Vector3D): AudioNode {
    if (!this.ctx) return this.getSfxDestination();
    if (!pos || !this.ctx.createPanner) {
      return this.getSfxDestination();
    }

    try {
      const panner = this.ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 4.0;
      panner.maxDistance = 50.0;
      panner.rolloffFactor = 1.0;
      panner.coneInnerAngle = 360;

      if (panner.positionX) {
        panner.positionX.setValueAtTime(pos.x, this.ctx.currentTime);
        panner.positionY.setValueAtTime(pos.y, this.ctx.currentTime);
        panner.positionZ.setValueAtTime(pos.z, this.ctx.currentTime);
      } else if ((panner as any).setPosition) {
        (panner as any).setPosition(pos.x, pos.y, pos.z);
      }

      panner.connect(this.getSfxDestination());
      return panner;
    } catch {
      return this.getSfxDestination();
    }
  }

  // ==========================================
  // PROCEDURAL CROWD AUDIO
  // ==========================================

  /**
   * Continuous background arena murmur (ambient voices)
   */
  private initCrowdMurmur() {
    if (!this.ctx || this.murmurSource) return;

    try {
      // Generate 2 seconds of pink-ish noise buffer
      const bufferSize = this.ctx.sampleRate * 2;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + white * 0.0555179;
        b1 = 0.99332 * b1 + white * 0.0750759;
        b2 = 0.96900 * b2 + white * 0.1538520;
        data[i] = (b0 + b1 + b2) * 0.15;
      }

      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = buffer;
      noiseSource.loop = true;

      // Vocal formant resonant filters simulating distant crowd murmur
      const f1 = this.ctx.createBiquadFilter();
      f1.type = 'bandpass';
      f1.frequency.setValueAtTime(340, this.ctx.currentTime);
      f1.Q.setValueAtTime(2.2, this.ctx.currentTime);

      const f2 = this.ctx.createBiquadFilter();
      f2.type = 'bandpass';
      f2.frequency.setValueAtTime(820, this.ctx.currentTime);
      f2.Q.setValueAtTime(2.8, this.ctx.currentTime);

      this.crowdMurmurGain = this.ctx.createGain();
      this.crowdMurmurGain.gain.setValueAtTime(0.04, this.ctx.currentTime);

      noiseSource.connect(f1);
      f1.connect(this.crowdMurmurGain);

      noiseSource.connect(f2);
      f2.connect(this.crowdMurmurGain);

      this.crowdMurmurGain.connect(this.getSfxDestination());
      noiseSource.start();
      this.murmurSource = noiseSource;
    } catch {
      // Ignore background audio errors
    }
  }

  /**
   * Dynamically swell crowd murmur as rally progresses
   */
  public updateRallyTension(rallyCount: number, inPlay: boolean) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx || !this.crowdMurmurGain) return;

    const t = this.ctx.currentTime;
    let targetGain = 0.03;

    if (inPlay) {
      if (rallyCount >= 10) {
        targetGain = 0.32; // Electric crowd tension
      } else if (rallyCount >= 6) {
        targetGain = 0.22;
      } else if (rallyCount >= 3) {
        targetGain = 0.12;
      } else {
        targetGain = 0.06;
      }
    }

    this.crowdMurmurGain.gain.setTargetAtTime(targetGain * this.sfxVolume, t, 0.4);
  }

  public stopAllCrowdAudio() {
    if (this.crowdMurmurGain && this.ctx) {
      this.crowdMurmurGain.gain.setValueAtTime(0.02, this.ctx.currentTime);
    }
  }

  /**
   * Crowd Cheer + Clap on every won point
   */
  public playCrowdCheer(intensity: number = 1.0) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const dest = this.getSfxDestination();

    // 1. Vocal Cheer Swell ("YEAAAH!")
    const cheerDuration = 2.4 * Math.min(1.5, intensity);
    const cheerBuffer = this.ctx.createBuffer(
      1,
      Math.floor(this.ctx.sampleRate * cheerDuration),
      this.ctx.sampleRate
    );
    const data = cheerBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.4;
    }

    const cheerSrc = this.ctx.createBufferSource();
    cheerSrc.buffer = cheerBuffer;

    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(620, t);
    f1.frequency.exponentialRampToValueAtTime(780, t + 0.6);
    f1.Q.setValueAtTime(3.5, t);

    const f2 = this.ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(1400, t);
    f2.frequency.exponentialRampToValueAtTime(1900, t + 0.8);
    f2.Q.setValueAtTime(4.0, t);

    const cheerGain = this.ctx.createGain();
    const maxGain = Math.min(0.45, 0.28 * intensity);
    cheerGain.gain.setValueAtTime(0.01, t);
    cheerGain.gain.linearRampToValueAtTime(maxGain, t + 0.25);
    cheerGain.gain.exponentialRampToValueAtTime(0.001, t + cheerDuration);

    cheerSrc.connect(f1);
    f1.connect(cheerGain);
    cheerSrc.connect(f2);
    f2.connect(cheerGain);
    cheerGain.connect(dest);

    cheerSrc.start(t);
    cheerSrc.stop(t + cheerDuration);

    // 2. Multi-person clapping cluster
    this.playApplauseBurst(cheerDuration, intensity);
  }

  /**
   * Procedural applause / clapping simulation
   */
  private playApplauseBurst(duration: number, intensity: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const dest = this.getSfxDestination();

    const clapCount = Math.floor(18 * intensity);
    for (let i = 0; i < clapCount; i++) {
      const offset = 0.15 + (i / clapCount) * (duration - 0.4) + (Math.random() - 0.5) * 0.12;
      const clapTime = t + Math.max(0.05, offset);

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(800 + Math.random() * 800, clapTime);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1600 + Math.random() * 600, clapTime);
      filter.Q.setValueAtTime(3.0, clapTime);

      const vol = 0.08 + Math.random() * 0.12;
      gain.gain.setValueAtTime(vol * intensity, clapTime);
      gain.gain.exponentialRampToValueAtTime(0.001, clapTime + 0.04);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);

      osc.start(clapTime);
      osc.stop(clapTime + 0.05);
    }
  }

  /**
   * Big Roar on Smash Winners or 10+ hit rallies
   */
  public playBigRoar() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const dest = this.getSfxDestination();

    // Deep sub-rumble punch
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(95, t);
    subOsc.frequency.exponentialRampToValueAtTime(45, t + 0.5);

    subGain.gain.setValueAtTime(0.42, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.7);

    subOsc.connect(subGain);
    subGain.connect(dest);
    subOsc.start(t);
    subOsc.stop(t + 0.75);

    // Roaring cheer swell
    this.playCrowdCheer(1.6);
  }

  /**
   * "Ooooh" crowd gasp on near misses (net cord, top of wall)
   */
  public playCrowdOoooh() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const dest = this.getSfxDestination();

    const duration = 1.6;
    const buffer = this.ctx.createBuffer(
      1,
      Math.floor(this.ctx.sampleRate * duration),
      this.ctx.sampleRate
    );
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.35;
    }

    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    // Vocal "Ooooh" formant sweep down
    const f1 = this.ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.setValueAtTime(540, t);
    f1.frequency.exponentialRampToValueAtTime(360, t + 0.8);
    f1.Q.setValueAtTime(4.2, t);

    const f2 = this.ctx.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.setValueAtTime(1050, t);
    f2.frequency.exponentialRampToValueAtTime(800, t + 0.9);
    f2.Q.setValueAtTime(5.0, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.32, t + 0.18);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    src.connect(f1);
    f1.connect(gain);
    src.connect(f2);
    f2.connect(gain);
    gain.connect(dest);

    src.start(t);
    src.stop(t + duration);
  }

  /**
   * Boo / Groan on double faults & unforced errors
   */
  public playCrowdGroan() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const dest = this.getSfxDestination();

    const duration = 1.4;
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(180, t);
    osc1.frequency.exponentialRampToValueAtTime(110, t + 0.9);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(184, t); // slight dissonance
    osc2.frequency.exponentialRampToValueAtTime(108, t + 0.9);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(220, t + 0.8);

    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.24, t + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + duration);
    osc2.stop(t + duration);
  }

  /**
   * Stadium Stomp / Chant at Game Point (THUMP - THUMP - CLAP!)
   */
  public playGamePointChant() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const dest = this.getSfxDestination();

    const playStomp = (time: number) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(80, time);
      osc.frequency.exponentialRampToValueAtTime(35, time + 0.18);

      gain.gain.setValueAtTime(0.35, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.22);

      osc.connect(gain);
      gain.connect(dest);
      osc.start(time);
      osc.stop(time + 0.24);
    };

    const playStadiumClap = (time: number) => {
      if (!this.ctx) return;
      const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * 0.1), this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

      const src = this.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400, time);
      filter.Q.setValueAtTime(2.5, time);

      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.28, time);
      gain.gain.exponentialRampToValueAtTime(0.001, time + 0.09);

      src.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      src.start(time);
      src.stop(time + 0.1);
    };

    // Rhythm: Stomp (0.0s), Stomp (0.35s), Clap (0.70s)
    playStomp(t + 0.05);
    playStomp(t + 0.38);
    playStadiumClap(t + 0.72);
  }

  /**
   * Referee Whistle (dual high-frequency oscillators with authentic acoustic beat flutter)
   */
  public playRefereeWhistle(type: 'start' | 'end' = 'end') {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const dest = this.getSfxDestination();

    const triggerTweet = (startTime: number, duration: number) => {
      if (!this.ctx) return;
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      // Realistic whistle twin resonant frequencies
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(2820, startTime);
      osc1.frequency.linearRampToValueAtTime(2950, startTime + duration * 0.5);

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(3060, startTime);
      osc2.frequency.linearRampToValueAtTime(3180, startTime + duration * 0.5);

      gain.gain.setValueAtTime(0.01, startTime);
      gain.gain.linearRampToValueAtTime(0.22, startTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(dest);

      osc1.start(startTime);
      osc2.start(startTime);
      osc1.stop(startTime + duration + 0.02);
      osc2.stop(startTime + duration + 0.02);
    };

    if (type === 'start') {
      // Single crisp tweet for serve / point start
      triggerTweet(t + 0.02, 0.22);
    } else {
      // Double tweet for point end
      triggerTweet(t + 0.02, 0.14);
      triggerTweet(t + 0.22, 0.28);
    }
  }

  // ==========================================
  // PROCEDURAL BALL & COURT SFX (SPATIALIZED)
  // ==========================================

  /**
   * Racket striking ball - pitch depends on shot power, spatialized in 3D
   */
  public playRacketHit(
    power: number = 0.7,
    shotType: string = 'flat',
    quality: string = 'GOOD',
    position?: Vector3D
  ) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const panner = this.createPanner(position);
    const isPerfect = quality === 'PERFECT';
    const isSmash = shotType === 'smash';

    // Pitch scales with shot power
    const pitchMultiplier = 0.85 + power * 0.45;

    // 1. Sweetspot transient pop
    const popOsc = this.ctx.createOscillator();
    const popGain = this.ctx.createGain();

    const baseStart = isPerfect ? 880 : (isSmash ? 640 : 440);
    const startFreq = baseStart * pitchMultiplier;
    const endFreq = (isPerfect ? 200 : 120) * pitchMultiplier;

    popOsc.type = isPerfect ? 'sine' : 'triangle';
    popOsc.frequency.setValueAtTime(startFreq, t);
    popOsc.frequency.exponentialRampToValueAtTime(endFreq, t + (isPerfect ? 0.045 : 0.07));

    const popVol = (isPerfect ? 0.55 : 0.38) * power;
    popGain.gain.setValueAtTime(popVol, t);
    popGain.gain.exponentialRampToValueAtTime(0.001, t + (isPerfect ? 0.06 : 0.08));

    popOsc.connect(popGain);
    popGain.connect(panner);
    popOsc.start(t);
    popOsc.stop(t + 0.09);

    // 2. Carbon racket head resonance
    const resOsc = this.ctx.createOscillator();
    const resGain = this.ctx.createGain();
    const resFilter = this.ctx.createBiquadFilter();

    const baseResFreq = (isSmash ? 240 : (shotType === 'slice' ? 180 : 210)) * pitchMultiplier;
    resOsc.type = 'triangle';
    resOsc.frequency.setValueAtTime(baseResFreq, t);
    resOsc.frequency.exponentialRampToValueAtTime(45, t + 0.12);

    resGain.gain.setValueAtTime(0.35 * power, t);
    resGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    resFilter.type = 'bandpass';
    resFilter.frequency.setValueAtTime(
      (isSmash ? 940 : (isPerfect ? 840 : 700)) * pitchMultiplier,
      t
    );
    resFilter.Q.setValueAtTime(isPerfect ? 5.5 : 3.5, t);

    resOsc.connect(resFilter);
    resFilter.connect(resGain);
    resGain.connect(panner);

    resOsc.start(t);
    resOsc.stop(t + 0.15);

    // 3. Crisp perforation holes air snap
    const bufferSize = Math.floor(this.ctx.sampleRate * 0.04);
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.setValueAtTime((isPerfect ? 2400 : 1600) * pitchMultiplier, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime((isPerfect ? 0.35 : 0.22) * power, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(panner);

    noise.start(t);
    noise.stop(t + 0.05);
  }

  /**
   * Turf bounce - soft synthetic padel turf thud, spatialized in 3D
   */
  public playTurfBounce(velocity: number = 5, position?: Vector3D) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const panner = this.createPanner(position);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    const vol = Math.min(0.38, Math.max(0.08, velocity * 0.04));
    osc.type = 'sine';
    osc.frequency.setValueAtTime(145, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.09);

    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc.connect(gain);
    gain.connect(panner);

    osc.start(t);
    osc.stop(t + 0.11);
  }

  /**
   * Glass wall rebound - crisp tempered glass thud & rebound clack, spatialized
   */
  public playGlassRebound(speed: number = 8, position?: Vector3D) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const panner = this.createPanner(position);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(680, t);
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.12);

    const vol = Math.min(0.42, Math.max(0.12, speed * 0.04));
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

    osc.connect(gain);
    gain.connect(panner);

    osc.start(t);
    osc.stop(t + 0.14);
  }

  /**
   * Metal mesh fence rebound - buzzing metallic rattle, spatialized
   */
  public playMeshFenceRebound(position?: Vector3D) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const panner = this.createPanner(position);

    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'square';
    osc1.frequency.setValueAtTime(320, t);
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(490, t);

    gain.gain.setValueAtTime(0.20, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(panner);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.19);
    osc2.stop(t + 0.19);
  }

  /**
   * Net hit / tape deflection sound, spatialized
   */
  public playNetHit(position?: Vector3D) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const panner = this.createPanner(position);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, t);
    osc.frequency.exponentialRampToValueAtTime(65, t + 0.12);

    gain.gain.setValueAtTime(0.32, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

    osc.connect(gain);
    gain.connect(panner);

    osc.start(t);
    osc.stop(t + 0.14);
  }

  /**
   * Footstep sound (sneaker turf squeak / athletic pivot scuff)
   */
  public playFootstep(surface: 'turf' | 'court' = 'turf', position?: Vector3D) {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const panner = this.createPanner(position);

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const startF = surface === 'turf' ? 320 : 680;
    osc.frequency.setValueAtTime(startF, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.05);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(gain);
    gain.connect(panner);

    osc.start(t);
    osc.stop(t + 0.07);
  }

  // ==========================================
  // UI & MENU MUSIC
  // ==========================================

  public playHoverTick() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.025);

    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.03);

    osc.connect(gain);
    gain.connect(this.getSfxDestination());
    osc.start(t);
    osc.stop(t + 0.035);
  }

  public playClickPop() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(540, t);
    osc.frequency.exponentialRampToValueAtTime(180, t + 0.07);

    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

    osc.connect(gain);
    gain.connect(this.getSfxDestination());
    osc.start(t);
    osc.stop(t + 0.09);
  }

  public playBackWhoosh() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(360, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.12);

    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    osc.connect(gain);
    gain.connect(this.getSfxDestination());
    osc.start(t);
    osc.stop(t + 0.15);
  }

  public startMenuMusic() {
    if (!this.enabled || this.isMusicPlaying) return;
    this.initCtx();
    if (!this.ctx) return;

    this.isMusicPlaying = true;
    this.musicStep = 0;

    const bassNotes = [
      130.81, 130.81, 130.81, 130.81,
      110.0, 110.0, 110.0, 110.0,
      87.31, 87.31, 87.31, 87.31,
      98.0, 98.0, 98.0, 98.0,
    ];
    const leadNotes = [
      523.25, 659.25, 783.99, 1046.5,
      440.0, 523.25, 659.25, 880.0,
      349.23, 440.0, 523.25, 698.46,
      392.0, 493.88, 587.33, 783.99,
    ];

    const playBeat = () => {
      if (!this.isMusicPlaying || !this.ctx || !this.musicGain) return;
      const t = this.ctx.currentTime;
      const step = this.musicStep % 16;
      this.musicStep++;

      if (step % 2 === 0) {
        const bOsc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();
        bOsc.type = 'triangle';
        bOsc.frequency.setValueAtTime(bassNotes[step], t);
        bGain.gain.setValueAtTime(0.18, t);
        bGain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        bOsc.connect(bGain);
        bGain.connect(this.musicGain);
        bOsc.start(t);
        bOsc.stop(t + 0.25);
      }

      if (step % 2 === 1 && Math.random() > 0.3) {
        const mOsc = this.ctx.createOscillator();
        const mGain = this.ctx.createGain();
        mOsc.type = 'sine';
        mOsc.frequency.setValueAtTime(leadNotes[step], t);
        mGain.gain.setValueAtTime(0.12, t);
        mGain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
        mOsc.connect(mGain);
        mGain.connect(this.musicGain);
        mOsc.start(t);
        mOsc.stop(t + 0.18);
      }
    };

    this.musicInterval = setInterval(playBeat, 140);
  }

  public stopMenuMusic() {
    this.isMusicPlaying = false;
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }

  public playPointWhistle() {
    this.playRefereeWhistle('end');
  }

  public playVictoryCheer() {
    if (!this.enabled) return;
    this.initCtx();
    if (!this.ctx) return;

    this.playBigRoar();

    const chords = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    chords.forEach((freq, idx) => {
      const t = this.ctx!.currentTime + idx * 0.12;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.24, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain);
      gain.connect(this.getSfxDestination());
      osc.start(t);
      osc.stop(t + 0.58);
    });
  }
}

export const padelAudio = new PadelAudioController();
