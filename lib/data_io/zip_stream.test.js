import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import zlib from "node:zlib";

import { crc32, createZipStream, readZip } from "./zip_stream";

// PLAT-04: the streaming ZIP writer produces archives standard readers open: deflated entries, data descriptors, CRC and sizes in the
// central directory, a SHA-256 per entry, and output handed to the sink piece by piece.

async function build(fn) {
  const chunks = [];
  const zip = createZipStream(async (bytes) => chunks.push(Buffer.from(bytes)));
  const results = await fn(zip);
  const done = await zip.finish();
  return { buf: Buffer.concat(chunks), chunks, results, done, zip };
}

const sha = (s) => createHash("sha256").update(s).digest("hex");

test("zip stream: entries round-trip through a reader, with CRC, size and SHA-256", async () => {
  const csv = "id,name\r\n1,Harbor & Pine\r\n2,\"Quoted, name\"\r\n";
  const { buf, results, done } = await build(async (zip) => [await zip.add("tables/properties.csv", csv), await zip.add("manifest.json", "{}"), await zip.add("empty.txt", "")]);
  const entries = readZip(buf);
  assert.deepEqual(
    entries.map((e) => [e.name, e.data.toString("utf8")]),
    [
      ["tables/properties.csv", csv],
      ["manifest.json", "{}"],
      ["empty.txt", ""],
    ],
  );
  assert.equal(results[0].bytes, Buffer.byteLength(csv));
  assert.equal(results[0].sha256, sha(csv));
  assert.equal(results[0].crc32, crc32(Buffer.from(csv)));
  assert.equal(done.entries, 3);
  assert.equal(done.bytes, buf.length);
});

test("zip stream: a large entry is written in slices as it streams and still inflates as one deflate stream", async () => {
  const line = (i) => `${i},row ${i},${"x".repeat(i % 50)}\r\n`;
  let expected = "";
  const { buf, chunks, results } = await build(async (zip) => {
    const e = await zip.open("tables/ledger_lines.csv");
    for (let page = 0; page < 40; page += 1) {
      let text = "";
      for (let i = page * 1000; i < (page + 1) * 1000; i += 1) text += line(i);
      expected += text;
      await e.write(text);
    }
    return e.close();
  });
  assert.ok(chunks.length > 5, "the sink received the archive in pieces");
  assert.equal(results.bytes, Buffer.byteLength(expected));
  assert.ok(results.compressed < results.bytes / 2, "the CSV is compressed");
  const [entry] = readZip(buf);
  assert.equal(entry.data.toString("utf8"), expected);
  assert.equal(results.sha256, sha(expected));
});

test("zip stream: binary data, UTF-8 names and the system unzip view (central directory) agree", async () => {
  const bin = Buffer.from(Array.from({ length: 70000 }, (_, i) => (i * 7919) % 256));
  const { buf } = await build(async (zip) => {
    const e = await zip.open("documents/property-files/lease/ü-1/scan.pdf");
    await e.write(bin.subarray(0, 30000));
    await e.write(new Uint8Array(bin.subarray(30000)));
    return e.close();
  });
  const [entry] = readZip(buf);
  assert.equal(entry.name, "documents/property-files/lease/ü-1/scan.pdf");
  assert.ok(entry.data.equals(bin));
  // The local header defers sizes to the data descriptor (bit 3) and flags UTF-8 names (bit 11).
  assert.equal(buf.readUInt16LE(6), 0x0808);
  assert.equal(buf.readUInt16LE(8), 8);
});

test("zip stream: one entry open at a time, nothing after finish, and the CRC matches zlib's", async () => {
  const zip = createZipStream(async () => {});
  await zip.open("a.txt");
  await assert.rejects(() => zip.open("b.txt"), /close a\.txt/);
  await assert.rejects(() => zip.finish(), /still open/);
  const data = Buffer.from("The quick brown fox");
  if (typeof zlib.crc32 === "function") assert.equal(crc32(data), zlib.crc32(data));
  assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
  assert.equal(crc32(Buffer.from("6789"), crc32(Buffer.from("12345"))), 0xcbf43926, "a running CRC over slices");
});

test("zip stream: a sink failure stops the writer", async () => {
  const zip = createZipStream(async () => {
    throw new Error("upload refused");
  });
  await assert.rejects(() => zip.add("a.txt", "x"), /upload refused/);
});
