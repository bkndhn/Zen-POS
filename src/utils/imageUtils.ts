// Image compression and upload utilities
import { supabase } from '@/integrations/supabase/client';

// Image cache for performance
const imageCache = new Map<string, string>();

export const compressImage = (file: File, maxSizeKB: number = 400): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    const cleanup = () => URL.revokeObjectURL(objectUrl);

    img.onerror = () => {
      cleanup();
      reject(new Error('Could not read image file (unsupported or corrupt)'));
    };

    img.onload = () => {
      try {
        const maxDimension = 1280;
        let { width, height } = img;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = (height * maxDimension) / width;
            width = maxDimension;
          } else {
            width = (width * maxDimension) / height;
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        let quality = 0.85;
        const compress = () => {
          // Attempt WebP compression first
          canvas.toBlob((blob) => {
            if (!blob) {
              // Fallback to JPEG if encoding failed
              canvas.toBlob((jpegBlob) => {
                if (!jpegBlob) {
                  cleanup();
                  reject(new Error('Image encoding failed'));
                  return;
                }
                if (jpegBlob.size <= maxSizeKB * 1024 || quality <= 0.2) {
                  cleanup();
                  resolve(jpegBlob);
                } else {
                  quality -= 0.1;
                  compress();
                }
              }, 'image/jpeg', quality);
              return;
            }

            if (blob.size <= maxSizeKB * 1024 || quality <= 0.2) {
              cleanup();
              resolve(blob);
            } else {
              quality -= 0.1;
              compress();
            }
          }, 'image/webp', quality);
        };
        compress();
      } catch (err) {
        cleanup();
        reject(err as Error);
      }
    };

    img.src = objectUrl;
  });
};

// Per-item upload-token so rapid Replace clicks always honour the LAST file the
// user chose. Earlier in-flight uploads see their token superseded and abort.
const uploadTokens = new Map<string, number>();

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export const uploadItemImage = async (file: File, itemId: string): Promise<string> => {
  // Tag this upload attempt so we can detect rapid replace races
  const myToken = Date.now() + Math.random();
  uploadTokens.set(itemId, myToken);

  // Compress the image (best-effort — fall back to original blob if compression fails)
  let uploadBlob: Blob;
  try {
    uploadBlob = await compressImage(file, 400);
  } catch (err) {
    console.warn('[uploadItemImage] compression failed, uploading original:', err);
    uploadBlob = file;
  }

  // Abort if a newer upload was started for the same item
  if (uploadTokens.get(itemId) !== myToken) {
    throw new Error('Upload superseded by a newer file selection');
  }

  // Storage RLS requires the first folder segment to equal the user's admin_id.
  const { data: adminId, error: adminErr } = await supabase.rpc('get_user_admin_id');
  if (adminErr || !adminId) {
    console.error('[uploadItemImage] get_user_admin_id failed:', adminErr);
    throw new Error('Unable to resolve account for upload. Please sign in again.');
  }

  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const fileName = `${itemId}_${timestamp}_${rand}.webp`;
  const filePath = `${adminId}/items/${fileName}`;

  // Retry up to 3 times on transient network/storage errors
  let lastError: any = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (uploadTokens.get(itemId) !== myToken) {
      throw new Error('Upload superseded by a newer file selection');
    }
    try {
      const { error } = await supabase.storage
        .from('item-images')
        .upload(filePath, uploadBlob, {
          cacheControl: '31536000, public', // Cache for a year since it's immutable (has timestamp + rand)
          upsert: true,
          contentType: 'image/webp',
        });

      if (!error) {
        const { data: { publicUrl } } = supabase.storage
          .from('item-images')
          .getPublicUrl(filePath);
        // Serve through CDN
        const cdnUrl = getCDNUrl(publicUrl);
        imageCache.set(itemId, cdnUrl);
        console.log(`[uploadItemImage] success on attempt ${attempt}:`, filePath);
        return cdnUrl;
      }
      lastError = error;
      const msg = (error as any)?.message || '';
      // Don't retry RLS/auth/permission errors — they won't fix themselves
      if (/row-level security|unauthorized|permission|forbidden|payload too large/i.test(msg)) {
        break;
      }
      console.warn(`[uploadItemImage] attempt ${attempt} failed, retrying:`, msg);
    } catch (e: any) {
      lastError = e;
      console.warn(`[uploadItemImage] attempt ${attempt} threw, retrying:`, e?.message || e);
    }
    await sleep(400 * attempt); // 400ms, 800ms backoff
  }

  const msg = (lastError as any)?.message || 'Unknown upload error';
  if (/row-level security|unauthorized|permission|forbidden/i.test(msg)) {
    throw new Error('Permission denied while uploading. Please sign in again or contact support.');
  }
  if (/payload too large|exceeded/i.test(msg)) {
    throw new Error('File is too large for upload. Try a smaller image (max 400KB).');
  }
  if (/network|fetch|timeout|failed to fetch/i.test(msg)) {
    throw new Error('Network error during upload. Check your connection and try again.');
  }
  throw new Error(`Upload failed after 3 attempts: ${msg}`);
};


