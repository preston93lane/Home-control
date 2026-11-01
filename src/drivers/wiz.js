// Philips WiZ (and other WiZ-based) WiFi bulbs. Local UDP API on port 38899,
// no cloud account needed. Find bulbs with `npm run discover`.
import { udpRequest } from './udp.js';
import { hexToRgb, rgbToHex, clamp } from '../color.js';

const PORT = 38899;

export default class WizDriver {
  constructor(config) {
    if (!config.host) throw new Error('wiz: "host" (bulb IP address) is required');
    this.host = config.host;
    this.capabilities = ['power', 'brightness', 'color'];
  }

  async connect() {
    await this.getState();
  }

  async call(method, params) {
    const reply = await udpRequest({ host: this.host, port: PORT, message: { method, params } });
    if (reply?.error) throw new Error(`wiz ${this.host}: ${reply.error.message || JSON.stringify(reply.error)}`);
    return reply?.result;
  }

  async getState() {
    const p = await this.call('getPilot', {});
    const state = { on: !!p.state };
    if (p.dimming != null) state.brightness = p.dimming;
    if (p.r != null) state.color = rgbToHex({ r: p.r, g: p.g, b: p.b });
    return state;
  }

  async setState(patch) {
    const params = {};
    if (patch.on !== undefined) params.state = !!patch.on;
    // WiZ accepts dimming 10-100.
    if (patch.brightness !== undefined) params.dimming = clamp(Math.round(patch.brightness), 10, 100);
    if (patch.color !== undefined) Object.assign(params, hexToRgb(patch.color));
    if (Object.keys(params).length) await this.call('setPilot', params);
    return patch;
  }
}
