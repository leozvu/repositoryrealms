# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: realm-office-diagnostic.spec.mjs >> diagnostic 960x600 archive route, return controls and two actual material captures
- Location: qa\realm-3d\diagnostics\realm-office-diagnostic.spec.mjs:4:1

# Error details

```
Test timeout of 90000ms exceeded.
```

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: 'Xem toàn cảnh', exact: true })

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - main [ref=e2]:
    - link "Bỏ qua điều hướng, tới nội dung Realm" [ref=e3] [cursor=pointer]:
      - /url: "#realm-main-content"
    - status [ref=e4]: Đã mở Đại sảnh.
    - generic [ref=e5]:
      - generic [ref=e6]:
        - img [ref=e8]
        - generic [ref=e10]:
          - strong [ref=e11]: CRMegoric Realms
          - generic [ref=e12]: Guildhall · Bản xem thử · Guildhall đang hoạt động
      - generic [ref=e13]:
        - group "Language / Ngôn ngữ" [ref=e14]:
          - button "VI" [pressed] [ref=e15] [cursor=pointer]
          - button "EN" [ref=e16] [cursor=pointer]
        - combobox "Trạng thái hiện diện" [ref=e19]:
          - option "Sẵn sàng" [selected]
          - option "Đang bận"
          - option "Tập trung"
          - option "Không làm phiền"
        - button "Mở Chronicle, số dư 28 Gold" [ref=e20] [cursor=pointer]:
          - generic [ref=e21]: G
          - strong [ref=e22]: 28 Gold
        - button "Mở hồ sơ nhân vật" [ref=e23] [cursor=pointer]:
          - generic [ref=e24]: A7
    - generic [ref=e25]:
      - generic [ref=e26]:
        - generic "Văn phòng Realm 3D. WASD hoặc phím mũi tên để đi, kéo chuột để xoay góc nhìn, E để tương tác." [active] [ref=e27]
        - generic:
          - generic:
            - heading "Guildhall" [level=2]
            - generic: Dữ liệu mẫu
          - generic:
            - img
            - generic: Thư viện
          - paragraph: Góc nhìn thứ nhất
        - navigation "Góc nhìn văn phòng" [ref=e28]:
          - button "Chọn địa điểm" [ref=e29] [cursor=pointer]:
            - img [ref=e30]
            - generic [ref=e33]: Địa điểm
          - button "Đổi góc nhìn nhân vật" [pressed] [ref=e34] [cursor=pointer]:
            - img [ref=e35]
            - generic [ref=e38]: Góc nhìn
          - button "Xem toàn cảnh" [ref=e39] [cursor=pointer]:
            - img [ref=e40]
            - generic [ref=e43]: Toàn cảnh
          - button "Cài đặt đồ họa" [ref=e44] [cursor=pointer]:
            - img [ref=e45]
            - generic [ref=e49]: Đồ họa
        - generic "Đồng đội trong văn phòng"
        - generic [ref=e50]:
          - generic [ref=e51]: E
          - generic [ref=e52]:
            - strong [ref=e53]: Thư viện
            - paragraph [ref=e54]: Xem tổng quan ngày làm việc
          - button "Mở Thư viện" [ref=e55] [cursor=pointer]:
            - text: Mở
            - img [ref=e56]
        - button "? Điều khiển" [ref=e59] [cursor=pointer]:
          - generic [ref=e60]: "?"
          - text: Điều khiển
        - status [ref=e61]: Đã mở Thư viện
      - navigation "Hành động chính trong Guildhall" [ref=e62]:
        - generic [ref=e63]:
          - button "Voice" [ref=e64] [cursor=pointer]:
            - img [ref=e65]
            - generic [ref=e67]: Voice
          - button "Công việc" [ref=e68] [cursor=pointer]:
            - img [ref=e69]
            - generic [ref=e71]: Công việc
          - button "Gold" [ref=e72] [cursor=pointer]:
            - img [ref=e73]
            - generic [ref=e75]: Gold
          - button "Mọi người, 1 online" [ref=e76] [cursor=pointer]:
            - img [ref=e77]
            - generic [ref=e79]: Mọi người
  - alert [ref=e80]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { writeFile } from 'node:fs/promises';
  3  | 
  4  | test('diagnostic 960x600 archive route, return controls and two actual material captures', async ({ page }, testInfo) => {
  5  |   const errors = [], warnings = [], events = [], observations = [];
  6  |   const started = performance.now();
  7  |   const note = name => events.push({ name, elapsedMs: Math.round(performance.now() - started) });
  8  |   page.on('pageerror', error => errors.push(error.message));
  9  |   page.on('console', message => { if (['warning', 'error'].includes(message.type()) && warnings.length < 40) warnings.push(message.text()); });
  10 |   const world = page.locator('[data-realm-world-version="3d"]');
  11 |   const observe = async name => {
  12 |     const value = await world.evaluate(element => {
  13 |       const canvas = element.querySelector('canvas'), gl = canvas?.getContext('webgl2');
  14 |       const rendererInfo = gl?.getExtension('WEBGL_debug_renderer_info');
  15 |       return { world: { ...element.dataset }, canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
  16 |         renderer: gl && rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : null };
  17 |     });
  18 |     observations.push({ name, elapsedMs: Math.round(performance.now() - started), ...value });
  19 |   };
  20 |   try {
  21 |     await page.goto('/realm-demo?world=3d'); note('document loaded');
  22 |     await expect(world).toHaveAttribute('data-ready', 'true', { timeout: 45000 });
  23 |     await expect(world).toHaveAttribute('data-materials', 'ready', { timeout: 20000 });
  24 |     await expect(world).toHaveAttribute('data-quality', 'balanced'); note('balanced materials ready');
  25 |     await observe('initial balanced');
  26 |     await page.getByRole('button', { name: 'Chọn địa điểm', exact: true }).click(); note('directory opened');
  27 |     await page.getByRole('region', { name: 'Các khu vực làm việc' }).getByRole('button', { name: /^\d{2} Thư viện/ }).click(); note('archive route selected');
  28 |     await expect(world).toHaveAttribute('data-paused', 'true', { timeout: 45000 });
  29 |     await expect.poll(() => world.evaluate(element => Math.hypot(Number(element.dataset.playerX) + 10.2, Number(element.dataset.playerZ) + 3.75))).toBeLessThanOrEqual(.2);
  30 |     // Archive deliberately dispatches briefing/realm-gate, labelled Đại sảnh.
  31 |     await expect(page.getByRole('complementary', { name: 'Đại sảnh', exact: true })).toBeVisible(); note('real briefing opened after arrival');
  32 |     await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  33 |     await expect(world).not.toHaveAttribute('data-paused', 'true'); note('returned to world');
  34 |     await page.getByRole('button', { name: 'Đổi góc nhìn nhân vật', exact: true }).click();
  35 |     await expect(world).toHaveAttribute('data-camera', 'first');
  36 |     await observe('archive balanced before screenshot');
  37 |     await page.screenshot({ path: testInfo.outputPath('archive-balanced-960.png'), scale: 'css', timeout: 10000 }); note('balanced screenshot captured');
> 38 |     await page.getByRole('button', { name: 'Xem toàn cảnh', exact: true }).click();
     |                                                                            ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
  39 |     await expect(world).toHaveAttribute('data-camera', 'overview');
  40 |     await page.getByRole('button', { name: 'Xem toàn cảnh', exact: true }).click();
  41 |     await expect(world).toHaveAttribute('data-camera', 'follow'); note('overview returned to follow');
  42 |     await page.getByRole('button', { name: 'Cài đặt đồ họa', exact: true }).click();
  43 |     await page.getByRole('button', { name: /^Ưu tiên độ nét/ }).click();
  44 |     await page.getByRole('region', { name: 'Chất lượng đồ họa' }).getByRole('button', { name: /^Đồ họa cao/ }).click();
  45 |     await expect(world).toHaveAttribute('data-quality', 'high');
  46 |     await expect(world).toHaveAttribute('data-resolution-preference', 'clarity');
  47 |     await page.getByRole('button', { name: 'Đổi góc nhìn nhân vật', exact: true }).click();
  48 |     await expect(world).toHaveAttribute('data-camera', 'first');
  49 |     await observe('archive high before screenshot');
  50 |     await page.screenshot({ path: testInfo.outputPath('archive-high-960.png'), scale: 'css', timeout: 10000 }); note('high screenshot captured');
  51 |     // Return the diagnostic browser to the lighter preset before teardown.
  52 |     await page.getByRole('button', { name: 'Cài đặt đồ họa', exact: true }).click();
  53 |     await page.getByRole('region', { name: 'Chất lượng đồ họa' }).getByRole('button', { name: /^Đồ họa nhẹ/ }).click();
  54 |     await expect(world).toHaveAttribute('data-quality', 'balanced'); note('balanced restored');
  55 |     expect(errors).toEqual([]);
  56 |   } finally {
  57 |     // Does not query an unresponsive page during teardown. Progress/errors
  58 |     // already received are retained even when a bounded action times out.
  59 |     await writeFile(testInfo.outputPath('diagnostic-observation.json'), JSON.stringify({
  60 |       scope: '960x600 DPR1 reduced-motion functional/visual diagnostic; not standard profile, D60 or AAA evidence',
  61 |       seededPreference: { quality: 'balanced', resolution: 'auto' }, tracing: false,
  62 |       viewport: { width: 960, height: 600 }, events, observations, errors, warnings,
  63 |     }, null, 2));
  64 |   }
  65 | });
  66 | 
```