// v3.9: Gửi email qua SMTP của công ty (cấu hình trong Cài đặt → Email công ty).
// Mỗi instance/công ty một hộp thư riêng — gửi báo giá/hóa đơn đúng brand.
// NextAuth hiện chỉ dùng CredentialsProvider; override peer optional giúp SMTP công ty chạy
// Nodemailer đã vá mà không kích hoạt EmailProvider không được cấu hình.
import nodemailer from 'nodemailer';
import { prisma } from './prisma.js';

export async function getSmtp() {
  const row = await prisma.setting.findUnique({ where: { id: 1 } });
  const s = row ? JSON.parse(row.json) : {};
  if (!s.smtpHost || !s.smtpUser || !s.smtpPass) return null;
  return {
    settings: s,
    transport: nodemailer.createTransport({
      host: s.smtpHost,
      port: +s.smtpPort || 465,
      secure: (+s.smtpPort || 465) === 465, // 465 = SSL, 587 = STARTTLS
      auth: { user: s.smtpUser, pass: s.smtpPass },
    }),
  };
}

export async function sendMail({ to, subject, html, replyTo }) {
  const smtp = await getSmtp();
  if (!smtp) throw new Error('Chưa cấu hình SMTP — vào Cài đặt → Email công ty');
  const from = smtp.settings.smtpFrom
    ? `"${smtp.settings.company || ''}" <${smtp.settings.smtpFrom}>`
    : smtp.settings.smtpUser;
  return smtp.transport.sendMail({ from, to, subject, html, replyTo });
}
