import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { loadPrices, LEVEL, won, pct, matchFood, quote, regionNames } from "./price.js";
import { createShop, itemQuote, currentRegion, advice, verdict } from "./shop.js";
import { makeBuy } from "./ledger.js";

const KEY = "fridge-toon-v2";
const $ = (id) => document.getElementById(id);
const SYNC = { url: "__SB_URL__", key: "__SB_KEY__" };
const SYNC_ON = SYNC.url.startsWith("https://");
const SEED = "__SEED__";

const W = 0.9;
const D = 0.7;
const T = 0.075;
const TH = 0.045;
const FZ = { y0: 0.06, y1: 0.63 };
const FR = { y0: 0.67, y1: 1.74 };
const PT = { x0: 0.56, x1: 1.36, y0: 0.0, y1: 1.62, z0: -0.35, z1: 0.12 };
const OPEN = 2.05;
const SENSOR = 1;
const INK = 0x2a2135;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$("stage").appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
scene.fog = new THREE.Fog(0xffffff, 6, 10);
const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.05, 30);
const cam = { x: 0.22, tx: 0.22, y: 0.95, ty: 0.95, minY: 0.55, maxY: 1.3, minX: -0.75, maxX: 1.25 };
function camDistance() {
  const a = window.innerWidth / window.innerHeight;
  return a < 1 ? Math.min(7, 2.4 / Math.max(a, 0.4)) : 4.5;
}
function placeCamera() {
  camera.position.set(cam.x, cam.y + 0.8, camDistance());
  camera.lookAt(cam.x + 0.02, cam.y, 0);
}

function addLights(sc) {
  sc.add(new THREE.HemisphereLight(0xffffff, 0xd9d2ea, 1.35));
  const s = new THREE.DirectionalLight(0xffffff, 2.3);
  s.position.set(1.8, 3.4, 2.6);
  return s;
}
const sun = addLights(scene);
sun.target.position.set(0.2, 0.6, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -2.5, right: 2.5, top: 2.5, bottom: -1 });
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.01;
scene.add(sun, sun.target);

const gradient = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
gradient.needsUpdate = true;
const toonCache = new Map();
function toon(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!toonCache.has(k)) toonCache.set(k, new THREE.MeshToonMaterial({ color, gradientMap: gradient, ...opts }));
  return toonCache.get(k);
}
function outlineMaterial(color, width) {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = { value: width };
    sh.vertexShader = "uniform float uOutline;\n" + sh.vertexShader.replace("#include <begin_vertex>", "vec3 transformed = position + normal * uOutline;");
  };
  m.customProgramCacheKey = () => "outline" + color + width;
  return m;
}
const OUT = outlineMaterial(INK, 0.006);
const OUT_THICK = outlineMaterial(INK, 0.01);
const OUT_HOT = outlineMaterial(0xffc21a, 0.012);
function noRay() {}
function outline(mesh, thick) {
  const o = new THREE.Mesh(mesh.geometry, thick ? OUT_THICK : OUT);
  o.userData.outline = true;
  o.raycast = noRay;
  mesh.add(o);
  return mesh;
}
function M(geo, color, opts = {}) {
  const m = new THREE.Mesh(geo, color instanceof THREE.Material ? color : toon(color, opts.mat || {}));
  m.castShadow = opts.shadow !== false;
  m.receiveShadow = true;
  if (opts.outline !== false) outline(m, opts.thick);
  return m;
}
function rb(w, h, d, color, r = 0.015, opts) {
  const rr = Math.max(0.001, Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001));
  return M(new RoundedBoxGeometry(w, h, d, 4, rr), color, opts);
}
function sp(r, color, sx = 1, sy = 1, sz = 1, opts) {
  const m = M(new THREE.SphereGeometry(r, 22, 16), color, opts);
  m.scale.set(sx, sy, sz);
  return m;
}
function cy(rt, rb2, h, color, opts, seg = 24) {
  return M(new THREE.CylinderGeometry(rt, rb2, h, seg), color, opts);
}
function cap(r, len, color, opts) {
  return M(new THREE.CapsuleGeometry(r, len, 6, 16), color, opts);
}
function at(o, x, y, z, rx = 0, ry = 0, rz = 0) {
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  return o;
}
function grp(...kids) {
  const g = new THREE.Group();
  kids.forEach((k) => g.add(k));
  return g;
}
function hex(c) {
  return new THREE.Color(c).getHex();
}

const AUDIO = { ctx: null, muted: false, lastHover: 0 };
try {
  AUDIO.muted = localStorage.getItem("fridge-muted") === "1";
} catch (e) {}
function actx() {
  if (!AUDIO.ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    AUDIO.ctx = new Ctx();
  }
  if (AUDIO.ctx.state === "suspended") AUDIO.ctx.resume();
  return AUDIO.ctx;
}
function tone({ type = "sine", f0 = 440, f1 = f0, dur = 0.1, vol = 0.2, delay = 0, attack = 0.004 }) {
  const c = actx();
  if (!c || AUDIO.muted) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}
let noiseBuf = null;
function noise({ dur = 0.1, vol = 0.2, type = "bandpass", f0 = 1000, f1 = f0, q = 1, delay = 0 }) {
  const c = actx();
  if (!c || AUDIO.muted) return;
  if (!noiseBuf) {
    noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(c.destination);
  s.start(t);
  s.stop(t + dur + 0.02);
}
const SFX = {
  fridgeOpen: () => {
    noise({ dur: 0.14, vol: 0.35, type: "bandpass", f0: 500, f1: 2200, q: 1.5 });
    tone({ type: "sine", f0: 190, f1: 90, dur: 0.18, vol: 0.28 });
    tone({ type: "triangle", f0: 1320, f1: 1320, dur: 0.12, vol: 0.05, delay: 0.12 });
    tone({ type: "triangle", f0: 1760, f1: 1760, dur: 0.14, vol: 0.05, delay: 0.19 });
  },
  freezerOpen: () => {
    noise({ dur: 0.5, vol: 0.22, type: "lowpass", f0: 3000, f1: 400, q: 0.7 });
    tone({ type: "sine", f0: 170, f1: 85, dur: 0.18, vol: 0.25 });
  },
  pantryOpen: () => {
    tone({ type: "triangle", f0: 260, f1: 420, dur: 0.22, vol: 0.12 });
    noise({ dur: 0.08, vol: 0.2, type: "bandpass", f0: 900, f1: 700, q: 3, delay: 0.02 });
  },
  close: () => {
    tone({ type: "sine", f0: 150, f1: 55, dur: 0.16, vol: 0.4 });
    noise({ dur: 0.07, vol: 0.25, type: "lowpass", f0: 900, f1: 300 });
  },
  pick: () => tone({ type: "triangle", f0: 480, f1: 980, dur: 0.09, vol: 0.25 }),
  drop: () => {
    tone({ type: "sine", f0: 460, f1: 170, dur: 0.12, vol: 0.3 });
    tone({ type: "sine", f0: 620, f1: 400, dur: 0.06, vol: 0.12, delay: 0.1 });
  },
  slap: () => {
    noise({ dur: 0.07, vol: 0.4, type: "highpass", f0: 1500, f1: 3500 });
    tone({ type: "square", f0: 230, f1: 110, dur: 0.05, vol: 0.06 });
  },
  poof: () => {
    noise({ dur: 0.38, vol: 0.3, type: "bandpass", f0: 2200, f1: 280, q: 0.9 });
    tone({ type: "sine", f0: 700, f1: 180, dur: 0.28, vol: 0.12 });
  },
  sparkle: () => [1320, 1760, 2093].forEach((f, i) => tone({ type: "sine", f0: f, dur: 0.12, vol: 0.07, delay: i * 0.055 })),
  click: () => tone({ type: "square", f0: 880, f1: 660, dur: 0.035, vol: 0.05 }),
  hover: () => {
    const now = performance.now();
    if (now - AUDIO.lastHover < 90) return;
    AUDIO.lastHover = now;
    tone({ type: "sine", f0: 1250, f1: 1400, dur: 0.03, vol: 0.03 });
  },
  undo: () => [523, 659, 784].forEach((f, i) => tone({ type: "triangle", f0: f, dur: 0.09, vol: 0.1, delay: i * 0.06 })),
  alert: () => [880, 660].forEach((f, i) => tone({ type: "square", f0: f, dur: 0.07, vol: 0.05, delay: i * 0.09 }))
};

function floorTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const g = c.getContext("2d");
  const n = 14;
  const s = 1024 / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? "#cfe9f0" : "#fdf6e8";
      g.fillRect(x * s, y * s, s, s);
      g.fillStyle = "rgba(255,255,255,0.35)";
      g.fillRect(x * s + 6, y * s + 6, s - 36, 9);
    }
  }
  g.globalCompositeOperation = "destination-in";
  const rad = g.createRadialGradient(512, 512, 200, 512, 512, 512);
  rad.addColorStop(0, "rgba(0,0,0,1)");
  rad.addColorStop(0.7, "rgba(0,0,0,0.9)");
  rad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = rad;
  g.fillRect(0, 0, 1024, 1024);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const floor = new THREE.Mesh(new THREE.CircleGeometry(3.2, 64), new THREE.MeshToonMaterial({ map: floorTexture(), transparent: true, gradientMap: gradient }));
floor.rotation.x = -Math.PI / 2;
floor.position.set(0.2, 0, 0.6);
scene.add(floor);
const SENSOR_MAT = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
const floorSensor = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), SENSOR_MAT);
floorSensor.rotation.x = -Math.PI / 2;
floorSensor.position.y = 0.001;
floorSensor.layers.set(SENSOR);
scene.add(floorSensor);
const dropRing = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.17, 40), new THREE.MeshBasicMaterial({ color: 0xff6b6b, transparent: true, opacity: 0.85, depthWrite: false }));
dropRing.rotation.x = -Math.PI / 2;
dropRing.visible = false;
scene.add(dropRing);

const sensors = [];
function sensorBox(w, h, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), SENSOR_MAT);
  m.layers.set(SENSOR);
  sensors.push(m);
  return m;
}
function sensorPlane(w, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), SENSOR_MAT);
  m.layers.set(SENSOR);
  sensors.push(m);
  return m;
}

const C = { body: 0xcfe0ea, liner: 0xf4fbff, linerShade: 0xdcebf3, handle: 0x7f8fa0, gasket: 0x6d6480, glass: 0xbfe9f5, bin: 0xa8dcef, wood: 0xe7ad6b, woodDark: 0xc0834a, woodIn: 0xf6ddb5, woodShelf: 0xd89a5b };
const world = new THREE.Group();
scene.add(world);
const doors = {};
const slots = new Map();
const surfaces = new Map();

function addSlot(id, unit, parent, x, y, z, w, d, onDoor) {
  const s = sensorBox(w, 0.2, d);
  s.position.set(x, y + 0.1, z);
  s.userData.slotId = id;
  parent.add(s);
  slots.set(id, { id, unit, parent, pos: new THREE.Vector3(x, y, z), onDoor: !!onDoor });
}

function alertSprite() {
  const make = (kind) => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = kind === "bad" ? "#ff4d5e" : "#ffb020";
    g.beginPath();
    g.arc(64, 60, 48, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 9;
    g.strokeStyle = "#2a2135";
    g.stroke();
    g.beginPath();
    g.moveTo(50, 104);
    g.lineTo(64, 122);
    g.lineTo(78, 104);
    g.fillStyle = kind === "bad" ? "#ff4d5e" : "#ffb020";
    g.fill();
    g.stroke();
    g.fillStyle = "#fff";
    g.strokeStyle = "#fff";
    if (kind === "bad") {
      g.beginPath();
      g.roundRect(56, 26, 16, 44, 8);
      g.fill();
      g.beginPath();
      g.arc(64, 84, 9, 0, Math.PI * 2);
      g.fill();
    } else {
      g.lineWidth = 8;
      g.beginPath();
      g.arc(64, 60, 28, 0, Math.PI * 2);
      g.stroke();
      g.lineCap = "round";
      g.beginPath();
      g.moveTo(64, 60);
      g.lineTo(64, 42);
      g.moveTo(64, 60);
      g.lineTo(78, 68);
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { bad: make("bad"), soon: make("soon") };
}
const ALERT_TEX = alertSprite();
function priceSprite() {
  const make = (level) => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d");
    g.fillStyle = LEVEL[level].color;
    g.strokeStyle = "#2a2135";
    g.lineWidth = 9;
    g.beginPath();
    g.roundRect(10, 22, 108, 84, 30);
    g.fill();
    g.stroke();
    g.fillStyle = "#fff";
    g.strokeStyle = "#2a2135";
    g.lineWidth = 7;
    g.font = "800 58px Pretendard, sans-serif";
    g.textAlign = "center";
    g.textBaseline = "middle";
    const mark = level === "good" ? "↓" : level === "bad" ? "↑" : "₩";
    g.strokeText(mark, 64, 66);
    g.fillText(mark, 64, 66);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { good: make("good"), ok: make("ok"), bad: make("bad") };
}
const PRICE_TEX = priceSprite();
function makeAlert(size) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ALERT_TEX.soon, transparent: true, depthWrite: false, depthTest: false }));
  s.scale.setScalar(size);
  s.visible = false;
  s.renderOrder = 5;
  return s;
}

