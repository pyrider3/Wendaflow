// Long comic image: storyboard panels stacked top to bottom as one SVG (rendered to PNG in the browser).
import { escapeXml, wrapText } from './export.mjs';

const STRIP = { light: { bg: '#f4f1ea', panel: '#ffffff', ink: '#1b1b1f', muted: '#5d5f66', border: '#1b1b1f', bubble: '#fffbe8' }, dark: { bg: '#121318', panel: '#1c1e26', ink: '#f1f2f6', muted: '#a8adbb', border: '#e7e9f0', bubble: '#2a2c36' } };

// panels: [{ title, scene, line, image: { dataUrl, width, height } | null }]
export function comicStripSVG(panels, { title = '', theme = 'light', width = 1080, footer = 'Made with Wendaflow · ComfyUI' } = {}) {
  const p = STRIP[theme] || STRIP.light;
  const M = 40, inner = width - M * 2, out = [];
  let y = M;
  const body = [];
  if (title) {
    const lines = wrapText(title, inner, 40, 2);
    lines.forEach((line, i) => body.push(`<text x="${width / 2}" y="${y + 40 + i * 52}" text-anchor="middle" font-size="40" font-weight="800" fill="${p.ink}">${escapeXml(line)}</text>`));
    y += 40 + lines.length * 52;
  }
  panels.forEach((panel, i) => {
    const ratio = panel.image?.width && panel.image?.height ? panel.image.height / panel.image.width : 832 / 1216;
    const h = Math.round(inner * ratio);
    body.push(`<rect x="${M}" y="${y}" width="${inner}" height="${h}" fill="${p.panel}" stroke="${p.border}" stroke-width="6"/>`);
    if (panel.image?.dataUrl) body.push(`<image x="${M}" y="${y}" width="${inner}" height="${h}" preserveAspectRatio="xMidYMid slice" href="${escapeXml(panel.image.dataUrl)}"/>`);
    else wrapText(panel.scene || panel.title, inner - 80, 26, 6).forEach((line, k) => body.push(`<text x="${width / 2}" y="${y + h / 2 - 60 + k * 36}" text-anchor="middle" font-size="26" fill="${p.muted}">${escapeXml(line)}</text>`));
    body.push(`<rect x="${M + 3}" y="${y + 3}" width="64" height="44" fill="${p.border}"/><text x="${M + 35}" y="${y + 35}" text-anchor="middle" font-size="26" font-weight="800" fill="${p.panel}">${i + 1}</text>`);
    body.push(`<rect x="${M}" y="${y}" width="${inner}" height="${h}" fill="none" stroke="${p.border}" stroke-width="6"/>`);
    y += h;
    const lines = panel.line ? wrapText(`「${panel.line}」`, inner - 60, 30, 3) : [];
    if (lines.length) {
      const bh = 30 + lines.length * 42;
      body.push(`<rect x="${M}" y="${y + 14}" width="${inner}" height="${bh}" rx="22" fill="${p.bubble}" stroke="${p.border}" stroke-width="3"/>`);
      lines.forEach((line, k) => body.push(`<text x="${M + 30}" y="${y + 14 + 44 + k * 42}" font-size="30" font-weight="650" fill="${p.ink}">${escapeXml(line)}</text>`));
      y += 14 + bh;
    }
    y += 36;
  });
  if (footer) { body.push(`<text x="${width / 2}" y="${y + 18}" text-anchor="middle" font-size="18" fill="${p.muted}">${escapeXml(footer)}</text>`); y += 40; }
  const height = Math.round(y + M / 2);
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family="system-ui,-apple-system,'Segoe UI','Noto Sans CJK SC','PingFang SC','Microsoft YaHei',sans-serif">`);
  out.push(`<rect width="${width}" height="${height}" fill="${p.bg}"/>`, ...body, '</svg>');
  return { svg: out.join('\n'), width, height };
}
