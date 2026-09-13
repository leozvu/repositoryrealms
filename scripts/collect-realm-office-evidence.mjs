import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectPng } from './lib/image-integrity.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VIEWS = ['first-person', 'overview', 'work-panel', 'high-profile'];
const PLATFORMS = ['desktop', 'mobile'];
const SOURCE_FILES = [
  'components/realm/three/guildhallScene.js',
  'components/realm/three/officeAvatar.js',
  'components/realm/three/officeRuntime.js',
  'components/realm/three/officeQuality.js',
  'components/realm/three/officeMaterials.js',
  'public/realms/assets/materials/pbr-v1/manifest.json',
  'components/realm/RealmWorld3D.jsx',
  'components/realm/realm-world-3d.module.css',
  'components/realm/RealmOffice.jsx',
  'components/realm/realm-office.module.css',
  'tests/e2e/realm-office-3d.spec.mjs',
  'tests/e2e/realm-office-workspace-ux.spec.mjs',
  'playwright.config.mjs',
];
const HELP = `Collect the eight canonical Realm office PNGs after QA has finished.
Usage: node scripts/collect-realm-office-evidence.mjs [options]
  --source PATH       Playwright output directory; repeat for separate runs.
                      Default: test-results
  --output PATH       Default: qa/realm-3d/2026-09-08
  --run-label TEXT    Optional label for these runs.
  --notes TEXT        Optional collection note; repeat to add more notes.
  --help              Print this usage without collecting files.
Paths are relative to the repository. Duplicate views require an explicit source
selection. Screenshots do not establish that their tests passed.
`;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const relativePath = filename => path.relative(PROJECT_ROOT, filename).split(path.sep).join('/');

export function parseEvidenceArgs(args) {
  const options = { sources: [], output: 'qa/realm-3d/2026-09-08', runLabel: null, notes: [] };
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i];
    if (flag === '--help') return { help: true };
    if (!['--source', '--output', '--run-label', '--notes'].includes(flag)) throw new Error(`Unknown option: ${flag}`);
    const value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${flag}`);
    if (flag === '--source') options.sources.push(value);
    if (flag === '--output') options.output = value;
    if (flag === '--run-label') options.runLabel = value;
    if (flag === '--notes') options.notes.push(value);
  }
  if (!options.sources.length) options.sources.push('test-results');
  return options;
}

async function readStableFile(filename) {
  const before = await stat(filename);
  const bytes = await readFile(filename);
  const after = await stat(filename);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs || after.size !== bytes.length) {
    throw new Error(`File changed during collection: ${relativePath(filename)}`);
  }
  return { bytes, metadata: { path: relativePath(filename), bytes: bytes.length, sha256: sha256(bytes), modifiedAt: after.mtime.toISOString() } };
}

async function findScreenshots(directory, found) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    // Trace resources and Playwright failure captures are never release evidence.
    if (/trace|test-failed/i.test(entry.name) || /^(resources|attachments)$/i.test(entry.name)) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) await findScreenshots(filename, found);
    else if (entry.isFile() && VIEWS.some(view => entry.name === `${view}.png`)) {
      const segments = filename.split(path.sep);
      if (segments.some(part => /^(traces?|trace-artifacts|resources|attachments)$/i.test(part) || /test-failed/i.test(part))) continue;
      const project = segments.map(part => /^realm-office-3d-.*-(desktop|mobile)-chromium(?:-retry\d+)?(?:-repeat\d+)?$/.exec(part)).find(Boolean);
      if (!project) throw new Error(`Cannot identify Realm desktop/mobile project: ${relativePath(filename)}`);
      const target = `${project[1]}-${entry.name}`;
      if (found.has(target) && found.get(target) !== filename) {
        throw new Error(`Duplicate ${target}; select one run with --source: ${relativePath(found.get(target))}, ${relativePath(filename)}`);
      }
      found.set(target, filename);
    }
  }
}

export async function collectRealmOfficeEvidence(options) {
  const sources = [...new Set(options.sources.map(source => path.resolve(PROJECT_ROOT, source)))];
  const output = path.resolve(PROJECT_ROOT, options.output);
  for (const source of sources) {
    const fromSource = path.relative(source, output);
    if (!fromSource || (!fromSource.startsWith(`..${path.sep}`) && fromSource !== '..' && !path.isAbsolute(fromSource))) {
      throw new Error('Evidence output must be outside the source directories.');
    }
  }
  const found = new Map();
  for (const source of sources) await findScreenshots(source, found);
  const expected = PLATFORMS.flatMap(platform => VIEWS.map(view => `${platform}-${view}.png`));
  const missing = expected.filter(filename => !found.has(filename));
  if (missing.length) throw new Error(`Missing canonical screenshots: ${missing.join(', ')}`);

  // Validate every original buffer before writing anything. Copy those same bytes,
  // so a subsequent change to a source file cannot bypass the CRC inspection.
  const images = [];
  for (const filename of expected) {
    const source = await readStableFile(found.get(filename));
    const png = inspectPng(source.bytes);
    if (!png.ok) throw new Error(`Invalid PNG ${source.metadata.path}: ${png.code}`);
    images.push({ filename, bytes: source.bytes, metadata: {
      file: filename,
      source: source.metadata.path,
      sourceModifiedAt: source.metadata.modifiedAt,
      bytes: source.metadata.bytes,
      sha256: source.metadata.sha256,
      width: png.width,
      height: png.height,
      pngIntegrity: 'signature, chunk CRCs and decoded scanlines verified',
    } });
  }
  const build = await readStableFile(path.join(PROJECT_ROOT, '.next/BUILD_ID'));
  const buildId = build.bytes.toString('utf8').trim();
  if (!buildId) throw new Error('The production .next/BUILD_ID is empty.');
  const sourceFiles = [];
  for (const filename of SOURCE_FILES) sourceFiles.push((await readStableFile(path.join(PROJECT_ROOT, filename))).metadata);
  const manifest = {
    schemaVersion: 1,
    collectedAt: new Date().toISOString(),
    runLabel: options.runLabel,
    notes: options.notes,
    sourceDirectories: sources.map(relativePath),
    context: {
      route: '/realm-demo?world=3d',
      dataMode: 'demo',
      renderer: 'software rendering (QA run context; not detected from PNG bytes)',
      performanceScope: 'Behavior and visual evidence only; not a hardware FPS benchmark.',
      testStatus: 'Not evaluated by this collector. Refer to the original Playwright results.',
      timestampScope: 'PNG timestamps are source file modification times, not independently verified capture times.',
      buildScope: 'BUILD_ID and source hashes observed at collection time; they do not alone prove which build produced each PNG.',
    },
    build: { id: buildId, ...build.metadata },
    sourceFiles,
    images: images.map(image => image.metadata),
  };
  await mkdir(output, { recursive: true });
  for (const image of images) await writeFile(path.join(output, image.filename), image.bytes);
  // Write the manifest last, after every canonical image has been copied.
  await writeFile(path.join(output, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { count: images.length, manifestPath: relativePath(path.join(output, 'manifest.json')) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseEvidenceArgs(process.argv.slice(2));
    if (options.help) process.stdout.write(HELP);
    else {
      const result = await collectRealmOfficeEvidence(options);
      process.stdout.write(`Collected ${result.count} verified PNGs; ${result.manifestPath}\n`);
    }
  } catch (error) {
    process.stderr.write(`Evidence collection failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
