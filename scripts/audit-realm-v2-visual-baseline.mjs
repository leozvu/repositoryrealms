import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { REALM_V2_AREAS } from '../lib/realm-v2-contracts.js';
import {
  aggregatePhaseScore,
  PHASE_0_AREAS,
  PHASE_0_BREAKPOINTS,
  PHASE_0_SCORE_WEIGHTS,
  weightedAreaScore,
} from '../qa/realm-v2-visual-baseline/phase-0-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qaRoot = path.join(root, 'qa', 'realm-v2-visual-baseline');
const referenceLockPath = path.join(qaRoot, 'reference-lock.json');
const manifestPath = path.join(qaRoot, 'baseline-manifest.json');
const scorecardPath = path.join(qaRoot, 'scorecard.json');
const reportPath = path.join(qaRoot, 'PHASE-0-REPORT.md');
const matrixPath = path.join(root, 'docs', 'realms', 'design-system', 'REALM-DESIGN-COVERAGE-MATRIX.md');
const checkOnly = process.argv.includes('--check');

function fail(message) { throw new Error(message); }
function sha256(file) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function isPreviewToolingNoise(issue) {
  return issue.includes('vercel.live/_next-live/feedback/feedback.js');
}
function hasActionableRuntimeIssue(screenshot) {
  return screenshot.runtimeIssues.pageErrors.length > 0
    || screenshot.runtimeIssues.serverErrors.length > 0
    || screenshot.runtimeIssues.consoleErrors.some((issue) => !isPreviewToolingNoise(issue));
}

