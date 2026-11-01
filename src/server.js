import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Hub } from './hub.js';
import { SceneStore } from './scenes.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function loadConfig() {
  const own = path.join(ROOT, 'config', 'devices.json');
  try {
    return await readJson(own);
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Could not read config/devices.json: ${err.message}`);
    console.log('No config/devices.json yet - starting with simulated demo devices from config/devices.example.json');
    return readJson(path.join(ROOT, 'config', 'devices.example.json'));
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) reject(Object.assign(new Error('Body too large'), { status: 413 }));
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(Object.assign(new Error('Invalid JSON'), { status: 400 }));
      }
    });
  });
}

export async function createServer({ config, scenesFile, log = console.log } = {}) {
  config ??= await loadConfig();
  const hub = new Hub({ log });
  await hub.load(config.devices || []);
  const scenes = new SceneStore(scenesFile ?? path.join(ROOT, 'data', 'scenes.json'), hub);
  await scenes.load(config.defaultScenes || []);

  const routes = [
    ['GET', /^\/api\/devices$/, () => hub.list()],
    ['POST', /^\/api\/devices\/([^/]+)\/state$/, async (m, body) => (await hub.setState(m[1], body), hub.get(m[1]).toJSON())],
    ['POST', /^\/api\/devices\/([^/]+)\/refresh$/, async (m) => (await hub.get(m[1]).init(), hub.get(m[1]).toJSON())],
    ['POST', /^\/api\/apply$/, (m, body) => hub.apply(body.actions || [])],
    ['GET', /^\/api\/scenes$/, () => scenes.list()],
    ['POST', /^\/api\/scenes$/, (m, body) => {
      // Either explicit actions, or "capture" the current state of the listed devices.
      const actions = body.actions || hub.snapshot(body.deviceIds || []);
      return scenes.create({ ...body, actions }).then(broadcastScenes);
    }],
    ['PUT', /^\/api\/scenes\/([^/]+)$/, (m, body) => scenes.update(m[1], body).then(broadcastScenes)],
    ['DELETE', /^\/api\/scenes\/([^/]+)$/, (m) => scenes.remove(m[1]).then(() => broadcastScenes({ ok: true }))],
    ['POST', /^\/api\/scenes\/([^/]+)\/activate$/, (m) => scenes.activate(m[1])],
  ];

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const send = (status, obj) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    };
    try {
      if (url.pathname.startsWith('/api/')) {
        for (const [method, re, handler] of routes) {
          const m = re.exec(url.pathname);
          if (m && req.method === method) {
            const body = ['POST', 'PUT'].includes(method) ? await readBody(req) : {};
            return send(200, await handler(m.map(decodeURIComponent), body));
          }
        }
        return send(404, { error: 'Not found' });
      }
      // Static files for the web app.
      const file = path.join(PUBLIC, path.normalize(url.pathname === '/' ? '/index.html' : url.pathname));
      if (!file.startsWith(PUBLIC)) return send(403, { error: 'Forbidden' });
      const data = await fs.readFile(file).catch(() => null);
      if (!data) return send(404, { error: 'Not found' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(data);
    } catch (err) {
      send(err.status || 500, { error: err.message });
    }
  });

  // Live updates: every connected phone sees changes made anywhere.
  const wss = new WebSocketServer({ server, path: '/ws' });
  const broadcast = (type, data) => {
    const msg = JSON.stringify({ type, data });
    for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
  };
  function broadcastScenes(result) {
    broadcast('scenes', scenes.list());
    return result;
  }
  hub.on('device', (d) => broadcast('device', d));
  wss.on('connection', (ws) => ws.send(JSON.stringify({ type: 'init', data: { devices: hub.list(), scenes: scenes.list() } })));

  return { server, hub, scenes, wss };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  const { server } = await createServer();
  server.listen(port, '0.0.0.0', async () => {
    const os = await import('node:os');
    const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i?.family === 'IPv4' && !i.internal).map((i) => i.address);
    console.log(`Home Control running. Open on your phone: ${ips.map((ip) => `http://${ip}:${port}`).join('  ') || `http://localhost:${port}`}`);
  });
}
