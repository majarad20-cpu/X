// Utilidades comunes de las pruebas: Playwright (local o global) y el Chromium del sistema si existe.
const fs = require('fs');
const { execSync } = require('child_process');

let playwright;
try {
  playwright = require('playwright');
} catch {
  playwright = require(`${execSync('npm root -g').toString().trim()}/playwright`);
}

const SYSTEM_CHROMIUM = '/opt/pw-browsers/chromium';
const launchOptions = fs.existsSync(SYSTEM_CHROMIUM) ? { executablePath: SYSTEM_CHROMIUM } : {};

module.exports = { chromium: playwright.chromium, launchOptions };