function pngDimensions(file) {
  const bytes = fs.readFileSync(file);
  if (bytes.length < 24 || bytes.toString('ascii', 1, 4) !== 'PNG') fail(`${path.relative(root, file)} is not a PNG.`);
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

function verifyReferences() {
  const lock = JSON.parse(fs.readFileSync(referenceLockPath, 'utf8'));
  if (lock.assets.length !== 14 || new Set(lock.assets.map((asset) => asset.file)).size !== 14) fail('Reference lock must contain 14 unique boards.');
  for (const asset of lock.assets) {
    const file = path.join(root, lock.root, asset.file);
    if (!fs.existsSync(file)) fail(`Missing visual reference ${asset.file}.`);
    if (sha256(file) !== asset.sha256) fail(`Reference checksum changed: ${asset.file}.`);
    const dimensions = pngDimensions(file);
    if (dimensions.width !== lock.width || dimensions.height !== lock.height) fail(`Reference dimensions changed: ${asset.file}.`);
  }
  return lock;
}

function verifyConfiguration() {
  if (PHASE_0_AREAS.length !== 18 || new Set(PHASE_0_AREAS.map((area) => area.slug)).size !== 18) fail('Scorecard must contain 18 unique areas.');
  if (PHASE_0_BREAKPOINTS.length !== 5 || new Set(PHASE_0_BREAKPOINTS.map((item) => item.width)).size !== 5) fail('Exactly five unique breakpoints are required.');
  if (Object.values(PHASE_0_SCORE_WEIGHTS).reduce((sum, value) => sum + value, 0) !== 100) fail('Score weights must total 100.');
  const contractBySlug = new Map(REALM_V2_AREAS.map((area) => [area.slug, area]));
  for (const area of PHASE_0_AREAS) {
    const contract = contractBySlug.get(area.slug);
    if (!contract || contract.canonicalPath !== area.canonicalPath) fail(`Canonical route mismatch for ${area.slug}.`);
    for (const dimension of Object.keys(PHASE_0_SCORE_WEIGHTS)) {
      const value = area.dimensions[dimension];
      if (!Number.isFinite(value) || value < 0 || value > 100) fail(`Invalid ${dimension} score for ${area.slug}.`);
    }
  }
}

function verifyScreenshots() {
  if (!fs.existsSync(manifestPath)) fail('baseline-manifest.json is missing; run realm:v2:baseline:capture.');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expectedCount = PHASE_0_AREAS.length * PHASE_0_BREAKPOINTS.length;
  if (manifest.screenshotCount !== expectedCount || manifest.screenshots?.length !== expectedCount) fail(`Expected ${expectedCount} screenshot records.`);
  const pngFiles = fs.readdirSync(path.join(qaRoot, 'current')).filter((file) => file.endsWith('.png'));
  if (pngFiles.length !== expectedCount) fail(`Expected exactly ${expectedCount} PNG files, found ${pngFiles.length}.`);
  const expectedKeys = new Set(PHASE_0_AREAS.flatMap((area) => PHASE_0_BREAKPOINTS.map((breakpoint) => `${area.slug}:${breakpoint.id}`)));
  const actualKeys = new Set();
  for (const screenshot of manifest.screenshots) {
    const key = `${screenshot.area}:${screenshot.breakpoint}`;
    if (!expectedKeys.has(key) || actualKeys.has(key)) fail(`Unexpected or duplicate screenshot ${key}.`);
    actualKeys.add(key);
    const area = PHASE_0_AREAS.find((item) => item.slug === screenshot.area);
    const breakpoint = PHASE_0_BREAKPOINTS.find((item) => item.id === screenshot.breakpoint);
    const file = path.join(root, screenshot.file);
    if (!fs.existsSync(file)) fail(`Missing screenshot file ${screenshot.file}.`);
    if (sha256(file) !== screenshot.sha256) fail(`Screenshot checksum changed: ${screenshot.file}.`);
    const dimensions = pngDimensions(file);
    if (dimensions.width !== breakpoint.width || dimensions.height !== breakpoint.height) fail(`Screenshot dimensions changed: ${screenshot.file}.`);
    if (new URL(screenshot.finalPath, 'https://baseline.invalid').pathname !== area.canonicalPath) fail(`Final path mismatch in ${screenshot.file}.`);
  }
  if (actualKeys.size !== expectedKeys.size) fail('Screenshot matrix is incomplete.');
  return manifest;
}

function buildScorecard(manifest) {
  const responsiveByArea = new Map(PHASE_0_AREAS.map((area) => [area.slug, manifest.screenshots.filter((shot) => shot.area === area.slug)]));
  return {
    version: 1,
    status: 'Design complete / implementation partial',
    scoredAt: manifest.capturedAt,
    sourceCommit: manifest.sourceCommit,
    rubric: PHASE_0_SCORE_WEIGHTS,
    aggregateScore: aggregatePhaseScore(),
    releaseGate: { aggregateMinimum: 95, areaMinimum: 90, stableRegionDiffMaximumPercent: 5 },
    areas: PHASE_0_AREAS.map((area) => {
      const shots = responsiveByArea.get(area.slug);
      return {
        slug: area.slug,
        productArea: area.productArea,
        referenceBoard: area.board,
        implementation: area.implementation,
        canonicalData: area.canonicalData,
        visualScore: area.visualScore,
        responsiveScore: area.responsiveScore,
        weightedScore: weightedAreaScore(area),
        dimensions: area.dimensions,
        baselineEvidence: {
          screenshotCount: shots.length,
          horizontalOverflowSamples: shots.filter((shot) => shot.horizontalOverflowPx > 0).length,
          runtimeIssueSamples: shots.filter(hasActionableRuntimeIssue).length,
          previewToolingNoiseSamples: shots.filter((shot) => shot.runtimeIssues.consoleErrors.some(isPreviewToolingNoise)).length,
        },
      };
    }),
  };
}

function buildReport(manifest, scorecard, referenceLock) {
  const overflow = manifest.screenshots.filter((shot) => shot.horizontalOverflowPx > 0);
  const runtimeIssues = manifest.screenshots.filter(hasActionableRuntimeIssue);
  const previewNoise = manifest.screenshots.filter((shot) => shot.runtimeIssues.consoleErrors.some(isPreviewToolingNoise));
  const mobileSamples = manifest.screenshots.filter((shot) => ['phone-375', 'phone-390'].includes(shot.breakpoint));
  const mobileNavSamples = mobileSamples.filter((shot) => shot.hasFiveItemMobileNav);
  const serverErrorCounts = new Map();
  for (const shot of manifest.screenshots) for (const issue of shot.runtimeIssues.serverErrors) serverErrorCounts.set(issue, (serverErrorCounts.get(issue) || 0) + 1);
  const serverErrorRows = [...serverErrorCounts.entries()].sort((a, b) => b[1] - a[1]).map(([issue, count]) => `| \`${issue}\` | ${count} |`).join('\n') || '| None | 0 |';
  const rows = scorecard.areas.map((area, index) => `| ${index + 1} | ${area.productArea} | ${area.implementation} | ${area.canonicalData} | ${area.visualScore}% | ${area.responsiveScore}% | ${area.weightedScore}% |`).join('\n');
  return `# Realm v2 Phase 0 Baseline Report\n\nStatus: **Design complete / implementation partial**  \nSource commit: \`${manifest.sourceCommit}\`  \nCaptured: ${manifest.capturedAt}  \nTarget: ${manifest.baseUrl}\n\n## Exit evidence\n\n- Locked references: **${referenceLock.assets.length}/14** boards passed SHA-256 and 1536×1024 checks.\n- Product areas: **${scorecard.areas.length}/18** configured.\n- Baseline screenshots: **${manifest.screenshotCount}/90** at 375/390/768/1024/1440.\n- Initial weighted score: **${scorecard.aggregateScore}%**; release target is at least 95%.\n- Horizontal-overflow samples: **${overflow.length}/90**.\n- Samples with actionable runtime issues: **${runtimeIssues.length}/90**.\n- Preview-toolbar CSP noise: **${previewNoise.length}/90** samples; retained in raw evidence but excluded from app defect counts.\n- Five-item mobile navigation present: **${mobileNavSamples.length}/${mobileSamples.length}** phone samples.\n- Document language: **${[...new Set(manifest.screenshots.map((shot) => shot.documentLanguage || 'unset'))].join(', ')}**.\n- Canonical business routes remain authoritative; the capture performs no write action.\n\n## Server error evidence\n\n| Response | Samples |\n| --- | ---: |\n${serverErrorRows}\n\n## Area scorecard\n\n| # | Product area | Implementation | Canonical data | Visual | Responsive | Weighted |\n| --- | --- | --- | --- | ---: | ---: | ---: |\n${rows}\n\n## Interpretation\n\nThe score is an implementation baseline, not design approval. The approved visual boards are locked, while the authenticated product currently preserves canonical ERP workflows and applies only a partial Realm v2 presentation. The next implementation phases must raise each area to at least 90 and the aggregate to at least 95 without replacing ERP routes, RBAC, business rules or receipts.\n\nSee [DEFECT-REGISTER.md](./DEFECT-REGISTER.md) for P0/P1/P2 remediation order.\n`;
}

function writeOrCheck(file, content) {
  if (checkOnly) {
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) fail(`${path.relative(root, file)} is stale; run npm run audit:realm:v2:baseline.`);
  } else {
    fs.writeFileSync(file, content);
  }
}