function makeDoor(unit, parent, hingeX, y0, w, h, z, sign, light, opts) {
  const pivot = new THREE.Group();
  pivot.position.set(hingeX, y0, z);
  parent.add(pivot);
  const root = new THREE.Group();
  root.userData.kind = "door";
  root.userData.unit = unit;
  pivot.add(root);
  const dx = sign < 0 ? 1 : -1;
  const cx = (dx * w) / 2;
  const d = { unit, pivot, root, light, sign, angle: 0, target: 0, vel: 0, dragging: false, wasOpen: false, alert: makeAlert(0.14), alertLevel: 0 };
  opts.build(root, cx, dx);
  const front = sensorPlane(w - 0.26, h - 0.24);
  front.position.set(cx - dx * 0.06, h / 2, (opts.thick || T) + 0.003);
  root.add(front);
  surfaces.set(`door-${unit}`, { id: `door-${unit}`, sensor: front, hw: (w - 0.26) / 2 - 0.08, hh: (h - 0.24) / 2 - 0.08 });
  d.alert.position.set(dx * (w - 0.1), h - 0.06, (opts.thick || T) + 0.08);
  root.add(d.alert);
  return d;
}

function buildFridge() {
  const fridge = new THREE.Group();
  world.add(fridge);
  const H = FR.y1;
  const bodyMat = toon(C.body);
  fridge.add(at(rb(TH, H - FZ.y0 + 0.02, D, bodyMat, 0.02, { thick: true }), -W / 2 + TH / 2, (H + FZ.y0) / 2, 0));
  fridge.add(at(rb(TH, H - FZ.y0 + 0.02, D, bodyMat, 0.02, { thick: true }), W / 2 - TH / 2, (H + FZ.y0) / 2, 0));
  fridge.add(at(rb(W, TH, D, bodyMat, 0.02, { thick: true }), 0, H - TH / 2 + 0.01, 0));
  fridge.add(at(rb(W, TH, D, bodyMat, 0.02, { thick: true }), 0, FZ.y0 + TH / 2 - 0.01, 0));
  fridge.add(at(rb(W, H - FZ.y0, TH, bodyMat, 0.02), 0, (H + FZ.y0) / 2, -D / 2 + TH / 2));
  fridge.add(at(rb(W - 0.02, FR.y0 - FZ.y1 + 0.02, D - 0.02, bodyMat, 0.015), 0, (FZ.y1 + FR.y0) / 2, 0));
  fridge.add(at(rb(W - 0.08, 0.05, 0.05, toon(0x6d7a88), 0.015), 0, 0.03, D / 2 - 0.06));
  [[-0.34, 0.2], [0.34, 0.2], [-0.34, -0.24], [0.34, -0.24]].forEach(([x, z]) => fridge.add(at(cy(0.03, 0.035, 0.05, toon(0x5a6472)), x, 0.025, z)));
  const inner = (y0, y1) => {
    const g = new THREE.Group();
    const w = W - TH * 2;
    g.add(at(rb(w, y1 - y0, 0.01, toon(C.linerShade), 0.004, { outline: false }), 0, (y0 + y1) / 2, -D / 2 + TH + 0.006));
    [-1, 1].forEach((s) => g.add(at(rb(0.01, y1 - y0, D - TH - 0.02, toon(C.liner), 0.004, { outline: false }), s * (w / 2 - 0.006), (y0 + y1) / 2, 0.012)));
    g.add(at(rb(w, 0.01, D - TH - 0.02, toon(C.liner), 0.004, { outline: false }), 0, y0 + 0.005, 0.012));
    g.add(at(rb(w, 0.01, D - TH - 0.02, toon(0xffffff), 0.004, { outline: false }), 0, y1 - 0.005, 0.012));
    return g;
  };
  fridge.add(inner(FZ.y0 + TH - 0.01, FZ.y1), inner(FR.y0 + 0.01, FR.y1 - TH + 0.01));
  const shelf = (y) =>
    grp(
      at(rb(W - TH * 2 - 0.02, 0.018, D - 0.2, toon(C.glass, { transparent: true, opacity: 0.75 }), 0.008, { outline: false, shadow: false }), 0, y - 0.009, -0.05),
      at(rb(W - TH * 2 - 0.02, 0.03, 0.03, toon(0xffffff), 0.012), 0, y - 0.01, D / 2 - 0.17)
    );
  fridge.add(shelf(0.36), shelf(0.99), shelf(1.33));
  fridge.add(at(rb(W - TH * 2 - 0.04, 0.11, 0.025, toon(C.bin, { transparent: true, opacity: 0.55 }), 0.012), 0, FR.y0 + 0.065, 0.2));
  fridge.add(at(rb(0.2, 0.025, 0.03, toon(0xffffff), 0.01), 0, FR.y0 + 0.1, 0.225));
  const xs = [-0.3, -0.1, 0.1, 0.3];
  const zs = [0.12, -0.04, -0.2];
  const shelfSlots = (prefix, unit, y) => {
    let i = 0;
    zs.forEach((z) => xs.forEach((x) => addSlot(`${prefix}-${i++}`, unit, fridge, x, y, z, 0.19, 0.16)));
  };
  shelfSlots("fz-top", "fz", 0.37);
  shelfSlots("fz-bot", "fz", FZ.y0 + TH);
  shelfSlots("fr-top", "fr", 1.34);
  shelfSlots("fr-mid", "fr", 1.0);
  addSlot("fr-crisper-0", "fr", fridge, -0.18, FR.y0 + 0.02, -0.02, 0.34, 0.4);
  addSlot("fr-crisper-1", "fr", fridge, 0.18, FR.y0 + 0.02, -0.02, 0.34, 0.4);
  const frLight = new THREE.PointLight(0xfff3c4, 0, 1.6, 1.5);
  frLight.position.set(0, FR.y1 - 0.12, 0.15);
  const fzLight = new THREE.PointLight(0xcaf0ff, 0, 1.2, 1.5);
  fzLight.position.set(0, FZ.y1 - 0.08, 0.15);
  fridge.add(frLight, fzLight);

  const fridgeDoor = (unit, y0, h, light, binYs, handleLow) =>
    makeDoor(unit, fridge, -W / 2, y0, W, h, D / 2, -1, light, {
      build: (root, cx) => {
        root.add(at(rb(W, h, T, toon(C.body), 0.035, { thick: true }), cx, h / 2, T / 2));
        root.add(at(rb(0.03, h * 0.6, 0.004, toon(0xffffff, { transparent: true, opacity: 0.55 }), 0.002, { outline: false, shadow: false }), 0.12, h * 0.55, T + 0.002, 0, 0, 0.08));
        root.add(at(rb(0.012, h * 0.4, 0.004, toon(0xffffff, { transparent: true, opacity: 0.45 }), 0.002, { outline: false, shadow: false }), 0.18, h * 0.5, T + 0.002, 0, 0, 0.08));
        root.add(at(rb(W - 0.02, h - 0.02, 0.012, toon(C.gasket), 0.02, { outline: false }), cx, h / 2, -0.001));
        root.add(at(rb(W - 0.06, h - 0.06, 0.02, toon(C.liner), 0.02, { outline: false }), cx, h / 2, -0.008));
        const hLen = unit === "fr" ? 0.3 : 0.22;
        const hy = handleLow ? 0.08 + hLen / 2 : h - 0.08 - hLen / 2;
        root.add(at(cap(0.022, hLen, toon(C.handle), { thick: true }), W - 0.07, hy, T + 0.045));
        root.add(at(rb(0.03, 0.03, 0.05, toon(C.handle), 0.01), W - 0.07, hy - hLen / 2 + 0.02, T + 0.02));
        root.add(at(rb(0.03, 0.03, 0.05, toon(C.handle), 0.01), W - 0.07, hy + hLen / 2 - 0.02, T + 0.02));
        const binMat = toon(C.bin, { transparent: true, opacity: 0.8 });
        binYs.forEach((by, bi) => {
          root.add(at(rb(W - 0.1, 0.08, 0.02, binMat, 0.01), cx, by + 0.04, -0.13));
          root.add(at(rb(W - 0.1, 0.015, 0.13, binMat, 0.006, { outline: false }), cx, by, -0.07));
          [0.13, 0.29, 0.45, 0.61, 0.77].forEach((x, i) => addSlot(`${unit}d-${bi}-${i}`, unit, root, x, by + 0.008, -0.07, 0.15, 0.12, true));
        });
      }
    });
  doors.fr = fridgeDoor("fr", FR.y0, FR.y1 - FR.y0 + 0.02, frLight, [0.1, 0.36, 0.62, 0.88], true);
  doors.fz = fridgeDoor("fz", FZ.y0 - 0.01, FZ.y1 - FZ.y0 + 0.02, fzLight, [0.1, 0.33], false);
  const side = sensorPlane(D - 0.16, FR.y1 - 0.3);
  side.rotation.y = -Math.PI / 2;
  side.position.set(-W / 2 - 0.004, (FR.y1 + 0.2) / 2, 0);
  fridge.add(side);
  surfaces.set("side", { id: "side", sensor: side, hw: (D - 0.16) / 2 - 0.1, hh: (FR.y1 - 0.3) / 2 - 0.1 });
}

function buildPantry() {
  const p = new THREE.Group();
  world.add(p);
  const w = PT.x1 - PT.x0;
  const d = PT.z1 - PT.z0;
  const cx = (PT.x0 + PT.x1) / 2;
  const cz = (PT.z0 + PT.z1) / 2;
  const wood = toon(C.wood);
  const th = 0.04;
  p.add(at(rb(th, PT.y1 - 0.06, d, wood, 0.015, { thick: true }), PT.x0 + th / 2, (PT.y1 + 0.06) / 2, cz));
  p.add(at(rb(th, PT.y1 - 0.06, d, wood, 0.015, { thick: true }), PT.x1 - th / 2, (PT.y1 + 0.06) / 2, cz));
  p.add(at(rb(w + 0.06, 0.05, d + 0.05, toon(C.woodDark), 0.02, { thick: true }), cx, PT.y1 + 0.01, cz + 0.01));
  p.add(at(rb(w, 0.1, d, toon(C.woodDark), 0.02, { thick: true }), cx, 0.05, cz));
  p.add(at(rb(w - 0.02, PT.y1 - 0.1, 0.02, toon(C.woodIn), 0.01, { outline: false }), cx, (PT.y1 + 0.1) / 2, PT.z0 + 0.02));
  const levels = [0.1, 0.5, 0.9, 1.28];
  levels.slice(1).forEach((y) => p.add(at(rb(w - th * 2, 0.03, d - 0.06, toon(C.woodShelf), 0.01), cx, y - 0.015, cz - 0.02)));
  const xs = [-0.28, -0.095, 0.095, 0.28];
  levels.forEach((y, li) => {
    let i = 0;
    [0, -0.135, -0.27].forEach((z) => xs.forEach((x) => addSlot(`pt-${li}-${i++}`, "pt", p, cx + x, y + 0.002, z, 0.17, 0.13)));
  });
  const ptLight = new THREE.PointLight(0xffe2b0, 0, 1.6, 1.5);
  ptLight.position.set(cx, 1.45, 0.05);
  p.add(ptLight);
  doors.pt = makeDoor("pt", p, PT.x1, 0.1, w, PT.y1 - 0.1, PT.z1, 1, ptLight, {
    thick: 0.065,
    build: (root, ccx, dx) => {
      const h = PT.y1 - 0.1;
      root.add(at(rb(w, h, 0.05, wood, 0.03, { thick: true }), ccx, h / 2, 0.025));
      root.add(at(rb(w - 0.16, h - 0.2, 0.012, toon(0xf2c28a), 0.02), ccx, h / 2, 0.055));
      root.add(at(rb(w - 0.2, 0.012, 0.006, toon(0xffffff, { transparent: true, opacity: 0.35 }), 0.003, { outline: false, shadow: false }), ccx, h - 0.16, 0.063));
      root.add(at(sp(0.028, toon(0xffd23f), 1, 1, 0.8), dx * (w - 0.07), h * 0.52, 0.075));
      root.add(at(rb(w - 0.04, h - 0.04, 0.02, toon(C.woodIn), 0.02, { outline: false }), ccx, h / 2, -0.008));
    }
  });
}
buildFridge();
buildPantry();

const shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0x5a4f78, transparent: true, opacity: 0.16, depthWrite: false }));
shadowBlob.rotation.x = -Math.PI / 2;
shadowBlob.scale.set(1.25, 0.5, 1);
shadowBlob.position.set(0.25, 0.002, 0.02);
scene.add(shadowBlob);

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function bottleShape(body, capC, h, r, extra) {
  const g = new THREE.Group();
  g.add(at(cy(r, r * 1.05, h * 0.7, body), 0, h * 0.35, 0));
  g.add(at(sp(r, body, 1, 0.55, 1), 0, h * 0.7, 0));
  g.add(at(cy(r * 0.45, r * 0.5, h * 0.12, body), 0, h * 0.8, 0));
  g.add(at(cy(r * 0.55, r * 0.55, h * 0.1, capC), 0, h * 0.9, 0));
  if (extra) extra(g, h, r);
  return g;
}
function squeezeShape(body, capC, h = 0.2, r = 0.042) {
  return grp(at(cap(r, h * 0.45, body), 0, h * 0.45, 0), at(cy(r * 0.2, r * 0.75, h * 0.2, capC), 0, h * 0.95, 0), at(cy(r * 0.08, r * 0.14, h * 0.1, capC), 0, h * 1.08, 0));
}
function jarShape(body, lid, w = 0.12, h = 0.11) {
  return grp(at(rb(w, h, w, body, 0.03), 0, h / 2, 0), at(rb(w + 0.012, 0.03, w + 0.012, lid, 0.012), 0, h + 0.01, 0));
}
function tray(w, d, color) {
  return rb(w, 0.03, d, color, 0.012);
}
function canShape(band, h = 0.1, r = 0.05) {
  return grp(at(cy(r, r, h, 0xc9d3dc), 0, h / 2, 0), at(cy(r * 1.015, r * 1.015, h * 0.6, band, { outline: false }), 0, h / 2, 0), at(cy(r * 0.9, r * 0.9, 0.006, 0xaab6c2, { outline: false }), 0, h + 0.003, 0));
}

