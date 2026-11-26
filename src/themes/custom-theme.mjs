// The custom theme: what the user can set, ready-made starting points, and the CSS variables it turns into.
// The page reads only --custom-* variables (see gallery.css), so everything here stays plain data.

export const COLOR_KEYS = ['background', 'grid', 'glow', 'card', 'cardBorder', 'text', 'body', 'muted', 'accent', 'selection', 'line', 'panel'];
export const SHADOWS = ['none', 'soft', 'float', 'hard', 'glow'];
export const GRIDS = ['dots', 'lines', 'none'];
export const FONTS = ['system', 'serif', 'kai', 'mono', 'rounded'];

const SHAPE = { radius: 12, borderWidth: 1, lineWidth: 1.5, cardOpacity: 100, shadow: 'soft', gridStyle: 'dots', gridSize: 24, font: 'system', glowStrength: 25 };

// Quick starts: complete palettes the user can pick and then adjust.
export const CUSTOM_PRESETS = {
  daylight: { background: '#f4f5f8', grid: '#d6d9e2', glow: '#6d7cff', card: '#ffffff', cardBorder: '#dfe2ea', text: '#1b1e27', body: '#4b5263', muted: '#6a7184', accent: '#4f5fe0', selection: '#4f5fe0', line: '#a3aabd', panel: '#ffffff' },
  night: { background: '#111318', grid: '#262b36', glow: '#7c8cff', card: '#1b1e26', cardBorder: '#2c313d', text: '#eef0f6', body: '#b3b9c8', muted: '#8890a2', accent: '#7c8cff', selection: '#7c8cff', line: '#5b6477', panel: '#171a21' },
  forest: { background: '#eef3ee', grid: '#cddbd1', glow: '#5fbf8a', card: '#fbfdfb', cardBorder: '#cfdcd2', text: '#17241c', body: '#44564a', muted: '#677a6d', accent: '#2f8a5b', selection: '#2f8a5b', line: '#93a99a', panel: '#f8fbf8' },
  rose: { background: '#fbf2f3', grid: '#ecd6da', glow: '#ff8fa3', card: '#ffffff', cardBorder: '#efd4d8', text: '#2a1a1e', body: '#5c4348', muted: '#8a6e73', accent: '#d1495b', selection: '#d1495b', line: '#c9a3aa', panel: '#fffafa' },
  deepsea: { background: '#0b1a2a', grid: '#173049', glow: '#3fb6ff', card: '#10263d', cardBorder: '#1f3c5c', text: '#e8f2ff', body: '#a9c2dd', muted: '#7f9bb9', accent: '#3fb6ff', selection: '#3fb6ff', line: '#4a7099', panel: '#0d2135' },
  amber: { background: '#17130d', grid: '#2e261b', glow: '#f0a72a', card: '#221c14', cardBorder: '#3a2f20', text: '#f6ecd9', body: '#cdbb9b', muted: '#a8977a', accent: '#f0a72a', selection: '#f0a72a', line: '#7d6a4c', panel: '#1c1710' },
};

export const DEFAULT_CUSTOM_THEME = { version: 2, ...CUSTOM_PRESETS.daylight, ...SHAPE };

const HEX = /^#[0-9a-f]{6}$/i;
const clamp = (value, min, max, fallback) => { const n = Number(value); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback; };

