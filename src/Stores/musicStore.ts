import { SongData } from '@deskthing/types'
import { DeskThing } from '@deskthing/client';
import { Playlist, SpotifyAudioAnalysis, AudioFeaturesResponse } from '../types/spotify';

type MusicListener = (data: SongData | Playlist[] | SpotifyAudioAnalysis | AudioFeaturesResponse | null) => void;
type ListenerType = 'music' | 'playlists' | 'analysis' | 'features';

class MusicStore {
  private static instance: MusicStore;
  private deskThing: DeskThing;
  private listeners: Record<ListenerType, MusicListener[]> = {
    music: [],
    playlists: [],
    analysis: [],
    features: [],
  };
  private currentSong: SongData | null = null;
  private playlists: Playlist[] = [];
  private analysisData: SpotifyAudioAnalysis | null = null;
  private featuresData: AudioFeaturesResponse | null = null;

  private constructor() {
    this.deskThing = DeskThing.getInstance();
    // Initialize data fetch
    this.fetchInitialData();
  }

  static getInstance(): MusicStore {
    if (!MusicStore.instance) {
      MusicStore.instance = new MusicStore();
    }
    return MusicStore.instance;
  }

  private fetchInitialData() {
    // Fetch initial song, analysis, playlists, etc.
    this.deskThing.sendMessageToParent({ app: 'client', type: 'get', request: 'music' });
    this.deskThing.sendMessageToParent({ type: 'get', request: 'analysis' });
    this.deskThing.sendMessageToParent({ type: 'get', request: 'playlists' });
    this.deskThing.sendMessageToParent({ type: 'get', request: 'features' });
  }

  on(type: ListenerType, listener: MusicListener): () => void {
    this.listeners[type].push(listener);

    // Call the listener immediately with existing data if available
    switch (type) {
      case 'music':
        if (this.currentSong) listener(this.currentSong);
        break;
      case 'playlists':
        if (this.playlists.length) listener(this.playlists);
        break;
      case 'analysis':
        if (this.analysisData) listener(this.analysisData);
        break;
      case 'features':
        if (this.featuresData) listener(this.featuresData);
        break;
    }

    return () => {
      this.off(type, listener);
    };
  }

  off(type: ListenerType, listener: MusicListener) {
    this.listeners[type] = this.listeners[type].filter((l) => l !== listener);
  }

  setPlay(state: boolean) {
    if (this.currentSong) {
      this.currentSong.is_playing = state;
      this.notifyListeners('music');
    }
  }

  private notifyListeners(type: ListenerType) {
    this.listeners[type].forEach((listener) => {
      switch (type) {
        case 'music':
          listener(this.currentSong);
          break;
        case 'playlists':
          listener(this.playlists);
          break;
        case 'analysis':
          listener(this.analysisData);
          break;
        case 'features':
          listener(this.featuresData);
          break;
      }
    });
  }

  getSong(): SongData | null {
    return this.currentSong;
  }

  getPlaylists(): Playlist[] {
    return this.playlists;
  }
}

export default MusicStore.getInstance();