const MAKERS = {
  pork: (r) => {
    const g = grp(at(tray(0.18, 0.14, 0xffe07a), 0, 0.015, 0));
    for (let i = 0; i < 3; i++) {
      const slab = rb(0.15, 0.022, 0.1, 0xff8da1, 0.01);
      at(slab, (i - 1) * 0.008, 0.042 + i * 0.022, (i - 1) * 0.006, 0, (r() - 0.5) * 0.3, 0);
      slab.add(at(rb(0.152, 0.024, 0.022, 0xfff0f2, 0.01, { outline: false }), 0, 0, -0.025));
      g.add(slab);
    }
    return g;
  },
  chicken: (r) => {
    const leg = (x, z, ry) => grp(at(sp(0.055, 0xe89b52, 1.25, 0.85, 1), 0, 0.05, 0), at(cap(0.016, 0.07, 0xfff6e3), 0.085, 0.05, 0, 0, 0, Math.PI / 2), at(sp(0.02, 0xfff6e3), 0.13, 0.062, 0.014), at(sp(0.02, 0xfff6e3), 0.13, 0.04, -0.012));
    const g = grp(at(leg(), -0.04, 0, 0.02, 0, 0.4, 0), at(leg(), -0.02, 0, -0.03, 0, -0.5, 0));
    return g;
  },
  galbi: () => {
    const g = new THREE.Group();
    [0, 1].forEach((i) => {
      const p = cy(0.07, 0.072, 0.04, 0x7a4526);
      at(p, (i - 0.5) * 0.02, 0.025 + i * 0.045, (i - 0.5) * 0.015);
      if (i === 1) for (let k = -1; k <= 1; k++) p.add(at(rb(0.1, 0.006, 0.012, 0x3b1f10, 0.003, { outline: false }), 0, 0.022, k * 0.03, 0, 0.6, 0));
      g.add(p);
    });
    return g;
  },
  salmon: () => {
    const f = rb(0.17, 0.055, 0.1, 0xff8a5c, 0.022);
    at(f, 0, 0.034, 0, 0, 0.25, 0);
    for (let i = -1; i <= 1; i++) f.add(at(rb(0.012, 0.004, 0.1, 0xffe1d2, 0.002, { outline: false }), i * 0.045, 0.029, 0, 0, 0.5, 0));
    return grp(f);
  },
  mussel: () => {
    const g = new THREE.Group();
    [[-0.05, 0, 0.3], [0.04, 0.03, -0.5], [0, -0.05, 1.4]].forEach(([x, z, ry]) => {
      const shell = sp(0.05, 0x2f3657, 1, 0.38, 0.6);
      at(shell, x, 0.022, z, 0, ry, 0);
      shell.add(at(sp(0.036, 0xff9a3c, 1, 0.3, 0.5, { outline: false }), 0, 0.35, 0));
      g.add(shell);
    });
    return g;
  },
  curry: () => {
    const g = new THREE.Group();
    [-0.045, 0.045].forEach((x) => {
      const bowl = at(cy(0.05, 0.04, 0.05, 0xffffff), x, 0.025, 0);
      bowl.add(at(cy(0.045, 0.045, 0.008, 0xf2b01e, { outline: false }), 0, 0.026, 0));
      bowl.add(at(rb(0.016, 0.012, 0.016, 0xff7a1a, 0.004, { outline: false }), 0.012, 0.032, 0.01));
      g.add(bowl);
    });
    return g;
  },
  doenjangFrozen: (r) => {
    const g = grp(at(rb(0.15, 0.075, 0.12, 0x8a5a2e, 0.02), 0, 0.038, 0), at(rb(0.156, 0.022, 0.126, 0xe3f7ff, 0.01), 0, 0.078, 0));
    return g;
  },
  greens: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) g.add(at(sp(0.05, i % 2 ? 0x5cc24d : 0x7fd96a, 0.55, 0.16, 1.35), (i - 1.5) * 0.02, 0.02 + i * 0.012, -0.02, 0, (i - 1.5) * 0.35, 0));
    return g;
  },
  broccoli: () => {
    const g = grp(at(cy(0.025, 0.035, 0.08, 0x9ad66a), 0, 0.04, 0));
    [[0, 0.1, 0, 0.045], [-0.04, 0.085, 0.02, 0.035], [0.04, 0.085, -0.01, 0.036], [0.01, 0.08, 0.045, 0.032], [-0.02, 0.08, -0.04, 0.032]].forEach(([x, y, z, rr]) => g.add(at(sp(rr, 0x3d9e3d), x, y, z)));
    return g;
  },
  carrot: (r) => {
    const g = grp(at(cy(0.075, 0.058, 0.045, 0xffffff), 0, 0.023, 0));
    for (let i = 0; i < 8; i++) g.add(at(rb(0.03, 0.03, 0.03, 0xff8a1f, 0.006), (r() - 0.5) * 0.08, 0.055 + r() * 0.025, (r() - 0.5) * 0.08, r(), r(), r()));
    return g;
  },
  scallion: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const stalk = at(cap(0.013, 0.15, 0x56c257), 0, 0.015 + (i % 2) * 0.018, (i - 1.5) * 0.026, 0, 0, Math.PI / 2);
      stalk.add(at(sp(0.015, 0xf2fbe8, 1, 1.4, 1, { outline: false }), 0, -0.085, 0));
      g.add(stalk);
    }
    g.add(at(cy(0.058, 0.058, 0.02, 0xff5a5a, {}, 20), 0.02, 0.025, 0, 0, 0, Math.PI / 2));
    return g;
  },
  pepper: () => {
    const g = new THREE.Group();
    [[-0.02, 0.35], [0.03, -0.3]].forEach(([z, ry]) => {
      const body = at(cy(0.006, 0.024, 0.15, 0xe53935), 0, 0.024, z, 0, ry, Math.PI / 2 + 0.15);
      body.add(at(cy(0.006, 0.01, 0.03, 0x3c9a3c), 0, -0.085, 0));
      g.add(body);
    });
    return g;
  },
  garlic: () => {
    const g = grp(at(sp(0.055, 0xfff4e0, 1, 0.9, 1), 0, 0.05, 0), at(cy(0.004, 0.02, 0.04, 0xf0dcb8), 0, 0.11, 0));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(at(sp(0.028, 0xfbe8cc, 0.8, 1.2, 0.8, { outline: false }), Math.cos(a) * 0.04, 0.05, Math.sin(a) * 0.04));
    }
    return g;
  },
  tomatoJuice: () =>
    bottleShape(0xe53935, 0x3aa845, 0.27, 0.05, (g, h, r) => {
      g.add(at(cy(r * 1.02, r * 1.07, h * 0.28, 0xfff6e8, { outline: false }), 0, h * 0.34, 0));
      g.add(at(sp(0.022, 0xff4d3d, 1, 0.9, 1), 0, h * 0.34, r + 0.012));
    }),
  cabbage: () => {
    const g = grp(at(sp(0.11, 0x92d050, 1, 0.9, 1, { thick: true }), 0, 0.1, 0), at(cy(0.02, 0.028, 0.02, 0xe6f7c7), 0, 0.195, 0));
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.114, 20, 12, i * 1.25, 1.5, 0.5, 1.7), toon(0xc6ee8a, { side: THREE.DoubleSide }));
      leaf.castShadow = true;
      leaf.scale.set(1, 0.9, 1);
      g.add(at(leaf, 0, 0.1, 0));
    }
    return g;
  },
  eggs: () => {
    const g = grp(at(rb(0.19, 0.045, 0.14, 0xf5d69a, 0.015), 0, 0.023, 0));
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.add(at(sp(0.026, 0xfff8ec, 1, 1.28, 1), -0.055 + i * 0.055, 0.075, -0.032 + j * 0.064));
    return g;
  },
  perillaKimchi: (r) => {
    const g = grp(at(rb(0.16, 0.05, 0.13, 0xffffff, 0.015), 0, 0.025, 0));
    for (let i = 0; i < 4; i++) g.add(at(sp(0.06, i % 2 ? 0x2e6b31 : 0x3a7d3a, 1, 0.13, 0.8), (r() - 0.5) * 0.02, 0.056 + i * 0.01, (r() - 0.5) * 0.02, 0, r() * 3, 0));
    for (let i = 0; i < 6; i++) g.add(at(sp(0.006, 0xe8452a, 1, 1, 1, { outline: false }), (r() - 0.5) * 0.09, 0.1, (r() - 0.5) * 0.07));
    return g;
  },
  youngRadishKimchi: (r) => {
    const g = grp(at(cy(0.068, 0.064, 0.13, 0xeafaff), 0, 0.065, 0), at(cy(0.062, 0.062, 0.01, 0xe8633a, { outline: false }), 0, 0.126, 0));
    for (let i = 0; i < 4; i++) g.add(at(cap(0.01, 0.07, i % 2 ? 0x6cc04a : 0x4fa83a), (r() - 0.5) * 0.06, 0.16, (r() - 0.5) * 0.05, (r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6));
    return g;
  },
  radishKimchi: (r) => {
    const g = grp(at(rb(0.15, 0.05, 0.13, 0xffffff, 0.015), 0, 0.025, 0));
    for (let i = 0; i < 9; i++) g.add(at(rb(0.032, 0.032, 0.032, i % 3 ? 0xffc6a8 : 0xff7b54, 0.007), (r() - 0.5) * 0.1, 0.066 + r() * 0.02, (r() - 0.5) * 0.08, r(), r(), r()));
    return g;
  },
  doenjang: () => grp(at(cy(0.075, 0.068, 0.1, 0xa35a2c), 0, 0.05, 0), at(cy(0.08, 0.08, 0.026, 0xffb74d), 0, 0.11, 0)),
  soy: () => bottleShape(0x3b2016, 0xe53935, 0.27, 0.042),
  chamsauce: () => bottleShape(0xc47a2c, 0xffd23f, 0.22, 0.048),
  oyster: () => bottleShape(0x2b2626, 0xe53935, 0.19, 0.05, (g, h, r) => g.add(at(cy(r * 1.03, r * 1.08, h * 0.2, 0xffd23f, { outline: false }), 0, h * 0.33, 0))),
  vinegar: () => bottleShape(0xf6f0c8, 0x46b04c, 0.26, 0.04),
  sugar: () => jarShape(0xffffff, 0x4aa3ff, 0.1, 0.13),
  salt: () => grp(at(cy(0.036, 0.04, 0.12, 0xffffff), 0, 0.06, 0), at(sp(0.037, 0xb8c4cf, 1, 0.6, 1), 0, 0.12, 0)),
  chili: () => jarShape(0xe53935, 0x8e1c1c, 0.095, 0.12),
  sesameOil: () => bottleShape(0xd8a23a, 0x2a2a2a, 0.27, 0.034),
  gochujang: () => jarShape(0xd32f2f, 0x7f1818, 0.13, 0.09),
  ketchup: () => squeezeShape(0xe53935, 0xffffff),
  mayo: () => squeezeShape(0xfff0bf, 0xe53935),
  oligo: () => squeezeShape(0xf0b33a, 0x8a5a2b, 0.18),
  pasta: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rr = i < 6 ? 0.012 : 0.024;
      g.add(at(cy(0.005, 0.005, 0.26, 0xf2c14e, { outline: false }, 8), 0, 0.03 + Math.sin(a) * rr, Math.cos(a) * rr, 0, 0, Math.PI / 2));
    }
    g.add(at(cy(0.034, 0.034, 0.1, 0x3b82f6), 0, 0.03, 0, 0, 0, Math.PI / 2));
    g.rotation.y = 0.4;
    return g;
  },
  tuna: () => grp(at(canShape(0x2f80ed, 0.05, 0.05), 0, 0, 0), at(canShape(0x2f80ed, 0.05, 0.05), 0.01, 0.05, 0.005)),
  gim: () => grp(at(rb(0.17, 0.035, 0.12, 0x1f3b2c, 0.012), 0, 0.018, 0), at(rb(0.1, 0.037, 0.06, 0x2d5a42, 0.01, { outline: false }), 0, 0.019, 0), at(rb(0.172, 0.037, 0.02, 0xffc93c, 0.006, { outline: false }), 0, 0.019, 0.04)),
  gimjaban: () => grp(at(rb(0.12, 0.17, 0.05, 0xff9f1c, 0.03), 0, 0.085, 0), at(rb(0.13, 0.03, 0.07, 0xff9f1c, 0.012), 0, 0.015, 0), at(rb(0.07, 0.06, 0.052, 0x2d2a26, 0.012, { outline: false }), 0, 0.085, 0.001), at(rb(0.122, 0.014, 0.052, 0x3aa845, 0.005, { outline: false }), 0, 0.15, 0.001)),
  cookingOil: () => bottleShape(0xffd45a, 0xe53935, 0.32, 0.046),
  oliveOil: () => bottleShape(0x3f6b2a, 0xd4a017, 0.33, 0.036, (g, h, r) => g.add(at(cy(r * 1.03, r * 1.08, h * 0.22, 0xfff3d6, { outline: false }), 0, h * 0.35, 0)))
};

