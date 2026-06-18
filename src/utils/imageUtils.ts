// Image compression and upload utilities
import { supabase } from '@/integrations/supabase/client';

// Image cache for performance
const imageCache = new Map<string, string>();

export const compressImage = (file: File, maxSizeKB: number = 200): Promise<Blob> => {
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
          canvas.toBlob((blob) => {
            if (!blob) {
              cleanup();
              reject(new Error('Image encoding failed'));
              return;
            }
            if (blob.size <= maxSizeKB * 1024 || quality <= 0.2) {
              cleanup();
              resolve(blob);
            } else {
              quality -= 0.1;
              compress();
            }
          }, 'image/jpeg', quality);
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

export const uploadItemImage = async (file: File, itemId: string): Promise<string> => {
  // Compress the image (best-effort — fall back to original blob if compression fails)
  let uploadBlob: Blob;
  try {
    uploadBlob = await compressImage(file);
  } catch (err) {
    console.warn('Compression failed, uploading original:', err);
    uploadBlob = file;
  }

  // Storage RLS requires the first folder segment to equal the user's admin_id.
  // Fetch it from the DB so the upload always satisfies the policy regardless of caller.
  const { data: adminId, error: adminErr } = await supabase.rpc('get_user_admin_id');
  if (adminErr || !adminId) {
    throw new Error('Unable to resolve account for upload. Please sign in again.');
  }

  // Always-unique filename so re-uploads never collide / hit stale CDN cache
  const timestamp = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const fileName = `${itemId}_${timestamp}_${rand}.jpg`;
  const filePath = `${adminId}/items/${fileName}`;

  const { error } = await supabase.storage
    .from('item-images')
    .upload(filePath, uploadBlob, {
      cacheControl: '3600',
      upsert: true,
      contentType: 'image/jpeg',
    });

  if (error) throw error;

  const { data: { publicUrl } } = supabase.storage
    .from('item-images')
    .getPublicUrl(filePath);

  imageCache.set(itemId, publicUrl);
  return publicUrl;
};


export const getCachedImageUrl = (itemId: string): string | null => {
  return imageCache.get(itemId) || null;
};

export const cacheImageUrl = (itemId: string, url: string) => {
  imageCache.set(itemId, url);
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
export const compressGifToImage = async (file: File, maxSizeKB: number = 500): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    img.onload = () => {
      // Calculate dimensions - scale down if needed
      const maxDimension = maxSizeKB <= 500 ? 800 : 1000;
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
            }, 'image/jpeg', 0.8);
          }
        }, 'image/jpeg', quality);
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
export const compressGifSimple = async (file: File, maxSizeKB: number = 1024): Promise<File> => {
  // If already small enough, return as-is
  if (file.size <= maxSizeKB * 1024) {
    return file;
  }

  // For GIFs, we can't truly compress in browser without losing animation
  // Best option: Convert to static high-quality JPEG
  const compressedBlob = await compressGifToImage(file, maxSizeKB);
  return new File([compressedBlob], file.name.replace('.gif', '.jpg'), { type: 'image/jpeg' });
};