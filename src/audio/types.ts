export type BgmTrackId = 'bird' | 'goWest' | 'rain';

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
  { id: 'bird', label: '鸟鸣' },
  { id: 'goWest', label: '山河' },
  { id: 'rain', label: '雨声' },
];

export const BGM_FILENAME_MAP: Record<BgmTrackId, string> = {
  bird: 'bird_min.mp3',
  goWest: 'goWest_min.mp3',
  rain: 'rain_min.mp3',
};

export const DEFAULT_BGM_SETTINGS: BgmSettings = {
  enabled: false,
  defaultTrack: 'rain',
  defaultVolume: 0.3,
};