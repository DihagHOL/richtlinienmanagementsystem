// Playwright-Konfiguration (CommonJS, damit node --check ohne type:module greift).
// Testet die Login-abhängigen Flows read-only gegen das Live-System.
const fs = require('fs');
const { defineConfig, devices } = require('@playwright/test');

const BASE = (process.env.BASE || 'https://richtlinienmanagement.dihag-extern.com').replace(/\/$/, '');
const STATE = 'e2e/.auth/state.json';
const hasState = fs.existsSync(STATE);   // Login-State vorhanden? (via `npm run e2e:login` erzeugt)

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 45000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    // Interaktiver Login → speichert die Session. Headed ausführen:  npm run e2e:login
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    // Authentifizierte, NUR LESENDE Checks. Nutzt die gespeicherte Session.
    {
      name: 'authenticated',
      testMatch: /authenticated\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: hasState ? STATE : undefined },
    },
  ],
});
