import { crc32, deflateSync } from "node:zlib";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { DemoUploadFile } from "./demoAtelierHttp.js";

/**
 * Synthetic demo documents, generated from code so the repository carries the
 * recipe, not binary blobs. Text is kept to the WinAnsi range of the standard
 * PDF font, so Romanian diacritics are written without marks inside the PDFs.
 */

const FIXED_DATE_ISO = "2026-10-20T08:00:00.000Z";

async function multipagePdf(title: string, pages: ReadonlyArray<readonly string[]>): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setAuthor("WorkOS demo atelier N-019 (sintetic)");
  pdf.setCreationDate(new Date(FIXED_DATE_ISO));
  pdf.setModificationDate(new Date(FIXED_DATE_ISO));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  pages.forEach((lines, index) => {
    const page = pdf.addPage([595, 842]);
    page.drawText(title, { x: 48, y: 790, size: 16, font: bold });
    page.drawText(`Pagina ${index + 1} din ${pages.length} - DOCUMENT SINTETIC, fara valoare comerciala`, {
      x: 48,
      y: 768,
      size: 9,
      font,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawRectangle({ x: 48, y: 420, width: 499, height: 320, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1 });
    lines.forEach((line, row) => {
      page.drawText(line, { x: 60, y: 715 - row * 18, size: 11, font });
    });
  });
  return pdf.save({ useObjectStreams: false });
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
}

/** A flat RGB mock-up: background, a sign band and letter blocks. */
function mockupPng(width: number, height: number, palette: { bg: number[]; band: number[]; letter: number[] }, letters: number): Uint8Array {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const bandTop = Math.floor(height * 0.3);
  const bandBottom = Math.floor(height * 0.7);
  const slot = Math.floor((width * 0.8) / Math.max(1, letters));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 3 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      let color = palette.bg;
      if (y >= bandTop && y < bandBottom) {
        color = palette.band;
        const inner = x - Math.floor(width * 0.1);
        if (inner >= 0 && inner < slot * letters && inner % slot < slot * 0.7 && y > bandTop + 12 && y < bandBottom - 12) {
          color = palette.letter;
        }
      }
      const offset = y * (width * 3 + 1) + 1 + x * 3;
      raw[offset] = color[0]!;
      raw[offset + 1] = color[1]!;
      raw[offset + 2] = color[2]!;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

/** Minimal ASCII DXF with rectangular letter outlines (synthetic contour). */
function contourDxf(name: string, count: number, widthMm: number, heightMm: number): Uint8Array {
  const lines = ["0", "SECTION", "2", "HEADER", "999", `WorkOS demo N-019 sintetic: ${name}`, "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES"];
  for (let index = 0; index < count; index += 1) {
    const x0 = index * (widthMm + 40);
    const corners = [
      [x0, 0],
      [x0 + widthMm, 0],
      [x0 + widthMm, heightMm],
      [x0, heightMm],
    ];
    for (let side = 0; side < 4; side += 1) {
      const [ax, ay] = corners[side]!;
      const [bx, by] = corners[(side + 1) % 4]!;
      lines.push("0", "LINE", "8", "CONTUR", "10", String(ax), "20", String(ay), "11", String(bx), "21", String(by));
    }
  }
  lines.push("0", "ENDSEC", "0", "EOF", "");
  return new TextEncoder().encode(lines.join("\n"));
}

function text(body: string): Uint8Array {
  return new TextEncoder().encode(body);
}

export type DemoFileKey =
  | "nordBrief"
  | "nordFacadePhoto"
  | "nordAcmDrawing"
  | "alphaDrawingV1"
  | "alphaDrawingV2"
  | "alphaContour"
  | "alphaLedInstructions"
  | "alphaMockup"
  | "meadowRalSpec"
  | "orbitCassetteDrawing"
  | "helixColorSpec"
  | "pineContour";

export async function buildDemoFile(key: DemoFileKey): Promise<DemoUploadFile> {
  switch (key) {
    case "nordBrief":
      return {
        name: "brief-fatada-nord-market.pdf",
        type: "application/pdf",
        bytes: await multipagePdf("Brief fatada Nord Market - Cluj", [
          ["Client: Nord Market Demo SRL (sintetic)", "Obiect: panou ACM casetat + litere volumetrice", "Amplasare: fatada principala, inaltime 4,2 m"],
          ["Dimensiuni aproximative panou: 6000 x 1200 mm", "Litere: NORD, inaltime 600 mm, frontlit", "Culoare fata: alb opal; volum aluminiu natur"],
          ["Program montaj: dupa 20:00, fara blocarea accesului", "Alimentare: priza existenta la 1,5 m de panou", "Persoana de contact: Andreea Pop (sintetic)"],
        ]),
      };
    case "nordFacadePhoto":
      return {
        name: "fotografie-fatada-nord.png",
        type: "image/png",
        bytes: mockupPng(480, 300, { bg: [180, 186, 192], band: [32, 40, 52], letter: [245, 245, 240] }, 4),
      };
    case "nordAcmDrawing":
      return {
        name: "desen-panou-acm-nord.pdf",
        type: "application/pdf",
        bytes: await multipagePdf("Desen tehnic panou ACM Nord", [
          ["Panou ACM 4 mm, casetat 40 mm", "Debitare CNC: contur exterior + decupaje litere"],
          ["Cadru intern aluminiu 30 x 30 mm", "Prindere: nituri la 300 mm"],
        ]),
      };
    case "alphaDrawingV1":
      return {
        name: "desen-litere-alpha.pdf",
        type: "application/pdf",
        bytes: await multipagePdf("Desen litere ALPHA - v1", [
          ["Litere ALPHA, inaltime 500 mm, adancime 80 mm", "Fata plexiglas opal 3 mm"],
          ["Volum aluminiu 0,6 mm, perimetru confirmat 14800 mm", "Spate PVC 5 mm"],
          ["Iluminare LED 12 V, 3 module / litera", "Sursa 100 W, IP67"],
        ]),
      };
    case "alphaDrawingV2":
      return {
        name: "desen-litere-alpha.pdf",
        type: "application/pdf",
        bytes: await multipagePdf("Desen litere ALPHA - v2 (revizie dupa confirmare client)", [
          ["Revizie: inaltime 520 mm, kerning corectat intre A-L", "Fata plexiglas opal 3 mm"],
          ["Volum aluminiu 0,6 mm, perimetru confirmat 14800 mm", "Spate PVC 5 mm"],
          ["Iluminare LED 12 V, 4 module / litera", "Sursa 100 W, IP67"],
          ["Aprobat client (sintetic): 21.10.2026", "Inlocuieste v1 pentru executie"],
        ]),
      };
    case "alphaContour":
      return {
        name: "contur-litere-alpha.dxf",
        type: "application/dxf",
        bytes: contourDxf("contur litere ALPHA", 5, 380, 520),
      };
    case "alphaLedInstructions":
      return {
        name: "instructiuni-cablare-led-alpha.txt",
        type: "text/plain",
        bytes: text(
          [
            "Instructiuni cablare LED - litere ALPHA (document sintetic N-019)",
            "1. Module LED 12 V, cate 4 pe litera, distanta 60 mm.",
            "2. Cablare in paralel, sectiune 0,75 mm2.",
            "3. Sursa 100 W montata in caseta tehnica, IP67.",
            "4. Proba de aprindere inainte de inchiderea corpului.",
            "",
          ].join("\n"),
        ),
      };
    case "alphaMockup":
      return {
        name: "macheta-alpha-receptie.png",
        type: "image/png",
        bytes: mockupPng(480, 270, { bg: [236, 238, 240], band: [255, 255, 255], letter: [20, 90, 160] }, 5),
      };
    case "meadowRalSpec":
      return {
        name: "specificatie-culori-meadow.pdf",
        type: "application/pdf",
        bytes: await multipagePdf("Specificatie culori Meadow Cafe", [
          ["Fata: folie verde (sintetic) - colantare dupa debitare", "Volum: vopsit RAL 9005 negru intens"],
          ["Vopsire dupa asamblare, conform procesului PAINT_RAL", "Uscare minim 12 h inainte de ambalare"],
        ]),
      };
    case "orbitCassetteDrawing":
      return {
        name: "desen-caseta-orbit.pdf",
        type: "application/pdf",
        bytes: await multipagePdf("Caseta ACM Orbit Auto", [
          ["Caseta ACM 2400 x 800 mm, adancime 40 mm", "Cadru intern din semifabricat metalic debitat"],
          ["Montaj pe fatada showroom (de confirmat separat)", "Document sintetic N-019"],
        ]),
      };
    case "helixColorSpec":
      return {
        name: "specificatie-culori-helix.pdf",
        type: "application/pdf",
        bytes: await multipagePdf("Logo receptie Helix - culori (istoric sintetic)", [
          ["Fata: folie albastru inchis, colantare dupa debitare", "Volum: vopsit RAL 7016"],
          ["Vopsire dupa inchiderea corpului", "Uscare peste noapte inainte de controlul final"],
        ]),
      };
    case "pineContour":
      return {
        name: "contur-litere-pine.dxf",
        type: "application/dxf",
        bytes: contourDxf("contur litere PINE", 4, 420, 600),
      };
    default: {
      const exhaustive: never = key;
      return exhaustive;
    }
  }
}
