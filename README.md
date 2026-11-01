# Home Control

One app to control your Bluetooth and WiFi lights and speakers. Change power, brightness, color and volume, and save **scenes** that set everything at once with a single tap.

```
 Phone / tablet / laptop  ──WiFi──►  Hub (Raspberry Pi or any always-on computer)
   (web app, add to                    ├── WiFi:      WiZ bulbs, Govee lights, Sonos speakers
    home screen)                       └── Bluetooth: cheap BLE LED strips & bulbs
```

The hub runs at home and does the talking to devices. Your phone just opens a web page served by the hub, so it works on iPhone and Android with nothing to install. (Phones can't reliably drive Bluetooth gadgets from a browser. iOS doesn't allow it at all. That's why the hub handles Bluetooth.)

## Quick start

```bash
npm install
npm start
```

Open the address it prints (for example `http://192.168.1.20:8080`) on your phone. On iPhone, tap **Share → Add to Home Screen** to use it like an app.

The first time, it runs with **simulated devices**, so you can try the controls and scenes before connecting anything real.

## Adding your real devices

1. Find them:
   ```bash
   npm run discover          # WiFi: WiZ, Govee, Sonos
   npm run discover -- --ble # also Bluetooth LED strips (needs Bluetooth on the hub)
   ```
2. Copy `config/devices.example.json` to `config/devices.json`, replace the mock devices with what you found, and give each one a friendly `name` and `room`.
3. Restart with `npm start`.

| Driver    | Devices | Setup notes |
|-----------|---------|-------------|
| `wiz`     | Philips WiZ and WiZ-based bulbs | Needs `host` (IP). Works locally, no account needed. |
| `govee`   | Govee WiFi lights | Turn on **LAN Control** for each device in the Govee Home app. Needs `host`. |
| `sonos`   | Sonos speakers | Needs `host`. Volume, mute, play/pause. |
| `ble-led` | Generic Bluetooth LED strips/bulbs | Needs `address`. `protocol`: `elk-bledom` (apps like duoCo Strip and Lotus Lantern) or `triones` (HappyLighting, Magic Blue). If one doesn't respond, try the other. Close the phone app first, because a BLE device accepts only one connection at a time. |
| `mock`    | Simulated light/speaker/plug | For testing. |

**Tip:** In your router, give each WiFi device a reserved (static) IP so the addresses don't change.

### Bluetooth on a Raspberry Pi

```bash
sudo apt install bluetooth bluez libbluetooth-dev libudev-dev
sudo setcap cap_net_raw+eip $(eval readlink -f $(which node))   # lets Node use BLE without sudo
npm install
```

## Scenes

- Set your devices however you like, tap **Save current as scene**, name it and pick which devices it includes.
- Tap a scene to apply it. If one device is offline, the rest still change, and the app tells you which one didn't respond.
- Scenes are saved in `data/scenes.json`. Starter scenes can be defined under `defaultScenes` in the config.

## Run it automatically on boot (Raspberry Pi)

```bash
sudo tee /etc/systemd/system/home-control.service <<EOF2
[Unit]
After=network-online.target bluetooth.target
[Service]
WorkingDirectory=$PWD
ExecStart=$(which node) src/server.js
Restart=always
User=$USER
[Install]
WantedBy=multi-user.target
EOF2
sudo systemctl enable --now home-control
```

## API

Everything the app does is available over HTTP, so you can add shortcuts (iOS Shortcuts, widgets, etc.):

- `GET /api/devices`
- `POST /api/devices/:id/state` with a body like `{"on":true,"brightness":60,"color":"#ff8800"}` or `{"volume":20}`
- `GET /api/scenes`, `POST /api/scenes/:id/activate`
- `POST /api/scenes` with `{"name":"Reading","deviceIds":["lamp"]}` (captures current settings) or explicit `actions`
- `WS /ws` for live updates

## Adding another brand

Create `src/drivers/<brand>.js` with a class that has `capabilities` (`power`, `brightness`, `color`, `volume`, `mute`, `playback`), `connect()`, `setState(patch)` and optionally `getState()`, then register it in `src/drivers/index.js`.

## Security

There's no login. Keep the hub on your home network only, and don't port-forward it to the internet.

## Development

```bash
npm run dev   # restarts on file changes
npm test
```
