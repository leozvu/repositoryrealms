/* Mint CEO service key cho MỘT entity — chạy với DATABASE_URL trỏ schema của entity đó.
   Tạo ApiKey scoped (audience = entityId, roles DIRECTOR, scopes = allowlist ceo.*, TTL 90 ngày).
   In raw key ra stdout MỘT LẦN — nạp vào env CEO_ENTITY_<ID>_SERVICE_KEY của portal.
   ENV: DATABASE_URL · ENTITY_ID (vd crmtest) */
import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { CEO_SERVICE_SCOPE_ALLOWLIST } from '../lib/ceo-service-auth.js';
import { hashKey } from '../lib/apiauth.js';

const prisma = new PrismaClient();
const entityId = process.env.ENTITY_ID;
if (!entityId) throw new Error('Thiếu ENTITY_ID');
const raw = `ceok_${crypto.randomBytes(24).toString('hex')}`;
// thu hồi key ceo-terminal cũ (nếu có) trước khi cấp key mới — tránh tồn key mồ côi
await prisma.apiKey.updateMany({ where: { name: 'ceo-terminal-service', audience: entityId, active: true }, data: { active: false, rotatedAt: new Date() } });
await prisma.apiKey.create({ data: {
  name: 'ceo-terminal-service',
  prefix: raw.slice(0, 10),
  keyHash: hashKey(raw),
  roles: JSON.stringify(['DIRECTOR']),
  scopes: JSON.stringify(CEO_SERVICE_SCOPE_ALLOWLIST),
  audience: entityId,
  active: true,
  expiresAt: new Date(Date.now() + 90 * 86400000),
} });
console.log(`SERVICE_KEY ${entityId} ${raw}`);
await prisma.$disconnect();
