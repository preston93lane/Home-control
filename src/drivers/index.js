import MockDriver from './mock.js';
import WizDriver from './wiz.js';
import GoveeDriver from './govee.js';
import SonosDriver from './sonos.js';
import BleLedDriver from './ble-led.js';

// To add a new brand: write a class with `capabilities`, `connect()`, `setState(patch)`
// and optionally `getState()`, then register it here.
export const drivers = {
  mock: MockDriver,
  wiz: WizDriver,
  govee: GoveeDriver,
  sonos: SonosDriver,
  'ble-led': BleLedDriver,
};

export function createDriver(config) {
  const Driver = drivers[config.driver];
  if (!Driver) throw new Error(`Unknown driver "${config.driver}". Available: ${Object.keys(drivers).join(', ')}`);
  return new Driver(config);
}
