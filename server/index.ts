import SonosHandler from './sonos';
import { DeskThing as DK, IncomingData } from 'deskthing-server';
const DeskThing = DK.getInstance();
export { DeskThing };

let sonos; SonosHandler;

const start = async () => {
  sonos = new SonosHandler();
  DeskThing.sendDataToClient('get', 'data')

  DeskThing.on('get', handleGet);
  DeskThing.on('set', handleSet);
  DeskThing.on('data', (data: any) => {
    if (data.Sonos_IP) {
      sonos.deviceIP = data.Sonos_IP;
      sonos.getTrackInfo();
      sonos.getFavorites();
    } else {
      promptForIP();
    }
  });

  // Fetch initial data
  const data = await DeskThing.getData();
  if (data.Sonos_IP) {
    sonos.deviceIP = data.Sonos_IP;
    sonos.getTrackInfo();
    sonos.getFavorites();
  } else {
    promptForIP();
  }
};

const promptForIP = () => {
  DeskThing.getUserInput({
    Sonos_IP: {
      value: '',
      label: 'Sonos Device IP',
      instructions: 'Please enter the IP address of your Sonos device.',
    },
  }, (data) => {
    if (data.payload.Sonos_IP) {
      DeskThing.saveData({ Sonos_IP: data.payload.Sonos_IP });
      sonos.deviceIP = data.payload.Sonos_IP;
      sonos.getTrackInfo();
      sonos.getFavorites();
    } else {
      DeskThing.sendError('No IP address provided!');
    }
  });
};

const handleGet = async (data: any) => {
  switch (data.request) {
    case 'song':
    await sonos.getTrackInfo();
    break;
    case 'refresh':
      await sonos.checkForRefresh()
      break;
  case 'favorites':
    await sonos.getFavorites();
    break;
    default:
      DeskThing.sendError(`Unknown request: ${data.request}`);
      break;
      DeskThing.on('set', (data) => {data.request == 'volume' && sonos.setCurrentVolume(data.payload)})
  }
  };

  const handleSet = async (data: any) => {
    switch (data.request) {
    case 'next':
      await sonos.next();
      break;
    case 'previous':
      await sonos.previous();
      break;
    case 'play':
      await sonos.play();
      break;
    case 'pause':
      await sonos.pause();
      break;     
    case 'playFavorite':
          if (data.payload && data.payload.uri) {
            console.log('Playing favorite with URI:', data.payload.uri);  // Log the URI
              await sonos.playFavorite(data.payload.uri);
          } else {
              DeskThing.sendError('No URI provided for playFavorite');
          }
          break;
    case 'volumeChange':  // This handles when the volume is changed by the user
          const newVolume = data.payload.volume;
          await sonos.setVolume(newVolume);  // Assuming you have a `setVolume` function
          console.log('Set volume to:', newVolume);
          window.postMessage({
              type: 'volumeChange',
              payload: { volume: newVolume }
          }, '*');
          break;

      case 'volume':  // This handles getting the current volume when the app starts
          const currentVolume = await sonos.getCurrentVolume();  // Assuming you have a `getCurrentVolume` function
          console.log('Fetched current volume:', currentVolume);
          window.postMessage({
              type: 'currentVolume',
              payload: { volume: currentVolume }
          }, '*');
          break;
    default:
      DeskThing.sendError(`Unknown action: ${data.request}`);
      break;
  }

  DeskThing.sendDataToClient('data', response);
  DeskThing.sendLog(response);
  window.addEventListener('message', (event) => {
    if (event.data.type === 'favorites') {
        const favoritesContainer = document.getElementById('favorites');
        favoritesContainer.innerHTML = ''; // Clear existing favorites
        event.data.data.forEach(favorite => {
            const favoriteElement = document.createElement('div');
            favoriteElement.className = 'favorite-item';
            favoriteElement.innerHTML = `
                <img src="${favorite.albumArtURI || 'default-image.jpg'}" alt="Album Art">
                <p>${favorite.title}</p>
            `;
            // Other event handling code
            favoritesContainer.appendChild(favoriteElement);
        });
    }
});

};

DeskThing.on('start', start);
