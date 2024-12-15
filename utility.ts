import axios from 'axios';

export async function getImageData(url: string): Promise<string | null> {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const buffer = Buffer.from(response.data, 'binary').toString('base64');
        return `data:${response.headers['content-type']};base64,${buffer}`;
    } catch (error) {
        console.error('Error fetching image data:', error.message);
        return null;
    }
}
