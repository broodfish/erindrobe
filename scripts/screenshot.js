const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 1600 } });
  await page.goto('http://localhost:8080/', { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/site-full.png', fullPage: false });
  await page.screenshot({ path: '/tmp/site-tall.png', fullPage: true });

  // mobile viewport
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/site-mobile.png' });

  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  console.log('console errors captured after reload check:', errors);

  await browser.close();
  console.log('done');
})();
