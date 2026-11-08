import zlib from "node:zlib";
import { createHash } from "node:crypto";

// Streaming ZIP writer (PLAT-04, server-only): entries are deflated in 256 KB slices as they are written and handed to an async sink, so
// memory stays at one slice however big the archive gets. Sizes and CRC follow each entry (data descriptor); no ZIP64, so callers keep a
// part under 4 GB and 65,535 entries (exports rotate parts at 45 MB). Each entry also reports the SHA-256 of its uncompressed bytes.

const SLICE = 256 * 1024;
const MAX_ENTRIES = 65535;
const MAX_BYTES = 0xffffffff;
const FLAGS = 0x0808; // data descriptor + UTF-8 names
const DEFLATE = 8;
const VERSION = 20;
// An empty final fixed-Huffman block: closes a deflate stream built from sync-flushed slices.
const FINAL_BLOCK = Uint8Array.from([0x03, 0x00]);
const enc = new TextEncoder();

let table = null;
function crcSlow(bytes, crc = 0) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
  }
  let c = (crc ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i += 1) c = table[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// Running CRC-32 (zlib's native one where Node has it).
export const crc32 = (bytes, crc = 0) => (typeof zlib.crc32 === "function" ? zlib.crc32(bytes, crc) : crcSlow(bytes, crc));

function dosStamp(at) {
  const d = new Date(at);
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = (Math.max(d.getFullYear() - 1980, 0) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

const toBytes = (data) => (typeof data === "string" ? enc.encode(data) : data instanceof Uint8Array ? data : new Uint8Array(data));

// createZipStream(sink) → { open(name), add(name, data), finish(), size, count }; sink(bytes) is awaited for every piece written.
export function createZipStream(sink, { now = new Date() } = {}) {
  const { time, date } = dosStamp(now);
  const central = [];
  let offset = 0;
  let current = null;
  let finished = false;

  const emit = async (bytes) => {
    if (!bytes.length) return;
    offset += bytes.length;
    if (offset > MAX_BYTES) throw new Error("zip: the part grew past 4 GB");
    await sink(bytes);
  };

  const flush = async (entry, final) => {
    const input = entry.pending.length === 1 ? entry.pending[0] : Buffer.concat(entry.pending);
    entry.pending = [];
    entry.pendingBytes = 0;
    const parts = [];
    if (input.length) parts.push(zlib.deflateRawSync(input, { level: 6, finishFlush: zlib.constants.Z_SYNC_FLUSH }));
    if (final) parts.push(FINAL_BLOCK);
    for (const p of parts) {
      entry.csize += p.length;
      await emit(p);
    }
  };

  async function open(name) {
    if (finished) throw new Error("zip: already finished");
    if (current) throw new Error(`zip: close ${current.name} before opening ${name}`);
    if (central.length >= MAX_ENTRIES) throw new Error("zip: too many entries in one part");
    const nameBytes = enc.encode(name);
    const entry = { name, nameBytes, offset, crc: 0, size: 0, csize: 0, pending: [], pendingBytes: 0, hash: createHash("sha256") };
    current = entry;
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(VERSION, 4);
    h.writeUInt16LE(FLAGS, 6);
    h.writeUInt16LE(DEFLATE, 8);
    h.writeUInt16LE(time, 10);
    h.writeUInt16LE(date, 12);
    h.writeUInt16LE(nameBytes.length, 26);
    await emit(h);
    await emit(nameBytes);
    return {
      name,
      get size() {
        return entry.size;
      },
      async write(data) {
        const bytes = toBytes(data);
        if (!bytes.length) return;
        entry.crc = crc32(bytes, entry.crc);
        entry.size += bytes.length;
        if (entry.size > MAX_BYTES) throw new Error(`zip: ${name} grew past 4 GB`);
        entry.hash.update(bytes);
        entry.pending.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.length));
        entry.pendingBytes += bytes.length;
        if (entry.pendingBytes >= SLICE) await flush(entry, false);
      },
      async close() {
        await flush(entry, true);
        const dd = Buffer.alloc(16);
        dd.writeUInt32LE(0x08074b50, 0);
        dd.writeUInt32LE(entry.crc >>> 0, 4);
        dd.writeUInt32LE(entry.csize, 8);
        dd.writeUInt32LE(entry.size, 12);
        await emit(dd);
        central.push(entry);
        current = null;
        return { name, bytes: entry.size, compressed: entry.csize, crc32: entry.crc >>> 0, sha256: entry.hash.digest("hex") };
      },
    };
  }

  return {
    open,
    // A whole entry from a string or bytes.
    async add(name, data) {
      const e = await open(name);
      await e.write(data);
      return e.close();
    },
    // Bytes written so far (compressed), and entries closed.
    get size() {
      return offset;
    },
    get count() {
      return central.length;
    },
    async finish() {
      if (current) throw new Error(`zip: ${current.name} is still open`);
      finished = true;
      const start = offset;
      for (const e of central) {
        const c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50, 0);
        c.writeUInt16LE(VERSION, 4);
        c.writeUInt16LE(VERSION, 6);
        c.writeUInt16LE(FLAGS, 8);
        c.writeUInt16LE(DEFLATE, 10);
        c.writeUInt16LE(time, 12);
        c.writeUInt16LE(date, 14);
        c.writeUInt32LE(e.crc >>> 0, 16);
        c.writeUInt32LE(e.csize, 20);
        c.writeUInt32LE(e.size, 24);
        c.writeUInt16LE(e.nameBytes.length, 28);
        c.writeUInt32LE(e.offset, 42);
        await emit(c);
        await emit(e.nameBytes);
      }
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(central.length, 8);
      end.writeUInt16LE(central.length, 10);
      end.writeUInt32LE(offset - start, 12);
      end.writeUInt32LE(start, 16);
      await emit(end);
      return { bytes: offset, entries: central.length };
    },
  };
}

// Read a whole archive back: [{ name, data }] with every CRC checked (tests and verification of small archives).
export function readZip(buffer) {
  const buf = Buffer.from(buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("zip: no end of central directory");
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error("zip: bad central header");
    const method = buf.readUInt16LE(at + 10);
    const crc = buf.readUInt32LE(at + 16);
    const csize = buf.readUInt32LE(at + 20);
    const size = buf.readUInt32LE(at + 24);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString("utf8");
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error(`zip: bad local header for ${name}`);
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(dataAt, dataAt + csize);
    const data = method === DEFLATE ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    if (data.length !== size) throw new Error(`zip: ${name} is ${data.length} bytes, expected ${size}`);
    if (crc32(data) !== crc) throw new Error(`zip: ${name} fails its CRC`);
    out.push({ name, data });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}
