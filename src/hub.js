import { EventEmitter } from 'node:events';
import { createDriver } from './drivers/index.js';
import { hexToRgb, clamp } from './color.js';

// Which state fields each capability allows.
const FIELDS = {
  power: { on: 'boolean' },
  brightness: { brightness: 'percent' },
  color: { color: 'color' },
  volume: { volume: 'percent' },
  mute: { muted: 'boolean' },
  playback: { playing: 'boolean' },
};

export class Device {
  constructor(config, hub) {
    this.id = config.id;
    this.name = config.name || config.id;
    this.room = config.room || 'Other';
    this.type = config.type || 'light';
    this.driverName = config.driver;
    this.hub = hub;
    this.driver = createDriver(config);
    this.state = {};
    this.online = false;
    this.error = null;
    this.pending = null; // latest patch waiting to be sent
    this.running = null;
  }

  get capabilities() {
    return this.driver.capabilities;
  }

  validate(patch) {
    const clean = {};
    for (const [key, value] of Object.entries(patch || {})) {
      const cap = Object.keys(FIELDS).find((c) => key in FIELDS[c]);
      if (!cap || !this.capabilities.includes(cap)) throw new Error(`${this.name} does not support "${key}"`);
      const kind = FIELDS[cap][key];
      if (kind === 'boolean') clean[key] = Boolean(value);
      else if (kind === 'percent') {
        const n = Number(value);
        if (!Number.isFinite(n)) throw new Error(`"${key}" must be a number 0-100`);
        clean[key] = clamp(n, 0, 100);
      } else if (kind === 'color') {
        hexToRgb(value); // throws if invalid
        clean[key] = String(value).toLowerCase().replace(/^#?/, '#');
      }
    }
    return clean;
  }

  async init() {
    try {
      await this.driver.connect();
      if (this.driver.getState) this.state = { ...this.state, ...(await this.driver.getState()) };
      this.setOnline(true);
    } catch (err) {
      this.setOnline(false, err);
    }
  }

  setOnline(online, err = null) {
    this.online = online;
    this.error = err ? err.message : null;
    if (err) this.hub.log(`[${this.id}] ${err.message}`);
    this.hub.emit('device', this.toJSON());
  }

  // Rapid changes (e.g. dragging a slider) are coalesced: only the latest value is sent
  // once the device finishes the previous command. Bluetooth devices especially need this.
  setState(patch) {
    const clean = this.validate(patch);
    this.pending = { ...this.pending, ...clean };
    this.running ??= this.flush().finally(() => {
      this.running = null;
    });
    return this.running;
  }

  async flush() {
    while (this.pending) {
      const patch = this.pending;
      this.pending = null;
      try {
        const result = await this.driver.setState(patch);
        this.state = { ...this.state, ...patch, ...(result || {}) };
        this.setOnline(true);
      } catch (err) {
        this.setOnline(false, err);
        throw err;
      }
    }
    return this.state;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      room: this.room,
      type: this.type,
      driver: this.driverName,
      capabilities: this.capabilities,
      state: this.state,
      online: this.online,
      error: this.error,
    };
  }
}

export class Hub extends EventEmitter {
  constructor({ log = console.log } = {}) {
    super();
    this.log = log;
    this.devices = new Map();
  }

  async load(deviceConfigs) {
    for (const cfg of deviceConfigs) {
      if (!cfg.id || !cfg.driver) throw new Error(`Every device needs an "id" and "driver": ${JSON.stringify(cfg)}`);
      if (this.devices.has(cfg.id)) throw new Error(`Duplicate device id "${cfg.id}"`);
      this.devices.set(cfg.id, new Device(cfg, this));
    }
    await Promise.all([...this.devices.values()].map((d) => d.init()));
  }

  get(id) {
    const d = this.devices.get(id);
    if (!d) throw Object.assign(new Error(`No device "${id}"`), { status: 404 });
    return d;
  }

  list() {
    return [...this.devices.values()].map((d) => d.toJSON());
  }

  async setState(id, patch) {
    return this.get(id).setState(patch);
  }

  // Run many device changes at once; one failing device doesn't stop the others.
  async apply(actions) {
    const results = await Promise.allSettled(actions.map((a) => this.setState(a.deviceId, a.state)));
    return actions.map((a, i) => ({
      deviceId: a.deviceId,
      ok: results[i].status === 'fulfilled',
      error: results[i].status === 'rejected' ? results[i].reason.message : undefined,
    }));
  }

  // Snapshot current settings of the given devices (used for "save as scene").
  snapshot(deviceIds) {
    return deviceIds.map((id) => {
      const d = this.get(id);
      const state = { ...d.state };
      // When a light is off, its color/brightness don't matter - just record "off".
      if (state.on === false) return { deviceId: id, state: { on: false } };
      return { deviceId: id, state: d.validate(state) };
    });
  }
}
