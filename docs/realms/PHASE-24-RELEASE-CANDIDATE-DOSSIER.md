# Phase 24 — Release Candidate Dossier

## Mục tiêu

Phase 24 tạo một evidence pack read-only để Director review trạng thái Release Candidate tại một chỗ. Dossier tái sử dụng dữ liệu authoritative đã có; không tạo database, business rule, approval hay rollout flow song song.

**Evidence completeness không phải launch readiness.** Một dossier đủ 5 nguồn chỉ có nghĩa là review packet đã đầy đủ. Quyết định launch vẫn thuộc Controlled Launch, maker–checker, authorization, receipts và audit hiện hữu.

## Năm nguồn evidence

1. RepositoryRealms live readiness.
2. Sealed maker–checker launch rehearsal.
3. Pilot operations: wave, activation guard, incident command và go/no-go report.
4. Chaos resilience posture cho bảy failure mode.
5. Aggregate-only Experience Pilot scorecard.

Dossier không suy luận một recommendation mới từ năm nguồn này. Nó giữ nguyên source signal để Director đối chiếu.

## Integrity contract

- Evidence canonical được sắp xếp key ổn định trước khi hash.
- Digest dùng SHA-256.
- `candidateId` lấy 12 ký tự đầu của digest.
- `generatedAt` không nằm trong digest, nên refresh không tạo candidate giả nếu evidence không đổi.
- Actor name/ID, free-text evidence, business record ID và nội dung feedback bị loại khỏi projection.

## Authorization và privacy

- Chỉ Director nội bộ có thể gọi `GET /api/realm-demo/release-candidate`.
- Freelancer và anonymous bị chặn bởi auth boundary ERP gốc.
- Evidence aggregate-only; không roster, user ID, business record ID, nội dung, thời lượng hay điểm hiệu suất.
- JSON export được tạo cục bộ trong browser từ chính response read-only; server không ghi export state.

## Ranh giới vận hành

- Không deploy, không đổi policy, không kích hoạt wave và không merge từ dossier.
- Không có POST/PUT/DELETE cho Release Candidate API.
- Không có nút Approve, GO, Rollout hoặc Deploy trong component.
- Khi source signal xấu, operator quay lại workflow nguồn để xử lý; dossier không có quyền bypass.
- Controlled Launch vẫn là launch authority; RepositoryRealms vẫn bảo đảm authorization, business rules, receipts và audit cho business action.

## Verification

```bash
npm run audit:realm:release-candidate
npm run audit:realm:release-candidate:check
node --test tests/realm-release-candidate.test.mjs tests/realm-release-candidate-audit.test.mjs
npm run qa
```

QA phải xác nhận digest deterministic, 5/5 source contracts, auth/no-store response, responsive 390px, keyboard focus, touch target tối thiểu 44px và reduced-motion. Không deploy trong Phase 24 nếu chưa có chỉ thị riêng.
