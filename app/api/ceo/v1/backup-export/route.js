import { NextResponse } from 'next/server';
import {
  authorizeCeoBackupExport,
  CeoBackupExportError,
  createDeploymentBackupExport,
  safeCeoBackupExportDiagnostic,
} from '@/lib/ceo-backup-export';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(request) {
  try {
    const authorization = authorizeCeoBackupExport(request);
    const backup = await createDeploymentBackupExport({ encryptionSecret: authorization.secret });
    return new Response(backup.encrypted, {
      status: 200,
      headers: {
        'Cache-Control': 'private, no-store, max-age=0',
        'Content-Disposition': `attachment; filename="${backup.schema}.rrbackup"`,
        'Content-Type': 'application/vnd.repositoryrealms.encrypted-backup',
        'X-CEO-Backup-Schema': backup.schema,
        'X-CEO-Backup-Tables': String(backup.tables),
        'X-CEO-Backup-Rows': String(backup.rows),
        'X-CEO-Database-Fingerprint': backup.databaseFingerprint,
        'X-CEO-Schema-Contract-Sha256': backup.schemaContractSha256,
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const known = error instanceof CeoBackupExportError;
    const diagnostic = known ? undefined : safeCeoBackupExportDiagnostic(error);
    if (!known) console.error('[CEO backup export]', diagnostic);
    return NextResponse.json(
      { error: known ? error.message : 'Backup export failed.', code: known ? error.code : 'ceo_backup_export_failed', diagnostic },
      { status: known ? error.status : 500, headers: { 'Cache-Control': 'private, no-store' } },
    );
  }
}
