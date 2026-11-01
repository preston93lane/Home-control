// Finds devices on your network so you can add them to config/devices.json.
//   npm run discover            -> WiZ and Govee WiFi lights, Sonos speakers
//   npm run discover -- --ble   -> also scan for nearby Bluetooth devices
import dgram from 'node:dgram';

const SECONDS = 5;
const found = [];
const add = (entry) => {
  const key = JSON.stringify(entry);
  if (found.some((f) => JSON.stringify(f) === key)) return;
  found.push(entry);
  console.log(JSON.stringify(entry));
};

function wiz() {
  const s = dgram.createSocket('udp4');
  s.on('message', (buf, r) => {
    try {
      const res = JSON.parse(buf).result;
      add({ driver: 'wiz', host: r.address, mac: res?.mac, id: `wiz-${r.address.split('.').pop()}`, name: 'WiZ light', type: 'light' });
    } catch {}
  });
  s.bind(() => {
    s.setBroadcast(true);
    s.send(JSON.stringify({ method: 'getPilot', params: {} }), 38899, '255.255.255.255');
  });
  return s;
}

function govee() {
  const listen = dgram.createSocket({ type: 'udp4', reuseAddr: true });
  listen.on('message', (buf) => {
    try {
      const d = JSON.parse(buf).msg.data;
      add({ driver: 'govee', host: d.ip, model: d.sku, id: `govee-${d.ip.split('.').pop()}`, name: `Govee ${d.sku}`, type: 'light' });
    } catch {}
  });
  listen.on('error', (e) => console.error('Govee listener:', e.message));
  listen.bind(4002, () => {
    const s = dgram.createSocket('udp4');
    s.send(JSON.stringify({ msg: { cmd: 'scan', data: { account_topic: 'reserve' } } }), 4001, '239.255.255.250', () => s.close());
  });
  return listen;
}

function sonos() {
  const s = dgram.createSocket('udp4');
  s.on('message', (buf, r) => {
    if (/Sonos/i.test(buf.toString())) add({ driver: 'sonos', host: r.address, id: `sonos-${r.address.split('.').pop()}`, name: 'Sonos speaker', type: 'speaker' });
  });
  s.bind(() => {
    const msg = ['M-SEARCH * HTTP/1.1', 'HOST: 239.255.255.250:1900', 'MAN: "ssdp:discover"', 'MX: 2', 'ST: urn:schemas-upnp-org:device:ZonePlayer:1', '', ''].join('\r\n');
    s.send(msg, 1900, '239.255.255.250');
  });
  return s;
}

async function ble() {
  const { getNoble } = await import('../src/drivers/ble.js');
  const noble = await getNoble();
  noble.on('discover', (p) => {
    const name = p.advertisement?.localName;
    if (!name) return;
    const guess = /ELK|MELK|BLEDOM/i.test(name) ? 'elk-bledom' : /Triones|LEDBlue|QHM|Magic/i.test(name) ? 'triones' : undefined;
    add({ driver: guess ? 'ble-led' : '(unknown)', protocol: guess, address: p.address && p.address !== 'unknown' ? p.address : p.id, name, rssi: p.rssi });
  });
  await noble.startScanningAsync([], false);
  return { close: () => noble.stopScanningAsync().then(() => process.exit(0)) };
}

console.log(`Scanning for ${SECONDS}s...`);
const sockets = [wiz(), govee(), sonos()];
if (process.argv.includes('--ble')) sockets.push(await ble().catch((e) => (console.error(e.message), { close() {} })));
setTimeout(() => {
  sockets.forEach((s) => s.close());
  console.log(found.length ? `\nFound ${found.length}. Copy the ones you want into config/devices.json (give each a friendly name and room).` : '\nNothing found. Make sure the hub is on the same WiFi network as your devices.');
  if (!process.argv.includes('--ble')) process.exit(0);
}, SECONDS * 1000);
