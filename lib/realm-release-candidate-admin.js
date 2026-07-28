import { isDirector } from './perm.js';
import { evaluateRealmExperiencePilot } from './realm-experience.js';
import { loadRealmExperienceTelemetry } from './realm-experience-admin.js';
import { RealmOperationError } from './realm-operation.js';
import { loadRealmPilotOperationsDashboard } from './realm-pilot-operations.js';
import { buildRealmReleaseCandidateDossier } from './realm-release-candidate.js';

export async function loadRealmReleaseCandidateDossier(db, sessionUser, { now = new Date() } = {}) {
  if (!isDirector(sessionUser)) {
    throw new RealmOperationError('Chỉ Giám đốc được xem Release Candidate dossier.', 403, 'realm_release_candidate_forbidden');
  }
  const [operationsDashboard, telemetry] = await Promise.all([
    loadRealmPilotOperationsDashboard(db, sessionUser, { now }),
    loadRealmExperienceTelemetry(db),
  ]);
  const experienceScorecard = evaluateRealmExperiencePilot({
    telemetry,
    readiness: operationsDashboard.readiness,
    openFeedback: operationsDashboard.readiness?.summary?.unresolvedFeedback,
    blockedFeedback: operationsDashboard.readiness?.summary?.blockedFeedback,
  });
  return buildRealmReleaseCandidateDossier({ operationsDashboard, experienceScorecard, generatedAt: now });
}
