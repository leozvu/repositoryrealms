# Deploy Agency ERP lên cloud miễn phí — 10 phút

> Mọi thứ đã chuẩn bị sẵn (production build đã PASS). Bạn chỉ cần làm theo 4 bước.
> Cần: tài khoản Google/GitHub để đăng ký 2 dịch vụ miễn phí.

## Bước 1 — Tạo database Postgres (Supabase, miễn phí)
1. Vào **supabase.com** → Sign up (bằng GitHub) → **New project**
   - Name: `agency-erp` · Password: đặt mật khẩu DB (LƯU LẠI) · Region: Singapore
2. Vào **Project Settings → Database → Connection string → URI** (chọn "Transaction pooler")
   → copy chuỗi dạng `postgresql://postgres.xxxx:MATKHAU@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`

## Bước 2 — Chuyển schema sang Postgres (trên máy này)
Mở file `prisma/schema.prisma`, sửa đúng 1 chữ:
```
datasource db {
  provider = "postgresql"   ← đổi từ "sqlite"
  url      = env("DATABASE_URL")
}
```
Rồi chạy (thay chuỗi kết nối của bạn):
```bash
cd Desktop/agency-erp
set DATABASE_URL=postgresql://...chuỗi-bước-1...
npx prisma db push
npm run db:seed
node prisma/migrate-v21.js
```
→ Database cloud đã có bảng + tài khoản mẫu.
(Muốn mang dữ liệu hiện tại lên: đăng nhập bản local, xuất JSON từ bản v1 hoặc dùng lại file import — sau khi deploy đăng nhập Giám đốc → Cài đặt → Import.)

## Bước 3 — Đẩy code lên GitHub
```bash
cd Desktop/agency-erp
git remote add origin https://github.com/<tai-khoan-cua-ban>/agency-erp.git
git push -u origin main
```
(Repo đã được `git init` + commit sẵn. Tạo repo trống tên `agency-erp` trên github.com trước, chọn Private.)

## Bước 4 — Deploy lên Vercel
1. Vào **vercel.com** → Sign up bằng GitHub → **Add New → Project** → chọn repo `agency-erp`
2. Trước khi bấm Deploy, mở **Environment Variables**, thêm 3 biến:
   | Name | Value |
   |---|---|
   | `DATABASE_URL` | chuỗi Postgres ở Bước 1 |
   | `NEXTAUTH_SECRET` | chuỗi ngẫu nhiên dài (gõ bừa 50+ ký tự hoặc chạy `openssl rand -hex 32`) |
   | `NEXTAUTH_URL` | để trống lần đầu — sau khi deploy xong điền `https://<ten-project>.vercel.app` rồi Redeploy |
3. Bấm **Deploy** → ~2 phút → nhận link `https://agency-erp-xxx.vercel.app`
4. Điền `NEXTAUTH_URL` = link đó → **Redeploy** → XONG. Gửi link + tài khoản cho team.

## Sau khi chạy thật
- Đăng nhập Giám đốc → **đổi toàn bộ mật khẩu mẫu** (Nhân sự → sửa từng người)
- Cài đặt → điền thông tin công ty + dán **Claude API key** nếu muốn bật AI Copilot
- Trên điện thoại: mở link bằng Chrome → menu → **"Thêm vào màn hình chính"** (PWA)
- Backup: Supabase tự backup hằng ngày (gói free giữ 7 ngày)

## Sự cố thường gặp
| Lỗi | Cách xử lý |
|---|---|
| Build fail trên Vercel | Kiểm tra đã đổi provider = "postgresql" và push code mới nhất |
| Đăng nhập xong văng ra | `NEXTAUTH_URL` chưa đúng link https thật → sửa rồi Redeploy |
| "Too many connections" | Dùng chuỗi **Transaction pooler** (cổng 6543), không dùng cổng 5432 |