function contentShape(g, type, color, o, r) {
  const { y, w, d, round } = o;
  if (type === "liquid") g.add(at(round ? cy(w / 2, w / 2, 0.02, color, { outline: false }) : rb(w, 0.02, d, color, 0.006, { outline: false }), 0, y + 0.01, 0));
  else if (type === "powder") {
    g.add(at(sp(w / 2, color, 1, 0.35, d / w), 0, y + 0.01, 0));
    for (let i = 0; i < 5; i++) g.add(at(sp(0.006, 0xffffff, 1, 1, 1, { outline: false }), (r() - 0.5) * w * 0.6, y + 0.03, (r() - 0.5) * d * 0.6));
  } else if (type === "chunks") for (let i = 0; i < 6; i++) g.add(at(sp(0.024, color, 1, 0.75, 1), (r() - 0.5) * w * 0.7, y + 0.02, (r() - 0.5) * d * 0.7));
  else if (type === "cubes") for (let i = 0; i < 7; i++) g.add(at(rb(0.03, 0.03, 0.03, color, 0.007), (r() - 0.5) * w * 0.7, y + 0.02 + r() * 0.02, (r() - 0.5) * d * 0.7, r(), r(), r()));
  else if (type === "leaves") for (let i = 0; i < 4; i++) g.add(at(sp(0.05, i % 2 ? color : new THREE.Color(color).offsetHSL(0, 0, 0.1).getHex(), 0.55, 0.15, 1.2), (i - 1.5) * 0.02, y + 0.015 + i * 0.01, 0, 0, (i - 1.5) * 0.4, 0));
  else if (type === "balls") for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.add(at(sp(0.022, color), -w * 0.3 + i * w * 0.3, y + 0.022, -d * 0.2 + j * d * 0.4));
  else if (type === "noodles") {
    for (let i = 0; i < 10; i++) g.add(at(cy(0.004, 0.004, w * 0.95, color, { outline: false }, 8), 0, y + 0.01 + (i % 3) * 0.008, (i - 4.5) * 0.008, 0, 0, Math.PI / 2));
  } else if (type === "slices") for (let i = 0; i < 3; i++) g.add(at(rb(w * 0.85, 0.018, d * 0.7, color, 0.008), (i - 1) * 0.008, y + 0.012 + i * 0.018, (i - 1) * 0.006, 0, (r() - 0.5) * 0.3, 0));
  else if (type === "whole") {
    const rr = Math.min(w, d) * 0.5;
    g.add(at(sp(rr, color, 1, 0.9, 1), 0, y + rr * 0.9, 0));
    g.add(at(cy(0.005, 0.009, 0.03, 0x3c9a3c), 0, y + rr * 1.8 + 0.01, 0));
  }
}
const CONTAINERS = {
  none: { label: "그대로", build: (g, c, f, ct, r) => contentShape(g, ct === "none" ? "whole" : ct, f, { y: 0, w: 0.15, d: 0.13, round: true }, r) },
  zipbag: {
    label: "지퍼백",
    build: (g, c, f, ct, r) => {
      contentShape(g, ct, f, { y: 0.008, w: 0.12, d: 0.1 }, r);
      g.add(at(rb(0.17, 0.06, 0.14, toon(c, { transparent: true, opacity: 0.55 }), 0.025), 0, 0.03, 0));
      g.add(at(rb(0.172, 0.012, 0.02, 0xffffff, 0.005, { outline: false }), 0, 0.055, -0.05));
    }
  },
  vinyl: { label: "비닐봉지", build: (g, c) => g.add(at(sp(0.075, c, 1, 0.8, 1), 0, 0.06, 0), at(sp(0.02, c), 0, 0.125, 0), at(cap(0.01, 0.03, c), -0.02, 0.145, 0, 0, 0, 0.7), at(cap(0.01, 0.03, c), 0.02, 0.145, 0, 0, 0, -0.7)) },
  tub: {
    label: "사각통",
    build: (g, c, f, ct, r) => {
      contentShape(g, ct, f, { y: 0.008, w: 0.14, d: 0.11 }, r);
      g.add(at(rb(0.16, 0.07, 0.13, toon(0xf7fbff, { transparent: true, opacity: 0.6 }), 0.02), 0, 0.035, 0), at(rb(0.166, 0.02, 0.136, c, 0.01), 0, 0.078, 0));
    }
  },
  round: {
    label: "원형통",
    build: (g, c, f, ct, r) => {
      contentShape(g, ct, f, { y: 0.008, w: 0.12, d: 0.12, round: true }, r);
      g.add(at(cy(0.07, 0.065, 0.08, toon(0xf7fbff, { transparent: true, opacity: 0.6 })), 0, 0.04, 0), at(cy(0.075, 0.075, 0.02, c), 0, 0.09, 0));
    }
  },
  jar: {
    label: "유리병",
    build: (g, c, f, ct, r) => {
      if (ct !== "none") g.add(at(cy(0.048, 0.048, 0.08, f, { outline: false }), 0, 0.045, 0));
      g.add(at(cy(0.055, 0.055, 0.12, toon(0xe8f7ff, { transparent: true, opacity: 0.4 })), 0, 0.06, 0), at(cy(0.058, 0.058, 0.025, c), 0, 0.133, 0));
    }
  },
  bottle: { label: "병", build: (g, c, f, ct) => g.add(bottleShape(ct === "liquid" ? f : c, ct === "liquid" ? c : 0x333333, 0.26, 0.045)) },
  squeeze: { label: "짜는 병", build: (g, c, f) => g.add(squeezeShape(c, f === c ? 0xffffff : f)) },
  can: { label: "캔", build: (g, c) => g.add(canShape(c)) },
  carton: {
    label: "종이팩",
    build: (g, c) => g.add(at(rb(0.09, 0.16, 0.09, c, 0.01), 0, 0.08, 0), at(rb(0.092, 0.012, 0.092, 0xffffff, 0.004, { outline: false }), 0, 0.12, 0), at(rb(0.09, 0.035, 0.05, c, 0.01), 0, 0.175, 0, 0.0), at(cy(0.012, 0.012, 0.02, 0xffffff), 0.02, 0.19, 0.02))
  },
  pouch: { label: "파우치", build: (g, c) => g.add(at(rb(0.13, 0.16, 0.05, c, 0.03), 0, 0.08, 0), at(rb(0.14, 0.03, 0.07, c, 0.012), 0, 0.015, 0), at(rb(0.132, 0.012, 0.052, 0xffffff, 0.005, { outline: false }), 0, 0.14, 0.001)) },
  sachet: {
    label: "일회용 봉지",
    build: (g, c, f, ct, r) => {
      for (let i = 0; i < 3; i++) {
        const s = rb(0.07, 0.012, 0.05, c, 0.006);
        at(s, (i - 1) * 0.02, 0.006 + i * 0.012, (i - 1) * 0.012, 0, (i - 1) * 0.35, 0);
        [-0.03, 0.03].forEach((x) => s.add(at(rb(0.01, 0.013, 0.052, new THREE.Color(c).offsetHSL(0, 0, -0.15).getHex(), 0.003, { outline: false }), x, 0, 0)));
        g.add(s);
      }
    }
  },
  tray: {
    label: "트레이",
    build: (g, c, f, ct, r) => {
      g.add(at(tray(0.18, 0.14, c), 0, 0.015, 0));
      contentShape(g, ct, f, { y: 0.03, w: 0.15, d: 0.11 }, r);
      g.add(at(rb(0.182, 0.05, 0.142, toon(0xffffff, { transparent: true, opacity: 0.2 }), 0.01, { outline: false, shadow: false }), 0, 0.04, 0));
    }
  },
  plate: {
    label: "접시",
    build: (g, c, f, ct, r) => {
      g.add(at(cy(0.09, 0.07, 0.025, c), 0, 0.012, 0));
      contentShape(g, ct, f, { y: 0.025, w: 0.12, d: 0.12, round: true }, r);
    }
  },
  box: { label: "상자", build: (g, c) => g.add(at(rb(0.16, 0.1, 0.12, c, 0.012), 0, 0.05, 0), at(rb(0.162, 0.012, 0.03, 0xffffff, 0.004, { outline: false }), 0, 0.1, 0)) },
  tube: { label: "튜브", build: (g, c, f) => g.add(at(cap(0.025, 0.12, c), 0, 0.026, 0, 0, 0, Math.PI / 2), at(cy(0.016, 0.02, 0.03, f === c ? 0xffffff : f), 0.1, 0.026, 0, 0, 0, Math.PI / 2)) }
};
const CONTENTS = { none: "없음", liquid: "액체", powder: "가루", chunks: "덩어리", cubes: "큐브", leaves: "잎채소", balls: "동그란 것", noodles: "면", slices: "슬라이스", whole: "통째로" };
const SIZES = { s: 0.75, m: 1, l: 1.25 };
function buildDesign(it) {
  const inner = new THREE.Group();
  const r = rng(hash(it.id || "preview"));
  if (it.kind === "custom" && it.design) {
    const d = it.design;
    (CONTAINERS[d.container] || CONTAINERS.zipbag).build(inner, hex(d.cColor), hex(d.fColor), d.content || "none", r);
    inner.scale.setScalar(SIZES[d.size] || 1);
  } else {
    const maker = MAKERS[it.kind];
    if (maker) inner.add(maker(r));
    else CONTAINERS.zipbag.build(inner, 0xffffff, 0xff9f43, "chunks", r);
  }
  return inner;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function dayNum(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86400000;
}
function daysLeft(it) {
  return it.expiry ? dayNum(it.expiry) - dayNum(today()) : null;
}
function daysSince(it) {
  return it.added ? dayNum(today()) - dayNum(it.added) : null;
}
function alertLevel(it) {
  const left = daysLeft(it);
  if (left === null) return 0;
  if (left < 0) return 2;
  if (left <= 2) return 1;
  return 0;
}
function addDays(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function initialItems() {
  const L = Array.isArray(SEED) ? SEED : [];
  const t = today();
  return L.map(([name, qty, kind, slot, design, expiry], i) => {
    const it = { id: slot.startsWith("pt") ? `p${i + 1}` : `i${i + 1}`, name, qty, kind, slot, added: t, expiry: expiry || "" };
    if (design) it.design = design;
    return it;
  });
}
function blankState() {
  return { items: initialItems(), memos: [], next: 1000, updated: 0 };
}
function loadState() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || "null");
    if (s && Array.isArray(s.items) && Array.isArray(s.memos)) return s;
  } catch (e) {}
  try {
    const old = JSON.parse(localStorage.getItem("fridge-toon-v1") || "null");
    if (old && Array.isArray(old.items)) {
      const s = blankState();
      const legacy = { customBag: ["zipbag", "chunks"], customTub: ["tub", "chunks"], customBottle: ["bottle", "liquid"], customVeg: ["none", "whole"], customMeat: ["tray", "slices"] };
      const pantry = s.items.filter((it) => it.slot.startsWith("pt"));
      s.items = old.items.map((it) => {
        const n = { added: today(), expiry: "", ...it };
        if (legacy[it.kind]) {
          const [container, content] = legacy[it.kind];
          const c = it.color || "#ff9f43";
          n.kind = "custom";
          n.design = { container, content, cColor: container === "none" || container === "bottle" ? c : "#ffffff", fColor: c, size: "m" };
          delete n.color;
        }
        return n;
      }).concat(pantry);
      s.memos = old.memos || [];
      s.next = Math.max(old.next || 1000, 1000);
      return s;
    }
  } catch (e) {}
  return null;
}
let state = loadState() || blankState();
function reseed(ask) {
  const n = (Array.isArray(SEED) ? SEED : []).length;
  if (!n) return 0;
  if (ask && !confirm(`재료 목록을 새로 심습니다 (${n}개).\n앱에서 직접 넣거나 지운 내용과 클라우드 데이터는 덮어써집니다.\n계속할까요?`)) return 0;
  const memos = state.memos || [];
  state = blankState();
  state.memos = memos;
  state.updated = Date.now();
  return state.items.length;
}
if (new URLSearchParams(location.search).has("reseed")) {
  if (reseed(true)) {
    try {
      history.replaceState(null, "", location.pathname);
    } catch (e) {}
  }
}
function save(fromRemote) {
  if (!fromRemote) state.updated = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {}
  if (!fromRemote) Sync.schedulePush();
}

