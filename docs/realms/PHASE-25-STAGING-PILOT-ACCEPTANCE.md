# Phase 25 — Staging Pilot Acceptance

Phase 25 không thay thế ERP và không coi Release Candidate Dossier là quyền phát hành. ERP · CRM vẫn là giao diện mặc định; Realm là trải nghiệm tùy chọn trên cùng authorization, business rules, receipts và audit của RepositoryRealms.

## Bảy cổng nghiệm thu

1. **Staging DB cô lập** — chỉ dùng Neon resource `crmegoric-realms-staging-db`; migration verify, backup và restore-readiness simulation phải đạt.
2. **SSO / session / RBAC** — một session dùng cho ERP và Realm; đủ role matrix; ERP là workspace mặc định; freelancer không được vào Realm.
3. **Business-flow UAT** — Task, CRM, Project, Finance, HR và approval dùng record ERP thật trong staging; action Realm phải có RepositoryRealms receipt và audit.
4. **Demo rehearsal** — tất cả kịch bản được maker attest và Director thứ hai niêm phong.
5. **Hardening** — regression, security, performance, chaos, backup/restore readiness và rollback về ERP đều đạt.
6. **Pilot 5–7 ngày** — wave tối thiểu 7 ngày, cohort có kiểm soát, không tự mở rộng, canary 90 phút, incident critical tự rollback về ERP.
7. **Go / No-Go** — fail closed. Trước đủ 7 ngày luôn `HOLD`; critical incident hoặc blocked feedback là `NO-GO`; `GO` chỉ có thể đến từ Realm Pilot Operations sau khi đủ evidence.

## Lệnh vận hành an toàn

- `npm run staging:backup:create` — snapshot toàn bộ Prisma model của DB staging và manifest SHA-256.
- `npm run staging:backup:verify` — giải nén, kiểm checksum, shape, primary identity và live counts; không ghi DB.
- `npm run staging:identities:reconcile` — upsert chín demo identity, xoay mật khẩu, reset lock/2FA và bổ sung Director checker. Không xóa user lạ hoặc business record.
- `npm run staging:smoke:execution` — tạo fixture tạm, kiểm business flow và tự cleanup trong `finally`.
- `npm run qa:full` — regression, audit, coverage, dependency audit, build và Playwright.

Mọi lệnh staging đều yêu cầu đúng nhánh `codex/realms-demo`, Vercel project `crmegoric-realms-demo`, staging target approval và không bao giờ fallback sang database production.
