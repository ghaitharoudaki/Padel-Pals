/**
 * Render-resolution management for phones, tablets and desktops.
 *
 * Phones often report a device pixel ratio of 3, which means rendering 9x the pixels of a
 * 1x screen. We start mobile devices at a lower ratio and then adapt from the measured frame
 * rate: drop resolution when the game struggles, raise it again when there is headroom.
 */

export interface DeviceProfile {
  isMobile: boolean;
  isTouch: boolean;
  devicePixelRatio: number;
}

export function detectDeviceProfile(): DeviceProfile {
  if (typeof window === 'undefined') return { isMobile: false, isTouch: false, devicePixelRatio: 1 };
  const nav = window.navigator;
  const ua = nav.userAgent || '';
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: coarse)').matches;
  const touchPoints = nav.maxTouchPoints || 0;
  // iPadOS reports itself as a Mac with touch support.
  const isIPadOS = /Macintosh/.test(ua) && touchPoints > 1;
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua);
  const isTouch = coarse || touchPoints > 0;
  return {
    isMobile: isMobileUa || isIPadOS || (coarse && touchPoints > 0),
    isTouch,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

export interface QualityOptions {
  /** Highest pixel ratio we will ever render at. */
  maxPixelRatio: number;
  /** Lowest pixel ratio adaptive scaling may drop to. */
  minPixelRatio: number;
  /** Ratio to start at. */
  initialPixelRatio: number;
}

export function getQualityOptions(profile: DeviceProfile, isSoftwareGl: boolean): QualityOptions {
  const dpr = Math.max(1, profile.devicePixelRatio);
  if (isSoftwareGl) return { maxPixelRatio: 1, minPixelRatio: 0.75, initialPixelRatio: 1 };
  if (profile.isMobile) {
    const max = Math.min(dpr, 2);
    return { maxPixelRatio: max, minPixelRatio: 0.85, initialPixelRatio: Math.min(dpr, 1.5) };
  }
  const max = Math.min(dpr, 2);
  return { maxPixelRatio: max, minPixelRatio: 1, initialPixelRatio: max };
}

/**
 * Tracks frame times and recommends a new pixel ratio when sustained performance changes.
 * Returns the new ratio from `sample()` only when it should change, otherwise null.
 */
export class AdaptiveResolution {
  public pixelRatio: number;
  private frames = 0;
  private elapsed = 0;
  private goodWindows = 0;
  private cooldown = 0;

  constructor(private readonly options: QualityOptions) {
    this.pixelRatio = options.initialPixelRatio;
  }

  /** Feed one rendered frame's duration (seconds). */
  public sample(dt: number): number | null {
    if (!(dt > 0) || dt > 1) return null; // ignore tab switches / hitches
    this.frames++;
    this.elapsed += dt;
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.elapsed < 2) return null;

    const fps = this.frames / this.elapsed;
    this.frames = 0;
    this.elapsed = 0;
    if (this.cooldown > 0) return null;

    const { minPixelRatio, maxPixelRatio } = this.options;
    if (fps < 42 && this.pixelRatio > minPixelRatio) {
      this.goodWindows = 0;
      this.cooldown = 3;
      this.pixelRatio = Math.max(minPixelRatio, round(this.pixelRatio - 0.25));
      return this.pixelRatio;
    }
    if (fps > 57) {
      this.goodWindows++;
      if (this.goodWindows >= 4 && this.pixelRatio < maxPixelRatio) {
        this.goodWindows = 0;
        this.cooldown = 4;
        this.pixelRatio = Math.min(maxPixelRatio, round(this.pixelRatio + 0.25));
        return this.pixelRatio;
      }
    } else {
      this.goodWindows = 0;
    }
    return null;
  }
}

function round(v: number) {
  return Math.round(v * 100) / 100;
}