const itemObjs = new Map();
const memoObjs = new Map();
function setOutline(root, mat) {
  root.traverse((o) => {
    if (o.userData.outline && o.material !== OUT_THICK) o.material = mat;
  });
}
function buildItem(it) {
  const pivot = grp(buildDesign(it));
  const root = grp(pivot);
  const alert = makeAlert(0.085);
  alert.position.set(0.07, 0.17, 0.09);
  root.add(alert);
  const tag = makeAlert(0.095);
  tag.position.set(-0.07, 0.16, 0.09);
  root.add(tag);
  root.userData = { kind: "item", id: it.id, pivot, alert, tag, price: null, level: 0, unit: String(it.slot).slice(0, 2), wob: 0, bounce: 0, lift: 0, liftT: 0 };
  return root;
}
function placeItem(obj, slotId, instant) {
  const s = slots.get(slotId);
  if (!s) return false;
  s.parent.attach(obj);
  obj.userData.tPos = s.pos.clone();
  obj.userData.tQuat = new THREE.Quaternion();
  if (instant) {
    obj.position.copy(s.pos);
    obj.quaternion.identity();
  }
  return true;
}
function takenSlots(except) {
  return new Set(state.items.filter((i) => i.id !== except).map((i) => i.slot));
}
function firstFree(test) {
  const taken = takenSlots();
  for (const id of slots.keys()) if (!taken.has(id) && test(id)) return id;
  return null;
}
function rebuildItems() {
  itemObjs.forEach((o) => o.parent && o.parent.remove(o));
  itemObjs.clear();
  const used = new Set();
  state.items.forEach((it) => {
    if (!slots.has(it.slot) || used.has(it.slot)) {
      const unit = String(it.slot || "fr").slice(0, 2);
      it.slot = [...slots.keys()].find((id) => id.startsWith(unit) && !used.has(id)) || null;
    }
    if (!it.slot) return;
    used.add(it.slot);
    const o = buildItem(it);
    itemObjs.set(it.id, o);
    placeItem(o, it.slot, true);
  });
  state.items = state.items.filter((i) => i.slot);
}

const PAPER = { yellow: "#ffe45c", pink: "#ff9ec0", sky: "#8fd3ff", green: "#a6ec7a" };
const MAGNET = { yellow: 0xff5a5a, pink: 0x5a8dff, sky: 0xffb020, green: 0xa45cff };
function memoTexture(text, color) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = PAPER[color] || PAPER.yellow;
  g.beginPath();
  g.roundRect(8, 8, 496, 496, 36);
  g.fill();
  g.lineWidth = 14;
  g.strokeStyle = "#2a2135";
  g.stroke();
  g.fillStyle = "#2a2135";
  g.font = "800 50px Pretendard, 'Malgun Gothic', sans-serif";
  g.textBaseline = "top";
  const lines = [];
  String(text || "").split("\n").forEach((para) => {
    let line = "";
    for (const ch of para) {
      if (g.measureText(line + ch).width > 420) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    lines.push(line);
  });
  lines.slice(0, 7).forEach((ln, i) => g.fillText(ln, 46, 60 + i * 60));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function buildMemo(m) {
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), new THREE.MeshBasicMaterial({ map: memoTexture(m.text, m.color), transparent: true }));
  const magnet = at(cy(0.024, 0.028, 0.02, MAGNET[m.color] || MAGNET.yellow), 0, 0.088, 0.012, Math.PI / 2, 0, 0);
  const pivot = grp(paper, magnet);
  const root = grp(pivot);
  root.rotation.z = m.tilt || 0;
  root.userData = { kind: "memo", id: m.id, pivot, slap: 0, wob: 0 };
  return root;
}
function placeMemo(obj, m) {
  const s = surfaces.get(m.surface) || surfaces.get("door-fr");
  s.sensor.add(obj);
  obj.position.set(THREE.MathUtils.clamp(m.x, -s.hw, s.hw), THREE.MathUtils.clamp(m.y, -s.hh, s.hh), 0.004);
}
function rebuildMemos() {
  memoObjs.forEach((o) => o.parent && o.parent.remove(o));
  memoObjs.clear();
  state.memos.forEach((m) => {
    const o = buildMemo(m);
    memoObjs.set(m.id, o);
    placeMemo(o, m);
  });
}

const fx = [];
const sparkleGeo = (() => {
  const s = new THREE.Shape();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rr = i % 2 ? 0.012 : 0.04;
    if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  s.closePath();
  return new THREE.ShapeGeometry(s);
})();
const puffGeo = new THREE.SphereGeometry(1, 14, 10);
function spawnPuff(pos, color, n, o = {}) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshToonMaterial({ color, gradientMap: gradient, transparent: true, opacity: o.opacity ?? 0.95 }));
    m.scale.setScalar(0.001);
    m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * (o.spread ?? 0.1), Math.random() * 0.04, (Math.random() - 0.5) * (o.spread ?? 0.1)));
    scene.add(m);
    const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, (o.up ?? 0.8) * (0.5 + Math.random()), Math.random() * (o.forward ?? 0.6)).multiplyScalar(o.speed ?? 0.45);
    fx.push({ m, vel: v, life: 0, max: (o.life ?? 0.8) * (0.7 + Math.random() * 0.6), base: (o.size ?? 0.04) * (0.6 + Math.random() * 0.8), kind: "puff", drag: o.drag ?? 2.4 });
  }
}
function spawnSparkles(pos, n, color = 0xffd21f, silent) {
  if (!silent) SFX.sparkle();
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(sparkleGeo, new THREE.MeshBasicMaterial({ color, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    m.position.copy(pos);
    m.lookAt(camera.position);
    scene.add(m);
    const a = Math.random() * Math.PI * 2;
    fx.push({ m, vel: new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.8 + 0.4, 0.3).multiplyScalar(0.6 + Math.random() * 0.6), life: 0, max: 0.6 + Math.random() * 0.3, base: 0.8 + Math.random() * 0.8, kind: "spark", spin: (Math.random() - 0.5) * 12, drag: 3 });
  }
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.life += dt;
    const k = f.life / f.max;
    f.m.position.addScaledVector(f.vel, dt);
    f.vel.multiplyScalar(Math.max(0, 1 - f.drag * dt));
    if (f.kind === "puff") {
      f.m.scale.setScalar(Math.max(0.001, f.base * (k < 0.3 ? k / 0.3 : 1 + (k - 0.3) * 0.8)));
      f.m.material.opacity = Math.max(0, 1 - Math.max(0, k - 0.45) / 0.55);
    } else {
      f.m.scale.setScalar(Math.max(0.001, f.base * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8)));
      f.m.rotation.z += f.spin * dt;
      f.m.material.opacity = 1 - k * 0.6;
    }
    if (k >= 1) {
      scene.remove(f.m);
      f.m.material.dispose();
      fx.splice(i, 1);
    }
  }
}