/**
 * Returns the URL to load an image from.
 *
 * Priority:
 *  1. If VITE_CDN_URL is configured (e.g. Cloudflare/Bunny in front of Supabase),
 *     rewrite the host so the CDN handles caching + transforms.
 *  2. Otherwise return the RAW Supabase public URL. The `item-images` bucket is
 *     public with 1-year Cache-Control, so Supabase's edge cache serves it fast
 *     and reliably.
 *
 * We intentionally NO LONGER route through the free images.weserv.nl proxy by
 * default — it rate-limits Vercel edge IPs, causing broken images in production
 * while working fine on Lovable preview. It also doubled our egress
 * (Supabase → weserv → client). Direct Supabase = single hop, single egress.
 *
 * Callers should still pair this with `getFallbackImageUrl()` in an <img onError>
 * handler so a failed CDN URL degrades gracefully to the raw Supabase URL.
 */
export const getCDNUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  if (!url.includes('supabase.co/storage/v1/object/public/')) {
    return url;
  }

  const cdnUrl = import.meta.env.VITE_CDN_URL;
  if (cdnUrl && !cdnUrl.includes('weserv.nl')) {
    if (cdnUrl.includes('?url=')) {
      return `${cdnUrl}${encodeURIComponent(url)}&output=webp`;
    }
    return url.replace('https://ivleyttlqlqawghvfyjz.supabase.co', cdnUrl);
  }

  // Direct Supabase public URL — most reliable in production.
  return url;
};

/**
 * Given any CDN/proxy URL we produced, recover the underlying raw Supabase
 * public URL. Use this inside <img onError> to retry with the direct upstream
 * before hiding the tag.
 */
export const getFallbackImageUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  // weserv.nl style: https://images.weserv.nl/?url=<encoded>&...
  try {
    const u = new URL(url);
    const proxied = u.searchParams.get('url');
    if (proxied) return decodeURIComponent(proxied);
  } catch { /* not a URL – fall through */ }
  // Custom CDN host rewrite → put the Supabase host back
  const cdnUrl = import.meta.env.VITE_CDN_URL;
  if (cdnUrl && url.startsWith(cdnUrl.replace(/\/$/, ''))) {
    return url.replace(cdnUrl.replace(/\/$/, ''), 'https://ivleyttlqlqawghvfyjz.supabase.co');
  }
  return url;
};

/**
 * <img onError> handler: retry once with the raw Supabase URL, then hide.
 * Logs a warning in production so the failure is visible in the console.
 */
export const handleImageError = (
  e: React.SyntheticEvent<HTMLImageElement>,
  originalUrl?: string | null,
): void => {
  const el = e.currentTarget;
  const already = el.dataset.fallbackTried === '1';
  const fallback = getFallbackImageUrl(originalUrl || el.src);
  if (!already && fallback && fallback !== el.src) {
    console.warn('[image] primary URL failed, falling back to raw Supabase URL:', el.src);
    el.dataset.fallbackTried = '1';
    el.src = fallback;
    return;
  }
  console.warn('[image] fallback also failed, hiding:', el.src);
  el.style.display = 'none';
  el.nextElementSibling?.classList.remove('hidden');
};

export const getCachedImageUrl = (itemId: string): string | null => {
  const cached = imageCache.get(itemId) || null;
  return cached ? getCDNUrl(cached) : null;
};

export const cacheImageUrl = (itemId: string, url: string) => {
  imageCache.set(itemId, getCDNUrl(url));
};