// Accepts anything (saved data, pasted theme code, the old five-colour format) and returns a complete theme.
export function normalizeCustomTheme(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const old = raw.version === 2 ? {} : { card: raw.surface, cardBorder: raw.grid, body: raw.text, selection: raw.accent };
  const merged = { ...DEFAULT_CUSTOM_THEME, ...Object.fromEntries(Object.entries(old).filter(([, value]) => value !== undefined)), ...raw };
  const out = { version: 2 };
  for (const key of COLOR_KEYS) out[key] = HEX.test(merged[key]) ? merged[key].toLowerCase() : DEFAULT_CUSTOM_THEME[key];
  out.radius = clamp(merged.radius, 0, 24, SHAPE.radius);
  out.borderWidth = clamp(merged.borderWidth, 0, 3, SHAPE.borderWidth);
  out.lineWidth = clamp(merged.lineWidth, 1, 3, SHAPE.lineWidth);
  out.cardOpacity = clamp(merged.cardOpacity, 60, 100, SHAPE.cardOpacity);
  out.gridSize = clamp(merged.gridSize, 12, 48, SHAPE.gridSize);
  out.glowStrength = clamp(merged.glowStrength, 0, 100, SHAPE.glowStrength);
  out.shadow = SHADOWS.includes(merged.shadow) ? merged.shadow : SHAPE.shadow;
  out.gridStyle = GRIDS.includes(merged.gridStyle) ? merged.gridStyle : SHAPE.gridStyle;
  out.font = FONTS.includes(merged.font) ? merged.font : SHAPE.font;
  return out;
}

const rgb = (hex) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16));
const rgba = (hex, alpha) => `rgba(${rgb(hex).join(', ')}, ${Math.round(alpha * 1000) / 1000})`;
export function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const FONT_STACKS = {
  system: 'inherit',
  serif: '"Noto Serif SC", "Source Han Serif SC", "Songti SC", STSong, Georgia, serif',
  kai: '"LXGW WenKai", "Kaiti SC", STKaiti, KaiTi, serif',
  mono: '"JetBrains Mono", "Sarasa Mono SC", "Cascadia Code", ui-monospace, monospace',
  rounded: '"SF Pro Rounded", "HarmonyOS Sans SC", Nunito, "Varela Round", system-ui, sans-serif',
};

// The theme as CSS variables, plus whether it reads as dark and which grid to draw.
export function customThemeVars(input) {
  const t = normalizeCustomTheme(input);
  const dark = luminance(t.background) < 0.18;
  const a = dark ? [0.32, 0.55, 0.72] : [0.06, 0.16, 0.26];
  const shadow = {
    none: 'none',
    soft: `0 1px 2px rgba(0, 0, 0, ${a[0]}), 0 8px 20px -8px rgba(0, 0, 0, ${a[1]})`,
    float: `0 2px 4px rgba(0, 0, 0, ${a[0]}), 0 18px 40px -12px rgba(0, 0, 0, ${a[2]})`,
    hard: `4px 4px 0 ${t.text}`,
    glow: `0 0 0 1px ${rgba(t.accent, 0.35)}, 0 0 22px ${rgba(t.accent, 0.38)}`,
  }[t.shadow];
  const glow = t.glowStrength / 100;
  const vars = {
    '--custom-bg': t.background,
    '--custom-grid': t.grid,
    '--custom-glow1': rgba(t.glow, 0.32 * glow),
    '--custom-glow2': rgba(t.glow, 0.18 * glow),
    '--custom-card': rgba(t.card, t.cardOpacity / 100),
    '--custom-card-solid': t.card,
    '--custom-card-border': t.cardBorder,
    '--custom-text': t.text,
    '--custom-body': t.body,
    '--custom-muted': t.muted,
    '--custom-accent': t.accent,
    '--custom-accent-ink': luminance(t.accent) > 0.45 ? '#111111' : '#ffffff',
    '--custom-selection': t.selection,
    '--custom-line': t.line,
    '--custom-panel': t.panel,
    '--custom-radius': `${t.radius}px`,
    '--custom-border-width': `${t.borderWidth}px`,
    '--custom-line-width': String(t.lineWidth),
    '--custom-grid-size': `${t.gridSize}px`,
    '--custom-shadow': shadow,
    '--custom-blur': t.cardOpacity < 100 ? 'blur(14px) saturate(1.2)' : 'none',
    '--custom-font': FONT_STACKS[t.font],
  };
  return { vars, tone: dark ? 'dark' : 'light', grid: t.gridStyle };
}
