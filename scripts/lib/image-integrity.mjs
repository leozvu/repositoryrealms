import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { inflateSync } from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = Array.from({ length: 256 }, (_, value) => {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});

export function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
const DEPTHS = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

// A structural PNG audit: signature, every chunk checksum, terminal chunk and
// inflated scanlines. It reads evidence only; it never repairs or rewrites it.
export function inspectPng(bytes) {
  const fail = (code) => ({ ok: false, code });
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return fail('png_signature_invalid');
  let offset = 8;
  let header = null;
  let ended = false;
  const compressed = [];
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return fail('png_chunk_truncated');
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > bytes.length) return fail('png_chunk_truncated');
    const type = bytes.toString('ascii', offset + 4, offset + 8);
    if (!/^[A-Za-z]{4}$/.test(type)) return fail('png_chunk_type_invalid');
    if (pngCrc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) return fail(`png_crc_invalid:${type}`);
    const data = bytes.subarray(offset + 8, end - 4);
    if (!header && type !== 'IHDR') return fail('png_header_missing');
    if (type === 'IHDR') {
      if (header || length !== 13) return fail('png_header_invalid');
      const width = data.readUInt32BE(0);
      const height = data.readUInt32BE(4);
      const depth = data[8];
      const color = data[9];
      if (!width || !height || !DEPTHS[color]?.includes(depth) || data[10] !== 0 || data[11] !== 0 || data[12] > 1) return fail('png_header_invalid');
      header = { width, height, depth, color, interlace: data[12] };
    }
    if (type === 'IDAT') compressed.push(data);
    if (type === 'IEND') {
      if (length !== 0 || end !== bytes.length) return fail('png_end_invalid');
      ended = true;
    }
    offset = end;
  }
  if (!ended || !compressed.length) return fail('png_image_incomplete');
  const { width, height, depth, color, interlace } = header;
  const passes = (interlace ? ADAM7 : [[0, 0, 1, 1]]).map(([x, y, dx, dy]) => {
    const columns = Math.max(0, Math.ceil((width - x) / dx));
    const rows = Math.max(0, Math.ceil((height - y) / dy));
    return { rows: columns ? rows : 0, rowBytes: Math.ceil(columns * CHANNELS[color] * depth / 8) + 1 };
  });
  const expected = passes.reduce((sum, pass) => sum + pass.rows * pass.rowBytes, 0);
  // Bound decompression while inspecting untrusted historical files.
  if (expected > 256 * 1024 * 1024) return fail('png_audit_size_limit');
  let inflated;
  try { inflated = inflateSync(Buffer.concat(compressed), { maxOutputLength: expected + 1 }); }
  catch { return fail('png_pixel_stream_invalid'); }
  if (inflated.length !== expected) return fail('png_scanline_size_invalid');
  let rowStart = 0;
  for (const pass of passes) {
    for (let row = 0; row < pass.rows; row += 1) {
      if (inflated[rowStart] > 4) return fail('png_filter_invalid');
      rowStart += pass.rowBytes;
    }
  }
  return { ok: true, width, height };
}

export async function auditPngEvidence(root) {
  const report = { root: path.resolve(root), scanned: 0, valid: 0, failures: [] };
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile() && /\.png$/i.test(entry.name)) {
        report.scanned += 1;
        let result;
        try { result = inspectPng(await readFile(filename)); }
        catch { result = { ok: false, code: 'png_read_failed' }; }
        if (result.ok) report.valid += 1;
        else report.failures.push({ path: path.relative(report.root, filename).replaceAll('\\', '/'), code: result.code });
      }
    }
  }
  await visit(report.root);
  report.ok = report.scanned > 0 && report.failures.length === 0;
  return report;
}
