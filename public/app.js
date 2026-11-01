const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const PRESETS = ['#ffffff', '#ffd8a8', '#ff9f43', '#ff4d4d', '#ff4dd2', '#6b5bff', '#3bb3ff', '#3cff8f'];

let devices = new Map();
let scenes = [];
const cards = new Map(); // deviceId -> element
const dragging = new Set(); // deviceIds the user is currently adjusting

// ---------- API ----------
async function api(method, url, body) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3000);
}

// Send device changes, at most ~8 per second per device while dragging sliders.
const outbox = new Map();
function send(id, patch) {
  const d = devices.get(id);
  Object.assign(d.state, patch);
  updateCard(d, true);
  const entry = outbox.get(id) || { patch: {}, timer: null };
  Object.assign(entry.patch, patch);
  outbox.set(id, entry);
  if (entry.timer) return;
  entry.timer = setTimeout(async () => {
    const p = entry.patch;
    outbox.delete(id);
    try {
      await api('POST', `/api/devices/${encodeURIComponent(id)}/state`, p);
    } catch (e) {
      toast(e.message);
    }
  }, 120);
}

// ---------- Scenes ----------
function renderScenes() {
  const el = $('#scenes');
  if (!scenes.length) {
    el.innerHTML = '<p class="hint">No scenes yet. Set your devices how you like, then tap “Save current as scene”.</p>';
    return;
  }
  el.innerHTML = scenes
    .map((s) => `<button class="scene" data-id="${esc(s.id)}"><span class="icon">${esc(s.icon)}</span><span class="name">${esc(s.name)}</span><span class="del" data-del="${esc(s.id)}" title="Delete">×</span></button>`)
    .join('');
}

$('#scenes').addEventListener('click', async (e) => {
  const del = e.target.closest('[data-del]');
  if (del) {
    e.stopPropagation();
    const s = scenes.find((x) => x.id === del.dataset.del);
    if (confirm(`Delete scene “${s.name}”?`)) await api('DELETE', `/api/scenes/${s.id}`).catch((err) => toast(err.message));
    return;
  }
  const btn = e.target.closest('.scene');
  if (!btn) return;
  btn.classList.add('busy');
  try {
    const r = await api('POST', `/api/scenes/${btn.dataset.id}/activate`);
    const failed = r.results.filter((x) => !x.ok);
    toast(failed.length ? `${r.scene}: ${failed.length} device(s) didn't respond` : `${r.scene} ✓`);
  } catch (err) {
    toast(err.message);
  } finally {
    btn.classList.remove('busy');
  }
});

$('#new-scene').addEventListener('click', () => {
  const fs = $('#scene-devices');
  fs.innerHTML =
    '<legend>Include</legend>' +
    [...devices.values()].map((d) => `<label><input type="checkbox" value="${esc(d.id)}" checked /> ${esc(d.name)} <small class="hint">${esc(summary(d))}</small></label>`).join('');
  $('#scene-form').reset();
  $('#scene-dialog').showModal();
});

$('#scene-dialog').addEventListener('close', async () => {
  if ($('#scene-dialog').returnValue !== 'save') return;
  const form = $('#scene-form');
  const deviceIds = [...form.querySelectorAll('fieldset input:checked')].map((i) => i.value);
  if (!deviceIds.length) return toast('Pick at least one device');
  try {
    await api('POST', '/api/scenes', { name: form.name.value, icon: form.icon.value, deviceIds });
    toast('Scene saved');
  } catch (err) {
    toast(err.message);
  }
});

// ---------- Devices ----------
function summary(d) {
  const s = d.state;
  const parts = [];
  if ('on' in s) parts.push(s.on ? 'On' : 'Off');
  if (s.on !== false && 'brightness' in s) parts.push(`${Math.round(s.brightness)}%`);
  if ('volume' in s) parts.push(`Vol ${Math.round(s.volume)}`);
  if (s.muted) parts.push('Muted');
  if ('playing' in s) parts.push(s.playing ? 'Playing' : 'Paused');
  return parts.join(' · ');
}

function renderRooms() {
  const byRoom = {};
  for (const d of devices.values()) (byRoom[d.room] ||= []).push(d);
  const root = $('#rooms');
  root.innerHTML = '';
  cards.clear();
  for (const [room, list] of Object.entries(byRoom)) {
    const sec = document.createElement('section');
    sec.innerHTML = `<div class="section-head"><h2>${esc(room)}</h2></div><div class="devices"></div>`;
    for (const d of list) {
      $('.devices', sec).append(buildCard(d));
    }
    root.append(sec);
  }
}

