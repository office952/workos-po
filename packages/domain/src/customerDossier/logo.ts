/**
 * N-023 · the customer's official logo, managed by hand. A logo belongs to one customer of one
 * organization; at most one version is active and every earlier revision is kept (going back to the
 * monogram is a revision without a file). It is the customer's visual identity only: not a PHOTO,
 * not a work's photo, not a Catalog product, not a production artwork, and it never changes a quote,
 * an order or an accepted commercial snapshot.
 *
 * V1 accepts PNG, JPEG and WebP up to 2 MB and 4096 px per side. The bytes are checked here for their
 * signature, their structure and their dimensions; PNG image data is also inflated by the API
 * (`apps/api/src/customerDossier/logo.ts`), which has zlib. SVG, GIF and anything else are refused.
 */
export const CUSTOMER_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export type CustomerLogoMimeType = (typeof CUSTOMER_LOGO_MIME_TYPES)[number];

export const MAX_CUSTOMER_LOGO_BYTES = 2 * 1024 * 1024;
export const MAX_CUSTOMER_LOGO_SIDE = 4096;
/** Room for the multipart envelope around a file at the byte limit. */
export const MAX_CUSTOMER_LOGO_HTTP_BODY_BYTES = MAX_CUSTOMER_LOGO_BYTES + 64 * 1024;

export const CUSTOMER_LOGO_PROVENANCES = ["UPLOAD"] as const;
export type CustomerLogoProvenance = (typeof CUSTOMER_LOGO_PROVENANCES)[number];

/** What a reader is given: never a storage key or a path. */
export type CustomerLogoRef = {
  revision: number;
  contentHref: string;
  width: number;
  height: number;
};

export function customerLogoContentHref(customerId: string, revision: number): string {
  return `/api/customers/${encodeURIComponent(customerId)}/logo/content?revision=${revision}`;
}

export const CUSTOMER_LOGO_REJECTIONS = [
  /** Not PNG, JPEG or WebP (SVG, GIF, PDF, text, unknown). */
  "UNSUPPORTED_FORMAT",
  /** The declared type or the file name extension says another format than the bytes. */
  "TYPE_MISMATCH",
  /** Signature right, structure wrong: truncated, corrupt, inconsistent. */
  "MALFORMED",
  /** An animation (APNG, animated WebP) is not a logo. */
  "ANIMATED",
  /** Wider or taller than MAX_CUSTOMER_LOGO_SIDE, or zero. */
  "DIMENSIONS",
  "TOO_LARGE",
  "EMPTY",
] as const;
export type CustomerLogoRejection = (typeof CUSTOMER_LOGO_REJECTIONS)[number];

/** The image data stream of a PNG, for the API to inflate and check against what the header says. */
export type PngImageData = {
  zlib: Uint8Array;
  /** Exact number of bytes the inflated stream must have (filter bytes included). */
  inflatedBytes: number;
  /** Non-interlaced: bytes per row after the filter byte; each row starts with a filter type 0–4. */
  rowBytes: number | null;
};

export type CustomerLogoImage = {
  mimeType: CustomerLogoMimeType;
  width: number;
  height: number;
  png: PngImageData | null;
};

export type CustomerLogoInspection = { ok: true; image: CustomerLogoImage } | { ok: false; reason: CustomerLogoRejection };

const EXTENSIONS: Record<CustomerLogoMimeType, readonly string[]> = {
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/webp": ["webp"],
};

/**
 * Inspects an uploaded logo. The format is recognized from the bytes only; the declared type and the
 * extension must agree with it (a missing type or a generic `application/octet-stream` is not a claim).
 */
export function inspectCustomerLogo(bytes: Uint8Array, declared: { mimeType: string | null; fileName: string }): CustomerLogoInspection {
  if (bytes.byteLength === 0) return { ok: false, reason: "EMPTY" };
  if (bytes.byteLength > MAX_CUSTOMER_LOGO_BYTES) return { ok: false, reason: "TOO_LARGE" };
  const read = isPng(bytes) ? readPng(bytes) : isJpeg(bytes) ? readJpeg(bytes) : isWebp(bytes) ? readWebp(bytes) : null;
  if (!read) return { ok: false, reason: "UNSUPPORTED_FORMAT" };
  if (!read.ok) return read;
  const { image } = read;
  const type = (declared.mimeType ?? "").trim().toLowerCase();
  if (type && type !== "application/octet-stream" && type !== image.mimeType && !(type === "image/jpg" && image.mimeType === "image/jpeg")) {
    return { ok: false, reason: "TYPE_MISMATCH" };
  }
  const extension = /\.([a-z0-9]+)$/i.exec(declared.fileName)?.[1]?.toLowerCase();
  if (extension && !EXTENSIONS[image.mimeType].includes(extension)) return { ok: false, reason: "TYPE_MISMATCH" };
  if (image.width < 1 || image.height < 1 || image.width > MAX_CUSTOMER_LOGO_SIDE || image.height > MAX_CUSTOMER_LOGO_SIDE) {
    return { ok: false, reason: "DIMENSIONS" };
  }
  return { ok: true, image };
}

