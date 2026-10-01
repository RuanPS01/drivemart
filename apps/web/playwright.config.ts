import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

// Chromium do sistema quando existir (ambientes sem download de navegadores); senão o do Playwright.
const systemChromium = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';

const port = Number(process.env.E2E_PORT ?? 5173);

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1000, height: 680 },
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath: existsSync(systemChromium) ? systemChromium : undefined,
      // WebGL por software (SwiftShader) para rodar sem GPU.
      args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
  },
  webServer: {
    command: `npm run dev -- --port ${port} --strictPort`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