function buildCard(d) {
  const c = d.capabilities;
  const el = document.createElement('div');
  el.className = 'device';
  el.dataset.id = d.id;
  cards.set(d.id, el);
  el.innerHTML = `
    <div class="top">
      <div class="swatch"></div>
      <div class="title"><b>${esc(d.name)}</b><small class="sum"></small></div>
      ${c.includes('power') ? '<button class="toggle" data-act="power" aria-label="Power"></button>' : ''}
      ${c.includes('playback') ? '<button class="pill" data-act="play"></button>' : ''}
    </div>
    ${c.includes('brightness') ? '<div class="row"><span>☀︎</span><input type="range" min="1" max="100" data-act="brightness" aria-label="Brightness" /></div>' : ''}
    ${c.includes('color') ? `<div class="row"><input type="color" data-act="color" aria-label="Color" /><div class="presets">${PRESETS.map((p) => `<button data-preset="${p}" style="background:${p}" aria-label="${p}"></button>`).join('')}</div></div>` : ''}
    ${c.includes('volume') ? `<div class="row"><span>🔈</span><input type="range" min="0" max="100" data-act="volume" aria-label="Volume" />${c.includes('mute') ? '<button class="pill" data-act="mute"></button>' : ''}</div>` : ''}
    <div class="err" hidden></div>`;
  if (d.type === 'speaker') $('.swatch', el).textContent = '🔊';

  el.addEventListener('click', (e) => {
    const dev = devices.get(d.id);
    const act = e.target.closest('[data-act]')?.dataset.act;
    const preset = e.target.closest('[data-preset]')?.dataset.preset;
    if (act === 'power') send(d.id, { on: !dev.state.on });
    else if (act === 'play') send(d.id, { playing: !dev.state.playing });
    else if (act === 'mute') send(d.id, { muted: !dev.state.muted });
    else if (preset) send(d.id, { color: preset, ...(dev.state.on === false ? { on: true } : {}) });
  });
  el.addEventListener('input', (e) => {
    const act = e.target.dataset.act;
    if (act === 'brightness' || act === 'volume') send(d.id, { [act]: Number(e.target.value) });
    if (act === 'color') send(d.id, { color: e.target.value });
  });
  el.addEventListener('pointerdown', () => dragging.add(d.id));
  el.addEventListener('pointerup', () => setTimeout(() => dragging.delete(d.id), 600));
  updateCard(d);
  return el;
}

function updateCard(d, local = false) {
  const el = cards.get(d.id);
  if (!el) return;
  const s = d.state;
  el.classList.toggle('on', s.on === true || s.playing === true);
  el.classList.toggle('offline', !d.online);
  $('.sum', el).textContent = d.online ? summary(d) : 'Not responding';
  const swatch = $('.swatch', el);
  swatch.style.background = s.color && s.on !== false ? s.color : 'transparent';
  $('[data-act=power]', el)?.classList.toggle('on', !!s.on);
  const play = $('[data-act=play]', el);
  if (play) play.textContent = s.playing ? '⏸ Pause' : '▶ Play';
  const mute = $('[data-act=mute]', el);
  if (mute) mute.textContent = s.muted ? 'Unmute' : 'Mute';
  // Don't move sliders under the user's finger.
  if (!local && !dragging.has(d.id)) {
    const b = $('[data-act=brightness]', el);
    if (b && s.brightness != null) b.value = s.brightness;
    const v = $('[data-act=volume]', el);
    if (v && s.volume != null) v.value = s.volume;
    const col = $('[data-act=color]', el);
    if (col && s.color) col.value = s.color;
  }
  const err = $('.err', el);
  err.hidden = !d.error;
  err.textContent = d.error || '';
}

// ---------- Live connection ----------
function connect() {
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => $('#conn').classList.add('ok');
  ws.onclose = () => {
    $('#conn').classList.remove('ok');
    setTimeout(connect, 2000);
  };
  ws.onmessage = (ev) => {
    const { type, data } = JSON.parse(ev.data);
    if (type === 'init') {
      devices = new Map(data.devices.map((d) => [d.id, d]));
      scenes = data.scenes;
      renderRooms();
      renderScenes();
    } else if (type === 'device') {
      const known = devices.has(data.id);
      // Keep optimistic values for anything still waiting to be sent.
      const pending = outbox.get(data.id)?.patch || {};
      data.state = { ...data.state, ...pending };
      devices.set(data.id, data);
      known ? updateCard(data) : renderRooms();
    } else if (type === 'scenes') {
      scenes = data;
      renderScenes();
    }
  };
}
connect();
