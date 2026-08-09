# Deployment Manifest — RepositoryRealms

Cập nhật: 2026-08-09. Control-plane release branch: `codex/realm-design-system-v2-implementation`; exact release commit được ghi trong CEO-18 evidence sau canary.

## Production domains đang phục vụ

| Entity | Vercel project | Domain | Schema | Stable deployment | Trạng thái |
|---|---|---|---|---|---|
| AIm Agency | `agency-erp` | `agency-erp-mu.vercel.app` | `public` | `dpl_2wdKb7RzMMtukGytCgufCnzhtJjA` | READY; `/login` 200 |
| Egoric Agency | `erp-egoric` | `erp-egoric.vercel.app` | `egoric` | `dpl_BLw3joRx3EUPM5LDcR48xwXYtT1Q` | READY; `/login` 200 |
| VNECOM LLC | `erp-vnecom` | `erp-vnecom.vercel.app` | `vnecom` | `dpl_3WTArswEcqM3zdUvP7wKCxx9Jnmh` | READY; `/login` 200 |
| Egolive | `erp-egolive` | `erp-egolive.vercel.app` | `egolive` | `dpl_AdvgYVquGvLnzUWrCQ5Lu6r3u3CP` | READY; `/login` 200 |
| CEO Terminal | `ceo-terminal-leoz` | `ceo-terminal-leoz.vercel.app` | `ceoportal` | `dpl_ByF5RCHvBxYcY5VmES6a12WHAHRm` | READY; `/login` 200; pre-CEO-18 stable |

Không project nào trong bảng trên được promote trong lần tạo production-truth evidence ngày 2026-08-09. Các deployment tạm dùng production environment đều chạy với `--skip-domain`, sau đó bị xóa.

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

Snapshot cho thấy cả năm schema có 95 bảng Prisma. CEO Portal đã được additive reconciliation; Prisma diff bằng 0 và 324 row được giữ nguyên. Pre-change và post-schema encrypted backups đều được giữ ngoài repository.

## Rollback

1. Code: dùng stable deployment ID ở bảng trên; không rollback bằng cách viết lại Git history.
2. Dữ liệu: chỉ restore từ bộ `20260809T040418Z` sau quyết định founder và rehearsal mới.
3. CEO feature: hạ rollout ring/kill switch của Portal; local ERP login phải tiếp tục hoạt động.
4. Không xóa hoặc ghi đè schema production để sửa drift.

## Release discipline

- Mọi business action đi qua RepositoryRealms Authorization → Business Rules → Receipt → Audit.
- CEO Terminal không ghi trực tiếp business table của entity.
- ERP của từng entity giữ workflow và dữ liệu riêng; Realm là giao diện tùy chọn.
- Trước promote: migration diff, authenticated SSO E2E, contract tests, chaos suite, canary và rollback evidence đều phải xanh.
