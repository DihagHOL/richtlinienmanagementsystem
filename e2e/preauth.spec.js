// Vor-Login-Smoketest – kein Konto nötig.
// Prüft die statische Auslieferung der alten KI-URL (Umzugsseite), bevor deren
// JS-Redirect feuert. Ausführen z. B.:  npx playwright test e2e/preauth.spec.js
const { test, expect } = require('@playwright/test');

const OLD_KI = process.env.OLD_KI || 'https://ki-dashboard.dihag-extern.com';

test('alte KI-URL liefert die Umzugsseite', async ({ page }) => {
  // 'commit' = sobald die Antwort da ist, vor dem JS-Redirect → Inhalt prüfbar
  await page.goto(`${OLD_KI}/`, { waitUntil: 'commit' });
  await expect(page.locator('text=umgezogen')).toBeVisible({ timeout: 5000 });
});
