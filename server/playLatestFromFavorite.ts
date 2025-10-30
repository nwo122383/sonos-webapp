// server/playLatestFromFavorite.ts

import { DeskThing } from "./initializer";
import sonos from "./sonos";

/**
 * Direct SOAP to play a hardcoded SiriusXM episode URI.
 * Replace the URI and TITLE below as needed for your show/episode.
 */
export async function playLatestFromFavorite(payload: any): Promise<void> {
  // Replace this URI with your latest episode for the show
  const URI = "x-sonosapi-hls-static:episode-audio%3ac7e06d6f-a640-4714-4e7c-3077e8d402b8?sid=37&flags=57384&sn=16";
  const TITLE = "Different Shades of Blue (Latest Episode)";

  const speakerIP: string = payload?.speakerIP || "192.168.5.240"; // Or derive from payload

  // Find CDUDN from device
  async function getCdudn() {
    try {
      const resp = await sonos.rawSoapRequest(
        speakerIP,
        "AVTransport",
        "GetMediaInfo",
        "<InstanceID>0</InstanceID>"
      );
      const match = resp.match(/<CurrentURIMetaData>(.*?)<\/CurrentURIMetaData>/);
      if (!match) return "";
      const raw = match[1];
      const cdudn = /<desc[^>]*id=['"]cdudn['"][^>]*>(.*?)<\/desc>/.exec(raw);
      return cdudn ? cdudn[1] : "";
    } catch {
      return "";
    }
  }

  const cdudn = await getCdudn();
  const desc = cdudn
    ? `<desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">${cdudn}</desc>`
    : "";

  const didl = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/"
   xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/"
   xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/"
   xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/">
   <item id="0" parentID="0" restricted="true">
    <dc:title>${TITLE}</dc:title>
    <upnp:class>object.item.audioItem</upnp:class>
    ${desc}
   </item>
  </DIDL-Lite>`;

  const AVT = "urn:schemas-upnp-org:service:AVTransport:1";

  // Set URI
  const setAVT = `
    <InstanceID>0</InstanceID>
    <CurrentURI>${URI}</CurrentURI>
    <CurrentURIMetaData>${didl.replace(/"/g, "&quot;")}</CurrentURIMetaData>
  `;
  await sonos.rawSoapRequest(
    speakerIP,
    "AVTransport",
    "SetAVTransportURI",
    setAVT
  );

  // Play
  const playBody = "<InstanceID>0</InstanceID><Speed>1</Speed>";
  await sonos.rawSoapRequest(
    speakerIP,
    "AVTransport",
    "Play",
    playBody
  );

  DeskThing.send({
    app: "sonos-webapp",
    type: "toast",
    payload: { message: "Issued SetAVTransportURI + Play for: " + TITLE }
  });
}
