import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// Scenes are saved to a JSON file so they survive restarts.
export class SceneStore {
  constructor(file, hub) {
    this.file = file;
    this.hub = hub;
    this.scenes = [];
  }

  async load(defaults = []) {
    try {
      this.scenes = JSON.parse(await fs.readFile(this.file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      this.scenes = defaults.map((s) => ({ id: randomUUID(), ...s }));
      await this.save();
    }
  }

  async save() {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    await fs.writeFile(tmp, JSON.stringify(this.scenes, null, 2));
    await fs.rename(tmp, this.file);
  }

  list() {
    return this.scenes;
  }

  get(id) {
    const s = this.scenes.find((x) => x.id === id);
    if (!s) throw Object.assign(new Error(`No scene "${id}"`), { status: 404 });
    return s;
  }

  normalize({ name, icon, actions }) {
    if (!name || typeof name !== 'string') throw Object.assign(new Error('Scene needs a name'), { status: 400 });
    if (!Array.isArray(actions) || !actions.length) throw Object.assign(new Error('Scene needs at least one device'), { status: 400 });
    const clean = actions.map((a) => {
      try {
        return { deviceId: a.deviceId, state: this.hub.get(a.deviceId).validate(a.state) };
      } catch (err) {
        throw Object.assign(err, { status: 400 });
      }
    });
    return { name: name.trim(), icon: icon || '✨', actions: clean };
  }

  async create(input) {
    const scene = { id: randomUUID(), ...this.normalize(input) };
    this.scenes.push(scene);
    await this.save();
    return scene;
  }

  async update(id, input) {
    const scene = this.get(id);
    Object.assign(scene, this.normalize({ ...scene, ...input }));
    await this.save();
    return scene;
  }

  async remove(id) {
    this.get(id);
    this.scenes = this.scenes.filter((s) => s.id !== id);
    await this.save();
  }

  async activate(id) {
    const scene = this.get(id);
    const results = await this.hub.apply(scene.actions);
    return { scene: scene.name, results };
  }
}