const Sync = {
  session: null,
  timer: null,
  busy: false,
  status: "off",
  init() {
    if (!SYNC_ON) return;
    try {
      this.session = JSON.parse(localStorage.getItem("fridge-session") || "null");
    } catch (e) {}
    if (this.session) {
      this.setStatus("on");
      this.pull(true);
    }
    setInterval(() => this.session && this.pull(false), 30000);
    document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && this.session && this.pull(false));
  },
  setStatus(s, msg) {
    this.status = s;
    const el = $("syncState");
    if (el) el.textContent = msg || { off: "로그인 안 됨", on: "동기화 중", err: "연결 실패" }[s];
    document.body.dataset.sync = s;
  },
  async auth(path, body) {
    const res = await fetch(`${SYNC.url}/auth/v1/${path}`, { method: "POST", headers: { apikey: SYNC.key, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const raw = String(json.error_description || json.msg || json.message || "");
      const known = [
        [/invalid login credentials/i, "이메일이나 비밀번호가 달라요. 아직 가입 전이면 '처음이면 가입'을 먼저 눌러 주세요"],
        [/email not confirmed/i, "메일함에서 가입 확인 링크를 먼저 눌러 주세요"],
        [/already registered|already exists/i, "이미 가입된 이메일이에요. 로그인을 눌러 주세요"],
        [/at least 6|password should/i, "비밀번호는 6자 이상이어야 해요"],
        [/rate limit/i, "메일 보내기 한도에 걸렸어요. 잠시 뒤에 다시 해 주세요"],
        [/signups not allowed|signup is disabled/i, "새 가입이 꺼져 있어요"],
        [/invalid.*email|email.*invalid|not authorized/i, "이 이메일로는 가입 메일을 보낼 수 없어요"]
      ].find(([re]) => re.test(raw));
      throw new Error(known ? known[1] : raw || `오류 ${res.status}`);
    }
    return json;
  },
  keep(json) {
    this.session = { access: json.access_token, refresh: json.refresh_token, user: json.user && json.user.id, email: json.user && json.user.email, exp: Date.now() + (json.expires_in || 3600) * 1000 };
    try {
      localStorage.setItem("fridge-session", JSON.stringify(this.session));
    } catch (e) {}
  },
  async login(email, password, signup) {
    if (signup) {
      const j = await this.auth("signup", { email, password });
      if (!j.access_token) throw new Error("가입 확인 메일을 확인한 뒤 로그인해 주세요");
      this.keep(j);
    } else this.keep(await this.auth("token?grant_type=password", { email, password }));
    this.setStatus("on");
    await this.pull(true);
  },
  logout() {
    this.session = null;
    try {
      localStorage.removeItem("fridge-session");
    } catch (e) {}
    this.setStatus("off");
  },
  async token() {
    if (this.session && Date.now() > this.session.exp - 60000) {
      try {
        this.keep(await this.auth("token?grant_type=refresh_token", { refresh_token: this.session.refresh }));
      } catch (e) {
        this.logout();
        throw e;
      }
    }
    return this.session.access;
  },
  async rest(method, query, body) {
    const tk = await this.token();
    const res = await fetch(`${SYNC.url}/rest/v1/fridge_state${query}`, {
      method,
      headers: { apikey: SYNC.key, Authorization: `Bearer ${tk}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
      body: body ? JSON.stringify(body) : undefined
    });
    if (!res.ok) throw new Error(`저장소 오류 ${res.status}`);
    return method === "GET" ? res.json() : null;
  },
  async pull(first) {
    if (!this.session || this.busy || drag.mode || document.querySelector("dialog[open]")) return;
    this.busy = true;
    try {
      const rows = await this.rest("GET", `?select=data,updated_at&user_id=eq.${this.session.user}`);
      const remote = rows[0];
      if (remote && remote.updated_at > (state.updated || 0)) {
        state = remote.data;
        save(true);
        rebuildItems();
        rebuildMemos();
        updateHud();
      } else if (!remote || (first && (state.updated || 0) > remote.updated_at)) {
        await this.push();
      }
      this.setStatus("on");
    } catch (e) {
      this.setStatus("err", e.message);
    } finally {
      this.busy = false;
    }
  },
  schedulePush() {
    if (!SYNC_ON || !this.session) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push().catch((e) => this.setStatus("err", e.message)), 900);
  },
  async push() {
    if (!this.session) return;
    await this.rest("POST", "", { user_id: this.session.user, data: state, updated_at: state.updated || Date.now() });
    this.setStatus("on");
  }
};

rebuildItems();
rebuildMemos();
save(true);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const tip = $("tip");
function setPointer(e) {
  const r = renderer.domElement.getBoundingClientRect();
  pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
}
function rootOf(o) {
  while (o) {
    if (o.userData && o.userData.kind) return o;
    o = o.parent;
  }
  return null;
}
function pick() {
  raycaster.layers.set(0);
  for (const h of raycaster.intersectObjects(world.children.concat([...memoObjs.values()]), true)) {
    if (h.object.userData.outline || h.object.isSprite) continue;
    const r = rootOf(h.object);
    const k = r ? r.userData.kind : null;
    if (k === "item" || k === "memo") return { hit: h, root: r };
    if (h.object.material && h.object.material.transparent) continue;
    return { hit: h, root: r };
  }
  return null;
}
function sensorPick(filter) {
  raycaster.layers.set(SENSOR);
  for (const h of raycaster.intersectObjects(sensors.concat([floorSensor]), false)) if (filter(h.object)) return h;
  return null;
}
function reachable(slotId) {
  const s = slots.get(slotId);
  return !!s && doors[s.unit].angle > 1.1;
}
function floorDrop(p) {
  return p.z > 0.5 || p.x < -0.6 || p.x > 1.5;
}
const itemById = (id) => state.items.find((i) => i.id === id);

const drag = { mode: null, sx: 0, sy: 0, lx: 0, ly: 0, moved: false, obj: null, id: null, prev: null, over: null, dist: 0, target: null, tQuat: null, vx: 0, door: null, a0: 0, lt: 0 };
let hovered = null;
let lastMemoTap = { id: null, t: 0 };
const el = renderer.domElement;

el.addEventListener("pointerdown", (e) => {
  actx();
  el.setPointerCapture(e.pointerId);
  setPointer(e);
  hideHint();
  Object.assign(drag, { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, lt: performance.now(), vx: 0 });
  const p = pick();
  const kind = p && p.root ? p.root.userData.kind : null;
  if (kind === "item") {
    const it = itemById(p.root.userData.id);
    if (it && reachable(it.slot)) {
      Object.assign(drag, { mode: "item", obj: p.root, id: it.id, prev: it.slot, over: null, dist: p.hit.distance, target: null, tQuat: null });
      scene.attach(p.root);
      p.root.userData.dragging = true;
      p.root.userData.bounce = 1;
      setOutline(p.root, OUT_HOT);
      tip.hidden = true;
      el.style.cursor = "grabbing";
      SFX.pick();
      return;
    }
  }
  if (kind === "memo") {
    Object.assign(drag, { mode: "memo", obj: p.root, id: p.root.userData.id, over: null });
    p.root.userData.lifted = true;
    el.style.cursor = "grabbing";
    SFX.pick();
    return;
  }
  if (kind === "door") {
    Object.assign(drag, { mode: "door", door: doors[p.root.userData.unit] });
    drag.a0 = drag.door.angle;
    drag.door.dragging = true;
    return;
  }
  drag.mode = "pan";
});

el.addEventListener("pointermove", (e) => {
  setPointer(e);
  const dx = e.clientX - drag.sx;
  const dy = e.clientY - drag.sy;
  if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
  const now = performance.now();
  if (drag.mode === "pan") {
    cam.ty = THREE.MathUtils.clamp(cam.ty + (e.clientY - drag.ly) * 0.004, cam.minY, cam.maxY);
    cam.tx = THREE.MathUtils.clamp(cam.tx - (e.clientX - drag.lx) * 0.004, cam.minX, cam.maxX);
  } else if (drag.mode === "door") {
    drag.vx = (e.clientX - drag.lx) / Math.max(1, now - drag.lt);
    const dd = drag.door;
    dd.angle = THREE.MathUtils.clamp(drag.a0 + dd.sign * dx * 0.006, 0, OPEN);
    dd.target = dd.angle;
  } else if (drag.mode === "item") {
    const hit = sensorPick((o) => o === floorSensor || (o.userData.slotId && reachable(o.userData.slotId) && !takenSlots(drag.id).has(o.userData.slotId)));
    let over = null;
    if (hit && hit.object !== floorSensor) over = hit.object.userData.slotId;
    else if (hit && floorDrop(hit.point)) over = "floor";
    if (over !== drag.over && over && over !== "floor") SFX.hover();
    drag.over = over;
    if (over && over !== "floor") {
      const s = slots.get(over);
      drag.target = s.parent.localToWorld(s.pos.clone()).add(new THREE.Vector3(0, 0.05, 0));
      drag.tQuat = s.parent.getWorldQuaternion(new THREE.Quaternion());
    } else {
      drag.target = raycaster.ray.at(Math.min(drag.dist, 3), new THREE.Vector3());
      if (drag.target.y < 0.05) drag.target.y = 0.05;
      drag.tQuat = null;
    }
    dropRing.visible = over === "floor";
    if (over === "floor") dropRing.position.set(hit.point.x, 0.004, hit.point.z);
    drag.vx = (e.clientX - drag.lx) / Math.max(1, now - drag.lt);
  } else if (drag.mode === "memo") {
    const hit = sensorPick((o) => o === floorSensor || [...surfaces.values()].some((s) => s.sensor === o));
    if (hit && hit.object !== floorSensor) {
      const s = [...surfaces.values()].find((x) => x.sensor === hit.object);
      if (drag.obj.parent !== s.sensor) s.sensor.add(drag.obj);
      const local = s.sensor.worldToLocal(hit.point.clone());
      drag.obj.position.set(THREE.MathUtils.clamp(local.x, -s.hw, s.hw), THREE.MathUtils.clamp(local.y, -s.hh, s.hh), 0.004);
      drag.over = s.id;
      dropRing.visible = false;
    } else if (hit && floorDrop(hit.point)) {
      drag.over = "floor";
      dropRing.visible = true;
      dropRing.position.set(hit.point.x, 0.004, hit.point.z);
    }
  } else hover(e);
  drag.lx = e.clientX;
  drag.ly = e.clientY;
  drag.lt = now;
});

function endPointer() {
  const mode = drag.mode;
  drag.mode = null;
  el.style.cursor = "";
  dropRing.visible = false;
  if (mode === "door") {
    const d = drag.door;
    d.dragging = false;
    const sv = d.sign * drag.vx;
    if (!drag.moved) d.target = d.angle > 0.6 ? 0 : OPEN;
    else if (sv > 0.35) d.target = OPEN;
    else if (sv < -0.35) d.target = 0;
    else d.target = d.angle > 0.8 ? OPEN : 0;
  } else if (mode === "item") {
    const it = itemById(drag.id);
    const o = drag.obj;
    o.userData.dragging = false;
    setOutline(o, OUT);
    if (!drag.moved) {
      placeItem(o, drag.prev, false);
      openCard(it);
      return;
    }
    if (drag.over === "floor") eatItem(it, o);
    else {
      const dest = drag.over || drag.prev;
      it.slot = dest;
      o.userData.unit = dest.slice(0, 2);
      placeItem(o, dest, false);
      o.userData.bounce = 1;
      SFX.drop();
      if (drag.over && drag.over !== drag.prev) setTimeout(() => spawnSparkles(o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.08, 0.05)), 5, 0xffd21f, true), 120);
      save();
    }
    updateHud();
  } else if (mode === "memo") {
    const m = state.memos.find((x) => x.id === drag.id);
    const o = drag.obj;
    o.userData.lifted = false;
    if (!m) return;
    if (drag.over === "floor") tossMemo(m, o);
    else {
      if (drag.over) m.surface = drag.over;
      m.x = o.position.x;
      m.y = o.position.y;
      o.userData.slap = 1;
      SFX.slap();
      if (!drag.moved) {
        const now = performance.now();
        if (lastMemoTap.id === m.id && now - lastMemoTap.t < 420) {
          lastMemoTap = { id: null, t: 0 };
          openMemo(m);
        } else lastMemoTap = { id: m.id, t: now };
      }
      save();
    }
  }
}
el.addEventListener("pointerup", endPointer);
el.addEventListener("pointercancel", endPointer);

function itemTipText(it) {
  const parts = [it.qty ? `${it.name} · ${it.qty}` : it.name];
  const left = daysLeft(it);
  if (left !== null) parts.push(left < 0 ? `유통기한 ${-left}일 지남` : left === 0 ? "오늘까지" : `D-${left}`);
  return parts.join("  ");
}
function hover(e) {
  const p = pick();
  const kind = p && p.root ? p.root.userData.kind : null;
  let cursor = "";
  let text = null;
  let hot = null;
  if (kind === "item") {
    const it = itemById(p.root.userData.id);
    if (it && reachable(it.slot)) {
      cursor = "grab";
      text = itemTipText(it);
      hot = p.root;
    }
  } else if (kind === "memo") {
    cursor = "grab";
    text = "두 번 누르면 고치기";
    hot = p.root;
  } else if (kind === "door") cursor = "pointer";
  if (hovered !== hot) {
    if (hovered && hovered.userData.kind === "item") {
      hovered.userData.liftT = 0;
      setOutline(hovered, OUT);
    }
    if (hot) {
      hot.userData.wob = 1;
      SFX.hover();
      if (hot.userData.kind === "item") {
        hot.userData.liftT = 0.02;
        setOutline(hot, OUT_HOT);
      }
    }
    hovered = hot;
  }
  el.style.cursor = cursor;
  if (text) {
    tip.textContent = text;
    tip.hidden = false;
    tip.style.left = e.clientX + "px";
    tip.style.top = e.clientY - 18 + "px";
  } else tip.hidden = true;
}
el.addEventListener("pointerleave", () => (tip.hidden = true));
el.addEventListener("wheel", (e) => {
  e.preventDefault();
  hideHint();
  if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) cam.tx = THREE.MathUtils.clamp(cam.tx + (e.deltaX || e.deltaY) * 0.0012, cam.minX, cam.maxX);
  else cam.ty = THREE.MathUtils.clamp(cam.ty - e.deltaY * 0.0012, cam.minY, cam.maxY);
}, { passive: false });
window.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("dialog,input,textarea,select")) return;
  if (e.key === "ArrowUp") cam.ty = Math.min(cam.maxY, cam.ty + 0.12);
  if (e.key === "ArrowDown") cam.ty = Math.max(cam.minY, cam.ty - 0.12);
  if (e.key === "ArrowLeft") cam.tx = Math.max(cam.minX, cam.tx - 0.15);
  if (e.key === "ArrowRight") cam.tx = Math.min(cam.maxX, cam.tx + 0.15);
});

let undo = null;
function eatItem(it, o) {
  const pos = o.getWorldPosition(new THREE.Vector3());
  spawnPuff(pos, 0xffffff, 12, { size: 0.05, spread: 0.12, up: 0.6, speed: 0.5, forward: 0.4 });
  spawnSparkles(pos.clone().add(new THREE.Vector3(0, 0.1, 0)), 6, 0xffd21f, true);
  SFX.poof();
  if (o.parent !== scene) scene.attach(o);
  o.userData.dying = 1;
  itemObjs.delete(it.id);
  state.items = state.items.filter((x) => x !== it);
  undo = { type: "item", data: { ...it } };
  save();
  updateHud();
  toast(`${it.name} 다 먹었어요`, true);
}
function tossMemo(m, o) {
  spawnPuff(o.getWorldPosition(new THREE.Vector3()), 0xffffff, 8, { size: 0.04 });
  SFX.poof();
  o.parent.remove(o);
  memoObjs.delete(m.id);
  state.memos = state.memos.filter((x) => x !== m);
  undo = { type: "memo", data: { ...m } };
  save();
  toast("메모를 버렸어요", true);
}
$("undo").addEventListener("click", () => {
  if (!undo) return;
  SFX.undo();
  if (undo.type === "item") {
    const it = undo.data;
    if (takenSlots().has(it.slot)) it.slot = firstFree((id) => id.startsWith(it.slot.slice(0, 2)));
    if (it.slot) {
      state.items.push(it);
      const o = buildItem(it);
      itemObjs.set(it.id, o);
      placeItem(o, it.slot, true);
      o.userData.bounce = 1;
      doors[slots.get(it.slot).unit].target = OPEN;
    }
  } else {
    const m = undo.data;
    state.memos.push(m);
    const o = buildMemo(m);
    memoObjs.set(m.id, o);
    placeMemo(o, m);
    o.userData.slap = 1;
  }
  undo = null;
  $("toast").classList.remove("show");
  save();
  updateHud();
});
let toastTimer;
function toast(msg, withUndo) {
  $("toastText").textContent = msg;
  $("undo").hidden = !withUndo;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("toast").classList.remove("show");
    if (withUndo) undo = null;
  }, withUndo ? 4500 : 1700);
}
let hintGone = false;
function hideHint() {
  if (hintGone) return;
  hintGone = true;
  setTimeout(() => $("hint").classList.add("gone"), 2200);
}

const AREAS = {
  "fr-top": "냉장실 윗칸", "fr-mid": "냉장실 가운데칸", "fr-crisper": "채소칸",
  "frd-2": "냉장실 문 위", "frd-1": "냉장실 문 가운데", "frd-0": "냉장실 문 아래",
  "fz-top": "냉동실 윗칸", "fz-bot": "냉동실 아랫칸", "fzd-1": "냉동실 문 위", "fzd-0": "냉동실 문 아래",
  "pt-3": "실온 장 맨 위", "pt-2": "실온 장 위", "pt-1": "실온 장 가운데", "pt-0": "실온 장 아래"
};
const areaOf = (slot) => slot.replace(/-\d+$/, "");
let sortMode = "area";
function badge(it) {
  const left = daysLeft(it);
  if (left !== null) {
    if (left < 0) return `<em class="bad">지남</em>`;
    if (left <= 2) return `<em class="soon">D-${left}</em>`;
    return `<em>D-${left}</em>`;
  }
  const since = daysSince(it);
  if (since !== null && since >= 14) return `<em class="old">${since}일</em>`;
  return "";
}
function chip(i) {
  return `<button data-find="${i.id}">${esc(i.name)}${badge(i)}</button>`;
}
function updateHud() {
  $("countFr").textContent = state.items.filter((i) => i.slot.startsWith("fr")).length;
  $("countFz").textContent = state.items.filter((i) => i.slot.startsWith("fz")).length;
  $("countPt").textContent = state.items.filter((i) => i.slot.startsWith("pt")).length;
  const q = $("search").value.trim();
  const list = state.items.filter((i) => !q || i.name.includes(q));
  let html = "";
  if (sortMode === "area") {
    Object.keys(AREAS).forEach((a) => {
      const g = list.filter((i) => areaOf(i.slot) === a);
      if (g.length) html += `<section><h3>${AREAS[a]}</h3><div class="chips">${g.map(chip).join("")}</div></section>`;
    });
  } else if (sortMode === "expiry") {
    const withExp = list.filter((i) => i.expiry).sort((a, b) => dayNum(a.expiry) - dayNum(b.expiry));
    html += withExp.length ? `<section><h3>유통기한 가까운 순</h3><div class="chips">${withExp.map(chip).join("")}</div></section>` : "";
    const rest = list.filter((i) => !i.expiry);
    if (rest.length) html += `<section><h3>유통기한 안 적음</h3><div class="chips">${rest.map(chip).join("")}</div></section>`;
  } else {
    const sorted = list.slice().sort((a, b) => (dayNum(a.added) ?? 1e9) - (dayNum(b.added) ?? 1e9));
    html += `<section><h3>오래 넣어둔 순</h3><div class="chips">${sorted.map(chip).join("")}</div></section>`;
  }
  $("list").innerHTML = html || `<p class="empty">없어요</p>`;
  const lv = { fr: 0, fz: 0, pt: 0 };
  state.items.forEach((i) => {
    const u = i.slot.slice(0, 2);
    lv[u] = Math.max(lv[u], alertLevel(i));
  });
  Object.entries(doors).forEach(([u, d]) => {
    d.alertLevel = lv[u];
    d.alert.visible = lv[u] > 0;
    d.alert.material.map = lv[u] === 2 ? ALERT_TEX.bad : ALERT_TEX.soon;
  });
  itemObjs.forEach((o, id) => {
    const it = itemById(id);
    const l = it ? alertLevel(it) : 0;
    o.userData.level = l;
    o.userData.alert.material.map = l === 2 ? ALERT_TEX.bad : ALERT_TEX.soon;
  });
  const bad = state.items.filter((i) => alertLevel(i) === 2).length;
  const soon = state.items.filter((i) => alertLevel(i) === 1).length;
  $("alertBadge").hidden = !(bad || soon);
  $("alertBadge").textContent = bad ? `지남 ${bad}` : `임박 ${soon}`;
  $("alertBadge").className = bad ? "badge bad" : "badge soon";
  updatePrices();
}
function updatePrices() {
  let good = 0;
  let dear = 0;
  itemObjs.forEach((o, id) => {
    const it = itemById(id);
    const q = it ? itemQuote(it) : null;
    const level = q && q.level !== "none" ? q.level : null;
    o.userData.price = level;
    if (level) o.userData.tag.material.map = PRICE_TEX[level];
    if (level === "good") good++;
    if (level === "bad") dear++;
  });
  const b = $("priceBadge");
  b.hidden = !(good || dear);
  b.innerHTML = `<i style="background:${LEVEL.good.color}"></i>싸요 <b>${good}</b> <i style="background:${LEVEL.bad.color}"></i>비싸요 <b>${dear}</b>`;
}
const shop = createShop({
  getItems: () => state.items,
  getBuys: () => state.buys || [],
  removeBuy: (id) => {
    state.buys = (state.buys || []).filter((b) => b.id !== id);
    save();
  },
  onRegionChange: () => updatePrices()
});
$("btnShop").addEventListener("click", () => {
  SFX.click();
  shop.open();
});
$("priceBadge").addEventListener("click", () => shop.open("fridge"));
loadPrices().then(() => updatePrices());
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}
$("search").addEventListener("input", updateHud);
$("sortTabs").addEventListener("click", (e) => {
  const b = e.target.closest("[data-sort]");
  if (!b) return;
  sortMode = b.dataset.sort;
  document.querySelectorAll("#sortTabs button").forEach((x) => x.classList.toggle("sel", x === b));
  SFX.click();
  updateHud();
});
function focusItem(it) {
  const s = slots.get(it.slot);
  doors[s.unit].target = OPEN;
  cam.tx = s.unit === "pt" ? 0.9 : -0.2;
  cam.ty = THREE.MathUtils.clamp(s.unit === "fz" ? 0.55 : s.unit === "pt" ? s.pos.y + 0.25 : s.onDoor ? 1.1 : s.pos.y + 0.1, cam.minY, cam.maxY);
  const o = itemObjs.get(it.id);
  if (o) {
    o.userData.wob = 1.6;
    setTimeout(() => spawnSparkles(o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0.05)), 8), 380);
  }
}
$("list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-find]");
  if (!b) return;
  const it = itemById(b.dataset.find);
  if (!it) return;
  focusItem(it);
  if (window.innerWidth < 760) $("panel").classList.remove("open");
});
$("btnList").addEventListener("click", () => {
  SFX.click();
  $("panel").classList.toggle("open");
});
$("alertBadge").addEventListener("click", () => {
  sortMode = "expiry";
  document.querySelectorAll("#sortTabs button").forEach((x) => x.classList.toggle("sel", x.dataset.sort === "expiry"));
  $("panel").classList.add("open");
  updateHud();
});

function swatch(containerId, attr, value) {
  document.querySelectorAll(`#${containerId} [data-${attr}]`).forEach((b) => b.classList.toggle("sel", b.dataset[attr] === value));
}
function bindPicker(id, attr, onPick) {
  $(id).addEventListener("click", (e) => {
    const b = e.target.closest(`[data-${attr}]`);
    if (!b) return;
    SFX.click();
    onPick(b.dataset[attr]);
    swatch(id, attr, b.dataset[attr]);
  });
}

const memoDlg = $("memoDlg");
let editingMemo = null;
let memoColor = "yellow";
bindPicker("memoColors", "color", (v) => (memoColor = v));
function openMemo(m) {
  editingMemo = m || null;
  memoColor = m ? m.color : "yellow";
  $("memoText").value = m ? m.text : "";
  $("memoTitle").textContent = m ? "메모 고치기" : "메모 쓰기";
  $("memoRemove").hidden = !m;
  memoDlg.returnValue = "";
  swatch("memoColors", "color", memoColor);
  memoDlg.showModal();
  setTimeout(() => $("memoText").focus(), 40);
}
$("btnMemo").addEventListener("click", () => {
  SFX.click();
  openMemo(null);
});
$("memoRemove").addEventListener("click", () => {
  if (!editingMemo) return;
  const o = memoObjs.get(editingMemo.id);
  memoDlg.close("cancel");
  if (o) tossMemo(editingMemo, o);
});
memoDlg.addEventListener("close", () => {
  if (memoDlg.returnValue !== "ok") return;
  const text = $("memoText").value.trim();
  if (!text) return;
  if (editingMemo) {
    editingMemo.text = text;
    editingMemo.color = memoColor;
    const old = memoObjs.get(editingMemo.id);
    const parent = old.parent;
    const pos = old.position.clone();
    parent.remove(old);
    const o = buildMemo(editingMemo);
    parent.add(o);
    o.position.copy(pos);
    o.userData.slap = 1;
    memoObjs.set(editingMemo.id, o);
  } else {
    const n = state.memos.filter((x) => x.surface === "door-fr").length;
    const m = { id: `m${state.next++}`, text, color: memoColor, surface: "door-fr", x: -0.12 + (n % 3) * 0.12, y: 0.22 - Math.floor(n / 3) * 0.24, tilt: (Math.random() - 0.5) * 0.16 };
    state.memos.push(m);
    const o = buildMemo(m);
    memoObjs.set(m.id, o);
    placeMemo(o, m);
    o.userData.slap = 1;
    doors.fr.target = 0;
    cam.tx = 0;
    cam.ty = 1.2;
    setTimeout(() => {
      SFX.slap();
      spawnSparkles(o.getWorldPosition(new THREE.Vector3()), 8);
    }, 250);
  }
  save();
});

const cardDlg = $("cardDlg");
let cardItem = null;
function openCard(it) {
  if (!it) return;
  cardItem = it;
  SFX.click();
  $("cardName").textContent = it.name;
  $("cardQty").textContent = it.qty || "";
  $("cardQty").hidden = !it.qty;
  const since = daysSince(it);
  $("cardAdded").textContent = it.added ? `${it.added.replace(/-/g, ".")} 넣음 · ${since === 0 ? "오늘" : `${since}일 전`}` : "넣은 날짜 모름";
  const left = daysLeft(it);
  $("cardExpiry").textContent = left === null ? "유통기한 안 적음" : left < 0 ? `유통기한 ${-left}일 지났어요` : left === 0 ? "오늘까지예요" : `유통기한 D-${left} (${it.expiry.replace(/-/g, ".")})`;
  $("cardExpiry").className = "line " + (left === null ? "" : left < 0 ? "bad" : left <= 2 ? "soon" : "");
  $("cardArea").textContent = AREAS[areaOf(it.slot)] || "";
  const pq = itemQuote(it);
  const cp = $("cardPrice");
  cp.hidden = !pq || pq.level === "none";
  if (pq && pq.level !== "none") {
    cp.innerHTML = `<i class="pdot" style="background:${LEVEL[pq.level].color}"></i><b>${esc(pq.food.name)}</b> 오늘 ${won(pq.now)} · ${esc(pq.vsNormal != null ? "평년보다 " + pct(pq.vsNormal) : "")}<br><small>눌러서 대체 재료 · 지역 비교 보기</small>`;
    cp.onclick = () => {
      cardDlg.close();
      shop.openFood(pq.food.id);
    };
  }
  cardDlg.returnValue = "";
  cardDlg.showModal();
  Preview.show($("cardPreview"), it);
}
cardDlg.addEventListener("close", () => {
  Preview.hide();
  const v = cardDlg.returnValue;
  if (!cardItem) return;
  if (v === "edit") openEditor(cardItem);
  if (v === "eat") {
    const o = itemObjs.get(cardItem.id);
    if (o) eatItem(cardItem, o);
  }
});

const addDlg = $("addDlg");
const draft = { container: "zipbag", cColor: "#dff3ff", content: "chunks", fColor: "#ff8da1", size: "m", useDesign: true };
let editingItem = null;
bindPicker("pickContainer", "v", (v) => {
  draft.container = v;
  draft.useDesign = true;
  refreshPreview();
});
bindPicker("pickCColor", "color", (v) => {
  draft.cColor = v;
  draft.useDesign = true;
  refreshPreview();
});
bindPicker("pickContent", "v", (v) => {
  draft.content = v;
  draft.useDesign = true;
  refreshPreview();
});
bindPicker("pickFColor", "color", (v) => {
  draft.fColor = v;
  draft.useDesign = true;
  refreshPreview();
});
bindPicker("pickSize", "v", (v) => {
  draft.size = v;
  draft.useDesign = true;
  refreshPreview();
});
bindPicker("pickExpiry", "v", (v) => {
  $("addExpiry").value = v === "none" ? "" : addDays(Number(v));
});
$("keepShape").addEventListener("click", () => {
  draft.useDesign = false;
  SFX.click();
  refreshPreview();
});
function draftItem() {
  if (editingItem && !draft.useDesign) return { ...editingItem };
  return { id: editingItem ? editingItem.id : "preview", kind: "custom", design: { container: draft.container, cColor: draft.cColor, content: draft.content, fColor: draft.fColor, size: draft.size } };
}
function refreshPreview() {
  ["pickContainer", "pickContent", "pickSize"].forEach((id, i) => swatch(id, "v", [draft.container, draft.content, draft.size][i]));
  swatch("pickCColor", "color", draft.cColor);
  swatch("pickFColor", "color", draft.fColor);
  $("keepShape").hidden = !(editingItem && editingItem.kind !== "custom");
  $("keepShape").classList.toggle("sel", !!editingItem && !draft.useDesign);
  Preview.show($("addPreview"), draftItem());
}
function openEditor(it) {
  editingItem = it || null;
  $("addTitle").textContent = it ? "재료 고치기" : "재료 넣기";
  $("addOk").textContent = it ? "고치기" : "넣기";
  $("addName").value = it ? it.name : "";
  $("addQty").value = it ? it.qty || "" : "";
  $("addDate").value = it && it.added ? it.added : today();
  $("addExpiry").value = it && it.expiry ? it.expiry : "";
  $("whereRow").hidden = !!it;
  $("addPaid").value = "";
  $("addLog").checked = true;
  refreshPriceHint();
  addDlg.returnValue = "";
  swatch("pickExpiry", "v", "");
  if (it && it.kind === "custom" && it.design) Object.assign(draft, it.design, { useDesign: true });
  else draft.useDesign = !it;
  addDlg.showModal();
  refreshPreview();
  if (!it) setTimeout(() => $("addName").focus(), 40);
}
function addMatch() {
  if (editingItem) return null;
  const f = matchFood($("addName").value.trim());
  if (!f) return null;
  const q = quote(f, currentRegion());
  return q.level === "none" ? null : { f, q };
}
function refreshPriceHint() {
  const m = addMatch();
  $("addPriceRow").hidden = !m;
  if (!m) return;
  const { f, q } = m;
  $("addPriceHint").innerHTML = "";
  const dot = document.createElement("i");
  dot.className = "pdot";
  dot.style.background = LEVEL[q.level].color;
  const b = document.createElement("b");
  b.textContent = ` ${f.name} 오늘 ${won(q.now)}`;
  const rest = document.createElement("span");
  rest.textContent = `${q.unit && !f.name.includes(q.unit) ? ` (${q.unit})` : ""} · ${advice(q)} · ${verdict(q)}`;
  $("addPriceHint").append(dot, b, rest);
}
$("addName").addEventListener("input", refreshPriceHint);
$("btnAdd").addEventListener("click", () => {
  SFX.click();
  openEditor(null);
});
addDlg.addEventListener("close", () => {
  Preview.hide();
  if (addDlg.returnValue !== "ok") return;
  const name = $("addName").value.trim();
  if (!name) return;
  const fields = { name, qty: $("addQty").value.trim(), added: $("addDate").value || today(), expiry: $("addExpiry").value || "" };
  const design = { container: draft.container, cColor: draft.cColor, content: draft.content, fColor: draft.fColor, size: draft.size };
  if (editingItem) {
    Object.assign(editingItem, fields);
    if (draft.useDesign) Object.assign(editingItem, { kind: "custom", design });
    const old = itemObjs.get(editingItem.id);
    if (old && old.parent) old.parent.remove(old);
    const o = buildItem(editingItem);
    itemObjs.set(editingItem.id, o);
    placeItem(o, editingItem.slot, true);
    o.scale.setScalar(0.01);
    o.userData.popIn = 1;
    setTimeout(() => spawnSparkles(o.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.1, 0.05)), 7), 250);
    save();
    updateHud();
    toast(`${name} 고쳤어요`);
    return;
  }
  const where = document.querySelector('input[name="where"]:checked').value;
  const slotId = firstFree((id) => (where.endsWith("d") ? id.startsWith(where + "-") : id.startsWith(where + "-") && !slots.get(id).onDoor));
  if (!slotId) {
    toast("거기는 자리가 없어요");
    return;
  }
  const it = { id: `i${state.next++}`, ...fields, kind: "custom", design, slot: slotId };
  state.items.push(it);
  const m = addMatch();
  if (m && $("addLog").checked) {
    state.buys = state.buys || [];
    state.buys.push(makeBuy({
      id: `b${state.next++}`,
      date: fields.added,
      food: m.f,
      name,
      q: m.q,
      paid: Number($("addPaid").value) || 0,
      regionName: regionNames()[m.q.region] || ""
    }));
  }
  const o = buildItem(it);
  itemObjs.set(it.id, o);
  placeItem(o, slotId, true);
  o.scale.setScalar(0.01);
  o.userData.popIn = 1;
  focusItem(it);
  save();
  updateHud();
  toast(`${name} 넣었어요`);
});

const Preview = {
  renderer: null,
  scene: null,
  camera: null,
  holder: null,
  obj: null,
  raf: 0,
  ensure() {
    if (this.renderer) return;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    const s = addLights(this.scene);
    this.scene.add(s);
    this.camera = new THREE.PerspectiveCamera(30, 1.6, 0.01, 10);
    this.camera.position.set(0, 0.32, 0.72);
    this.camera.lookAt(0, 0.09, 0);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 40), toon(0xfff1c9));
    base.position.y = -0.01;
    this.scene.add(outline(base));
  },
  show(holder, it) {
    this.ensure();
    if (this.holder !== holder) {
      holder.appendChild(this.renderer.domElement);
      this.holder = holder;
    }
    const w = holder.clientWidth || 300;
    const h = holder.clientHeight || 170;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.obj) this.scene.remove(this.obj);
    const ry = this.obj ? this.obj.rotation.y : 0.6;
    this.obj = grp(buildDesign(it));
    this.obj.rotation.y = ry;
    this.obj.userData.pop = 1;
    this.scene.add(this.obj);
    if (!this.raf) this.loop();
  },
  loop() {
    this.raf = requestAnimationFrame(() => this.loop());
    if (!this.obj) return;
    this.obj.rotation.y += 0.012;
    const u = this.obj.userData;
    if (u.pop > 0) {
      u.pop = Math.max(0, u.pop - 0.06);
      const b = Math.sin((1 - u.pop) * Math.PI * 2.5) * u.pop * 0.2;
      this.obj.scale.set(1 + b * 0.6, 1 - b, 1 + b * 0.6);
    }
    this.renderer.render(this.scene, this.camera);
  },
  hide() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
};

