import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import './ReceiptCropModal.css';

/** Normalised crop rectangle: every value is a fraction of the (rotated) image. */
interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'move';

interface ReceiptCropModalProps {
  file: Blob;
  onCancel: () => void;
  /** The cropped, rotated image ready for OCR. */
  onConfirm: (image: Blob) => void;
}

const FULL: CropRect = { x: 0, y: 0, w: 1, h: 1 };
const MIN_SIZE = 0.08;
const MAX_SOURCE_DIM = 2200;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = url;
  });
}

/** Draws the photo rotated by `quarterTurns` × 90°, downscaled to a sane size. */
function rotatedCanvas(img: HTMLImageElement, quarterTurns: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_SOURCE_DIM / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const sideways = quarterTurns % 2 === 1;

  const canvas = document.createElement('canvas');
  canvas.width = sideways ? h : w;
  canvas.height = sideways ? w : h;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((quarterTurns * Math.PI) / 2);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  return canvas;
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/**
 * Lets the person crop and rotate a receipt photo before it goes to OCR.
 *
 * Trimming away the table, the hand holding the receipt and the neighbouring
 * menu does more for recognition accuracy than any amount of parser tuning.
 * Pointer events cover touch, mouse and pen alike.
 */
export default function ReceiptCropModal({ file, onCancel, onConfirm }: ReceiptCropModalProps) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [turns, setTurns] = useState(0);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState(1); // width / height of the rotated image
  const [crop, setCrop] = useState<CropRect>(FULL);
  const [box, setBox] = useState({ w: 0, h: 0 }); // rendered size of the image
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ handle: Handle; startX: number; startY: number; start: CropRect } | null>(null);

  // Decode the file once.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    let cancelled = false;
    loadImage(url)
      .then((img) => { if (!cancelled) setImage(img); })
      .catch(() => { if (!cancelled) setError("Couldn't open that photo."); })
      .finally(() => URL.revokeObjectURL(url));
    return () => { cancelled = true; };
  }, [file]);

  // Re-rasterise whenever the rotation changes.
  useEffect(() => {
    if (!image) return;
    const canvas = rotatedCanvas(image, turns);
    sourceRef.current = canvas;
    setAspect(canvas.width / canvas.height);
    setDisplayUrl(canvas.toDataURL('image/jpeg', 0.85));
    setCrop(FULL);
  }, [image, turns]);

  // Fit the image inside the stage, letterboxed, and track resizes.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const fit = () => {
      const { width, height } = stage.getBoundingClientRect();
      if (width === 0 || height === 0) return;
      const w = Math.min(width, height * aspect);
      setBox({ w, h: w / aspect });
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [aspect, displayUrl]);

  const onPointerDown = (handle: Handle) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { handle, startX: e.clientX, startY: e.clientY, start: crop };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || box.w === 0) return;
    const dx = (e.clientX - d.startX) / box.w;
    const dy = (e.clientY - d.startY) / box.h;
    const s = d.start;
    let next: CropRect;

    switch (d.handle) {
      case 'move':
        next = { ...s, x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) };
        break;
      case 'nw': {
        const x = clamp(s.x + dx, 0, s.x + s.w - MIN_SIZE);
        const y = clamp(s.y + dy, 0, s.y + s.h - MIN_SIZE);
        next = { x, y, w: s.x + s.w - x, h: s.y + s.h - y };
        break;
      }
      case 'ne': {
        const y = clamp(s.y + dy, 0, s.y + s.h - MIN_SIZE);
        const w = clamp(s.w + dx, MIN_SIZE, 1 - s.x);
        next = { x: s.x, y, w, h: s.y + s.h - y };
        break;
      }
      case 'sw': {
        const x = clamp(s.x + dx, 0, s.x + s.w - MIN_SIZE);
        const h = clamp(s.h + dy, MIN_SIZE, 1 - s.y);
        next = { x, y: s.y, w: s.x + s.w - x, h };
        break;
      }
      case 'se':
      default:
        next = { x: s.x, y: s.y, w: clamp(s.w + dx, MIN_SIZE, 1 - s.x), h: clamp(s.h + dy, MIN_SIZE, 1 - s.y) };
        break;
    }
    setCrop(next);
  };

  const onPointerUp = () => { drag.current = null; };

  const confirm = async (region: CropRect) => {
    const source = sourceRef.current;
    if (!source || busy) return;
    setBusy(true);
    try {
      const sx = Math.round(region.x * source.width);
      const sy = Math.round(region.y * source.height);
      const sw = Math.max(1, Math.round(region.w * source.width));
      const sh = Math.max(1, Math.round(region.h * source.height));
      const out = document.createElement('canvas');
      out.width = sw;
      out.height = sh;
      out.getContext('2d')!.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.92));
      if (!blob) throw new Error('toBlob failed');
      onConfirm(blob);
    } catch {
      setError("Couldn't prepare the photo. Try again or use the whole image.");
      setBusy(false);
    }
  };

  const pct = (n: number) => `${n * 100}%`;
  const isFull = crop.x === 0 && crop.y === 0 && crop.w === 1 && crop.h === 1;

  return (
    <motion.div
      className="rcm-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-label="Crop receipt"
    >
      <div className="rcm-top">
        <button className="rcm-text-btn" onClick={onCancel}>Cancel</button>
        <span className="rcm-title">Crop receipt</span>
        <button className="rcm-text-btn" onClick={() => setTurns((t) => (t + 1) % 4)} aria-label="Rotate 90 degrees">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M21 12a9 9 0 1 1-3-6.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            <path d="M21 3v6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <div className="rcm-stage" ref={stageRef}>
        {displayUrl && box.w > 0 && (
          <div
            className="rcm-image-box"
            style={{ width: box.w, height: box.h }}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            <img src={displayUrl} alt="" draggable={false} />
            <div
              className="rcm-crop"
              style={{ left: pct(crop.x), top: pct(crop.y), width: pct(crop.w), height: pct(crop.h) }}
              onPointerDown={onPointerDown('move')}
            >
              <div className="rcm-grid" aria-hidden />
              {(['nw', 'ne', 'sw', 'se'] as Handle[]).map((h) => (
                <div key={h} className={`rcm-handle rcm-handle-${h}`} onPointerDown={onPointerDown(h)} />
              ))}
            </div>
          </div>
        )}
        {!displayUrl && !error && <div className="rcm-loading">Opening photo…</div>}
        {error && <div className="rcm-error">{error}</div>}
      </div>

      <p className="rcm-hint">Drag the corners to frame just the receipt. Tighter framing reads better.</p>

      <div className="rcm-actions">
        {!isFull && (
          <button className="rcm-secondary" onClick={() => setCrop(FULL)} disabled={busy}>Reset</button>
        )}
        <button className="rcm-secondary" onClick={() => confirm(FULL)} disabled={busy || !displayUrl}>
          Use whole photo
        </button>
        <button className="rcm-primary" onClick={() => confirm(crop)} disabled={busy || !displayUrl}>
          {busy ? 'Preparing…' : 'Scan'}
        </button>
      </div>
    </motion.div>
  );
}
