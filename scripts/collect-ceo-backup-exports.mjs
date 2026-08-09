import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  CEO_BACKUP_FORMAT,
  decryptBackup,
  fileSha256,
  sha256,
} from './lib/ceo-production-truth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECTED = Object.freeze([
  ['aim', 'public'],
  ['egoric', 'egoric'],
  ['vnecom', 'vnecom'],
  ['egolive', 'egolive'],
  ['portal', 'ceoportal'],
]);

function argument(name, required = true) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : null;
  if (required && !value) throw new Error(`Missing --${name}.`);
  return value;
}

function releaseSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function initializeSecretFile(file) {
  const target = path.resolve(file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${randomBytes(48).toString('base64url')}\n`, { flag: 'wx', mode: 0o600 });
  return target;
}

export function readBackupSecret(file) {
  const secret = fs.readFileSync(path.resolve(file), 'utf8').trim();
  if (secret.length < 48) throw new Error('Backup secret file is invalid.');
  return secret;
}

function normalizeEndpoint(rawUrl) {
  const url = new URL(String(rawUrl || ''));
  if (url.protocol !== 'https:') throw new Error('Backup export endpoint must use HTTPS.');
  url.pathname = '/api/ceo/v1/backup-export';
  url.search = '';
  url.hash = '';
  return url.toString();
}

async function download({ entity, schema, endpoint, secret }) {
  const response = await fetch(normalizeEndpoint(endpoint), {
    method: 'GET',
    headers: { 'x-ceo-backup-export-key': secret },
    cache: 'no-store',
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) throw new Error(`${entity} backup export failed with HTTP ${response.status}.`);
  if (response.headers.get('x-ceo-backup-schema') !== schema) throw new Error(`${entity} returned the wrong schema.`);
  const encrypted = Buffer.from(await response.arrayBuffer());
  const envelope = JSON.parse(encrypted.toString('utf8'));
  if (envelope.format !== CEO_BACKUP_FORMAT) throw new Error(`${entity} returned an unsupported backup.`);
  const payload = decryptBackup(encrypted, secret);
  if (payload.schema !== schema) throw new Error(`${entity} backup payload schema mismatch.`);
  const counts = payload.counts || {};
  return {
    encrypted,
    entry: {
      entity,
      schema,
      company: payload.company,
      sourceGroup: payload.sourceGroup,
      file: `${schema}.rrbackup`,
      tables: Object.keys(counts).length,
      rows: Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0),
      encryptedSha256: sha256(encrypted),
      databaseFingerprint: response.headers.get('x-ceo-database-fingerprint') || null,
    },
  };
}

async function collect() {
  const secretFile = path.resolve(argument('secret-file'));
  if (process.argv.includes('--initialize-secret')) initializeSecretFile(secretFile);
  const secret = readBackupSecret(secretFile);
  const outputDirectory = path.join(path.resolve(argument('output')), stamp());
  if (fs.existsSync(outputDirectory)) throw new Error('Backup output already exists.');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const entries = [];
  try {
    for (const [entity, schema] of EXPECTED) {
      const result = await download({ entity, schema, endpoint: argument(`${entity}-url`), secret });
      fs.writeFileSync(path.join(outputDirectory, result.entry.file), result.encrypted, { flag: 'wx', mode: 0o600 });
      entries.push(result.entry);
      console.log(`COLLECT ${schema}: ${result.entry.tables} tables, ${result.entry.rows} rows`);
    }
    const manifest = {
      format: 'repositoryrealms.ceo.backup-manifest',
      version: 1,
      createdAt: new Date().toISOString(),
      releaseSha: releaseSha(),
      encryptedAtRest: true,
      source: 'ephemeral-unpromoted-production-environment-deployments',
      schemas: entries,
    };
    const manifestFile = path.join(outputDirectory, 'manifest.json');
    fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    const sums = entries.map((entry) => `${entry.encryptedSha256}  ${entry.file}`);
    sums.push(`${fileSha256(manifestFile)}  manifest.json`);
    fs.writeFileSync(path.join(outputDirectory, 'SHA256SUMS'), `${sums.join('\n')}\n`, { flag: 'wx', mode: 0o600 });
    console.log(`MANIFEST ${manifestFile}`);
  } catch (error) {
    fs.rmSync(outputDirectory, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  collect().catch((error) => {
    console.error(`CEO backup collection failed: ${error.message}`);
    process.exit(1);
  });
}
