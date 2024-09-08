import axios from 'axios';

// Function to fetch image data from a URL and convert it to base64
export async function getImageData(imageUrl: string): Promise<string | null> {
    try {
        const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
        const base64 = Buffer.from(response.data, 'binary').toString('base64');
        const mimeType = response.headers['content-type'];
        return `data:${mimeType};base64,${base64}`;
    } catch (error) {
        console.error('Error fetching image:', error.message);
        return null;
    }
}
