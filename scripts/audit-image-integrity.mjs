import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { auditPngEvidence } from './lib/image-integrity.mjs';

const args = process.argv.slice(2);
const rootIndex = args.indexOf('--root');
if (rootIndex >= 0 && (!args[rootIndex + 1] || args[rootIndex + 1].startsWith('--'))) throw new Error('--root requires a directory');
const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = rootIndex >= 0 ? path.resolve(args[rootIndex + 1]) : path.join(repository, 'qa');
const report = await auditPngEvidence(root);
if (args.includes('--json')) console.log(JSON.stringify(report, null, 2));
else {
  console.log(`PNG integrity: ${report.valid}/${report.scanned} valid; ${report.failures.length} failed.`);
  for (const failure of report.failures.slice(0, 30)) console.log(`${failure.code}: ${failure.path}`);
  if (report.failures.length > 30) console.log(`${report.failures.length - 30} additional failures; use --json for the complete read-only report.`);
  if (!report.scanned) console.log('No PNG evidence found; an empty audit cannot pass.');
  if (report.failures.length) console.log('Recapture damaged evidence from its original source. No files were changed.');
}
process.exitCode = report.ok ? 0 : 1;
