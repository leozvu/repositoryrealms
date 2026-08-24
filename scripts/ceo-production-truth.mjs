import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  backupSchema,
  fileSha256,
  readAndVerifyBackup,
  readEnvFile,
  rehearseRestore,
  writeBackup,
} from './lib/ceo-production-truth.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2];

function argument(name, required = true) {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : null;
  if (required && !value) throw new Error(`Missing --${name}.`);
  return value;
}

function releaseSha() {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

function loadInputs() {
  const entityEnvFile = path.resolve(argument('entity-env-file'));
  const portalEnvFile = path.resolve(argument('portal-env-file'));
  const entity = readEnvFile(entityEnvFile);
  const portal = readEnvFile(portalEnvFile);
  if (!entity.DIRECT_URL) throw new Error('Entity DIRECT_URL is missing.');
  if (!portal.DIRECT_URL) throw new Error('Portal DIRECT_URL is missing.');
  if (!portal.CEO_MESSAGING_ENCRYPTION_SECRET) throw new Error('CEO_MESSAGING_ENCRYPTION_SECRET is missing.');
  return { entity, portal, encryptionSecret: portal.CEO_MESSAGING_ENCRYPTION_SECRET };
}

function readSecretFile(file) {
  const secret = fs.readFileSync(path.resolve(file), 'utf8').trim();
  if (secret.length < 48) throw new Error('Backup secret file must contain at least 48 characters.');
  return secret;
}

function rehearsalInputs() {
  const secretFile = argument('secret-file', false);
  const rehearsalEnvFile = argument('rehearsal-env-file', false);
  const entityEnvFile = argument('entity-env-file', false);
  const portalEnvFile = argument('portal-env-file', false);
  const encryptionSecret = secretFile
    ? readSecretFile(secretFile)
    : portalEnvFile
      ? readEnvFile(path.resolve(portalEnvFile)).CEO_MESSAGING_ENCRYPTION_SECRET
      : '';
  if (String(encryptionSecret || '').length < 32) throw new Error('A valid --secret-file or portal encryption secret is required.');
  if (rehearsalEnvFile) {
    const rehearsal = readEnvFile(path.resolve(rehearsalEnvFile));
    const directUrl = rehearsal.DIRECT_URL || rehearsal.DATABASE_URL;
    if (!directUrl) throw new Error('Rehearsal database URL is missing.');
    return { encryptionSecret, isolatedDirectUrl: directUrl };
  }
  if (!entityEnvFile || !portalEnvFile) {
    throw new Error('Use --rehearsal-env-file, or provide both --entity-env-file and --portal-env-file.');
  }
  const entity = readEnvFile(path.resolve(entityEnvFile));
  const portal = readEnvFile(path.resolve(portalEnvFile));
  if (!entity.DIRECT_URL || !portal.DIRECT_URL) throw new Error('Restore target DIRECT_URL is missing.');
  return { entity, portal, encryptionSecret, isolatedDirectUrl: null };
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

async function backup() {
  const { entity, portal, encryptionSecret } = loadInputs();
  const outputRoot = path.resolve(argument('output'));
  const outputDirectory = path.join(outputRoot, stamp());
  if (fs.existsSync(outputDirectory)) throw new Error('Backup output already exists.');
  const definitions = [
    { schema: 'public', company: 'AIm Agency', sourceGroup: 'entity', directUrl: entity.DIRECT_URL },
    { schema: 'egoric', company: 'Egoric Agency', sourceGroup: 'entity', directUrl: entity.DIRECT_URL },
    { schema: 'vnecom', company: 'Vnecom LLC', sourceGroup: 'entity', directUrl: entity.DIRECT_URL },
    { schema: 'egolive', company: 'Egolive', sourceGroup: 'entity', directUrl: entity.DIRECT_URL },
    { schema: 'ceoportal', company: 'Leoz Group CEO Terminal', sourceGroup: 'portal', directUrl: portal.DIRECT_URL },
  ];
  const entries = [];
  for (const definition of definitions) {
    const result = await backupSchema({ ...definition, encryptionSecret });
    entries.push(writeBackup({ outputDirectory, backup: result, filename: `${definition.schema}.rrbackup` }));
    console.log(`BACKUP ${definition.schema}: ${result.summary.tables} tables, ${result.summary.rows} rows`);
  }
  const manifest = {
    format: 'repositoryrealms.ceo.backup-manifest',
    version: 1,
    createdAt: new Date().toISOString(),
    releaseSha: releaseSha(),
    encryptedAtRest: true,
    schemas: entries,
  };
  const manifestFile = path.join(outputDirectory, 'manifest.json');
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  fs.writeFileSync(path.join(outputDirectory, 'SHA256SUMS'), `${entries.map((entry) => `${entry.encryptedSha256}  ${entry.file}`).join('\n')}\n${fileSha256(manifestFile)}  manifest.json\n`, { flag: 'wx' });
  console.log(`MANIFEST ${manifestFile}`);
}

async function rehearse() {
  const { entity, portal, encryptionSecret, isolatedDirectUrl } = rehearsalInputs();
  const directory = path.resolve(argument('backup'));
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.format !== 'repositoryrealms.ceo.backup-manifest' || manifest.version !== 1) throw new Error('Unsupported backup manifest.');
  const results = [];
  for (const [index, entry] of manifest.schemas.entries()) {
    const payload = readAndVerifyBackup({ directory, entry, secret: encryptionSecret });
    const directUrl = isolatedDirectUrl || (entry.sourceGroup === 'portal' ? portal.DIRECT_URL : entity.DIRECT_URL);
    const rehearsalSchema = `rr_rehearsal_${entry.schema}_${Date.now().toString(36)}_${index}`.slice(0, 63);
    const result = await rehearseRestore({ root, directUrl, payload, rehearsalSchema });
    results.push(result);
    console.log(`RESTORE ${entry.schema}: ${result.tables} tables, ${result.rows} rows, ${result.foreignKeys} FKs`);
  }
  const evidence = {
    format: 'repositoryrealms.ceo.restore-rehearsal',
    version: 1,
    createdAt: new Date().toISOString(),
    sourceManifestSha256: fileSha256(path.join(directory, 'manifest.json')),
    releaseSha: releaseSha(),
    results,
    productionSchemasMutated: false,
    rehearsalSchemasDropped: true,
  };
  fs.writeFileSync(path.join(directory, 'restore-rehearsal.json'), `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx' });
  console.log(`EVIDENCE ${path.join(directory, 'restore-rehearsal.json')}`);
}

if (!['backup', 'rehearse'].includes(command)) {
  console.error('Usage: backup --entity-env-file <file> --portal-env-file <file> --output <directory>; rehearse --backup <directory> --secret-file <file> --rehearsal-env-file <isolated staging env>');
  process.exit(1);
}

(command === 'backup' ? backup() : rehearse()).catch((error) => {
  console.error(`CEO production truth failed: ${error.message}`);
  process.exit(1);
});
