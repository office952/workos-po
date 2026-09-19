import { readFileSync, writeFileSync } from "node:fs";

const HEADER_SIZE = 0x4c;
const HAS_LINK_TARGET_ID_LIST = 1 << 0;
const HAS_LINK_INFO = 1 << 1;
const HAS_NAME = 1 << 2;
const HAS_RELATIVE_PATH = 1 << 3;
const HAS_WORKING_DIR = 1 << 4;
const HAS_ARGUMENTS = 1 << 5;
const HAS_ICON_LOCATION = 1 << 6;
const IS_UNICODE = 1 << 7;

function readString(buf, offset, unicode) {
  const count = buf.readUInt16LE(offset);
  const start = offset + 2;
  const bytes = unicode ? count * 2 : count;
  const value = unicode
    ? buf.toString("utf16le", start, start + bytes)
    : buf.toString("latin1", start, start + bytes);
  return { value, next: start + bytes };
}

function writeString(value, unicode) {
  const header = Buffer.alloc(2);
  if (unicode) {
    header.writeUInt16LE(value.length, 0);
    return Buffer.concat([header, Buffer.from(value, "utf16le")]);
  }
  header.writeUInt16LE(Buffer.byteLength(value, "latin1"), 0);
  return Buffer.concat([header, Buffer.from(value, "latin1")]);
}

function stringDataStart(buf) {
  let offset = HEADER_SIZE;
  const flags = buf.readUInt32LE(0x14);
  if (flags & HAS_LINK_TARGET_ID_LIST) {
    offset += 2 + buf.readUInt16LE(offset);
  }
  if (flags & HAS_LINK_INFO) {
    offset += buf.readUInt32LE(offset);
  }
  return { offset, flags };
}

export function parseLnkStrings(buf) {
  const { offset, flags } = stringDataStart(buf);
  const unicode = Boolean(flags & IS_UNICODE);
  let pos = offset;
  const strings = {
    name: "",
    relativePath: "",
    workingDir: "",
    arguments: "",
    iconLocation: "",
  };
  if (flags & HAS_NAME) {
    const parsed = readString(buf, pos, unicode);
    strings.name = parsed.value;
    pos = parsed.next;
  }
  if (flags & HAS_RELATIVE_PATH) {
    const parsed = readString(buf, pos, unicode);
    strings.relativePath = parsed.value;
    pos = parsed.next;
  }
  if (flags & HAS_WORKING_DIR) {
    const parsed = readString(buf, pos, unicode);
    strings.workingDir = parsed.value;
    pos = parsed.next;
  }
  if (flags & HAS_ARGUMENTS) {
    const parsed = readString(buf, pos, unicode);
    strings.arguments = parsed.value;
    pos = parsed.next;
  }
  if (flags & HAS_ICON_LOCATION) {
    const parsed = readString(buf, pos, unicode);
    strings.iconLocation = parsed.value;
    pos = parsed.next;
  }
  return { flags, strings, extraOffset: pos };
}

export function patchLnkUnicodeStrings(path, updates) {
  const buf = readFileSync(path);
  if (buf.length < HEADER_SIZE || buf.readUInt32LE(0) !== HEADER_SIZE) {
    throw new Error("shortcut_header_invalid");
  }
  const parsed = parseLnkStrings(buf);
  const flags =
    parsed.flags | IS_UNICODE | HAS_NAME | HAS_WORKING_DIR | HAS_ARGUMENTS;
  const prefix = Buffer.from(buf.subarray(0, stringDataStart(buf).offset));
  prefix.writeUInt32LE(flags, 0x14);
  const chunks = [writeString(updates.description ?? parsed.strings.name, true)];
  if (flags & HAS_RELATIVE_PATH) {
    chunks.push(writeString(parsed.strings.relativePath, true));
  }
  chunks.push(writeString(updates.workingDir ?? parsed.strings.workingDir, true));
  chunks.push(writeString(updates.argumentsText ?? parsed.strings.arguments, true));
  if (flags & HAS_ICON_LOCATION) {
    chunks.push(writeString(parsed.strings.iconLocation, true));
  }
  writeFileSync(path, Buffer.concat([prefix, ...chunks, buf.subarray(parsed.extraOffset)]));
}
