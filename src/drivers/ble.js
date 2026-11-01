// Shared Bluetooth Low Energy access via @abandonware/noble.
// Noble is an optional dependency: the hub runs fine without it if you have no BLE devices.

let noblePromise;

export async function getNoble() {
  noblePromise ??= (async () => {
    let noble;
    try {
      noble = (await import('@abandonware/noble')).default;
    } catch (err) {
      throw new Error(
        'Bluetooth support is not installed. Run `npm install @abandonware/noble` on the hub ' +
          '(on Raspberry Pi/Linux you may first need: sudo apt install bluetooth bluez libbluetooth-dev libudev-dev). ' +
          `Cause: ${err.message}`
      );
    }
    if (noble.state !== 'poweredOn') {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(`Bluetooth adapter not ready (state: ${noble.state})`)), 10000);
        noble.on('stateChange', (s) => {
          if (s === 'poweredOn') {
            clearTimeout(t);
            resolve();
          }
        });
      });
    }
    return noble;
  })();
  return noblePromise;
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^0-9a-f]/g, '');

// Find a peripheral by MAC address (Linux/Windows) or noble id (macOS), or by advertised name.
export async function findPeripheral({ address, name, timeoutMs = 15000 }) {
  const noble = await getNoble();
  const want = norm(address);
  return new Promise((resolve, reject) => {
    const onDiscover = (p) => {
      const hit =
        (want && (norm(p.address) === want || norm(p.id) === want)) ||
        (!want && name && p.advertisement?.localName === name);
      if (hit) {
        cleanup();
        resolve(p);
      }
    };
    const cleanup = () => {
      clearTimeout(timer);
      noble.removeListener('discover', onDiscover);
      noble.stopScanningAsync().catch(() => {});
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Bluetooth device ${address || name} not found. Is it powered on, in range, and disconnected from its phone app?`));
    }, timeoutMs);
    noble.on('discover', onDiscover);
    noble.startScanningAsync([], true).catch((e) => {
      cleanup();
      reject(e);
    });
  });
}
