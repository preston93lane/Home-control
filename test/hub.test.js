import { test } from 'node:test';
import assert from 'node:assert/strict';
import dgram from 'node:dgram';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { Hub } from '../src/hub.js';
import { SceneStore } from '../src/scenes.js';
import { createServer } from '../src/server.js';
import WizDriver from '../src/drivers/wiz.js';

const quiet = () => {};
const devices = [
  { id: 'lamp', name: 'Lamp', driver: 'mock', kind: 'light', latencyMs: 5 },
  { id: 'spk', name: 'Speaker', driver: 'mock', kind: 'speaker', latencyMs: 5 },
];

test('validates state against device capabilities', async () => {
  const hub = new Hub({ log: quiet });
  await hub.load(devices);
  await assert.rejects(hub.setState('spk', { color: '#ff0000' }), /does not support "color"/);
  await assert.rejects(hub.setState('lamp', { color: 'red' }), /Invalid color/);
  await hub.setState('lamp', { brightness: 250, color: '#FF0000' });
  assert.deepEqual(hub.get('lamp').state, { on: false, brightness: 100, color: '#ff0000' });
});

test('rapid updates are coalesced into the latest value', async () => {
  const hub = new Hub({ log: quiet });
  await hub.load(devices);
  const sent = [];
  const drv = hub.get('lamp').driver;
  const orig = drv.setState.bind(drv);
  drv.setState = (p) => (sent.push(p), orig(p));
  await Promise.all([1, 2, 3, 4, 5].map((b) => hub.setState('lamp', { brightness: b * 10 })));
  assert.equal(hub.get('lamp').state.brightness, 50);
  assert.ok(sent.length <= 2, `expected coalescing, got ${sent.length} sends`);
});

test('scenes capture, persist, and activate; one failing device does not block others', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-'));
  const hub = new Hub({ log: quiet });
  await hub.load(devices);
  const store = new SceneStore(path.join(dir, 'scenes.json'), hub);
  await store.load();
  await hub.setState('lamp', { on: true, brightness: 20, color: '#112233' });
  await hub.setState('spk', { volume: 7 });
  const scene = await store.create({ name: 'Chill', actions: hub.snapshot(['lamp', 'spk']) });

  await hub.setState('lamp', { on: false });
  await hub.setState('spk', { volume: 90 });
  hub.get('spk').driver.setState = async () => {
    throw new Error('speaker unplugged');
  };
  const r = await store.activate(scene.id);
  assert.deepEqual(r.results.map((x) => x.ok), [true, false]);
  assert.deepEqual(hub.get('lamp').state, { on: true, brightness: 20, color: '#112233' });
  assert.equal(hub.get('spk').online, false);

  const reloaded = new SceneStore(path.join(dir, 'scenes.json'), hub);
  await reloaded.load();
  assert.equal(reloaded.list()[0].name, 'Chill');
});

test('WiZ driver speaks the local UDP protocol', async () => {
  const bulb = dgram.createSocket('udp4');
  const got = [];
  bulb.on('message', (buf, r) => {
    const msg = JSON.parse(buf);
    got.push(msg);
    const result = msg.method === 'getPilot' ? { state: true, dimming: 40, r: 255, g: 0, b: 0 } : { success: true };
    bulb.send(JSON.stringify({ method: msg.method, result }), r.port, r.address);
  });
  await new Promise((r) => bulb.bind(38899, '127.0.0.1', r));
  try {
    const wiz = new WizDriver({ host: '127.0.0.1' });
    assert.deepEqual(await wiz.getState(), { on: true, brightness: 40, color: '#ff0000' });
    await wiz.setState({ on: true, brightness: 5, color: '#00ff80' });
    assert.deepEqual(got[1], { method: 'setPilot', params: { state: true, dimming: 10, r: 0, g: 255, b: 128 } });
  } finally {
    bulb.close();
  }
});

test('HTTP API end to end', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hc-'));
  const { server, wss } = await createServer({ config: { devices }, scenesFile: path.join(dir, 's.json'), log: quiet });
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (m, u, b) => fetch(base + u, { method: m, body: b && JSON.stringify(b) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  try {
    assert.equal((await call('GET', '/api/devices')).body.length, 2);
    assert.equal((await call('POST', '/api/devices/lamp/state', { on: true })).body.state.on, true);
    assert.equal((await call('POST', '/api/devices/nope/state', { on: true })).status, 404);
    const created = await call('POST', '/api/scenes', { name: 'Test', deviceIds: ['lamp'] });
    assert.equal(created.status, 200);
    assert.equal((await call('POST', `/api/scenes/${created.body.id}/activate`)).body.results[0].ok, true);
    assert.equal((await call('POST', '/api/scenes', { name: 'Empty', deviceIds: [] })).status, 400);
    assert.equal((await call('GET', '/../package.json')).status, 404);
  } finally {
    wss.close();
    server.close();
  }
});
