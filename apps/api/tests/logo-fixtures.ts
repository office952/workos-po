// N-023 · synthetic logo files, generated from code (no real company logo). Every image here is
// decodable by a browser: a PNG with real deflated pixel rows, a baseline grey JPEG with valid
// Huffman tables, and the minimal WebP files commonly used for feature detection.
import { deflateSync } from "node:zlib";

let table: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.byteLength);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.byteLength);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.byteLength, crc32(out.subarray(4, 8 + data.byteLength)));
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

export type PngOptions = {
  width?: number;
  height?: number;
  /** RGBA of every pixel; default a dark ink on transparent (a black logo). */
  colour?: readonly [number, number, number, number];
  /** Replace the deflated rows (to build inconsistent files). */
  rows?: Uint8Array;
  extraChunks?: Array<{ type: string; data: Uint8Array; before?: "IDAT" }>;
};

/** A real RGBA PNG: a filled square with a transparent border, so it reads as a mark on any surface. */
export function makePng(options: PngOptions = {}): Uint8Array {
  const width = options.width ?? 32;
  const height = options.height ?? 32;
  const [r, g, b, a] = options.colour ?? [17, 17, 17, 255];
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const raw = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const inside = x >= width / 4 && x < (width * 3) / 4 && y >= height / 4 && y < (height * 3) / 4;
      raw.set(inside ? [r, g, b, a] : [0, 0, 0, 0], row + 1 + x * 4);
    }
  }
  const before = (options.extraChunks ?? []).filter((extra) => extra.before === "IDAT").map((extra) => chunk(extra.type, extra.data));
  const after = (options.extraChunks ?? []).filter((extra) => extra.before !== "IDAT").map((extra) => chunk(extra.type, extra.data));
  return concat([
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    ...before,
    chunk("IDAT", options.rows ?? deflateSync(raw)),
    ...after,
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/** PNG whose header announces a size: the row data is for a 1 × 1 image (only the header lies). */
export function makePngWithHeaderSize(width: number, height: number): Uint8Array {
  return makePng({ width, height, rows: deflateSync(Uint8Array.from([0, 0, 0, 0, 0])) });
}

/**
 * A baseline greyscale JPEG of `width` × `height` (multiples of 8 work best): one quantization table,
 * one DC and one AC Huffman table with a single 1-bit code each, so every block is "DC diff 0, EOB"
 * and the image is a flat mid-grey.
 */
export function makeJpeg(width = 16, height = 16): Uint8Array {
  const segment = (marker: number, data: number[]) => [0xff, marker, ((data.length + 2) >> 8) & 0xff, (data.length + 2) & 0xff, ...data];
  const blocks = Math.ceil(width / 8) * Math.ceil(height / 8);
  // Two zero bits per block, packed, padded with ones.
  const bits = blocks * 2;
  const scan: number[] = [];
  for (let i = 0; i < Math.ceil(bits / 8); i += 1) {
    const used = Math.min(8, bits - i * 8);
    const byte = (0xff >> used) & 0xff;
    scan.push(byte);
    if (byte === 0xff) scan.push(0x00);
  }
  const counts = (length1: number) => [length1, ...new Array(15).fill(0)];
  return Uint8Array.from([
    0xff, 0xd8,
    ...segment(0xdb, [0x00, ...new Array(64).fill(1)]),
    ...segment(0xc0, [8, (height >> 8) & 0xff, height & 0xff, (width >> 8) & 0xff, width & 0xff, 1, 1, 0x11, 0]),
    ...segment(0xc4, [0x00, ...counts(1), 0x00]), // DC table 0: symbol 0 (category 0)
    ...segment(0xc4, [0x10, ...counts(1), 0x00]), // AC table 0: symbol 0x00 (EOB)
    ...segment(0xda, [1, 1, 0x00, 0, 63, 0]),
    ...scan,
    0xff, 0xd9,
  ]);
}

const base64 = (text: string) => Uint8Array.from(Buffer.from(text, "base64"));
/** 1 × 1 lossy WebP (VP8). */
export const WEBP_LOSSY = base64("UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA");
/** 1 × 1 lossless WebP (VP8L). */
export const WEBP_LOSSLESS = base64("UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==");
/** 1 × 1 extended WebP with alpha (VP8X + ALPH + VP8). */
export const WEBP_ALPHA = base64("UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAABQBAJ0BKgEAAQAAAP4AAA3AAP7mtQAAAA==");
/** Animated WebP (VP8X with the animation flag, ANIM, ANMF). */
export const WEBP_ANIMATED = base64("UklGRlIAAABXRUJQVlA4WAoAAAASAAAAAAAAAAAAQU5JTQYAAAD/////AABBTk1GJgAAAAAAAAAAAAAAAAAAAGQAAABWUDhMDQAAAC8AAAAQBxAREYiI/gcA");

export const GIF = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff, 0x21, 0xf9, 4, 1, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 1, 0, 0x3b]);
export const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>');