function fillPickers() {
  $("pickContainer").innerHTML = Object.entries(CONTAINERS).map(([k, v]) => `<button type="button" data-v="${k}">${v.label}</button>`).join("");
  $("pickContent").innerHTML = Object.entries(CONTENTS).map(([k, v]) => `<button type="button" data-v="${k}">${v}</button>`).join("");
  const cols = ["#ffffff", "#dff3ff", "#ff5a5a", "#ff9f43", "#ffd23f", "#6bd46b", "#5ec8ff", "#a78bfa", "#ff9ec0", "#9b6b43", "#c9d3dc", "#2d2a26"];
  const fcols = ["#ff8da1", "#e53935", "#7a4526", "#ff8a1f", "#ffd23f", "#f2c14e", "#6bd46b", "#2e6b31", "#fff4e0", "#e9d6c2", "#3b2016", "#8b5cf6"];
  $("pickCColor").innerHTML = cols.map((c) => `<button type="button" data-color="${c}" style="background:${c}"></button>`).join("");
  $("pickFColor").innerHTML = fcols.map((c) => `<button type="button" data-color="${c}" style="background:${c}"></button>`).join("");
}
fillPickers();

$("btnReset").addEventListener("click", () => {
  if (!confirm("처음 정리한 상태로 되돌릴까요? 옮기거나 추가한 재료와 메모가 사라져요.")) return;
  state = blankState();
  rebuildItems();
  rebuildMemos();
  save();
  updateHud();
});
function syncMuteButton() {
  $("btnSound").classList.toggle("off", AUDIO.muted);
  $("btnSound").title = AUDIO.muted ? "소리 켜기" : "소리 끄기";
}
$("btnSound").addEventListener("click", () => {
  AUDIO.muted = !AUDIO.muted;
  try {
    localStorage.setItem("fridge-muted", AUDIO.muted ? "1" : "0");
  } catch (e) {}
  syncMuteButton();
  SFX.click();
});
syncMuteButton();

