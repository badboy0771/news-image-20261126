// The World in One Day — Thursday 26 November 2026
// A slate-and-amber front page: masthead, world map with eight pins, and
// eight news cards in two columns. Drawn pixel by pixel with a hand-rolled
// PNG encoder. Node 22, standard library only. No network, no clock, no
// randomness: the same input always produces the same bytes.

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 1024;
const H = 1024;

// ---- palette: deep slate, parchment, amber, coral ----
const INK_TOP: [number, number, number] = [13, 34, 48];
const INK_BOTTOM: [number, number, number] = [7, 19, 30];
const PANEL: [number, number, number] = [17, 45, 63];
const PANEL_LINE: [number, number, number] = [52, 92, 112];
const LAND: [number, number, number] = [94, 143, 128];
const LAND_EDGE: [number, number, number] = [150, 196, 178];
const AMBER: [number, number, number] = [232, 178, 84];
const AMBER_SOFT: [number, number, number] = [176, 138, 74];
const PARCHMENT: [number, number, number] = [243, 234, 211];
const MIST: [number, number, number] = [158, 178, 190];
const CORAL: [number, number, number] = [224, 84, 66];
const CORAL_DARK: [number, number, number] = [150, 44, 34];
const WHITE: [number, number, number] = [255, 255, 255];

// ---- canvas ----
const px = new Uint8Array(W * H * 4);
function put(x: number, y: number, c: [number, number, number]): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 4;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
  px[i + 3] = 255;
}
function rect(x: number, y: number, w: number, h: number, c: [number, number, number]): void {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) put(i, j, c);
}
function hline(x0: number, x1: number, y: number, c: [number, number, number]): void {
  for (let x = x0; x <= x1; x++) put(x, y, c);
}
function vline(x: number, y0: number, y1: number, c: [number, number, number]): void {
  for (let y = y0; y <= y1; y++) put(x, y, c);
}
function line(x0: number, y0: number, x1: number, y1: number, c: [number, number, number]): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    put(x, y, c);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x += sx; }
    if (e2 <= dx) { err += dx; y += sy; }
  }
}
function disc(cx: number, cy: number, r: number, c: [number, number, number]): void {
  for (let y = cy - r; y <= cy + r; y++)
    for (let x = cx - r; x <= cx + r; x++) {
      const ddx = x - cx;
      const ddy = y - cy;
      if (ddx * ddx + ddy * ddy <= r * r) put(x, y, c);
    }
}
function ring(cx: number, cy: number, r: number, c: [number, number, number]): void {
  for (let a = 0; a < 360; a += 2) {
    const rad = (a * Math.PI) / 180;
    put(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
  }
}

// Fill a polygon (even-odd scanline fill) from [x, y] vertices.
function fillPoly(pts: Array<[number, number]>, c: [number, number, number]): void {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [, y] of pts) {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
    const xs: number[] = [];
    for (let k = 0; k < pts.length; k++) {
      const [x0, y0] = pts[k];
      const [x1, y1] = pts[(k + 1) % pts.length];
      if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
        xs.push(x0 + ((y - y0) * (x1 - x0)) / (y1 - y0));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) put(x, y, c);
    }
  }
  for (let k = 0; k < pts.length; k++) {
    line(pts[k][0], pts[k][1], pts[(k + 1) % pts.length][0], pts[(k + 1) % pts.length][1], LAND_EDGE);
  }
}

