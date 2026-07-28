/* Deprecated on purpose: the old restore path read application credentials and
   could overwrite a live schema. Restore verification now runs only through the
   isolated staging rehearsal documented in HUONG-DAN-BACKUP.md. */
console.error('Direct restore is disabled. Verify the backup and run `npm run staging:backup:rehearse:legacy` against isolated staging.');
process.exit(1);
