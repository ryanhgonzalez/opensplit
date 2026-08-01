import type { ExpenseCategory } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// Client-side receipt scanner: image → OCR (Tesseract.js) → best-effort fields.
//
// Accuracy note: generic OCR on real-world receipts is imperfect, so everything
// here is best-effort and MUST land in an editable draft the user reviews before
// saving — never auto-commit. `parseReceiptText` is kept pure (no DOM/OCR deps)
// so it can be unit-tested against sample receipt text.
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedReceipt {
  amount?: number;
  description?: string;
  category?: ExpenseCategory;
  rawText: string;
}

export type ScanProgress = (progress: number) => void;

/** Scan a receipt image file and return best-effort expense fields. */
export async function scanReceipt(file: File, onProgress?: ScanProgress): Promise<ParsedReceipt> {
  const canvas = await preprocessImage(file);

  // Lazy-load Tesseract so it never bloats the main bundle — only fetched on first scan.
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress);
    },
  });

  try {
    const { data } = await worker.recognize(canvas);
    const text = data.text ?? '';
    return { ...parseReceiptText(text), rawText: text };
  } finally {
    await worker.terminate();
  }
}

// ─── Image preprocessing (downscale + grayscale + mild contrast) ──────────────

async function preprocessImage(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const maxDim = 1800; // enough detail for OCR without excessive memory/time
    const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.drawImage(img, 0, 0, width, height);

    // Grayscale + mild contrast boost — helps OCR on faded thermal receipts.
    const imageData = ctx.getImageData(0, 0, width, height);
    const d = imageData.data;
    const contrast = 1.35;
    const intercept = 128 * (1 - contrast);
    for (let i = 0; i < d.length; i += 4) {
      const gray = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = clamp(contrast * gray + intercept, 0, 255);
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = src;
  });
}

const clamp = (n: number, lo: number, hi: number) => (n < lo ? lo : n > hi ? hi : n);

// ─── Text parsing (pure — unit-testable) ──────────────────────────────────────

export function parseReceiptText(text: string): Omit<ParsedReceipt, 'rawText'> {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  return {
    amount: extractTotal(lines),
    description: extractMerchant(lines),
    category: guessCategory(text),
  };
}

/** Pull currency-looking numbers ($1,234.56 / 12.00) from a single line. */
function moneyOnLine(line: string): number[] {
  const re = /(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d+\.\d{2})/g;
  const out: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (!Number.isNaN(n)) out.push(n);
  }
  return out;
}

/**
 * Find the receipt total. Priority:
 *   1) strong keywords (grand total / balance due / amount due), scanned bottom-up
 *   2) a plain "total" line (excluding "subtotal")
 *   3) fallback: the largest currency value on the receipt
 * Label and value are sometimes on separate lines, so we also peek at the next line.
 */
function extractTotal(lines: string[]): number | undefined {
  const strong = /(grand\s*total|total\s*due|balance\s*due|amount\s*due)/i;
  const total = /\btotals?\b/i;
  const excludeFromTotal = /(sub\s*-?\s*total|subtotal)/i;

  const numbersFor = (i: number): number[] => {
    const here = moneyOnLine(lines[i]);
    if (here.length) return here;
    return i + 1 < lines.length ? moneyOnLine(lines[i + 1]) : [];
  };

  for (let i = lines.length - 1; i >= 0; i--) {
    if (strong.test(lines[i])) {
      const nums = numbersFor(i);
      if (nums.length) return nums[nums.length - 1];
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (total.test(lines[i]) && !excludeFromTotal.test(lines[i])) {
      const nums = numbersFor(i);
      if (nums.length) return nums[nums.length - 1];
    }
  }

  let max: number | undefined;
  for (const line of lines) {
    for (const n of moneyOnLine(line)) {
      if (max === undefined || n > max) max = n;
    }
  }
  return max;
}

/** Merchant name is almost always at the very top of the receipt. */
function extractMerchant(lines: string[]): string | undefined {
  // Note: \btel[.:] (not bare "tel") so merchant names like "HOTEL"/"MOTEL" aren't
  // mistaken for a "Tel:" phone line.
  const noise = /(receipt|invoice|order\s*#|\btel[.:]|phone|fax|www\.|https?:|\.com|street|\bst\b|\bave\b|\brd\b|suite|\bste\b|survey|thank you|welcome|cashier|register|\d{2,}[\/\-]\d{2,})/i;
  for (const line of lines.slice(0, 6)) {
    const letters = (line.match(/[a-z]/gi) ?? []).length;
    const digits = (line.match(/\d/g) ?? []).length;
    if (letters >= 3 && letters > digits && line.length <= 40 && !noise.test(line)) {
      return toTitleCase(line.replace(/[*_|]+/g, '').trim());
    }
  }
  return undefined;
}

function toTitleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (_, c: string) => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim();
}

// Keyword → category. Ordered by specificity; first confident hit wins.
const CATEGORY_KEYWORDS: [ExpenseCategory, RegExp][] = [
  ['subscriptions', /\b(netflix|spotify|hulu|disney\+?|prime video|subscription|patreon|youtube premium)\b/i],
  ['accommodation', /\b(hotel|motel|inn|resort|airbnb|lodging|hostel)\b/i],
  ['transport',     /\b(uber|lyft|taxi|cab|fuel|gas station|shell|chevron|exxon|mobil|\bbp\b|parking|transit|metro|toll|fare)\b/i],
  ['travel',        /\b(airline|airways|airport|flight|delta|united airlines|jetblue|southwest|amtrak|rental car|hertz|avis)\b/i],
  ['healthcare',    /\b(pharmacy|cvs|walgreens|clinic|hospital|medical|dental|dentist|doctor|urgent care|\brx\b)\b/i],
  ['groceries',     /\b(grocery|supermarket|market|foods|safeway|kroger|costco|trader joe|whole foods|aldi|publix|wegmans|produce)\b/i],
  ['entertainment', /\b(cinema|theatre|theater|movie|amc|regal|concert|arcade|bowling|museum)\b/i],
  ['utilities',     /\b(electric|water bill|utility|energy|comcast|xfinity|at&t|verizon|t-?mobile|internet|power company)\b/i],
  ['personal-care', /\b(salon|spa|barber|nails?|beauty|haircut|massage)\b/i],
  ['food',          /\b(restaurant|cafe|coffee|grill|pizza|burger|sushi|\bbar\b|diner|kitchen|bistro|bakery|starbucks|mcdonald|chipotle|taco|deli|eatery|brewery|pub)\b/i],
  ['shopping',      /\b(target|walmart|amazon|best buy|boutique|apparel|clothing|mall|\bstore\b|outlet|ikea)\b/i],
  ['education',     /\b(tuition|university|college|bookstore|course|textbook)\b/i],
];

function guessCategory(text: string): ExpenseCategory | undefined {
  for (const [category, re] of CATEGORY_KEYWORDS) {
    if (re.test(text)) return category;
  }
  return undefined; // leave the form's current selection untouched when unsure
}
