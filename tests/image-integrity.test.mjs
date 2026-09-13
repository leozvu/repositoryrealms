import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { auditPngEvidence, inspectPng, pngCrc32 } from '../scripts/lib/image-integrity.mjs';

function chunk(type, data) {
  const name = Buffer.from(type);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(pngCrc32(Buffer.concat([name, data])));
  return Buffer.concat([size, name, data, crc]);
}

function png(scanline = Buffer.from([0, 255, 0, 0, 255])) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(scanline)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

test('valid PNG passes the complete pixel-stream check and CRC uses the standard reference value', () => {
  assert.equal(pngCrc32(Buffer.from('123456789')), 0xcbf43926);
  assert.deepEqual(inspectPng(png()), { ok: true, width: 1, height: 1 });
});

test('newline-normalized, truncated and corrupted PNG evidence is rejected', () => {
  const valid = png();
  const normalized = Buffer.from([...valid].filter((byte, index) => !(byte === 13 && valid[index + 1] === 10)));
  assert.equal(inspectPng(normalized).code, 'png_signature_invalid');
  assert.equal(inspectPng(valid.subarray(0, valid.length - 3)).code, 'png_chunk_truncated');
  const corrupt = Buffer.from(valid);
  corrupt[45] ^= 1;
  assert.match(inspectPng(corrupt).code, /^png_crc_invalid/);
  assert.equal(inspectPng(valid.subarray(0, valid.length - 12)).code, 'png_image_incomplete');
});

test('correct checksums cannot disguise malformed decompressed scanlines', () => {
  assert.equal(inspectPng(png(Buffer.from([0, 255]))).code, 'png_scanline_size_invalid');
  assert.equal(inspectPng(png(Buffer.from([5, 255, 0, 0, 255]))).code, 'png_filter_invalid');
});

test('recursive audit reports damaged evidence without changing either source file', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'realm-png-audit-'));
  try {
    assert.equal((await auditPngEvidence(root)).ok, false, 'empty evidence must not pass');
    await mkdir(path.join(root, 'nested'));
    const valid = png();
    const damaged = valid.subarray(0, 20);
    await writeFile(path.join(root, 'valid.png'), valid);
    await writeFile(path.join(root, 'nested', 'damaged.PNG'), damaged);
    const report = await auditPngEvidence(root);
    assert.equal(report.scanned, 2);
    assert.equal(report.valid, 1);
    assert.deepEqual(report.failures, [{ path: 'nested/damaged.PNG', code: 'png_chunk_truncated' }]);
    assert.deepEqual(await readFile(path.join(root, 'valid.png')), valid);
    assert.deepEqual(await readFile(path.join(root, 'nested', 'damaged.PNG')), damaged);
  } finally {
    const resolved = path.resolve(root);
    const temporary = path.resolve(tmpdir());
    assert.equal(path.dirname(resolved), temporary);
    assert.ok(path.basename(resolved).startsWith('realm-png-audit-'));
    await rm(resolved, { recursive: true, force: true });
  }
});
