-- LeozOps Sprint 1D: append-only single-operator human review facts.
-- A review is not an Approval, command, execution or receipt.
CREATE TABLE "LeozOpsProposalReview" (
  "id" TEXT NOT NULL,
  "proposalId" TEXT NOT NULL,
  "correlationId" TEXT NOT NULL,
  "decision" TEXT NOT NULL,
  "reasonCode" TEXT NOT NULL,
  "governanceMode" TEXT NOT NULL DEFAULT 'single_operator_explicit_review',
  "reviewerId" TEXT NOT NULL,
  "proposalPayloadHash" TEXT NOT NULL,
  "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeozOpsProposalReview_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LeozOpsProposalReview_proposalId_key"
ON "LeozOpsProposalReview"("proposalId");

CREATE UNIQUE INDEX "LeozOpsProposalReview_correlationId_key"
ON "LeozOpsProposalReview"("correlationId");

CREATE INDEX "LeozOpsProposalReview_reviewerId_reviewedAt_idx"
ON "LeozOpsProposalReview"("reviewerId", "reviewedAt");

CREATE INDEX "LeozOpsProposalReview_decision_reviewedAt_idx"
ON "LeozOpsProposalReview"("decision", "reviewedAt");
