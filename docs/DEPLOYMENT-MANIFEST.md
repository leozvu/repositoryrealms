# Deployment Manifest — RepositoryRealms

Cập nhật: 2026-08-09. Entity UX/UI release: `ux-ui-rehab`; CEO control-plane giữ nguyên.

## Production domains đang phục vụ

| Entity | Vercel project | Domain | Schema | Stable deployment | Trạng thái |
|---|---|---|---|---|---|
| AIm Agency | `agency-erp` | `agency-erp-mu.vercel.app` | `public` | `dpl_6czBa3jbvLmK2mSBKzbnv5jyiqvT` | READY; UX rehab smoke PASS |
| Egoric Agency | `erp-egoric` | `erp-egoric.vercel.app` | `egoric` | `dpl_DQgU5EBtPwihNL1DuJuXk9T3QYbS` | READY; UX rehab smoke PASS |
| VNECOM LLC | `erp-vnecom` | `erp-vnecom.vercel.app` | `vnecom` | `dpl_A148KFQ5w9d8BGionGuUNDyQbqBc` | READY; UX rehab smoke PASS |
| Egolive | `erp-egolive` | `erp-egolive.vercel.app` | `egolive` | `dpl_42MbiE38n8Ug3iZJSha5MEhgyJ84` | READY; UX rehab smoke PASS |
| CEO Terminal | `ceo-terminal-leoz` | `ceo-terminal-leoz.vercel.app` | `ceoportal` | `dpl_6ARCEAAYKhkAxK8oUg9gibCDY8ou` | READY; `/login` 200 |

UX/UI rehab được build thành bốn canary production-env với `--skip-domain`, smoke test trước cutover rồi mới promote. Kiểm tra hậu promote trên cả bốn domain: `/login` 200 và đúng entity brand; `/dashboard` 307 khi chưa đăng nhập; `/api/settings` 401; credentials provider sẵn sàng. Release không có thay đổi Prisma schema hoặc migration và không promote CEO Terminal.

### Rollback evidence cho UX/UI rehab

| Entity | Canary đã promote | Previous stable deployment |
|---|---|---|
| AIm Agency | `agency-j4haatkbb-leozs-projects-64a5f0c8.vercel.app` | `dpl_5SyEfVuneLtCf5wpsBXBpgaeotbW` |
| Egoric Agency | `erp-egoric-ibqvzgr6n-leozs-projects-64a5f0c8.vercel.app` | `dpl_FjAfMgTg1uCmFySrXrd7xPo5wejJ` |
| VNECOM LLC | `erp-vnecom-gk10tj7bi-leozs-projects-64a5f0c8.vercel.app` | `dpl_69L7bXo8puX94UAjLww3pAGi9ePc` |
| Egolive | `erp-egolive-21ywbssbq-leozs-projects-64a5f0c8.vercel.app` | `dpl_B39QEDvdpiATRYYryxEBvBmTvXFX` |

Ngoài phạm vi: Fretas, `erp-master-leoz`, LeozOps và contract `lead-snapshot v1`.

## Backup gần nhất đã restore-test

- Thư mục ngoài repository: `C:\Users\Asus\AppData\Local\CRMegoricBackups\20260809T040418Z`.
- Archive key ngoài repository: `C:\Users\Asus\AppData\Local\CRMegoricBackups\keys\ceo12-20260809.archive.key`.
- Key ACL: chỉ tài khoản Windows `LAPTOP-0FKLAPQP\Asus` và `SYSTEM`.
- Mã hóa: AES-256-GCM + gzip; checksum SHA-256 cho từng file và manifest.
- Phạm vi: đúng 5 schema `public`, `egoric`, `vnecom`, `egolive`, `ceoportal`; không gồm Fretas.
- Restore rehearsal: PASS 5/5 trên các schema staging tạm; row count khớp; 51 foreign key/schema được phục hồi; mọi schema rehearsal đã drop.
- Production database chỉ được đọc bằng transaction `READ ONLY`.

Chi tiết evidence: `docs/realms/CEO-12-PRODUCTION-TRUTH-EVIDENCE.md`.

## Schema gate hiện tại

Snapshot cho thấy cả năm schema có 95 bảng Prisma. CEO Portal production từng trả `P2022` khi đọc bằng model Prisma hiện tại, nghĩa là có column drift so với release candidate; công cụ backup đã đọc các cột thực tế và chứng minh dữ liệu có thể restore vào schema hiện tại. Không được promote CEO Terminal trước khi chạy migration diff, backup gate và additive migration plan.

## Rollback

1. Code: promote `Previous stable deployment` trong bảng rollback evidence; không rollback bằng cách viết lại Git history.
2. Dữ liệu: chỉ restore từ bộ `20260809T040418Z` sau quyết định founder và rehearsal mới.
3. CEO feature: hạ rollout ring/kill switch của Portal; local ERP login phải tiếp tục hoạt động.
4. Không xóa hoặc ghi đè schema production để sửa drift.

## Release discipline

- Mọi business action đi qua RepositoryRealms Authorization → Business Rules → Receipt → Audit.
- CEO Terminal không ghi trực tiếp business table của entity.
- ERP của từng entity giữ workflow và dữ liệu riêng; Realm là giao diện tùy chọn.
- Trước promote: migration diff, authenticated SSO E2E, contract tests, chaos suite, canary và rollback evidence đều phải xanh.
