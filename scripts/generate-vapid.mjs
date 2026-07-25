/* Sinh cặp khóa VAPID cho Web Push (chạy 1 lần, nạp vào env deployment).
   node scripts/generate-vapid.mjs  */
import crypto from 'node:crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pubJwk = publicKey.export({ format: 'jwk' });
const privJwk = privateKey.export({ format: 'jwk' });
const raw = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(pubJwk.x, 'base64url'),
  Buffer.from(pubJwk.y, 'base64url'),
]);
console.log('VAPID_PUBLIC_KEY=' + raw.toString('base64url'));
console.log('VAPID_PRIVATE_KEY=' + privJwk.d);
console.log('NEXT_PUBLIC_VAPID_PUBLIC_KEY=' + raw.toString('base64url'));
