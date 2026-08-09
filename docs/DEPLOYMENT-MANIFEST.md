# Deployment Manifest — RepositoryRealms

Cập nhật: 2026-08-09. Control-plane release branch: `codex/realm-design-system-v2-implementation`; exact release commit được ghi trong CEO-18 evidence sau canary.

## Production domains đang phục vụ

| Entity | Vercel project | Domain | Schema | Stable deployment | Trạng thái |
|---|---|---|---|---|---|
| AIm Agency | `agency-erp` | `agency-erp-mu.vercel.app` | `public` | `dpl_5SyEfVuneLtCf5wpsBXBpgaeotbW` | READY; pool bounded; authenticated CEO SSO PASS |
| Egoric Agency | `erp-egoric` | `erp-egoric.vercel.app` | `egoric` | `dpl_FjAfMgTg1uCmFySrXrd7xPo5wejJ` | READY; pool bounded; authenticated CEO SSO PASS |
| VNECOM LLC | `erp-vnecom` | `erp-vnecom.vercel.app` | `vnecom` | `dpl_69L7bXo8puX94UAjLww3pAGi9ePc` | READY; pool bounded; authenticated CEO SSO PASS |
| Egolive | `erp-egolive` | `erp-egolive.vercel.app` | `egolive` | `dpl_B39QEDvdpiATRYYryxEBvBmTvXFX` | READY; pool bounded; authenticated CEO SSO PASS |
| CEO Terminal | `ceo-terminal-leoz` | `ceo-terminal-leoz.vercel.app` | `ceoportal` | `dpl_CCpgYtuUe9uMJqrdGTDbzPHtQvCC` | READY; CEO-18 stable; authenticated SSO PASS 4/4 |

CEO Terminal được promote sau protected-canary gate ngày 2026-08-09. Sau khi stable drill phát hiện shared Postgres `EMAXCONN`, cả bốn entity được build canary bằng immutable commit `b0af34b`, không đổi schema/data, rồi promote theo ring. `origin/main` và nhánh LeozOps không bị sửa hoặc merge trong release này.

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

1. Code: dùng stable deployment ID ở bảng trên; rollback CEO về `dpl_ByF5RCHvBxYcY5VmES6a12WHAHRm`, AIm về `dpl_2wdKb7RzMMtukGytCgufCnzhtJjA`, Egoric về `dpl_BLw3joRx3EUPM5LDcR48xwXYtT1Q`, VNECOM về `dpl_3WTArswEcqM3zdUvP7wKCxx9Jnmh`, Egolive về `dpl_wHrAprGqtDLMo6VnjQPr7qM8UZd4`; không rollback bằng cách viết lại Git history.
2. Dữ liệu: chỉ restore từ bộ `20260809T040418Z` sau quyết định founder và rehearsal mới.
3. CEO feature: hạ rollout ring/kill switch của Portal; local ERP login phải tiếp tục hoạt động.
4. Không xóa hoặc ghi đè schema production để sửa drift.

## Release discipline

- Mọi business action đi qua RepositoryRealms Authorization → Business Rules → Receipt → Audit.
- CEO Terminal không ghi trực tiếp business table của entity.
- ERP của từng entity giữ workflow và dữ liệu riêng; Realm là giao diện tùy chọn.
- Trước promote: migration diff, authenticated SSO E2E, contract tests, chaos suite, canary và rollback evidence đều phải xanh.