/** `expectedRevision` of a logo change: an integer ≥ 0 (0 = the customer never had a logo revision). */
export function readCustomerLogoExpectedRevision(value: unknown): number | null {
  const number = typeof value === "string" && /^\d{1,9}$/.test(value.trim()) ? Number(value.trim()) : value;
  return typeof number === "number" && Number.isInteger(number) && number >= 0 ? number : null;
}

const fail = (reason: CustomerLogoRejection): { ok: false; reason: CustomerLogoRejection } => ({ ok: false, reason });
const u16be = (b: Uint8Array, at: number) => (b[at]! << 8) | b[at + 1]!;
const u32be = (b: Uint8Array, at: number) => ((b[at]! << 24) >>> 0) + (b[at + 1]! << 16) + (b[at + 2]! << 8) + b[at + 3]!;
const u16le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8);
const u24le = (b: Uint8Array, at: number) => b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16);
const u32le = (b: Uint8Array, at: number) => (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16)) + b[at + 3]! * 0x1000000;
const ascii = (b: Uint8Array, at: number, length: number) => String.fromCharCode(...b.subarray(at, at + length));

// ─── PNG ─────────────────────────────────────────────────────────────────────

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function isPng(b: Uint8Array): boolean {
  return b.byteLength >= 8 && PNG_SIGNATURE.every((value, index) => b[index] === value);
}

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Allowed bit depths per colour type, and the channels of each. */
const PNG_COLOUR: Record<number, { depths: readonly number[]; channels: number }> = {
  0: { depths: [1, 2, 4, 8, 16], channels: 1 },
  2: { depths: [8, 16], channels: 3 },
  3: { depths: [1, 2, 4, 8], channels: 1 },
  4: { depths: [8, 16], channels: 2 },
  6: { depths: [8, 16], channels: 4 },
};

