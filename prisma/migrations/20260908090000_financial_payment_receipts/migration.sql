CREATE TABLE "FinancialPaymentReceipt" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "approvalId" TEXT,
  "transactionId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "fxRate" DOUBLE PRECISION NOT NULL,
  "date" TEXT NOT NULL,
  "resultJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinancialPaymentReceipt_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinancialPaymentReceipt_idempotencyKey_key" ON "FinancialPaymentReceipt"("idempotencyKey");
CREATE UNIQUE INDEX "FinancialPaymentReceipt_transactionId_key" ON "FinancialPaymentReceipt"("transactionId");
CREATE INDEX "FinancialPaymentReceipt_resource_recordId_createdAt_idx" ON "FinancialPaymentReceipt"("resource", "recordId", "createdAt");
CREATE INDEX "FinancialPaymentReceipt_approvalId_idx" ON "FinancialPaymentReceipt"("approvalId");
ALTER TABLE "FinancialPaymentReceipt" ADD CONSTRAINT "FinancialPaymentReceipt_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Approval" ADD COLUMN "requestKey" TEXT;
CREATE UNIQUE INDEX "Approval_requestKey_key" ON "Approval"("requestKey");
