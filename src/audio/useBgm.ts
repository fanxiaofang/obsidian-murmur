// src/audio/useBgm.ts

import { useEffect, useState } from 'react';
import type { BgmState } from './types';
import type { BgmManager } from './BgmManager';

export function useBgm(bgmManager: BgmManager | null): BgmState & {
  toggle: () => void;
  setVolume: (v: number) => void;
  setTrack: (id: string) => void;
  nextTrack: () => void;
  prevTrack: () => void;
} {
  const [state, setState] = useState<BgmState>(
    bgmManager?.getState() ?? { enabled: false, trackId: 'rain', volume: 0.3 }
  );

  useEffect(() => {
    if (!bgmManager) return;
    return bgmManager.subscribe(setState);
  }, [bgmManager]);

  return {
    ...state,
    toggle: () => bgmManager?.toggle(),
    setVolume: (v) => bgmManager?.setVolume(v),
    setTrack: (id) => bgmManager?.setTrack(id as any),
    nextTrack: () => bgmManager?.nextTrack(),
    prevTrack: () => bgmManager?.prevTrack(),
  };
}