import { auditRoleCapabilities } from '../lib/role-capability-audit.js';

const result = auditRoleCapabilities();
const summary = {
  roles: result.requirements.length,
  checks: result.checks.length,
  passed: result.checks.length - result.failures.length,
  failed: result.failures.length,
};

console.log(JSON.stringify({ summary, failures: result.failures }, null, 2));
if (result.failures.length) process.exitCode = 1;
