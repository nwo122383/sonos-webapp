import assert from 'node:assert/strict';
import xml2js from 'xml2js';

async function parseDIDL(xml: string, deviceIP: string = '192.0.2.1', port = 1400) {
  const metadataParser = new xml2js.Parser({ explicitArray: true, ignoreAttrs: false });
  const metaResult = await metadataParser.parseStringPromise(xml);
  const rootAttrs = metaResult['DIDL-Lite'].$ || {};
  const containers: any[] = metaResult['DIDL-Lite']['container'] || [];
  const items: any[] = metaResult['DIDL-Lite']['item'] || [];
  const allItems = [...containers, ...items].filter(Boolean);
  const builder = new xml2js.Builder({ headless: true });

  return Promise.all(
    allItems.map(async (child: any) => {
      const title = child['dc:title'] || 'Unknown Title';
      const childRes = child['res'];
      const resEntry = Array.isArray(childRes) ? childRes[0] : childRes;
      const uri = typeof resEntry === 'object' ? resEntry._ : resEntry || null;
      const albumArtVal = Array.isArray(child['upnp:albumArtURI']) ? child['upnp:albumArtURI'][0] : child['upnp:albumArtURI'];
      const albumArtURI = albumArtVal || null;
      const upnpClass = child['upnp:class'] || '';
      const isContainer =
        upnpClass.includes('object.container') || (!uri && Boolean(child?.$?.id));
      const meta = builder.buildObject({ 'DIDL-Lite': { $: rootAttrs, [isContainer ? 'container' : 'item']: child } });
      const idAttr = child?.$?.id || '';
      let formattedAlbumArtURI = albumArtURI;
      if (albumArtURI && !albumArtURI.startsWith('http://') && !albumArtURI.startsWith('https://')) {
        formattedAlbumArtURI = `http://${deviceIP}:${port}${albumArtURI}`;
      }
      return {
        title,
        uri,
        albumArt: formattedAlbumArtURI || null,
        metaData: meta,
        isContainer,
        id: idAttr,
      };
    })
  );
}

(async () => {
  const single = `<?xml version="1.0"?>\n<DIDL-Lite xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\">\n<item id=\"1\">\n<dc:title>Test</dc:title>\n<res protocolInfo=\"http-get:*:audio/mpeg:*\">http://example.com/song.mp3</res>\n<upnp:albumArtURI>/img/art.jpg</upnp:albumArtURI>\n<upnp:class>object.item.audioItem.musicTrack</upnp:class>\n</item>\n</DIDL-Lite>`;

  const resSingle = await parseDIDL(single);
  assert.equal(resSingle[0].uri, 'http://example.com/song.mp3');
  assert.equal(resSingle[0].albumArt, 'http://192.0.2.1:1400/img/art.jpg');

  const multi = `<?xml version="1.0"?>\n<DIDL-Lite xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\">\n<item id=\"2\">\n<dc:title>Test2</dc:title>\n<res protocolInfo=\"http-get:*:audio/mpeg:*\">http://example.com/song1.mp3</res>\n<res protocolInfo=\"http-get:*:audio/mpeg:*\">http://example.com/song2.mp3</res>\n<upnp:albumArtURI>/img/art1.jpg</upnp:albumArtURI>\n<upnp:albumArtURI>/img/art2.jpg</upnp:albumArtURI>\n<upnp:class>object.item.audioItem.musicTrack</upnp:class>\n</item>\n</DIDL-Lite>`;

  const resMulti = await parseDIDL(multi);
  assert.equal(resMulti[0].uri, 'http://example.com/song1.mp3');
  assert.equal(resMulti[0].albumArt, 'http://192.0.2.1:1400/img/art1.jpg');

  console.log('All tests passed');
})();
