// Vor-Login-Smoketest – kein Konto nötig. Prüft die Weiterleitung der alten
// KI-URL auf zwei Arten:
//   1) ohne JS: der Server liefert die statische Umzugsseite (Inhalt korrekt)
//   2) mit JS:  der Client-Redirect führt tatsächlich weg von der alten Domain
// Ausführen:  npm run e2e:preauth
const { test, expect } = require('@playwright/test');

const OLD_KI  = (process.env.OLD_KI || 'https://ki-dashboard.dihag-extern.com').replace(/\/$/, '');
const OLD_HOST = new URL(OLD_KI).host;

test.describe('Umzugsseite ohne JavaScript (statischer Inhalt)', () => {
  test.use({ javaScriptEnabled: false });

  test('alte KI-URL liefert die Umzugsseite mit Ziel /ki/', async ({ page }) => {
    await page.goto(`${OLD_KI}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('body')).toContainText('umgezogen');
    await expect(page.locator('a#target-link')).toHaveAttribute('href', /\/ki\/$/);
  });
});

test('JS-Redirect führt von der alten Domain weg', async ({ page }) => {
  await page.goto(`${OLD_KI}/`);
  // erster URL-Wechsel weg von der alten Domain (Ziel /ki/ bzw. dessen Login-Redirect)
  await page.waitForURL(u => !u.host.includes(OLD_HOST), { timeout: 15000 });
  expect(page.url()).not.toContain(OLD_HOST);
});
