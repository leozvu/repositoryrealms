import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function routeFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) routeFiles(target, files);
    else if (entry.isFile() && /^route\.(?:js|jsx|ts|tsx)$/.test(entry.name)) files.push(target);
  }
  return files;
}

test('legacy API 401 payloads keep error and expose the normalized unauthorized code', () => {
  const offenders = [];
  for (const file of routeFiles(path.join(root, 'app', 'api'))) {
    const relative = path.relative(root, file).split(path.sep).join('/');
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!/error:\s*['"`]unauthorized/i.test(line) || !/(?:status:\s*401|,\s*401\s*\))/.test(line)) return;
      if (!/code:\s*['"`]unauthorized['"`]/.test(line)) offenders.push(`${relative}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});
