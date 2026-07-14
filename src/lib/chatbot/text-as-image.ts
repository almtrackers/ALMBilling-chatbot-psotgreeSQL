import fs from 'fs';
import path from 'path';

const PT_TO_PX = 96 / 72;
const DEFAULT_SCALE = 2;

type CanvasModule = {
  createCanvas: (width: number, height: number) => any;
  GlobalFonts: {
    registerFromPath: (fontPath: string, name: string) => void;
    has: (name: string) => boolean;
  };
};

export type PdfAddressImage = {
  dataUrl: string;
  width: number;
  height: number;
  widthPt: number;
  heightPt: number;
};

let canvasModule: CanvasModule | null | undefined;
let fontRegistered = false;
let resolvedFontFamily: string | null = null;

function loadCanvasModule(): CanvasModule | null {
  if (canvasModule !== undefined) return canvasModule;

  try {
    const runtimeRequire = eval('require') as NodeRequire;
    canvasModule = runtimeRequire('@napi-rs/canvas') as CanvasModule;
  } catch (error) {
    console.warn(
      '[@napi-rs/canvas] native binding unavailable; PDF addresses will fall back to plain text.',
      error instanceof Error ? error.message : error
    );
    canvasModule = null;
  }

  return canvasModule;
}

function ensureUrduFontRegistered(canvas: CanvasModule) {
  if (fontRegistered) return resolvedFontFamily;
  fontRegistered = true;

  try {
    const nastaliqPath = path.join(process.cwd(), 'public', 'fonts', 'NotoNastaliqUrdu-Regular.ttf');
    if (fs.existsSync(nastaliqPath)) {
      canvas.GlobalFonts.registerFromPath(nastaliqPath, 'NotoNastaliqUrdu');
    }

    const nirmalaPath = path.join(process.cwd(), 'public', 'fonts', 'NirmalaUI.ttf');
    if (fs.existsSync(nirmalaPath)) {
      canvas.GlobalFonts.registerFromPath(nirmalaPath, 'NirmalaUI');
    }
  } catch (error) {
    console.warn('Failed to register Urdu font for PDF address images:', error);
  }

  if (canvas.GlobalFonts.has('NotoNastaliqUrdu')) {
    resolvedFontFamily = 'NotoNastaliqUrdu';
  } else if (canvas.GlobalFonts.has('NirmalaUI')) {
    resolvedFontFamily = 'NirmalaUI';
  } else {
    resolvedFontFamily = 'sans-serif';
  }

  return resolvedFontFamily;
}

export function containsUrdu(text: string) {
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);
}

function wrapCanvasText(ctx: any, text: string, maxWidth: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return [''];

  const words = normalized.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      currentLine = candidate;
      continue;
    }

    if (currentLine) {
      lines.push(currentLine);
      currentLine = '';
    }

    if (ctx.measureText(word).width <= maxWidth) {
      currentLine = word;
      continue;
    }

    let chunk = '';
    for (const char of Array.from(word)) {
      const nextChunk = `${chunk}${char}`;
      if (ctx.measureText(nextChunk).width <= maxWidth || !chunk) {
        chunk = nextChunk;
      } else {
        lines.push(chunk);
        chunk = char;
      }
    }
    currentLine = chunk;
  }

  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [normalized];
}

const imageCache = new Map<string, PdfAddressImage>();

export function renderAddressImage(text: string, widthPt: number): PdfAddressImage | null {
  const clean = String(text || '').trim();
  if (!clean || clean === '-') return null;

  const canvasApi = loadCanvasModule();
  if (!canvasApi) return null;

  try {
    const fontFamily = ensureUrduFontRegistered(canvasApi) || 'sans-serif';
    const useRtl = containsUrdu(clean);
    const scale = DEFAULT_SCALE;
    const fontSizePx = Math.round(11 * scale);
    const lineHeightPx = Math.round(18 * scale);
    const horizontalPadding = Math.round(8 * scale);
    const verticalPadding = Math.round(6 * scale);
    const canvasWidth = Math.max(80, Math.ceil(widthPt * PT_TO_PX * scale));
    const drawableWidth = Math.max(40, canvasWidth - horizontalPadding * 2);

    const cacheKey = `${fontFamily}|${useRtl}|${canvasWidth}|${fontSizePx}|${clean}`;
    const cached = imageCache.get(cacheKey);
    if (cached) return cached;

    const measureCanvas = canvasApi.createCanvas(canvasWidth, 40);
    const measureCtx = measureCanvas.getContext('2d');
    measureCtx.font = `${fontSizePx}px "${fontFamily}"`;
    measureCtx.direction = useRtl ? 'rtl' : 'ltr';
    measureCtx.textAlign = useRtl ? 'right' : 'left';
    const lines = wrapCanvasText(measureCtx, clean, drawableWidth);

    const canvasHeight = Math.max(
      36,
      verticalPadding * 2 + lines.length * lineHeightPx
    );

    const canvas = canvasApi.createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.font = `${fontSizePx}px "${fontFamily}"`;
    ctx.fillStyle = '#111827';
    ctx.direction = useRtl ? 'rtl' : 'ltr';
    ctx.textAlign = useRtl ? 'right' : 'left';
    ctx.textBaseline = 'alphabetic';

    const x = useRtl ? canvasWidth - horizontalPadding : horizontalPadding;
    lines.forEach((line, index) => {
      ctx.fillText(line, x, verticalPadding + fontSizePx + index * lineHeightPx);
    });

    const png = canvas.toBuffer('image/png');
    const result: PdfAddressImage = {
      dataUrl: `data:image/png;base64,${png.toString('base64')}`,
      width: canvasWidth,
      height: canvasHeight,
      widthPt,
      heightPt: canvasHeight / (PT_TO_PX * scale),
    };
    imageCache.set(cacheKey, result);
    return result;
  } catch (error) {
    console.warn('Failed to render address image for PDF:', error);
    return null;
  }
}

export function renderTextToPngDataUrl(
  text: string,
  options: {
    widthPt: number;
    heightPt: number;
    fontSizePt: number;
    paddingPt?: number;
    align?: 'left' | 'right' | 'center';
    rtl?: boolean;
  }
) {
  const image = renderAddressImage(text, options.widthPt);
  return image?.dataUrl ?? null;
}
