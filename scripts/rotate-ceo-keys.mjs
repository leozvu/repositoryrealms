/* v3.40 — XOAY SERVICE KEY CHO 4 CÔNG TY BẰNG MỘT LỆNH (Đợt 3a).
   Trước đây phải mint tay từng công ty rồi dán env — dễ sót, dễ hết hạn im lặng.

   Chạy:  node scripts/rotate-ceo-keys.mjs            (xoay tất cả)
          node scripts/rotate-ceo-keys.mjs egoric aim (chỉ vài công ty)

   Việc script làm cho MỖI công ty:
   1. Mint key mới trong DB công ty (thu hồi key ceo-terminal cũ) — TTL 90 ngày.
   2. Nạp key mới vào env production của CEO Terminal (CEO_ENTITY_<ID>_SERVICE_KEY).
   3. Sau khi xong tất cả: cập nhật CEO_SERVICE_KEY_EXPIRES_AT + redeploy terminal + verify.

   ENV: đọc DATABASE_URL trong .env (dùng chung Supabase, đổi ?schema=).
   Yêu cầu: đã `vercel login`; script tự link project ceo-terminal-leoz. */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';
import { CEO_SERVICE_SCOPE_ALLOWLIST } from '../lib/ceo-service-auth.js';
import { hashKey } from '../lib/apiauth.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENTITY_SCHEMA = { aim: 'public', egoric: 'egoric', vnecom: 'vnecom', egolive: 'egolive' };
const TTL_DAYS = 90;
const SCOPE = 'leozs-projects-64a5f0c8';
const PORTAL_PROJECT = 'ceo-terminal-leoz';

const targets = process.argv.slice(2).filter(Boolean);
const entities = targets.length ? targets : Object.keys(ENTITY_SCHEMA);
for (const id of entities) {
  if (!ENTITY_SCHEMA[id]) throw new Error(`Không biết entity "${id}" (chỉ: ${Object.keys(ENTITY_SCHEMA).join(', ')})`);
}

const baseUrl = fs.readFileSync(path.join(root, '.env'), 'utf8').match(/^\s*DATABASE_URL\s*=\s*"?([^"\n]+)/m)?.[1]?.trim();
if (!baseUrl) throw new Error('Không thấy DATABASE_URL trong .env');
const vercel = (args, options = {}) => execFileSync('npx', ['vercel', ...args], { cwd: root, encoding: 'utf8', stdio: options.stdio || 'pipe', input: options.input });

console.log(`→ Xoay key cho: ${entities.join(', ')}`);
vercel(['link', '--yes', '--project', PORTAL_PROJECT, '--scope', SCOPE]);

const minted = [];
for (const id of entities) {
  const url = `${baseUrl}&schema=${ENTITY_SCHEMA[id]}`;
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const raw = `ceok_${crypto.randomBytes(24).toString('hex')}`;
  try {
    await prisma.apiKey.updateMany({
      where: { name: 'ceo-terminal-service', audience: id, active: true },
      data: { active: false, rotatedAt: new Date() },
    });
    await prisma.apiKey.create({ data: {
      name: 'ceo-terminal-service',
      prefix: raw.slice(0, 10),
      keyHash: hashKey(raw),
      roles: JSON.stringify(['DIRECTOR']),
      scopes: JSON.stringify(CEO_SERVICE_SCOPE_ALLOWLIST),
      audience: id,
      active: true,
      expiresAt: new Date(Date.now() + TTL_DAYS * 86400000),
    } });
  } finally {
    await prisma.$disconnect();
  }
  const envName = `CEO_ENTITY_${id.toUpperCase()}_SERVICE_KEY`;
  try { vercel(['env', 'rm', envName, 'production', '--yes']); } catch { /* chưa có thì thôi */ }
  vercel(['env', 'add', envName, 'production'], { input: raw });
  minted.push(id);
  console.log(`   ✓ ${id}: key mới đã mint + nạp vào ${envName}`);
}

const expiresAt = new Date(Date.now() + TTL_DAYS * 86400000).toISOString().slice(0, 10);
try { vercel(['env', 'rm', 'CEO_SERVICE_KEY_EXPIRES_AT', 'production', '--yes']); } catch {}
vercel(['env', 'add', 'CEO_SERVICE_KEY_EXPIRES_AT', 'production'], { input: expiresAt });
console.log(`→ Hạn mới: ${expiresAt}. Đang redeploy terminal…`);
vercel(['deploy', '--prod', '--yes'], { stdio: 'inherit' });
console.log(`✓ Hoàn tất ${minted.length} công ty. Kiểm tra lại: node scripts/sync-ceo-capabilities.mjs (SECRETS_FILE) hoặc mở Tổng quan CEO.`);
