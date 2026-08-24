# CEO-12 — Production truth, backup and restore evidence

Ngày thực hiện: 2026-08-09. Release candidate được kiểm: `6c7a71e8e63d0d49335d8570be6214021ea044d1`.

## Kết quả

| Entity | Schema | Tables | Rows | Encrypted SHA-256 | Restore | FKs |
|---|---:|---:|---:|---|---|---:|
| AIm Agency | `public` | 95 | 183 | `5c313cd802d3cd60e6ede47ccc68b880d21113e421737ba91ed33a77c45fbda3` | PASS | 51 |
| Egoric Agency | `egoric` | 95 | 1,253 | `fd5e317b5071560453cd09ff09734f73514ab5899f4c831cd188dc99c04bfa7` | PASS | 51 |
| VNECOM LLC | `vnecom` | 95 | 23 | `1128adf27c891533d257fcf9f55d91ba64a60e40c66202546ee10f7ce3e03da9` | PASS | 51 |
| Egolive | `egolive` | 95 | 25 | `2f9d8c40e33daf1a2c10f2bf012d55b1f1c759265ce04773fc78fd1c8ef5602e` | PASS | 51 |
| CEO Terminal | `ceoportal` | 95 | 324 | `0f35fff1dd2539d7737ea2c4feac09b01f488f98c4f8e1d9ab22a882d73f4912` | PASS | 51 |

Manifest SHA-256: `efcd33ee892049eac9bbc36cce39733ab47e43299cd565c134fea061029cd71a`.

## Invariants đã kiểm

- Snapshot chỉ đọc production qua transaction `READ ONLY`.
- File backup không chứa plaintext; envelope dùng AES-256-GCM + gzip.
- Collector kiểm schema ở response header, payload và allowlist năm schema.
- Restore diễn ra trên Neon staging bằng schema prefix `rr_rehearsal_`.
- Row count của 95 model/schema khớp snapshot sau restore.
- 51 foreign key/schema được re-apply thành công.
- `productionSchemasMutated=false`; `rehearsalSchemasDropped=true`.
- Endpoint, env secret, bốn automation bypass vừa tạo và toàn bộ deployment tạm đã bị thu hồi/xóa.
- Automation bypass đã tồn tại từ trước của CEO Terminal không bị thay đổi.
- Năm production login domain vẫn trả HTTP 200 sau cleanup.

## Vị trí recovery material

- Backup: `C:\Users\Asus\AppData\Local\CRMegoricBackups\20260809T040418Z`
- Key: `C:\Users\Asus\AppData\Local\CRMegoricBackups\keys\ceo12-20260809.archive.key`

Không commit backup, archive key, database URL, credential hoặc PII vào Git.

## Finding phải xử lý trước rollout

CEO Portal production phát hiện Prisma `P2022` khi đọc theo model release candidate. Đây là bằng chứng column drift, không phải mất dữ liệu: raw snapshot có 324 rows và restore vào schema hiện tại đã PASS. Bước kế tiếp là tạo migration-diff evidence và additive migration plan; tuyệt đối không `db push` mù vào production.
