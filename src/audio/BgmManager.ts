import type { BgmSettings, BgmState } from './types';
import { AudioEngine } from './AudioEngine';

type Listener = (state: BgmState) => void;

export class BgmManager {
  private engine: AudioEngine;
  private state: BgmState;
  private listeners = new Set<Listener>();
  private showNotice: (msg: string) => void;

  constructor(settings: BgmSettings, showNotice: (msg: string) => void) {
    this.showNotice = showNotice;
    this.state = {
      enabled: settings.enabled,
      trackId: 'nature',
      volume: settings.defaultVolume,
    };
    this.engine = new AudioEngine();
    this.engine.setVolume(this.state.volume);
    this.engine.subscribe((running) => {
      this.state.enabled = running;
      this.notify();
    });
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

  toggle(): void {
    if (this.state.enabled) {
      this.pause();
    } else {
      this.play();
    }
  }

  play(): void {
    this.state.enabled = true;
    this.notify();

    this.engine.start().catch((err) => {
      console.warn('[Murmur BGM] Play failed:', err);
      if (err.name === 'NotAllowedError') {
        this.showNotice('点击界面任意处激活音频');
      } else {
        this.showNotice(`播放失败: ${err.message || err}`);
      }
      this.state.enabled = false;
      this.notify();
    });
  }

  pause(): void {
    this.engine.stop();
  }

  setVolume(vol: number): void {
    this.state.volume = Math.max(0, Math.min(1, vol));
    this.engine.setVolume(this.state.volume);
    this.notify();
  }

  destroy(): void {
    this.engine.destroy();
    this.listeners.clear();
    this.state.enabled = false;
  }
}