import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import fontkit from "@pdf-lib/fontkit";
import { degrees, PDFDocument, rgb } from "pdf-lib";

/**
 * Synthetic demo files for the customer dossier scenario. Generated from code, deterministic
 * (same input, same bytes), so a re-run recognizes them by SHA-256. PDFs carry the mark
 * "DEMO — fără valoare comercială" on every page; images are declared illustrative.
 */
export const DEMO_MARK = "DEMO — fără valoare comercială";
export const DEMO_IMAGE_PROVENANCE = "Imagine ilustrativă generată sintetic (seed N-020), nu fotografie reală.";

// The font the quote document already ships (Romanian diacritics), reused rather than copied.
const FONT_PATH = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "quoteDocument", "fonts", "NotoSans-Regular.ttf");
const FIXED_DATE = new Date("2026-01-01T00:00:00.000Z");

export type DemoPdfSpec = {
  heading: string;
  subtitle: string;
  lines: readonly string[];
};

export async function renderDemoPdf(spec: DemoPdfSpec): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(readFileSync(FONT_PATH), { subset: true });
  // Fixed metadata keeps the bytes deterministic.
  pdf.setCreationDate(FIXED_DATE);
  pdf.setModificationDate(FIXED_DATE);
  pdf.setProducer("WorkOS N-020 demo seed");
  pdf.setCreator("WorkOS N-020 demo seed");
  pdf.setTitle(`${spec.heading} — ${DEMO_MARK}`);
  const page = pdf.addPage([595, 842]);
  const ink = rgb(0.12, 0.12, 0.14);
  const muted = rgb(0.4, 0.4, 0.42);
  page.drawText(DEMO_MARK, { x: 120, y: 260, size: 34, font, color: rgb(0.85, 0.2, 0.2), opacity: 0.18, rotate: degrees(35) });
  page.drawRectangle({ x: 40, y: 780, width: 515, height: 30, color: rgb(0.96, 0.9, 0.9) });
  page.drawText(DEMO_MARK.toUpperCase(), { x: 50, y: 790, size: 12, font, color: rgb(0.7, 0.1, 0.1) });
  page.drawText(spec.heading, { x: 50, y: 740, size: 20, font, color: ink });
  page.drawText(spec.subtitle, { x: 50, y: 716, size: 11, font, color: muted });
  let y = 680;
  for (const line of spec.lines) {
    page.drawText(line, { x: 50, y, size: 11, font, color: ink, maxWidth: 495 });
    y -= 20;
  }
  page.drawText("Document sintetic generat de seed-ul N-020 pentru mediul demonstrativ. Nu este semnat, aprobat sau plătit.", {
    x: 50,
    y: 60,
    size: 8,
    font,
    color: muted,
    maxWidth: 495,
  });
  return pdf.save({ useObjectStreams: false });
}

// ─── PNG: a small illustrative scene (facade + sign), with a stamped caption ───

const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  "0": ["01110", "10011", "10101", "10101", "10101", "11001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
};

type Rgb = [number, number, number];

class Canvas {
  readonly pixels: Uint8Array;
  constructor(readonly width: number, readonly height: number) {
    this.pixels = new Uint8Array(width * height * 3);
  }
  rect(x: number, y: number, w: number, h: number, color: Rgb): void {
    for (let row = Math.max(0, y); row < Math.min(this.height, y + h); row += 1) {
      for (let col = Math.max(0, x); col < Math.min(this.width, x + w); col += 1) {
        const at = (row * this.width + col) * 3;
        this.pixels[at] = color[0];
        this.pixels[at + 1] = color[1];
        this.pixels[at + 2] = color[2];
      }
    }
  }
  text(value: string, x: number, y: number, scale: number, color: Rgb): void {
    let cursor = x;
    for (const char of value.toUpperCase()) {
      const glyph = GLYPHS[char] ?? GLYPHS[" "]!;
      glyph.forEach((line, row) => {
        [...line].forEach((bit, col) => {
          if (bit === "1") this.rect(cursor + col * scale, y + row * scale, scale, scale, color);
        });
      });
      cursor += 6 * scale;
    }
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = ~0;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return ~crc >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(new TextEncoder().encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

function encodePng(canvas: Canvas, caption: string): Uint8Array {
  const raw = new Uint8Array((canvas.width * 3 + 1) * canvas.height);
  for (let row = 0; row < canvas.height; row += 1) {
    raw[row * (canvas.width * 3 + 1)] = 0;
    raw.set(canvas.pixels.subarray(row * canvas.width * 3, (row + 1) * canvas.width * 3), row * (canvas.width * 3 + 1) + 1);
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, canvas.width);
  view.setUint32(4, canvas.height);
  header.set([8, 2, 0, 0, 0], 8);
  const text = new TextEncoder().encode(`Description\0${caption}`);
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("tEXt", text),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    png.set(part, offset);
    offset += part.length;
  }
  return png;
}

export type DemoImageSpec = {
  stage: "BEFORE" | "SIMULATION" | "AFTER";
  signText: string;
  facade: Rgb;
  sign: Rgb;
};

/** 640×420 illustration: sky, facade, windows; the sign absent (before), outlined (simulation) or lit (after). */
export function renderDemoImage(spec: DemoImageSpec): Uint8Array {
  const canvas = new Canvas(640, 420);
  for (let row = 0; row < 420; row += 1) {
    const shade = Math.round(200 - row * 0.12);
    canvas.rect(0, row, 640, 1, [shade - 40, shade - 10, Math.min(255, shade + 40)]);
  }
  canvas.rect(0, 360, 640, 60, [90, 92, 96]);
  canvas.rect(60, 120, 520, 240, spec.facade);
  for (let col = 0; col < 5; col += 1) canvas.rect(90 + col * 100, 250, 60, 80, [60, 80, 100]);
  canvas.rect(270, 270, 100, 90, [70, 60, 50]);
  const signX = 120;
  const signY = 150;
  const signW = 400;
  const signH = 70;
  if (spec.stage === "SIMULATION") {
    for (let i = 0; i < signW; i += 16) {
      canvas.rect(signX + i, signY, 8, 3, [255, 255, 255]);
      canvas.rect(signX + i, signY + signH - 3, 8, 3, [255, 255, 255]);
    }
    for (let i = 0; i < signH; i += 16) {
      canvas.rect(signX, signY + i, 3, 8, [255, 255, 255]);
      canvas.rect(signX + signW - 3, signY + i, 3, 8, [255, 255, 255]);
    }
    canvas.text(spec.signText, signX + 20, signY + 20, 4, [235, 235, 235]);
  }
  if (spec.stage === "AFTER") {
    canvas.rect(signX - 6, signY - 6, signW + 12, signH + 12, [Math.min(255, spec.sign[0] + 60), Math.min(255, spec.sign[1] + 60), Math.min(255, spec.sign[2] + 60)]);
    canvas.rect(signX, signY, signW, signH, spec.sign);
    canvas.text(spec.signText, signX + 20, signY + 20, 4, [255, 255, 255]);
  }
  canvas.rect(0, 0, 640, 34, [30, 30, 32]);
  canvas.text(`ILUSTRATIV DEMO N-020 ${spec.stage === "BEFORE" ? "INAINTE" : spec.stage === "SIMULATION" ? "SIMULARE" : "DUPA"}`, 12, 7, 3, [255, 210, 120]);
  // PNG tEXt is Latin-1: the embedded caption is the ASCII form of the declared provenance.
  return encodePng(canvas, "Imagine ilustrativa generata sintetic (seed N-020), nu fotografie reala. DEMO - fara valoare comerciala.");
}
