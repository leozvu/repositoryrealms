import { chromium } from '@playwright/test';
const BASE = 'https://erp-crm-test.vercel.app';
const OUT = process.env.REPRO_OUT || '.';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' });
await page.goto(BASE + '/login');
await page.getByLabel('Email', { exact: true }).fill(process.env.REPRO_EMAIL);
await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.REPRO_PASSWORD);
await page.getByRole('button', { name: 'Đăng nhập' }).click();
await page.waitForURL(/dashboard|myday|realm/, { timeout: 30000 }).catch(() => {});
await page.goto(BASE + '/leads', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(4000); // chờ realm art 'ready'
const skip = page.getByText('Bỏ qua lúc này');
if (await skip.count()) await skip.first().click().catch(() => {});
const attrs = await page.evaluate(() => ({
  htmlTheme: document.documentElement.dataset.theme || null,
  artReady: document.documentElement.dataset.realmUiArt || document.body.dataset.realmUiArt || null,
  appClass: document.getElementById('app')?.className || null,
  anyArtAttr: [...document.querySelectorAll('[data-realm-ui-art]')].map(e => e.tagName + '=' + e.dataset.realmUiArt).slice(0, 3),
}));
console.log('env:', JSON.stringify(attrs));
await page.getByRole('button', { name: /Thêm khách tiềm năng|Thêm khách/ }).first().click();
await page.waitForTimeout(800);
const diag = await page.evaluate(() => {
  const overlay = document.querySelector('.modal-overlay');
  const modal = document.querySelector('.modal-overlay .modal');
  if (!modal) return { modal: false };
  const mb = modal.getBoundingClientRect();
  const cs = getComputedStyle(modal);
  const ocs = getComputedStyle(overlay);
  // điểm giữa modal — phần tử nào đang paint trên cùng?
  const cx = mb.x + mb.width / 2, cy = mb.y + Math.min(mb.height - 10, 300);
  const top = document.elementFromPoint(cx, cy);
  return {
    modal: true,
    modalRect: { x: Math.round(mb.x), y: Math.round(mb.y), w: Math.round(mb.width), h: Math.round(mb.height) },
    modalBg: cs.backgroundColor, modalOpacity: cs.opacity,
    overlayPos: ocs.position, overlayBg: ocs.backgroundColor, overlayZ: ocs.zIndex,
    topElementAtCenter: top ? (top.className?.toString?.().slice(0, 60) || top.tagName) : null,
    topInModal: top ? modal.contains(top) : null,
  };
});
console.log('modal diag:', JSON.stringify(diag, null, 1));
await page.screenshot({ path: `${OUT}/dark-leads-modal.png` });
await browser.close();
