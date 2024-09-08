import SonosHandler from './sonos';

class SonosService {
  static instance: SonosService;
  handler: SonosHandler;

  constructor() {
    this.handler = new SonosHandler();
  }

  static getInstance(): SonosService {
    if (!SonosService.instance) {
      SonosService.instance = new SonosService();
    }
    return SonosService.instance;
  }

  setDeviceIP(ip: string) {
    this.handler.setDeviceIP(ip);
  }

  async getTrackInfo() {
    return this.handler.getTrackInfo();
  }

  async getFavorites() {
    return this.handler.getFavorites();
  }

  async play() {
    return this.handler.play();
  }

  async pause() {
    return this.handler.pause();
  }

  async next() {
    return this.handler.next();
  }

  async previous() {
    return this.handler.previous();
  }
}

export default SonosService;
