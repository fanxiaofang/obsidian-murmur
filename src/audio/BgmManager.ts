import type { BgmTrackId, BgmSettings, BgmState } from './types';
import { BGM_TRACKS, BGM_FILENAME_MAP } from './types';

type Listener = (state: BgmState) => void;

export class BgmManager {
  private audio: HTMLAudioElement | null = null;
  private state: BgmState;
  private listeners = new Set<Listener>();
  private fadeRaf: number | null = null;
  private resolveResource: (path: string) => string;
  private showNotice: (msg: string) => void;

  constructor(resolveResource: (path: string) => string, settings: BgmSettings, showNotice: (msg: string) => void) {
    this.resolveResource = resolveResource;
    this.showNotice = showNotice;
    this.state = {
      enabled: settings.enabled,
      trackId: settings.defaultTrack,
      volume: settings.defaultVolume,
    };
  }

  getState(): BgmState {
    return { ...this.state };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    const s = this.getState();
    this.listeners.forEach(fn => fn(s));
  }

  private getAudioUrl(trackId: BgmTrackId): string {
    return this.resolveResource(`audio/${BGM_FILENAME_MAP[trackId]}`);
  }

  private ensureAudio(): HTMLAudioElement {
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.loop = true;
      this.audio.volume = 0;
    }
    return this.audio;
  }

  toggle(): void {
    if (this.state.enabled) {
      this.pause();
    } else {
      this.play();
    }
  }

  play(): void {
    const audio = this.ensureAudio();
    const url = this.getAudioUrl(this.state.trackId);
    
    if (audio.src !== url) {
      audio.src = url;
      audio.load();
    }
    
    // Set volume directly for now to ensure it's not a fade issue
    audio.volume = this.state.volume;
    this.state.enabled = true;
    this.notify();

    audio.play().then(() => {
    }).catch((err) => {
      console.warn('[Murmur BGM] Play failed:', err);
      if (err.name === 'NotAllowedError') {
        this.showNotice('点击界面任意处激活音频');
      } else {
        this.showNotice(`播放失败: ${err.message}`);
      }
      this.state.enabled = false;
      this.notify();
    });
  }

  pause(): void {
    this.state.enabled = false;
    this.notify();
    if (!this.audio) return;
    this.fadeTo(0, 300).then(() => {
      this.audio?.pause();
    });
  }

  setVolume(vol: number): void {
    this.state.volume = Math.max(0, Math.min(1, vol));
    if (this.audio) {
      this.audio.volume = this.state.volume;
    }
    this.notify();
  }

  setTrack(trackId: BgmTrackId): void {
    if (trackId === this.state.trackId) return;
    const wasPlaying = this.state.enabled;
    this.state.trackId = trackId;
    this.notify();

    if (wasPlaying && this.audio) {
      this.audio.src = this.getAudioUrl(trackId);
      this.audio.load();
      this.audio.volume = this.state.volume;
      this.audio.play().catch(() => {});
    }
  }

  nextTrack(): void {
    const idx = BGM_TRACKS.findIndex(t => t.id === this.state.trackId);
    const next = BGM_TRACKS[(idx + 1) % BGM_TRACKS.length];
    this.setTrack(next.id);
  }

  prevTrack(): void {
    const idx = BGM_TRACKS.findIndex(t => t.id === this.state.trackId);
    const prev = BGM_TRACKS[(idx - 1 + BGM_TRACKS.length) % BGM_TRACKS.length];
    this.setTrack(prev.id);
  }

  private fadeTo(target: number, durationMs: number): Promise<void> {
    return new Promise(resolve => {
      if (!this.audio) return resolve();
      if (this.fadeRaf) cancelAnimationFrame(this.fadeRaf);

      const startVol = this.audio.volume;
      const start = performance.now();

      const step = () => {
        const elapsed = performance.now() - start;
        const progress = Math.min(elapsed / durationMs, 1);
        const eased = progress * (2 - progress);
        this.audio!.volume = startVol + (target - startVol) * eased;

        if (progress < 1) {
          this.fadeRaf = requestAnimationFrame(step);
        } else {
          this.fadeRaf = null;
          resolve();
        }
      };

      this.fadeRaf = requestAnimationFrame(step);
    });
  }

  destroy(): void {
    if (this.fadeRaf) cancelAnimationFrame(this.fadeRaf);
    if (this.audio) {
      this.audio.pause();
      this.audio.src = '';
      this.audio.load();
      this.audio = null;
    }
    this.listeners.clear();
    this.state.enabled = false;
  }
}