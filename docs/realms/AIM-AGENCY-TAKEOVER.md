# AIm Agency takeover branch

## Mục tiêu

Nhánh `codex/aim-agency-takeover` là không gian phát triển riêng để đội AIm Agency tiếp quản các nhu cầu đặc thù của AIm mà không làm gián đoạn luồng phát triển RepositoryRealms chung.

Nhánh này được tách từ `codex/realm-design-system-v2-implementation` tại commit `d102b98`. Đây không phải một fork sản phẩm độc lập: nền tảng, dữ liệu và business contract dùng chung vẫn phải đi theo nhánh canonical đó.

## Phạm vi AIm được phép sở hữu

- Cấu hình entity `aim`, nhận diện AIm Agency và module được bật cho AIm.
- Workflow, copy, dashboard và báo cáo đặc thù của AIm khi chúng không làm thay đổi contract dùng chung.
- Trải nghiệm ERP/CRM và Realm dành riêng cho nhân sự AIm.
- Kiểm thử, tài liệu vận hành và cấu hình triển khai dành riêng cho Vercel project `agency-erp`.

## Phần lõi vẫn do RepositoryRealms quản trị

Đội AIm không được tạo business logic song song hoặc tự ý thay đổi các phần sau trên nhánh takeover:

- authentication, session và CEO cross-entity SSO;
- authorization, business rules, idempotency, canonical receipts và audit;
- schema/migration dùng chung và canonical ERP/CRM records;
- CEO Terminal, federation contract và world-map gateway;
- `lead-snapshot v1` contract;
- `lib/leozops` và `tests/leozops-*` nếu chưa có assignment riêng;
- hành vi của các entity Egoric Agency, Vnecom LLC và Egolive.

Nếu một yêu cầu AIm cần thay đổi phần lõi, hãy mở PR về nhánh canonical trước. Sau khi thay đổi lõi được duyệt, đồng bộ commit đó trở lại nhánh AIm rồi mới hoàn thiện phần AIm-specific.

## Quy trình đồng bộ bắt buộc

Trước khi bắt đầu một hạng mục và trước khi mở PR, đội AIm cập nhật nhánh local từ GitHub rồi merge nhánh canonical:

```bash
git fetch origin
git switch codex/aim-agency-takeover
git merge origin/codex/realm-design-system-v2-implementation
```

Không force-push, không rewrite history và không merge trực tiếp vào `main`. Khi có conflict ở contract dùng chung, dừng merge và chuyển conflict cho người quản trị RepositoryRealms quyết định thứ tự tích hợp.

Workflow `.github/workflows/aim-canonical-sync.yml` kiểm tra quy tắc này trên mọi push và pull request vào takeover branch. Check sẽ fail nếu revision AIm chưa chứa HEAD mới nhất của nhánh canonical.

## Luồng đóng góp

1. Mỗi hạng mục AIm dùng một branch ngắn tách từ `codex/aim-agency-takeover`.
2. PR AIm-specific quay về `codex/aim-agency-takeover`.
3. Cải tiến có ích cho toàn hệ thống mở PR riêng về `codex/realm-design-system-v2-implementation`.
4. Sau khi thay đổi dùng chung được duyệt, merge canonical vào branch takeover.
5. Chỉ deploy AIm từ nhánh takeover tới Vercel project `agency-erp`; không deploy sang ba entity còn lại hoặc CEO Terminal.

## Definition of done

Một thay đổi AIm chỉ hoàn tất khi:

- workflow ERP/CRM cũ của AIm vẫn hoạt động và tiếng Việt vẫn là mặc định;
- Realm chỉ là giao diện tùy chọn trên cùng authorization, business rules và canonical records;
- action có hệ quả chỉ báo thành công sau khi có canonical receipt;
- không làm thay đổi hành vi của entity khác;
- test liên quan đã chạy và không có secret/credential được commit;
- branch đã được đồng bộ với canonical và mọi conflict dùng chung đã được xử lý có chủ đích.

## Đích vận hành

| Hạng mục | Giá trị |
| --- | --- |
| Entity ID | `aim` |
| Takeover branch | `codex/aim-agency-takeover` |
| Canonical development branch | `codex/realm-design-system-v2-implementation` |
| Vercel project | `agency-erp` |
| Production URL | `https://agency-erp-mu.vercel.app` |

Việc có tên production project trong tài liệu không cho phép deploy tự động. Mỗi lần deploy vẫn phải xác minh branch và project đích, đồng thời tuân thủ quy trình review hiện hành.
