// Simulated devices. Handy for trying the app before any real hardware is set up,
// and used by the tests.

const DEFAULTS = {
  light: { on: false, brightness: 80, color: '#ffd8a8' },
  speaker: { volume: 25, muted: false, playing: false },
  plug: { on: false },
};

const CAPS = {
  light: ['power', 'brightness', 'color'],
  speaker: ['volume', 'mute', 'playback'],
  plug: ['power'],
};

export default class MockDriver {
  constructor(config) {
    this.kind = config.kind || 'light';
    if (!DEFAULTS[this.kind]) throw new Error(`mock: unknown kind "${this.kind}"`);
    this.capabilities = CAPS[this.kind];
    this.state = { ...DEFAULTS[this.kind], ...(config.initialState || {}) };
    this.latencyMs = config.latencyMs ?? 30;
  }

  async connect() {}

  async getState() {
    return { ...this.state };
  }

  async setState(patch) {
    await new Promise((r) => setTimeout(r, this.latencyMs));
    Object.assign(this.state, patch);
    return { ...this.state };
  }
}
