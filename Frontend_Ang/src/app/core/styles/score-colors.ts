// Fuente de verdad para escalas de score y paints MapLibre
export type ScoreDomain = { min: number; max: number };
export type PaletteStop = { at: number; color: string };

// Dominio que sale de tu backend (ajústalo si cambia)
export const BACKEND_SCORE_DOMAIN: ScoreDomain = { min: 10, max: 95 };

// Paleta rojo→verde suave (gradual)
export const PALETTE_RDYLGN: PaletteStop[] = [
  { at: 0.00, color: '#d73027' },
  { at: 0.20, color: '#f46d43' },
  { at: 0.40, color: '#fdae61' },
  { at: 0.60, color: '#a6d96a' },
  { at: 0.80, color: '#66bd63' },
  { at: 1.00, color: '#1a9850' },
];

const clamp01 = (t: number) => Math.max(0, Math.min(1, t));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function hexToRgb(hex: string) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  const toHex = (v: number) => v.toString(16).padStart(2, '0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

export function interpolatePalette(palette: PaletteStop[], t: number): string {
  if (!palette.length) return '#ccc';
  t = clamp01(t);
  for (let i = 0; i < palette.length - 1; i++) {
    const a = palette[i], b = palette[i + 1];
    if (t >= a.at && t <= b.at) {
      const local = (t - a.at) / (b.at - a.at || 1);
      const ca = hexToRgb(a.color), cb = hexToRgb(b.color);
      return rgbToHex({
        r: Math.round(lerp(ca.r, cb.r, local)),
        g: Math.round(lerp(ca.g, cb.g, local)),
        b: Math.round(lerp(ca.b, cb.b, local))
      });
    }
  }
  return t <= palette[0].at ? palette[0].color : palette[palette.length - 1].color;
}

export function generateStops(domain: ScoreDomain, palette = PALETTE_RDYLGN, steps = 12) {
  const arr: Array<[number, string]> = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const v = domain.min + t * (domain.max - domain.min);
    arr.push([+v.toFixed(6), interpolatePalette(palette, t)]);
  }
  return arr;
}

/** p-quantile */
export function quantile(sorted: number[], q: number) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return sorted[base] + (sorted[Math.min(base + 1, sorted.length - 1)] - sorted[base]) * rest;
}

/** Dominio robusto pLow–pHigh dentro del rango backend */
export function robustDomainFromScores(
  scores: number[],
  backend: ScoreDomain = BACKEND_SCORE_DOMAIN,
  pLow = 0.05,
  pHigh = 0.95,
  pad = 0
): ScoreDomain {
  const vals = scores
    .filter(v => Number.isFinite(v))
    .map(v => Math.max(backend.min, Math.min(backend.max, v)))
    .sort((a,b)=>a-b);
  if (!vals.length) return backend;
  const lo = Math.max(backend.min, quantile(vals, pLow) - pad);
  const hi = Math.min(backend.max, quantile(vals, pHigh) + pad);
  if (hi <= lo) return backend;
  return { min: +lo.toFixed(2), max: +hi.toFixed(2) };
}

/** Expr interpolate para MapLibre (con fallback si falta propiedad) */
export function colorInterpolateExpr(
  property: string,
  domain: ScoreDomain,
  palette = PALETTE_RDYLGN,
  steps = 12,
  fallback = '#bdbdbd'
): any[] {
  const stops = generateStops(domain, palette, steps).flat();
  return [
    'case',
    ['has', property],
    ['interpolate', ['linear'], ['to-number', ['get', property]], ...stops],
    fallback
  ];
}

/** Paints listos */
export function fillPaintForScore(
  property: string,
  domain: ScoreDomain,
  opts?: { palette?: PaletteStop[]; steps?: number; fillOpacity?: number; outline?: string }
) {
  const palette = opts?.palette ?? PALETTE_RDYLGN;
  const steps = opts?.steps ?? 12;
  return {
    'fill-color': colorInterpolateExpr(property, domain, palette, steps),
    'fill-opacity': opts?.fillOpacity ?? 0.75,
    'fill-outline-color': opts?.outline ?? '#1f2937'
  } as const;
}

export function circlePaintForScore(
  property: string,
  domain: ScoreDomain,
  opts?: { palette?: PaletteStop[]; steps?: number; radius?: any; strokeColor?: string; strokeWidth?: number; opacity?: number }
) {
  const palette = opts?.palette ?? PALETTE_RDYLGN;
  const steps = opts?.steps ?? 12;
  return {
    'circle-color': colorInterpolateExpr(property, domain, palette, steps),
    'circle-radius': opts?.radius ?? ['interpolate',['linear'],['zoom'],8,3,12,6,16,10],
    'circle-stroke-color': opts?.strokeColor ?? '#111827',
    'circle-stroke-width': opts?.strokeWidth ?? 0.5,
    'circle-opacity': opts?.opacity ?? 0.9
  } as const;
}

export function heatmapPaintForScore(
  property: string,
  domain: ScoreDomain,
  opts?: { palette?: PaletteStop[]; steps?: number; radius?: any; intensity?: any; opacity?: any }
) {
  const palette = opts?.palette ?? PALETTE_RDYLGN;
  const steps = opts?.steps ?? 12;
  const stops01 = generateStops({ min: 0, max: 1 }, palette, steps).map(([v, c]) => [v, c]).flat();
  return {
    'heatmap-weight': [
      'case',
      ['has', property],
      ['interpolate', ['linear'], ['to-number', ['get', property]],
        domain.min, 0, domain.max, 1
      ],
      0
    ],
    'heatmap-radius': opts?.radius ?? ['interpolate',['linear'],['zoom'],8,10,13,30],
    'heatmap-intensity': opts?.intensity ?? ['interpolate',['linear'],['zoom'],8,0.7,13,1.6],
    'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], ...stops01],
    'heatmap-opacity': opts?.opacity ?? 0.85
  } as const;
}
