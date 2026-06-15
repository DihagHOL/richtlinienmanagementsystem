// Playwright-Konfiguration (CommonJS, damit node --check ohne type:module greift).
// Testet die Login-abhängigen Flows gegen das Live-System.
const fs = require('fs');
const { defineConfig, devices } = require('@playwright/test');

const BASE = (process.env.BASE || 'https://richtlinienmanagement.dihag-extern.com').replace(/\/$/, '');
const STATE = 'e2e/.auth/state.json';
const hasState = fs.existsSync(STATE);   // Login-State vorhanden? (via `npm run e2e:login` erzeugt)

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 45000,
  fullyParallel: false,           // gemeinsame Session, sequentiell
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: BASE,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 900 },
  },
  projects: [
    // Interaktiver Login → speichert die Session. Headed:  npm run e2e:login
    { name: 'setup', testMatch: /auth\.setup\.js/ },
    // Ohne Login: alte-URL-Redirect.  npm run e2e:preauth
    { name: 'preauth', testMatch: /preauth\.spec\.js/, use: { ...devices['Desktop Chrome'] } },
    // Authentifiziert: Lese-Checks + Schreib-Validierung (+ optional echte Mutationen).
    {
      name: 'authenticated',
      testMatch: /(authenticated|mutations)\.spec\.js/,
      use: { ...devices['Desktop Chrome'], storageState: hasState ? STATE : undefined },
    },
  ],
});
