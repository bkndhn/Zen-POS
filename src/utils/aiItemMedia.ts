// Free, keyless AI item image + 360° turntable GIF maker.
// Image comes from the free Pollinations service (no credits used);
// the GIF is built on the device, so it costs nothing per item.
import { GIFEncoder, quantize, applyPalette } from 'gifenc';

export function buildFoodPrompt(name: string, category?: string): string {
  const clean = String(name || '').replace(/[^\p{L}\p{N} &'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  const cat = String(category || '').replace(/[^\p{L}\p{N} ]/gu, ' ').trim().slice(0, 30);
  return `professional top-down food photo of ${clean}${cat ? ` (${cat})` : ''}, served on a round plate, centered, plain soft background, studio lighting, appetizing, high detail`;
}

export function freeImageUrl(name: string, category?: string, seed = Date.now() % 100000): string {
  const prompt = encodeURIComponent(buildFoodPrompt(name, category));
  return `https://image.pollinations.ai/prompt/${prompt}?width=512&height=512&nologo=true&seed=${seed}`;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('Could not read the generated picture'));
    img.src = URL.createObjectURL(blob);
  });
}

export async function fetchFreeImage(name: string, category?: string): Promise<Blob> {
  const r = await fetch(freeImageUrl(name, category));
  if (!r.ok) throw new Error('Free image service is busy, please try again in a minute');
  return r.blob();
}

/** Re-encode to small, sharp WebP (~25–60KB). */
export async function toSmallWebp(src: Blob, size = 512, quality = 0.82): Promise<Blob> {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d')!;
  const s = Math.min(img.width, img.height);
  ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('encode failed'))), 'image/webp', quality));
}

/** Build a looping 360° turntable GIF (plate spins a full circle). */
export async function make360Gif(src: Blob, size = 240, frames = 24): Promise<Blob> {
  const img = await loadImage(src);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  const s = Math.min(img.width, img.height);
  const gif = GIFEncoder();
  let palette: number[][] | null = null;
  for (let f = 0; f < frames; f++) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((f / frames) * Math.PI * 2);
    ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, -size / 2, -size / 2, size, size);
    ctx.restore();
    const { data } = ctx.getImageData(0, 0, size, size);
    if (!palette) palette = quantize(data, 128);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, size, size, { palette, delay: 70 });
  }
  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
