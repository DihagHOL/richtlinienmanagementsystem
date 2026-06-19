// Authentifizierte E2E-Smoketests – NUR LESEND.
// Voraussetzung: einmal `npm run e2e:login` ausgeführt (erzeugt e2e/.auth/state.json).
// Ausführen:    npm run e2e
//
// Bewusst KEINE mutierenden Tests (kein Antrag anlegen, keine Entscheidung,
// kein Mailversand) – diese Suite läuft gegen das Live-System und darf keine
// echten Daten verändern oder Mails an reale Genehmiger auslösen. Solche
// Schreib-Flows stehen in der manuellen Checkliste (docs/SMOKETESTS.md).
const fs = require('fs');
const { test, expect } = require('@playwright/test');

const HAS_STATE = fs.existsSync('e2e/.auth/state.json');

test.describe('Authentifiziert (read-only)', () => {
  test.skip(!HAS_STATE, 'Kein Login-State – zuerst `npm run e2e:login` ausführen.');

  test('RMS lädt die App-Shell (kein Boot-Fehler)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('#boot-err')).toHaveText('');           // kein Startfehler
    await expect(page.locator('#hdr-name')).not.toHaveText('–');      // Benutzer geladen
    // Pflicht-Nav für alle: Meine Richtlinien + KI-Dashboard-Link
    await expect(page.locator('.nav-item[data-view="meine"]')).toBeVisible();
    await expect(page.locator('.sidebar a[href="ki/"]')).toBeVisible();
  });

  test('RMS „Meine Richtlinien" rendert Stats ohne Fehlerbanner', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#view-meine')).toBeVisible();
    await expect(page.locator('#meine-stats')).toBeVisible();
    await expect(page.locator('.col-warning')).toHaveCount(0);        // kein Lade-/Rechtefehler
  });

  test('RMS „ISMS-Dokumente" lädt (Admin)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.sidebar')).toBeVisible();
    const nav = page.locator('.nav-item[data-view="ismsdocs"]');
    test.skip(!(await nav.isVisible()), 'Kein Admin / ISMS-Reiter ausgeblendet – übersprungen.');
    await nav.click();
    await expect(page.locator('#view-ismsdocs')).toBeVisible();
    // entweder Tabelle, leerer Zustand oder klare Fehlermeldung – aber kein Dauer-Spinner
    await expect(page.locator('#isms-mount .doc-loading')).toHaveCount(0, { timeout: 20000 });
  });

  test('KI-Dashboard /ki/ lädt unter derselben Session (SSO)', async ({ page }) => {
    await page.goto('/ki/');
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.locator('#boot-err')).toHaveText('');
    await expect(page.locator('#page-title')).toBeVisible();
    // Zurück-Link ins Richtlinienmanagement vorhanden
    await expect(page.locator('.sidebar a[href="../"]')).toBeVisible();
  });

  test('KI-Dashboard: Gremium-Sicht ist konsistent', async ({ page }) => {
    await page.goto('/ki/');
    await expect(page.locator('.sidebar')).toBeVisible();
    const gremiumBadge = page.locator('#gremium-badge');
    const settingsTab  = page.locator('#tab-einstellungen');
    // Badge sichtbar ⇒ Einstellungen-Tab muss ebenfalls sichtbar sein (Admin/Gremium)
    if (await gremiumBadge.isVisible()) {
      await expect(settingsTab).toBeVisible();
    }
    // Antrags-Tab ist für jede Rolle vorhanden
    await expect(page.locator('.nav-item[data-view="antrag"]')).toBeVisible();
  });

  test('KI-Dashboard Demo-Modus zeigt die KI-Vorschläge-Sidebar', async ({ page }) => {
    await page.goto('/ki/?demo=1');
    await expect(page.locator('.sidebar')).toBeVisible();
    await page.locator('.nav-item[data-view="antrag"]').click();
    await expect(page.locator('#ki-vorschlaege-sidebar')).toBeVisible();
  });
});
