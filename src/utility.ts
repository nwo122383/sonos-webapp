import axios from 'axios';

export async function getImageData(url: string): Promise<string | null> {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data, 'binary').toString('base64');
    return `data:${response.headers['content-type']};base64,${buffer}`;
  } catch (error: any) {
    console.error('Error fetching image data:', error.message);
    return null;
  }
}

export function getSonosIp(): string | null {
  const settings = (window as any).settings;
  if (settings?.sonos_ip) return settings.sonos_ip;

  const localIp = localStorage.getItem("sonos_ip");
  if (localIp) return localIp;

  console.error("Sonos IP not found.");
  return null;
}

export function extractIPAddress(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return null;
  }
}
