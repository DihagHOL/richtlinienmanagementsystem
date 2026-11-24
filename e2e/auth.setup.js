// Einmaliger interaktiver Login → speichert die Session für die E2E-Tests.
// Ausführen:  npm run e2e:login   (öffnet einen sichtbaren Browser)
// Melde dich mit dem gewünschten Test-/Prüfkonto an. Sobald die App geladen
// ist (Sidebar sichtbar), wird die Session nach e2e/.auth/state.json gespeichert.
// Diese Datei ist in .gitignore – sie enthält Tokens und gehört NICHT ins Repo.
const fs = require('fs');
const { test, expect } = require('@playwright/test');

const STATE = 'e2e/.auth/state.json';

test('manuelle Anmeldung & Session speichern', async ({ page }) => {
  test.setTimeout(180000);   // 3 Min für manuellen Login inkl. MFA
  await page.goto('/');

  // Warten bis die App nach dem Login geladen ist (Sidebar erscheint).
  await expect(page.locator('.sidebar')).toBeVisible({ timeout: 170000 });

  fs.mkdirSync('e2e/.auth', { recursive: true });
  await page.context().storageState({ path: STATE });
  console.log('✓ Session gespeichert:', STATE);
});
