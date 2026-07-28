/* Deprecated on purpose: the v1 script read application credentials, skipped failed
   tables and deleted old backups automatically. Keeping a hard failure at this path
   prevents an old Task Scheduler entry or runbook from silently using it. */
console.error('Legacy backup is disabled. Run `npm run backup:plan`, review the target, then run `npm run backup`.');
process.exit(1);