function readPng(b: Uint8Array): CustomerLogoInspection {
  let at = 8;
  let header: { width: number; height: number; depth: number; colour: number; interlaced: boolean } | null = null;
  let palette = false;
  let ended = false;
  const idat: Uint8Array[] = [];
  let idatClosed = false;
  while (at < b.byteLength) {
    if (ended) return fail("MALFORMED"); // nothing may follow IEND
    if (at + 12 > b.byteLength) return fail("MALFORMED");
    const length = u32be(b, at);
    if (length > 0x7fffffff || at + 12 + length > b.byteLength) return fail("MALFORMED");
    const type = ascii(b, at + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type)) return fail("MALFORMED");
    const data = b.subarray(at + 8, at + 8 + length);
    if (crc32(b.subarray(at + 4, at + 8 + length)) !== u32be(b, at + 8 + length)) return fail("MALFORMED");
    if (!header && type !== "IHDR") return fail("MALFORMED");
    if (type !== "IDAT" && idat.length) idatClosed = true;
    switch (type) {
      case "IHDR": {
        if (header || length !== 13) return fail("MALFORMED");
        const colour = PNG_COLOUR[data[9]!];
        if (!colour || !colour.depths.includes(data[8]!) || data[10] !== 0 || data[11] !== 0 || data[12]! > 1) return fail("MALFORMED");
        header = { width: u32be(data, 0), height: u32be(data, 4), depth: data[8]!, colour: data[9]!, interlaced: data[12] === 1 };
        if (header.width < 1 || header.height < 1) return fail("MALFORMED");
        if (header.width > MAX_CUSTOMER_LOGO_SIDE || header.height > MAX_CUSTOMER_LOGO_SIDE) return fail("DIMENSIONS");
        break;
      }
      case "PLTE":
        if (palette || idat.length || length === 0 || length % 3 !== 0 || length / 3 > 256) return fail("MALFORMED");
        palette = true;
        break;
      case "IDAT":
        if (idatClosed) return fail("MALFORMED"); // IDAT chunks are consecutive
        idat.push(data);
        break;
      case "acTL":
      case "fcTL":
      case "fdAT":
        return fail("ANIMATED");
      case "IEND":
        if (length !== 0) return fail("MALFORMED");
        ended = true;
        break;
      default:
        // An unknown critical chunk (upper-case first letter) cannot be skipped safely.
        if (type.charCodeAt(0) < 0x61) return fail("MALFORMED");
    }
    at += 12 + length;
  }
  if (!header || !ended || idat.length === 0) return fail("MALFORMED");
  if (header.colour === 3 && !palette) return fail("MALFORMED");
  const bitsPerPixel = PNG_COLOUR[header.colour]!.channels * header.depth;
  const rowLength = (width: number) => Math.ceil((width * bitsPerPixel) / 8);
  let inflatedBytes = 0;
  if (header.interlaced) {
    // Adam7: seven reduced images, each row with its own filter byte; empty passes are absent.
    const passes = [
      [0, 0, 8, 8],
      [4, 0, 8, 8],
      [0, 4, 4, 8],
      [2, 0, 4, 4],
      [0, 2, 2, 4],
      [1, 0, 2, 2],
      [0, 1, 1, 2],
    ] as const;
    for (const [x0, y0, dx, dy] of passes) {
      const width = Math.ceil((header.width - x0) / dx);
      const height = Math.ceil((header.height - y0) / dy);
      if (width > 0 && height > 0) inflatedBytes += height * (1 + rowLength(width));
    }
  } else {
    inflatedBytes = header.height * (1 + rowLength(header.width));
  }
  const total = idat.reduce((sum, part) => sum + part.byteLength, 0);
  const zlib = new Uint8Array(total);
  let offset = 0;
  for (const part of idat) {
    zlib.set(part, offset);
    offset += part.byteLength;
  }
  return {
    ok: true,
    image: {
      mimeType: "image/png",
      width: header.width,
      height: header.height,
      png: { zlib, inflatedBytes, rowBytes: header.interlaced ? null : rowLength(header.width) },
    },
  };
}

// ─── JPEG ────────────────────────────────────────────────────────────────────

function isJpeg(b: Uint8Array): boolean {
  return b.byteLength >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
}

const isSof = (marker: number) => marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

/**
 * Walks every marker segment and every entropy-coded scan up to EOI: lengths inside the file, one
 * frame header with sane dimensions and components, quantization and (for Huffman coding) Huffman
 * tables before the first scan, a valid scan header, and nothing after EOI.
 */
function readJpeg(b: Uint8Array): CustomerLogoInspection {
  let at = 2;
  let frame: { width: number; height: number; components: number; huffman: boolean } | null = null;
  let quantization = false;
  let huffmanTables = false;
  let scans = 0;
  while (true) {
    if (at >= b.byteLength || b[at] !== 0xff) return fail("MALFORMED");
    while (at < b.byteLength && b[at] === 0xff) at += 1; // fill bytes
    if (at >= b.byteLength) return fail("MALFORMED");
    const marker = b[at]!;
    at += 1;
    if (marker === 0xd9) {
      // EOI: only after at least one scan, and the file ends here.
      if (!frame || scans === 0 || at !== b.byteLength) return fail("MALFORMED");
      return { ok: true, image: { mimeType: "image/jpeg", width: frame.width, height: frame.height, png: null } };
    }
    if (marker === 0x00 || marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) return fail("MALFORMED");
    if (at + 2 > b.byteLength) return fail("MALFORMED");
    const length = u16be(b, at);
    if (length < 2 || at + length > b.byteLength) return fail("MALFORMED");
    const segment = b.subarray(at + 2, at + length);
    at += length;
    if (isSof(marker)) {
      if (frame || segment.byteLength < 6) return fail("MALFORMED");
      const precision = segment[0]!;
      const height = u16be(segment, 1);
      const width = u16be(segment, 3);
      const components = segment[5]!;
      if (![8, 12, 16].includes(precision) || components < 1 || components > 4 || segment.byteLength !== 6 + components * 3) return fail("MALFORMED");
      if (height === 0 || width === 0) return fail("MALFORMED"); // a height given later (DNL) is not supported
      if (width > MAX_CUSTOMER_LOGO_SIDE || height > MAX_CUSTOMER_LOGO_SIDE) return fail("DIMENSIONS");
      frame = { width, height, components, huffman: marker < 0xc8 };
    } else if (marker === 0xdb) {
      if (segment.byteLength < 65) return fail("MALFORMED");
      quantization = true;
    } else if (marker === 0xc4) {
      if (segment.byteLength < 17) return fail("MALFORMED");
      huffmanTables = true;
    } else if (marker === 0xda) {
      if (!frame || !quantization || (frame.huffman && !huffmanTables)) return fail("MALFORMED");
      const count = segment[0] ?? 0;
      if (count < 1 || count > frame.components || segment.byteLength !== 4 + count * 2) return fail("MALFORMED");
      scans += 1;
      // Entropy-coded data: FF00 is a stuffed byte, FFD0–FFD7 a restart marker; any other marker ends it.
      while (true) {
        if (at + 1 >= b.byteLength) return fail("MALFORMED");
        if (b[at] === 0xff) {
          const next = b[at + 1]!;
          if (next === 0x00 || (next >= 0xd0 && next <= 0xd7) || next === 0xff) {
            at += next === 0xff ? 1 : 2;
            continue;
          }
          break;
        }
        at += 1;
      }
    }
  }
}