export const deleteItemImage = async (imageUrl: string): Promise<void> => {
  try {
    // Extract file path from URL
    const urlParts = imageUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];
    const filePath = `items/${fileName}`;

    const { error } = await supabase.storage
      .from('item-images')
      .remove([filePath]);

    if (error) throw error;
  } catch (error) {
    console.error('Error deleting image:', error);
    throw error;
  }
};

/**
 * Compress GIF by extracting first frame and converting to static image
 * For true GIF compression, a backend solution would be needed.
 * This reduces file size significantly while maintaining visual quality.
 */
export const compressGifToImage = async (file: File, maxSizeKB: number = 400): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    img.onload = () => {
      // Calculate dimensions - scale down if needed
      const maxDimension = maxSizeKB <= 400 ? 800 : 1000;
      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = (height * maxDimension) / width;
          width = maxDimension;
        } else {
          width = (width * maxDimension) / height;
          height = maxDimension;
        }
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      // Compress iteratively
      let quality = 0.9;
      const compress = () => {
        canvas.toBlob((blob) => {
          if (blob && blob.size <= maxSizeKB * 1024) {
            resolve(blob);
          } else if (quality > 0.2) {
            quality -= 0.1;
            compress();
          } else {
            // Last resort: reduce dimensions further
            canvas.width = width * 0.7;
            canvas.height = height * 0.7;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((finalBlob) => {
              resolve(finalBlob || blob!);
            }, 'image/webp', 0.8);
          }
        }, 'image/webp', quality);
      };

      compress();
    };

    img.onerror = () => reject(new Error('Failed to load GIF for compression'));
    img.src = URL.createObjectURL(file);
  });
};

/**
 * Compress video by re-encoding at lower bitrate using canvas + MediaRecorder
 * This works entirely in the browser without external dependencies.
 */
export const compressVideo = async (
  file: File,
  maxSizeKB: number = 1024,
  onProgress?: (progress: number) => void
): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = async () => {
      const duration = video.duration;

      // If file is already under limit, return as-is
      if (file.size <= maxSizeKB * 1024) {
        resolve(file);
        return;
      }

      // Calculate scale factor to reduce file size
      const scaleFactor = Math.sqrt((maxSizeKB * 1024) / file.size);
      const targetWidth = Math.floor(video.videoWidth * Math.min(scaleFactor, 0.8));
      const targetHeight = Math.floor(video.videoHeight * Math.min(scaleFactor, 0.8));

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(targetWidth, 320);
      canvas.height = Math.max(targetHeight, 180);
      const ctx = canvas.getContext('2d')!;

      // Calculate target bitrate (aim for 80% of max size to be safe)
      const targetBitrate = Math.floor((maxSizeKB * 1024 * 8 * 0.8) / duration);

      const stream = canvas.captureStream(24); // 24 fps
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8',
        videoBitsPerSecond: Math.min(targetBitrate, 500000) // Cap at 500kbps
      });

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: 'video/webm' });
        resolve(blob);
      };

      mediaRecorder.onerror = (e) => reject(e);

      // Play and record
      video.currentTime = 0;
      mediaRecorder.start();

      const drawFrame = () => {
        if (video.ended || video.paused) {
          mediaRecorder.stop();
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (onProgress) {
          onProgress((video.currentTime / duration) * 100);
        }
        requestAnimationFrame(drawFrame);
      };

      video.play().then(() => {
        drawFrame();
      }).catch(reject);

      video.onended = () => {
        mediaRecorder.stop();
      };
    };

    video.onerror = () => reject(new Error('Failed to load video for compression'));
    video.src = URL.createObjectURL(file);
  });
};

/**
 * Simple GIF compression by reducing dimensions
 * Keeps it as GIF format but makes it smaller
 */
export const compressGifSimple = async (file: File, maxSizeKB: number = 400): Promise<File> => {
  // If already small enough, return as-is
  if (file.size <= maxSizeKB * 1024) {
    return file;
  }

  // For GIFs, we can't truly compress in browser without losing animation
  // Best option: Convert to static high-quality WebP
  const compressedBlob = await compressGifToImage(file, maxSizeKB);
  return new File([compressedBlob], file.name.replace('.gif', '.webp'), { type: 'image/webp' });
};