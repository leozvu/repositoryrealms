# Phase 5 — Financial Operating Intelligence

## Product question

Finance phải trả lời: **Mỗi giờ làm tạo ra bao nhiêu giá trị và lợi nhuận?**

Chuỗi đọc của phase này là:

`Task → TimeLog → Cost proxy → Invoice → Cash`

Phase 5 không tạo ledger riêng. ERP Finance, Project Health và Royal Ledger cùng đọc canonical ERP finance records: `Project`, `TimeLog`, `User rate`, `Invoice`, `VendorBill`, `Transaction`, `Budget` và `RecurringExpense`.

## Sự thật nào được phép kết luận

- Cash balance lấy từ `Transaction` đã ghi sổ và quy đổi VND.
- Phải thu lấy từ tổng Invoice hợp lệ trừ payment history.
- Phải trả lấy từ VendorBill chưa paid.
- Labor accrued là **declared TimeLog × current rate**. Nó không phải payroll lịch sử và không phải observed activity.
- Operating margin proxy là Invoice trừ labor accrued và vendor commitment.
- Invoice không được gọi là revenue recognition; operating margin proxy không được gọi là accounting profit.
- Schedule ba tháng dùng ngày đến hạn và recurring template tương lai. Nó loại trừ payroll và mọi chi phí chưa có chứng từ, nên confidence ceiling là `low`.

Invoice có `items` hoặc `payments` JSON hỏng bị loại khỏi tổng và đưa vào Manager Queue. Hệ thống dừng đoán thay vì biến lỗi dữ liệu thành doanh thu 0.

## Authorization và privacy

- Chỉ `ACCOUNTANT` và `DIRECTOR` truy cập API `/api/finance/intelligence`.
- Anonymous, PM, Staff và freelancer bị chặn trước database query.
- Salary và hourlyRate chỉ được dùng server-side để aggregate labor cost; response không chứa rate, salary hoặc economics theo cá nhân.
- Project economics sắp theo tên. Không có employee ranking hoặc individual profitability.

## Hai trải nghiệm, một contract

- `/finance` hiển thị Financial Intelligence trước, rồi giữ nguyên sổ quỹ/CRUD trong `Sổ quỹ & giao dịch` drill-down.
- Accountant/Director trong Realm thấy `Royal Ledger` dùng cùng server loader.
- Người không có quyền finance vẫn dùng Tavern nhưng không nhận Financial Intelligence payload.

Mọi hành động ghi tiền vẫn đi qua API, authorization, approval, audit và receipt hiện hữu của RepositoryRealms. Phase 5 chỉ thêm read model advisory; không tự tạo Invoice, không tự thanh toán và không đổi Transaction.

## Verification

- Domain + server authorization/privacy tests.
- Deterministic contract audit: `npm run audit:finance:check`.
- Full QA: `npm run qa`.
- Isolated staging smoke tạo fixture Finance tạm, xác minh ERP/Royal Ledger parity, mobile 375px và cleanup.

Chỉ deploy vào Vercel project `crmegoric-realms-demo`; không deploy production ERP.