const syncDlg = $("syncDlg");
$("btnSync").addEventListener("click", () => {
  SFX.click();
  $("syncSetup").hidden = SYNC_ON;
  $("syncLogin").hidden = !SYNC_ON || !!Sync.session;
  $("syncDone").hidden = !SYNC_ON || !Sync.session;
  if (Sync.session) $("syncEmail").textContent = Sync.session.email || "";
  $("syncMsg").textContent = "";
  syncDlg.returnValue = "";
  syncDlg.showModal();
});
async function doLogin(signup) {
  $("syncMsg").textContent = signup ? "가입하는 중..." : "로그인하는 중...";
  try {
    await Sync.login($("syncId").value.trim(), $("syncPw").value, signup);
    $("syncMsg").textContent = "";
    syncDlg.close();
    toast("동기화를 켰어요");
    spawnSparkles(new THREE.Vector3(cam.x, cam.y + 0.3, 0.6), 10);
  } catch (e) {
    $("syncMsg").textContent = e.message;
  }
}
$("syncLoginBtn").addEventListener("click", () => doLogin(false));
$("syncSignupBtn").addEventListener("click", () => doLogin(true));
$("syncLogoutBtn").addEventListener("click", () => {
  Sync.logout();
  syncDlg.close();
  toast("로그아웃했어요");
});
Sync.init();
if (!SYNC_ON) document.body.dataset.sync = "none";

const clock = new THREE.Clock();
const tmp = new THREE.Vector3();
let elapsed = 0;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  cam.y += (cam.ty - cam.y) * Math.min(1, dt * 8);
  cam.x += (cam.tx - cam.x) * Math.min(1, dt * 8);
  placeCamera();
  Object.values(doors).forEach((d) => {
    if (!d.dragging) {
      d.vel += ((d.target - d.angle) * 95 - d.vel * 9) * dt;
      d.angle += d.vel * dt;
      if (d.angle < 0) {
        d.angle = 0;
        if (Math.abs(d.vel) > 0.6) SFX.close();
        d.vel = -d.vel * 0.25;
      }
    }
    d.pivot.rotation.y = d.sign * d.angle;
    const open = THREE.MathUtils.clamp(d.angle / 0.6, 0, 1);
    d.light.intensity = open * (d.unit === "fz" ? 0.6 : 0.8);
    const isOpen = d.angle > 0.5;
    if (isOpen && !d.wasOpen) {
      if (d.unit === "fz") {
        SFX.freezerOpen();
        spawnPuff(new THREE.Vector3(0, 0.34, D / 2 + 0.05), 0xdff6ff, 18, { size: 0.07, spread: W * 0.8, up: 0.15, speed: 0.55, forward: 1.2, life: 1.3, opacity: 0.85, drag: 1.6 });
      } else if (d.unit === "fr") {
        SFX.fridgeOpen();
        spawnSparkles(new THREE.Vector3(0, 1.2, D / 2 + 0.05), 7, 0xfff3a0, true);
      } else {
        SFX.pantryOpen();
        spawnSparkles(new THREE.Vector3((PT.x0 + PT.x1) / 2, 1.0, PT.z1 + 0.05), 5, 0xffe0a0, true);
      }
    }
    d.wasOpen = isOpen;
    if (d.alert.visible) {
      d.alert.position.y = d.alert.userData.baseY ?? (d.alert.userData.baseY = d.alert.position.y);
      d.alert.position.y = d.alert.userData.baseY + Math.abs(Math.sin(elapsed * 4)) * 0.03;
      d.alert.material.opacity = d.angle > 0.15 ? 0 : 1;
    }
  });
  itemObjs.forEach((o) => {
    const u = o.userData;
    if (u.dragging) {
      if (drag.target) o.position.lerp(drag.target, 0.3);
      if (drag.tQuat) o.quaternion.slerp(drag.tQuat, 0.25);
      u.pivot.rotation.z += (THREE.MathUtils.clamp(-drag.vx * 0.35, -0.5, 0.5) - u.pivot.rotation.z) * 0.2;
      u.pivot.position.y = 0.02 + Math.sin(elapsed * 14) * 0.006;
    } else {
      u.lift += (u.liftT - u.lift) * 0.25;
      if (u.tPos) {
        tmp.copy(u.tPos);
        tmp.y += u.lift;
        o.position.lerp(tmp, 0.28);
        o.quaternion.slerp(u.tQuat, 0.28);
      }
      u.pivot.rotation.z *= 0.8;
      u.pivot.position.y *= 0.8;
    }
    if (u.wob > 0) {
      u.wob = Math.max(0, u.wob - dt * 2.2);
      u.pivot.rotation.z += Math.sin(elapsed * 32) * 0.05 * u.wob;
      u.pivot.rotation.x = Math.sin(elapsed * 27) * 0.03 * u.wob;
    }
    u.alert.visible = u.level > 0 && !u.dragging && !!doors[u.unit] && doors[u.unit].angle > 0.9;
    u.tag.visible = !!u.price && !u.dragging && !!doors[u.unit] && doors[u.unit].angle > 0.9;
    if (u.tag.visible) u.tag.position.y = 0.16 + Math.abs(Math.sin(elapsed * 3 + o.id * 1.7)) * 0.012;
    if (u.alert.visible) u.alert.position.y = 0.17 + Math.abs(Math.sin(elapsed * 5 + o.id)) * 0.02;
    let sx = 1;
    let sy = 1;
    if (u.bounce > 0) {
      u.bounce = Math.max(0, u.bounce - dt * 2.6);
      const b = Math.sin((1 - u.bounce) * Math.PI * 3) * u.bounce * 0.22;
      sy = 1 - b;
      sx = 1 + b * 0.6;
    }
    if (u.popIn) {
      u.popIn = Math.max(0, u.popIn - dt * 2.5);
      const k = 1 - u.popIn;
      o.scale.setScalar(Math.max(0.01, k < 0.7 ? (k / 0.7) * 1.2 : 1.2 - ((k - 0.7) / 0.3) * 0.2));
    } else if (!u.dying) o.scale.set(sx, sy, sx);
  });
  memoObjs.forEach((o) => {
    const u = o.userData;
    if (u.slap > 0) {
      u.slap = Math.max(0, u.slap - dt * 3);
      const s = 1 + Math.sin((1 - u.slap) * Math.PI * 2.5) * u.slap * 0.25;
      u.pivot.scale.set(s, 2 - s, 1);
    } else u.pivot.scale.set(1, 1, 1);
    u.pivot.position.z = u.lifted ? 0.03 : 0;
    if (u.wob > 0) {
      u.wob = Math.max(0, u.wob - dt * 2.5);
      u.pivot.rotation.z = Math.sin(elapsed * 26) * 0.08 * u.wob;
    } else u.pivot.rotation.z = u.lifted ? Math.sin(elapsed * 10) * 0.05 : u.pivot.rotation.z * 0.8;
  });
  scene.children.slice().forEach((c) => {
    if (c.userData && c.userData.dying) {
      c.userData.dying -= dt * 3.5;
      c.scale.setScalar(Math.max(0.001, c.userData.dying));
      c.rotation.y += dt * 12;
      if (c.userData.dying <= 0) scene.remove(c);
    }
  });
  updateFx(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
updateHud();
placeCamera();
if (document.fonts && document.fonts.load) Promise.all([document.fonts.load("800 50px Pretendard"), document.fonts.load("700 16px Pretendard")]).then(rebuildMemos).catch(() => {});
window.__fridge = {
  doors,
  cam,
  state: () => state,
  snapOpen: () => Object.values(doors).forEach((d) => Object.assign(d, { target: OPEN, angle: OPEN, vel: 0, wasOpen: true })),
  addMemo: (text, color) => {
    const m = { id: `m${state.next++}`, text, color: color || "yellow", surface: "door-fr", x: -0.1, y: 0.2, tilt: -0.06 };
    state.memos.push(m);
    const o = buildMemo(m);
    memoObjs.set(m.id, o);
    placeMemo(o, m);
  },
  setExpiry: (name, days) => {
    const it = state.items.find((i) => i.name === name);
    if (it) it.expiry = addDays(days);
    updateHud();
  },
  openEditor: () => openEditor(null),
  reseed: () => {
    const n = reseed(false);
    save();
    rebuildItems();
    rebuildMemos();
    updateHud();
    return n;
  },
  openCard: (name) => openCard(state.items.find((i) => i.name === name))
};
requestAnimationFrame(tick);
