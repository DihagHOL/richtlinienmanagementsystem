// Schreib-/Mutations-Tests gegen das Live-System.
// Voraussetzung: `npm run e2e:login` (erzeugt e2e/.auth/state.json) – am besten
// mit einem Konto, das im KI-Gremium ist und im RMS Prüfer-Rechte hat.
//
// Zwei Klassen:
//  A) SICHER – testet Schreib-AKTIONEN, die die App blockiert (Pflicht-Kommentar).
//     Es wird nichts gespeichert und keine Mail ausgelöst. Läuft immer.
//  B) ECHTE MUTATION – legt einen Antrag an. Nur mit E2E_WRITE=1.
//     ⚠ Löst beim Einreichen echte Genehmiger-Mails aus, sofern die
//     E-Mail-Benachrichtigung in den KI-Einstellungen nicht abgeschaltet ist.
const fs = require('fs');
const { test, expect } = require('@playwright/test');

const HAS_STATE = fs.existsSync('e2e/.auth/state.json');
const WRITE = process.env.E2E_WRITE === '1';

test.describe('A) Schreib-Validierung (sicher – nichts wird gespeichert)', () => {
  test.skip(!HAS_STATE, 'Kein Login-State – zuerst `npm run e2e:login`.');

  test('KI: Ablehnen ohne Kommentar wird blockiert', async ({ page }) => {
    await page.goto('/ki/');
    await expect(page.locator('.sidebar')).toBeVisible();
    await page.locator('.nav-item[data-view="antraege"]').click();
    await expect(page.locator('#antraege-list')).toBeVisible();

    // einen Antrag öffnen, der Gremium-Aktionsbuttons zeigt
    const cards = page.locator('#antraege-list .item-card');
    const count = await cards.count();
    let opened = false;
    for (let i = 0; i < Math.min(count, 8); i++) {
      await cards.nth(i).click();
      await expect(page.locator('#side-panel')).toBeVisible();
      if (await page.locator('.panel-actions button:has-text("Ablehnen")').count()) { opened = true; break; }
      await page.locator('.panel-close').last().click();
    }
    test.skip(!opened, 'Kein ablehnbarer Antrag sichtbar (Rolle/Datenlage) – Schreib-Validierung übersprungen.');

    await page.locator('#pg-kommentar').fill('');
    await page.locator('.panel-actions button:has-text("Ablehnen")').click();
    // App blockiert: Fehlertoast + rotes Pflichtfeld, KEIN Statuswechsel
    await expect(page.locator('#toast-container .toast', { hasText: 'begründet' })).toBeVisible();
    await expect(page.locator('#pg-kommentar')).toHaveClass(/invalid/);
  });

  test('KI: Rückfrage-Button bleibt ohne Kommentar gesperrt', async ({ page }) => {
    await page.goto('/ki/');
    await page.locator('.nav-item[data-view="antraege"]').click();
    const cards = page.locator('#antraege-list .item-card');
    const count = await cards.count();
    let opened = false;
    for (let i = 0; i < Math.min(count, 8); i++) {
      await cards.nth(i).click();
      await expect(page.locator('#side-panel')).toBeVisible();
      if (await page.locator('#btn-rueckfrage').count()) { opened = true; break; }
      await page.locator('.panel-close').last().click();
    }
    test.skip(!opened, 'Kein Antrag mit Rückfrage-Aktion sichtbar – übersprungen.');
    await expect(page.locator('#btn-rueckfrage')).toBeDisabled();
  });

  test('RMS: „nicht konform" ohne Begründung wird blockiert', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.sidebar')).toBeVisible();
    const freigabenNav = page.locator('.nav-item[data-view="freigaben"]');
    test.skip(!(await freigabenNav.isVisible()), 'Keine Freigabe-Rechte (Prüfer/GL) – übersprungen.');
    await freigabenNav.click();
    await expect(page.locator('#view-freigaben')).toBeVisible();

    const nichtKonform = page.locator('#list-freigaben button:has-text("Nicht konform")').first();
    test.skip(!(await nichtKonform.count()), 'Keine Richtlinie in Konformitätsprüfung – übersprungen.');
    await nichtKonform.click();
    // App blockiert: Fehlertoast „… muss begründet werden."
    await expect(page.locator('.toast', { hasText: 'begründet' })).toBeVisible();
  });
});

test.describe('B) Echte Mutation – nur mit E2E_WRITE=1', () => {
  test.skip(!HAS_STATE, 'Kein Login-State – zuerst `npm run e2e:login`.');
  test.skip(!WRITE, 'Ohne E2E_WRITE=1 übersprungen (legt echten Antrag an, ggf. Genehmiger-Mail).');

  test('KI: Antrag anlegen erscheint in der Liste', async ({ page }) => {
    const titel = `[E2E-TEST] ${new Date().toISOString()}`;
    await page.goto('/ki/');
    await page.locator('.nav-item[data-view="antrag"]').click();
    await expect(page.locator('#form-antrag')).toBeVisible();

    // alle Pflichtfelder generisch füllen (robust gegen die genaue Feldliste)
    const reqs = page.locator('#form-antrag-fields [required]');
    const n = await reqs.count();
    for (let i = 0; i < n; i++) {
      const el = reqs.nth(i);
      const tag = await el.evaluate(e => e.tagName);
      if (tag === 'SELECT') await el.selectOption({ index: 1 });
      else await el.fill('E2E-TEST');
    }
    await page.locator('#f-Title').fill(titel);
    await page.locator('#btn-submit').click();

    await expect(page.locator('#antrag-success')).toBeVisible({ timeout: 20000 });

    // in der Anträge-Liste wiederfinden
    await page.locator('.nav-item[data-view="antraege"]').click();
    await page.locator('#search-antraege').fill('[E2E-TEST]');
    await expect(page.locator('#antraege-list', { hasText: titel })).toBeVisible({ timeout: 10000 });
    // Hinweis: Test-Anträge tragen das Präfix [E2E-TEST] und können in
    // SharePoint gesammelt gelöscht werden (keine UI-Löschung im Dashboard).
  });
});
