// Govee WiFi lights via the Govee LAN API (UDP port 4003).
// Turn on "LAN Control" for each device in the Govee Home app first.
// Find devices with `npm run discover`.
import { udpRequest } from './udp.js';
import { hexToRgb, clamp } from '../color.js';

const PORT = 4003;

export default class GoveeDriver {
  constructor(config) {
    if (!config.host) throw new Error('govee: "host" (device IP address) is required');
    this.host = config.host;
    this.capabilities = ['power', 'brightness', 'color'];
  }

  async connect() {}

  send(cmd, data) {
    // Govee LAN commands are fire-and-forget; status replies go to port 4002.
    return udpRequest({ host: this.host, port: PORT, message: { msg: { cmd, data } }, expectReply: false });
  }

  async setState(patch) {
    if (patch.on === false) return this.send('turn', { value: 0 }).then(() => patch);
    if (patch.on === true) await this.send('turn', { value: 1 });
    if (patch.brightness !== undefined)
      await this.send('brightness', { value: clamp(Math.round(patch.brightness), 1, 100) });
    if (patch.color !== undefined)
      await this.send('colorwc', { color: hexToRgb(patch.color), colorTemInKelvin: 0 });
    return patch;
  }
}