function main() {
  const referenceLock = verifyReferences();
  verifyConfiguration();
  const manifest = verifyScreenshots();
  const scorecard = buildScorecard(manifest);
  const report = buildReport(manifest, scorecard, referenceLock);
  writeOrCheck(scorecardPath, `${JSON.stringify(scorecard, null, 2)}\n`);
  writeOrCheck(reportPath, report);
  const matrix = fs.readFileSync(matrixPath, 'utf8');
  for (const column of ['Implementation', 'Canonical data', 'Visual score', 'Responsive score']) {
    if (!matrix.includes(column)) fail(`Coverage matrix is missing the ${column} column.`);
  }
  if (!matrix.includes('Design complete / implementation partial')) fail('Coverage matrix has an inaccurate status label.');
  const overflow = manifest.screenshots.filter((shot) => shot.horizontalOverflowPx > 0).length;
  const issues = manifest.screenshots.filter(hasActionableRuntimeIssue).length;
  console.log(`Realm v2 Phase 0 baseline verified: 14 references, 18 areas, ${manifest.screenshotCount} screenshots, score ${scorecard.aggregateScore}%.`);
  console.log(`Recorded evidence: ${overflow} horizontal-overflow samples and ${issues} actionable runtime-issue samples (remediation gates begin after Phase 0).`);
}

try { main(); } catch (error) {
  console.error(`[realm-v2-baseline-audit] ${error.message}`);
  process.exitCode = 1;
}
