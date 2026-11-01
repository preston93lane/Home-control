// Cheap Bluetooth LED strips/bulbs. Most of them speak one of two protocols:
//  - "elk-bledom": devices named ELK-BLEDOM / ELK-BLE / MELK, apps "duoCo Strip", "Lotus Lantern"
//  - "triones":    devices named Triones / LEDBlue / QHM-xxxx, apps "HappyLighting", "Magic Blue"
// If a strip doesn't respond, try the other protocol. Find the address with `npm run discover -- --ble`.
import { findPeripheral } from './ble.js';
import { hexToRgb, clamp } from '../color.js';

const PROTOCOLS = {
  'elk-bledom': {
    service: 'fff0',
    characteristic: 'fff3',
    power: (on) => (on ? [0x7e, 0x00, 0x04, 0xf0, 0x00, 0x01, 0xff, 0x00, 0xef] : [0x7e, 0x00, 0x04, 0x00, 0x00, 0x00, 0xff, 0x00, 0xef]),
    color: ({ r, g, b }) => [0x7e, 0x00, 0x05, 0x03, r, g, b, 0x00, 0xef],
    brightness: (pct) => [0x7e, 0x00, 0x01, pct, 0x00, 0x00, 0x00, 0x00, 0xef],
  },
  triones: {
    service: 'ffd5',
    characteristic: 'ffd9',
    power: (on) => (on ? [0xcc, 0x23, 0x33] : [0xcc, 0x24, 0x33]),
    color: ({ r, g, b }) => [0x56, r, g, b, 0x00, 0xf0, 0xaa],
    brightness: null, // no native brightness: emulated by scaling the color
  },
};

export default class BleLedDriver {
  constructor(config) {
    if (!config.address && !config.name) throw new Error('ble-led: "address" (or advertised "name") is required');
    this.config = config;
    this.proto = PROTOCOLS[config.protocol || 'elk-bledom'];
    if (!this.proto) throw new Error(`ble-led: unknown protocol "${config.protocol}" (use ${Object.keys(PROTOCOLS).join(' or ')})`);
    this.capabilities = ['power', 'brightness', 'color'];
    this.char = null;
    this.state = { on: false, brightness: 100, color: '#ffffff' }; // these strips can't report state
  }

  async connect() {
    if (this.char) return;
    this.connecting ??= (async () => {
      const p = await findPeripheral(this.config);
      await p.connectAsync();
      p.once('disconnect', () => {
        this.char = null;
      });
      const { characteristics } = await p.discoverSomeServicesAndCharacteristicsAsync([this.proto.service], [this.proto.characteristic]);
      if (!characteristics.length) throw new Error(`ble-led: characteristic ${this.proto.characteristic} not found - try the other protocol`);
      this.char = characteristics[0];
    })().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  async write(bytes) {
    await this.connect(); // reconnects automatically if the strip dropped
    await this.char.writeAsync(Buffer.from(bytes), true);
  }

  async getState() {
    return { ...this.state };
  }

  async setState(patch) {
    const next = { ...this.state, ...patch };
    if (patch.on !== undefined) await this.write(this.proto.power(next.on));
    if (patch.color !== undefined || (patch.brightness !== undefined && !this.proto.brightness)) {
      const rgb = hexToRgb(next.color);
      const scale = this.proto.brightness ? 1 : next.brightness / 100;
      await this.write(this.proto.color({ r: Math.round(rgb.r * scale), g: Math.round(rgb.g * scale), b: Math.round(rgb.b * scale) }));
    }
    if (patch.brightness !== undefined && this.proto.brightness)
      await this.write(this.proto.brightness(clamp(Math.round(next.brightness), 0, 100)));
    this.state = next;
    return { ...next };
  }
}