// ─── WebP ────────────────────────────────────────────────────────────────────

function isWebp(b: Uint8Array): boolean {
  return b.byteLength >= 12 && ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP";
}

function vp8Size(data: Uint8Array): { width: number; height: number } | null {
  if (data.byteLength < 10) return null;
  const tag = data[0]! | (data[1]! << 8) | (data[2]! << 16);
  const keyFrame = (tag & 1) === 0;
  const version = (tag >> 1) & 7;
  const shown = (tag >> 4) & 1;
  const partition = tag >>> 5;
  if (!keyFrame || version > 3 || !shown || partition === 0 || partition > data.byteLength - 10) return null;
  if (data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) return null;
  const width = u16le(data, 6) & 0x3fff;
  const height = u16le(data, 8) & 0x3fff;
  return width && height ? { width, height } : null;
}

function vp8lSize(data: Uint8Array): { width: number; height: number } | null {
  if (data.byteLength < 5 || data[0] !== 0x2f) return null;
  const bits = u32le(data, 1);
  const version = Math.floor(bits / 0x20000000) & 7;
  if (version !== 0) return null;
  return { width: (bits & 0x3fff) + 1, height: (Math.floor(bits / 0x4000) & 0x3fff) + 1 };
}

/**
 * The RIFF container must account for every byte; the chunks follow each other exactly (odd sizes
 * padded); one still image (VP8 lossy or VP8L lossless), directly or inside an extended (VP8X) file
 * whose canvas matches it. Animation is refused.
 */
function readWebp(b: Uint8Array): CustomerLogoInspection {
  if (u32le(b, 4) + 8 !== b.byteLength || b.byteLength % 2 !== 0) return fail("MALFORMED");
  const chunks: Array<{ type: string; data: Uint8Array }> = [];
  let at = 12;
  while (at < b.byteLength) {
    if (at + 8 > b.byteLength) return fail("MALFORMED");
    const type = ascii(b, at, 4);
    const size = u32le(b, at + 4);
    const end = at + 8 + size + (size % 2);
    if (end > b.byteLength) return fail("MALFORMED");
    chunks.push({ type, data: b.subarray(at + 8, at + 8 + size) });
    at = end;
  }
  const first = chunks[0];
  if (!first) return fail("MALFORMED");
  const still = (chunk: { type: string; data: Uint8Array }) => (chunk.type === "VP8 " ? vp8Size(chunk.data) : chunk.type === "VP8L" ? vp8lSize(chunk.data) : null);
  if (chunks.some((chunk) => chunk.type === "ANIM" || chunk.type === "ANMF")) return fail("ANIMATED");
  const images = chunks.filter((chunk) => chunk.type === "VP8 " || chunk.type === "VP8L");
  if (images.length !== 1) return fail("MALFORMED");
  const size = still(images[0]!);
  if (!size) return fail("MALFORMED");
  if (first.type === "VP8X") {
    if (first.data.byteLength < 10) return fail("MALFORMED");
    if (first.data[0]! & 0x02) return fail("ANIMATED");
    const width = u24le(first.data, 4) + 1;
    const height = u24le(first.data, 7) + 1;
    if (width !== size.width || height !== size.height) return fail("MALFORMED");
  } else if (first !== images[0] || chunks.length !== 1) {
    return fail("MALFORMED");
  }
  return { ok: true, image: { mimeType: "image/webp", width: size.width, height: size.height, png: null } };
}
