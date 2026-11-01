// Sonos speakers (and other UPnP renderers on port 1400) over the local network.
import { clamp } from '../color.js';

const RC = { path: '/MediaRenderer/RenderingControl/Control', ns: 'urn:schemas-upnp-org:service:RenderingControl:1' };
const AV = { path: '/MediaRenderer/AVTransport/Control', ns: 'urn:schemas-upnp-org:service:AVTransport:1' };

export default class SonosDriver {
  constructor(config) {
    if (!config.host) throw new Error('sonos: "host" (speaker IP address) is required');
    this.base = `http://${config.host}:${config.port || 1400}`;
    this.capabilities = ['volume', 'mute', 'playback'];
  }

  async connect() {
    await this.getState();
  }

  async soap(service, action, args) {
    const body =
      `<?xml version="1.0" encoding="utf-8"?>` +
      `<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">` +
      `<s:Body><u:${action} xmlns:u="${service.ns}">` +
      Object.entries(args).map(([k, v]) => `<${k}>${v}</${k}>`).join('') +
      `</u:${action}></s:Body></s:Envelope>`;
    const res = await fetch(this.base + service.path, {
      method: 'POST',
      headers: { 'Content-Type': 'text/xml; charset="utf-8"', SOAPACTION: `"${service.ns}#${action}"` },
      body,
      signal: AbortSignal.timeout(3000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`sonos ${action} failed (HTTP ${res.status})`);
    return text;
  }

  async getState() {
    const vol = await this.soap(RC, 'GetVolume', { InstanceID: 0, Channel: 'Master' });
    const mute = await this.soap(RC, 'GetMute', { InstanceID: 0, Channel: 'Master' });
    const info = await this.soap(AV, 'GetTransportInfo', { InstanceID: 0 });
    return {
      volume: Number(/<CurrentVolume>(\d+)</.exec(vol)?.[1] ?? 0),
      muted: /<CurrentMute>1</.test(mute),
      playing: /<CurrentTransportState>PLAYING</.test(info),
    };
  }

  async setState(patch) {
    if (patch.volume !== undefined)
      await this.soap(RC, 'SetVolume', { InstanceID: 0, Channel: 'Master', DesiredVolume: clamp(Math.round(patch.volume), 0, 100) });
    if (patch.muted !== undefined)
      await this.soap(RC, 'SetMute', { InstanceID: 0, Channel: 'Master', DesiredMute: patch.muted ? 1 : 0 });
    if (patch.playing === true) await this.soap(AV, 'Play', { InstanceID: 0, Speed: 1 });
    if (patch.playing === false) await this.soap(AV, 'Pause', { InstanceID: 0 });
    return patch;
  }
}