// ---- 5x7 bitmap type, one number per row: five bits, leftmost is bit 4 ----
const GLYPHS: Record<string, number[]> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  "0": [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  "1": [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  "2": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x08, 0x1f],
  "3": [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  "4": [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  "5": [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  "6": [0x0e, 0x10, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  "7": [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  "8": [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  "9": [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x01, 0x0e],
  " ": [0, 0, 0, 0, 0, 0, 0],
  ".": [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ",": [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  ":": [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  "-": [0, 0, 0, 0x0e, 0, 0, 0],
  "%": [0x19, 0x19, 0x02, 0x04, 0x08, 0x13, 0x13],
  "&": [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  "/": [0x01, 0x01, 0x02, 0x04, 0x08, 0x10, 0x10],
  "(": [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ")": [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  "!": [0x04, 0x04, 0x04, 0x04, 0x04, 0x00, 0x04],
  "?": [0x0e, 0x11, 0x01, 0x02, 0x04, 0x00, 0x04],
  "$": [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  "+": [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
};

function drawGlyph(x: number, y: number, ch: string, s: number, c: [number, number, number]): void {
  const rows = GLYPHS[ch] ?? GLYPHS["?"];
  for (let r = 0; r < 7; r++) {
    const bits = rows[r];
    for (let col = 0; col < 5; col++) {
      if (bits & (1 << (4 - col))) rect(x + col * s, y + r * s, s, s, c);
    }
  }
}
function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}
function drawText(x: number, y: number, s: string, scale: number, c: [number, number, number]): void {
  // The bitmap font only carries capitals, digits and punctuation, so every
  // line is set in capitals: headlines, sub-lines and labels alike.
  let cx = x;
  for (const ch of s.toUpperCase()) {
    drawGlyph(cx, y, ch, scale, c);
    cx += 6 * scale;
  }
}
function drawCentred(y: number, s: string, scale: number, c: [number, number, number]): void {
  drawText(Math.round((W - textWidth(s, scale)) / 2), y, s, scale, c);
}
// Greedy word wrap into lines of at most maxChars characters.
function wrap(s: string, maxChars: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur === "") cur = w;
    else if (cur.length + 1 + w.length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// ---- the eight stories, all first reported Thursday 26 November 2026 ----
type Story = { n: number; head: string; a: string; b: string; lon: number; lat: number };
const STORIES: Story[] = [
  { n: 1, head: "US TARIFFS HIT 14 PARTNERS", a: "Trump proposes new duties on", b: "Japan, China and the EU", lon: -77.0, lat: 38.9 },
  { n: 2, head: "MISSILES OVER RIYADH", a: "Saudi Arabia intercepts two", b: "After Houthi attacks on ports", lon: 46.7, lat: 24.7 },
  { n: 3, head: "500,000 RUSSIAN DEAD", a: "Moscow's own figures show", b: "The toll of the Ukraine war", lon: 37.6, lat: 55.7 },
  { n: 4, head: "HAMAS OFFICIAL KILLED", a: "Israeli strike hits Gaza", b: "Family members also killed", lon: 34.5, lat: 31.5 },
  { n: 5, head: "HOSTAGES FREED IN COLOMBIA", a: "Police storm a supermarket", b: "20 freed after 17 hours", lon: -74.1, lat: 4.7 },
  { n: 6, head: "BANGLADESH PAY RISE 36%", a: "Garment workers win a raise", b: "Minimum wage lifted", lon: 90.4, lat: 23.8 },
  { n: 7, head: "PAKISTAN'S FIRST ASTRONAUT", a: "Chosen for Shenzhou-24", b: "First foreigner on Tiangong", lon: 73.1, lat: 33.7 },
  { n: 8, head: "NORWAY OIL LICENCES VOID", a: "Top court rules against", b: "Climate-disputed permits", lon: 10.7, lat: 59.9 },
];

// ---- world map: coarse continent outlines in [lon, lat] ----
type Poly = Array<[number, number]>;
const LANDS: Poly[] = [
  // North America
  [[-168, 66], [-150, 70], [-135, 69], [-125, 71], [-110, 68], [-95, 69], [-85, 66], [-80, 73], [-70, 62], [-60, 60], [-55, 52], [-60, 47], [-65, 44], [-70, 42], [-74, 39], [-76, 35], [-80, 32], [-81, 26], [-84, 30], [-90, 21], [-94, 18], [-97, 16], [-92, 14], [-87, 13], [-83, 9], [-80, 8], [-85, 11], [-90, 14], [-95, 16], [-100, 18], [-105, 20], [-110, 23], [-114, 28], [-120, 34], [-124, 40], [-124, 48], [-130, 55], [-140, 60], [-150, 60], [-158, 58], [-165, 60], [-168, 66]],
  // South America
  [[-80, 9], [-77, 8], [-72, 11], [-64, 10], [-60, 8], [-55, 6], [-52, 5], [-50, 0], [-44, -3], [-38, -5], [-35, -8], [-38, -15], [-40, -21], [-48, -27], [-52, -33], [-58, -38], [-62, -41], [-65, -45], [-68, -50], [-70, -54], [-73, -50], [-73, -44], [-73, -37], [-71, -30], [-70, -23], [-70, -18], [-75, -15], [-80, -6], [-81, -1], [-80, 5], [-80, 9]],
  // Africa
  [[-17, 15], [-16, 20], [-13, 27], [-10, 31], [-6, 34], [-1, 35], [3, 37], [10, 37], [11, 34], [15, 32], [20, 32], [25, 32], [30, 31], [32, 31], [34, 28], [35, 24], [37, 20], [38, 18], [40, 15], [43, 12], [46, 11], [51, 11], [51, 6], [48, 2], [41, -2], [40, -8], [40, -12], [37, -16], [36, -20], [35, -24], [33, -26], [30, -30], [27, -33], [22, -35], [19, -34], [17, -32], [15, -27], [13, -22], [12, -18], [12, -13], [11, -7], [9, -1], [9, 4], [6, 4], [2, 6], [-3, 5], [-8, 5], [-12, 8], [-15, 11], [-17, 15]],
  // Eurasia
  [[-10, 36], [-9, 38], [-9, 43], [-4, 44], [-2, 47], [-1, 49], [1, 51], [3, 53], [5, 57], [8, 58], [10, 60], [12, 56], [18, 56], [21, 55], [24, 58], [26, 59], [30, 60], [30, 65], [32, 70], [40, 68], [48, 68], [55, 68], [62, 69], [68, 72], [75, 73], [85, 74], [95, 76], [105, 77], [115, 73], [125, 72], [135, 71], [145, 72], [155, 71], [162, 69], [170, 68], [178, 66], [178, 64], [170, 60], [162, 56], [156, 51], [150, 59], [142, 55], [141, 45], [140, 40], [135, 35], [130, 33], [127, 34], [124, 30], [122, 28], [120, 23], [114, 22], [109, 18], [108, 12], [105, 9], [103, 7], [100, 7], [98, 10], [97, 16], [94, 17], [92, 21], [89, 22], [86, 20], [83, 18], [80, 13], [80, 8], [77, 8], [75, 12], [73, 17], [72, 20], [69, 22], [66, 25], [62, 25], [58, 25], [56, 27], [53, 27], [51, 29], [49, 30], [48, 30], [45, 29], [43, 29], [40, 31], [39, 31], [36, 36], [35, 36], [33, 35], [30, 36], [28, 37], [27, 40], [26, 40], [23, 40], [22, 40], [20, 41], [19, 42], [16, 42], [14, 45], [12, 44], [10, 44], [8, 44], [6, 43], [3, 43], [0, 40], [-2, 37], [-5, 36], [-8, 37], [-10, 36]],
  // Australia
  [[113, -22], [114, -28], [114, -32], [115, -35], [118, -35], [122, -34], [126, -32], [129, -32], [132, -32], [135, -35], [137, -35], [139, -37], [141, -38], [144, -38], [147, -39], [150, -37], [152, -33], [153, -30], [153, -27], [151, -24], [149, -20], [146, -19], [144, -15], [142, -11], [141, -13], [138, -12], [136, -12], [135, -15], [132, -12], [130, -13], [127, -14], [124, -15], [122, -17], [120, -20], [117, -20], [114, -22], [113, -22]],
  // Greenland
  [[-44, 60], [-42, 63], [-40, 65], [-32, 68], [-26, 69], [-22, 70], [-22, 73], [-26, 76], [-32, 78], [-40, 80], [-50, 80], [-56, 79], [-58, 76], [-55, 73], [-53, 70], [-52, 66], [-50, 63], [-46, 60], [-44, 60]],
  // Britain
  [[-5, 50], [-3, 53], [-5, 56], [-4, 58], [-2, 58], [0, 57], [0, 53], [1, 51], [-2, 50], [-5, 50]],
  // Japan
  [[130, 31], [132, 33], [134, 34], [136, 35], [138, 35], [140, 37], [141, 39], [141, 42], [143, 43], [145, 44], [143, 45], [141, 42], [140, 38], [137, 37], [134, 35], [131, 33], [130, 31]],
  // Madagascar
  [[44, -16], [47, -15], [49, -16], [50, -18], [49, -21], [47, -24], [45, -25], [44, -22], [43, -19], [44, -16]],
  // Borneo
  [[109, 1], [111, 2], [114, 4], [117, 6], [119, 4], [118, 1], [117, -2], [115, -4], [112, -3], [110, -1], [109, 1]],
  // Sumatra
  [[95, 5], [98, 3], [100, 0], [103, -3], [105, -5], [104, -6], [101, -2], [98, 1], [95, 5]],
  // New Guinea
  [[131, -1], [134, -2], [137, -3], [140, -3], [143, -4], [146, -6], [148, -8], [150, -9], [147, -9], [143, -8], [140, -8], [137, -6], [134, -4], [131, -1]],
];

// Map frame: equirectangular, lon -180..180, lat 82..-58.
const MAP = { x: 18, y: 128, w: 988, h: 330, latTop: 82, latBot: -58 };
function project(lon: number, lat: number): [number, number] {
  const x = MAP.x + ((lon + 180) / 360) * MAP.w;
  const y = MAP.y + ((MAP.latTop - lat) / (MAP.latTop - MAP.latBot)) * MAP.h;
  return [Math.round(x), Math.round(y)];
}

// ---- PNG encoder: CRC32 + zlib deflate, filter 0 ----
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function encodePng(): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 4));
  const flat = Buffer.from(px.buffer, px.byteOffset, px.byteLength);
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 4)] = 0;
    flat.copy(raw, y * (1 + W * 4) + 1, y * W * 4, (y + 1) * W * 4);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- render ----
function render(): void {
  // Background: vertical slate gradient.
  for (let y = 0; y < H; y++) {
    const t = y / (H - 1);
    const r = Math.round(INK_TOP[0] + (INK_BOTTOM[0] - INK_TOP[0]) * t);
    const g = Math.round(INK_TOP[1] + (INK_BOTTOM[1] - INK_TOP[1]) * t);
    const b = Math.round(INK_TOP[2] + (INK_BOTTOM[2] - INK_TOP[2]) * t);
    hline(0, W - 1, y, [r, g, b]);
  }
  // Outer frame.
  rect(0, 0, W, 6, AMBER);
  rect(0, H - 6, W, 6, AMBER);
  rect(0, 0, 6, H, AMBER);
  rect(W - 6, 0, 6, H, AMBER);

  // Masthead.
  drawCentred(26, "THE WORLD IN ONE DAY", 2, AMBER_SOFT);
  drawCentred(58, "THURSDAY 26 NOVEMBER 2026", 3, PARCHMENT);
  hline(120, W - 121, 100, AMBER);
  hline(120, W - 121, 103, AMBER_SOFT);
  drawCentred(108, "EIGHT STORIES FROM AROUND THE GLOBE", 1, MIST);

  // Map panel.
  rect(MAP.x - 4, MAP.y - 4, MAP.w + 8, MAP.h + 8, PANEL);
  for (let x = MAP.x; x <= MAP.x + MAP.w; x++) {
    put(x, MAP.y - 4, PANEL_LINE);
    put(x, MAP.y + MAP.h + 3, PANEL_LINE);
  }
  // Graticule every 30 degrees.
  for (let lon = -150; lon <= 150; lon += 30) {
    const [gx] = project(lon, 0);
    for (let y = MAP.y; y < MAP.y + MAP.h; y += 2) put(gx, y, [34, 66, 86]);
  }
  for (let lat = 60; lat >= -30; lat -= 30) {
    const [, gy] = project(0, lat);
    for (let x = MAP.x; x < MAP.x + MAP.w; x += 2) put(x, gy, [34, 66, 86]);
  }
  const [, eqY] = project(0, 0);
  for (let x = MAP.x; x < MAP.x + MAP.w; x += 3) put(x, eqY, PANEL_LINE);
  // Continents.
  for (const poly of LANDS) {
    const pts = poly.map(([lo, la]) => project(lo, la));
    fillPoly(pts, LAND);
  }
  // Pins with numbers.
  for (const s of STORIES) {
    const [pxx, pyy] = project(s.lon, s.lat);
    disc(pxx, pyy, 11, CORAL);
    ring(pxx, pyy, 11, WHITE);
    ring(pxx, pyy, 12, CORAL_DARK);
    drawText(pxx - 3, pyy - 7, String(s.n), 2, WHITE);
    // Leader dot above the pin for visibility on land.
    disc(pxx, pyy - 16, 2, CORAL);
  }

  // Cards: two columns, four rows.
  const cardW = 488;
  const cardH = 118;
  const gapX = 16;
  const gapY = 10;
  const topY = 482;
  for (let i = 0; i < STORIES.length; i++) {
    const s = STORIES[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = 16 + col * (cardW + gapX);
    const y = topY + row * (cardH + gapY);
    rect(x, y, cardW, cardH, PANEL);
    rect(x, y, cardW, 3, AMBER);
    // Number badge.
    disc(x + 26, y + 26, 16, CORAL);
    ring(x + 26, y + 26, 16, WHITE);
    drawText(x + 20, y + 19, String(s.n), 2, WHITE);
    // Headline, wrapped to two lines max.
    const lines = wrap(s.head, 38);
    drawText(x + 52, y + 14, lines[0], 2, PARCHMENT);
    if (lines[1]) drawText(x + 52, y + 38, lines[1], 2, PARCHMENT);
    // Sub-lines.
    drawText(x + 52, y + 66, s.a, 2, MIST);
    drawText(x + 52, y + 90, s.b, 2, MIST);
    // Corner ticks.
    hline(x, x + 14, y + cardH - 1, AMBER_SOFT);
    vline(x + cardW - 1, y + cardH - 15, y + cardH - 1, AMBER_SOFT);
  }

  // Footer: sources.
  drawCentred(992, "SOURCES: REUTERS, BBC, ASSOCIATED PRESS - ALL STORIES FIRST REPORTED 26 NOVEMBER 2026", 1, MIST);
}

render();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "entry.png"), encodePng());
