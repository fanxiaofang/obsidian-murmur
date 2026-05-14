export type BgmTrackId = 'nature';

export interface BgmTrack {
  id: BgmTrackId;
  label: string;
}

export interface BgmSettings {
  enabled: boolean;
  defaultTrack: BgmTrackId;
  defaultVolume: number;
}

export interface BgmState {
  enabled: boolean;
  trackId: BgmTrackId;
  volume: number;
}

export const BGM_TRACKS: BgmTrack[] = [
  { id: 'nature', label: '夏日雨后' },
];

export const DEFAULT_BGM_SETTINGS: BgmSettings = {
  enabled: false,
  defaultTrack: 'nature',
  defaultVolume: 0.3,
};