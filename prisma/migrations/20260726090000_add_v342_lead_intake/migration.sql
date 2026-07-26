-- v3.42 (cụm Lead): cổng nhận lead tự động + chia sale theo khu vực/mảng/chiến dịch.
-- Hoàn toàn CỘNG THÊM: 5 cột nullable + 3 chỉ mục. Không sửa, không xóa cột nào đang có,
-- nên dữ liệu lead hiện tại của 4 công ty giữ nguyên.

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "campaign" TEXT,
ADD COLUMN     "intakeAt" TIMESTAMP(3),
ADD COLUMN     "intakeKey" TEXT,
ADD COLUMN     "region" TEXT,
ADD COLUMN     "serviceLine" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Lead_intakeKey_key" ON "Lead"("intakeKey");

-- CreateIndex
CREATE INDEX "Lead_campaign_idx" ON "Lead"("campaign");

-- CreateIndex
CREATE INDEX "Lead_ownerId_stage_idx" ON "Lead"("ownerId", "stage");
