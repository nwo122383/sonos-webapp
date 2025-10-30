// server/persist.ts
import fs from 'fs/promises';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'server', 'data');
const FILE = path.join(DATA_DIR, 'settings.json');

export type PersistedSettings = {
  volumeSpeakerUUIDs?: string[];
};

export async function loadSettings(): Promise<PersistedSettings> {
  try {
    const raw = await fs.readFile(FILE, 'utf8');
    return JSON.parse(raw) as PersistedSettings;
  } catch {
    return {};
  }
}

export async function saveSettings(next: PersistedSettings): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(next, null, 2), 'utf8');
}
