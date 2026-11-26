import test from 'node:test';
import assert from 'node:assert/strict';
import { CUSTOM_PRESETS, DEFAULT_CUSTOM_THEME, customThemeVars, normalizeCustomTheme } from './custom-theme.mjs';

test('old five-colour custom themes carry over', () => {
  const t = normalizeCustomTheme({ background: '#101010', surface: '#202020', text: '#eeeeee', accent: '#ff0066', grid: '#333333' });
  assert.equal(t.version, 2);
  assert.equal(t.background, '#101010');
  assert.equal(t.card, '#202020');
  assert.equal(t.text, '#eeeeee');
  assert.equal(t.body, '#eeeeee');
  assert.equal(t.accent, '#ff0066');
  assert.equal(t.selection, '#ff0066');
  assert.equal(t.grid, '#333333');
});

test('bad values fall back to defaults and numbers are clamped', () => {
  const t = normalizeCustomTheme({ version: 2, background: 'red', radius: 99, borderWidth: -2, shadow: 'weird', font: 'comic', gridSize: '30' });
  assert.equal(t.background, DEFAULT_CUSTOM_THEME.background);
  assert.equal(t.radius, 24);
  assert.equal(t.borderWidth, 0);
  assert.equal(t.shadow, 'soft');
  assert.equal(t.font, 'system');
  assert.equal(t.gridSize, 30);
  assert.deepEqual(normalizeCustomTheme(null), DEFAULT_CUSTOM_THEME);
});

test('tone follows the background and every preset is complete', () => {
  assert.equal(customThemeVars(DEFAULT_CUSTOM_THEME).tone, 'light');
  assert.equal(customThemeVars({ version: 2, ...CUSTOM_PRESETS.night }).tone, 'dark');
  for (const preset of Object.values(CUSTOM_PRESETS)) assert.deepEqual(normalizeCustomTheme({ version: 2, ...preset }), { ...DEFAULT_CUSTOM_THEME, ...preset });
});

test('variables reflect shape choices', () => {
  const { vars, grid } = customThemeVars({ version: 2, radius: 4, cardOpacity: 80, shadow: 'none', gridStyle: 'lines', font: 'mono' });
  assert.equal(vars['--custom-radius'], '4px');
  assert.match(vars['--custom-card'], /^rgba\(.*0\.8\)$/);
  assert.notEqual(vars['--custom-blur'], 'none');
  assert.equal(vars['--custom-shadow'], 'none');
  assert.equal(grid, 'lines');
  assert.match(vars['--custom-font'], /monospace/);
});
