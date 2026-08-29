import { useEffect, useRef, useCallback } from 'react';

/**
 * Robust Wake Lock Hook for keeping screen always on
 * 
 * Supports:
 * - Chrome Android 84+
 * - Safari iOS 16.4+ (fixed in iOS 18.4 for installed PWAs)
 * - Firefox Android 126+
 * - Samsung Internet 14+
 * - Desktop Chrome 84+, Edge 84+, Firefox 126+
 * 
 * Fallbacks:
 * - Video-based keep-awake for older browsers
 * - Touch simulation for very aggressive screen keep on
 * - More frequent lock re-acquisition for mobile (every 10 seconds)
 */
export const useWakeLock = (enabled: boolean = true) => {
    const wakeLockRef = useRef<WakeLockSentinel | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const isActiveRef = useRef(enabled);
    const keepAliveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const touchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Update active ref when enabled prop changes
    useEffect(() => {
        isActiveRef.current = enabled;
        if (enabled) {
            requestWakeLock();
            if (isMobile()) {
                startTouchSimulation();
            }
        } else {
            releaseWakeLock();
        }
    }, [enabled]);

    // Detect if running on mobile
    const isMobile = useCallback(() => {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
            (navigator.maxTouchPoints && navigator.maxTouchPoints > 2);
    }, []);

    // Request wake lock using the Screen Wake Lock API
    const requestWakeLock = useCallback(async () => {
        if (!isActiveRef.current) return;

        // Check if Wake Lock API is supported
        if ('wakeLock' in navigator) {
            try {
                // Release any existing lock first
                if (wakeLockRef.current) {
                    try {
                        await wakeLockRef.current.release();
                    } catch (e) {
                        // Ignore release errors
                    }
                    wakeLockRef.current = null;
                }

                // Request a new wake lock
                wakeLockRef.current = await (navigator as any).wakeLock.request('screen');

                console.log('✅ Screen Wake Lock acquired');

                // Listen for release events (e.g., when tab loses focus)
                wakeLockRef.current.addEventListener('release', () => {
                    console.log('⚠️ Screen Wake Lock released automatically');
                    // Don't set to null here, we'll re-acquire on visibility change
                });

                return true;
            } catch (err: any) {
                console.warn(`Wake Lock request failed: ${err.name}, ${err.message}`);
                // Fall back to video-based keep-awake
                startVideoKeepAwake();
                return false;
            }
        } else {
            console.log('Wake Lock API not supported, using video fallback');
            startVideoKeepAwake();
            return false;
        }
    }, []);

    // Video-based fallback - Works on most mobile browsers
    const startVideoKeepAwake = useCallback(() => {
        if (videoRef.current) return; // Already running
        if (!isActiveRef.current) return;

        try {
            // Create a video element that loops silently
            const video = document.createElement('video');
            video.setAttribute('playsinline', 'true'); // Required for iOS
            video.setAttribute('webkit-playsinline', 'true'); // Older iOS
            video.setAttribute('muted', 'true');
            video.setAttribute('loop', 'true');
            video.setAttribute('autoplay', 'true');
            video.muted = true;
            video.playsInline = true;
            video.style.cssText = `
        position: fixed;
        top: -9999px;
        left: -9999px;
        width: 1px;
        height: 1px;
        opacity: 0.01;
        pointer-events: none;
        z-index: -9999;
      `;

            // Create a minimal video using canvas (more reliable than base64)
            const canvas = document.createElement('canvas');
            canvas.width = 1;
            canvas.height = 1;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = 'transparent';
                ctx.fillRect(0, 0, 1, 1);
            }

            // Try to use canvas capture stream if available
            if (canvas.captureStream) {
                try {
                    const stream = canvas.captureStream(1); // 1 FPS
                    video.srcObject = stream;
                } catch (e) {
                    // Fallback to inline data URL
                    video.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhtZGF0AAAA1m1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjU4Ljc2LjEwMA==';
                }
            } else {
                // Fallback for browsers without captureStream
                video.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAAAAhtZGF0AAAA1m1vb3YAAABsbXZoZAAAAAAAAAAAAAAAAAAAA+gAAAAAAAEAAAEAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAAAAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjU4Ljc2LjEwMA==';
            }

            document.body.appendChild(video);

            // Play with retries for mobile
            const playVideo = () => {
                video.play().catch((e) => {
                    console.log('Video autoplay blocked, waiting for user interaction');
                    // On mobile, autoplay might be blocked - we'll retry on user interaction
                    const retryPlay = () => {
                        if (isActiveRef.current) {
                            video.play().catch(() => { });
                        }
                        document.removeEventListener('touchstart', retryPlay);
                        document.removeEventListener('click', retryPlay);
                    };
                    document.addEventListener('touchstart', retryPlay, { once: true, passive: true });
                    document.addEventListener('click', retryPlay, { once: true });
                });
            };

            playVideo();
            videoRef.current = video;
            console.log('✅ Video-based keep-awake started');
        } catch (err) {
            console.warn('Failed to start video keep-awake:', err);
        }
    }, []);

    // Stop video-based keep-awake
    const stopVideoKeepAwake = useCallback(() => {
        if (videoRef.current) {
            videoRef.current.pause();
            if (videoRef.current.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream;
                stream.getTracks().forEach(track => track.stop());
            }
            videoRef.current.remove();
            videoRef.current = null;
            console.log('Video-based keep-awake stopped');
        }
    }, []);

    // Simulate minimal activity to prevent some aggressive power saving modes
    const startTouchSimulation = useCallback(() => {
        if (touchIntervalRef.current) return;
        if (!isActiveRef.current) return;

        touchIntervalRef.current = setInterval(() => {
            if (!isActiveRef.current || document.visibilityState !== 'visible') return;

            // Dispatch a minimal synthetic event to keep the browser active
            // NOTE: We avoid `new TouchEvent()` because on Android 10 / Chrome Mobile
            // the constructor crashes with "Cannot read properties of undefined
            // (reading 'clientX')" when given empty touch arrays.
            try {
                const event = new Event('zenpos-keepalive', {
                    bubbles: false,
                    cancelable: false,
                });
                document.dispatchEvent(event);
            } catch (e) {
                // Ignore — worst case the keep-alive just doesn't fire
            }
        }, 25000); // Every 25 seconds
    }, []);

    const stopTouchSimulation = useCallback(() => {
        if (touchIntervalRef.current) {
            clearInterval(touchIntervalRef.current);
            touchIntervalRef.current = null;
        }
    }, []);

    // Release wake lock
    const releaseWakeLock = useCallback(async () => {
        // We don't set isActiveRef to false here because we might want to toggle it back on via prop
        // But for the cleanup purpose we stop everything

        if (wakeLockRef.current) {
            try {
                await wakeLockRef.current.release();
                wakeLockRef.current = null;
                console.log('Screen Wake Lock released');
            } catch (err) {
                console.warn('Failed to release wake lock:', err);
            }
        }

        stopVideoKeepAwake();
        stopTouchSimulation();

        if (keepAliveIntervalRef.current) {
            clearInterval(keepAliveIntervalRef.current);
            keepAliveIntervalRef.current = null;
        }
    }, [stopVideoKeepAwake, stopTouchSimulation]);

    useEffect(() => {
        // Initial setup only if enabled
        if (enabled) {
            isActiveRef.current = true;
            requestWakeLock();

            if (isMobile()) {
                startTouchSimulation();
                console.log('📱 Mobile device detected - extra keep-awake protections enabled');
            }
        }

        // Re-acquire wake lock when page becomes visible again
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && isActiveRef.current) {
                console.log('Page visible, re-acquiring wake lock...');
                setTimeout(() => {
                    if (isActiveRef.current) {
                        requestWakeLock();
                    }
                }, 100);
            }
        };

        // Re-acquire on focus (additional safety)
        const handleFocus = () => {
            if (isActiveRef.current) {
                setTimeout(() => requestWakeLock(), 100);
            }
        };

        // Handle page show event (for back/forward cache)
        const handlePageShow = (event: PageTransitionEvent) => {
            if (event.persisted && isActiveRef.current) {
                requestWakeLock();
            }
        };

        // Handle fullscreen change - reacquire lock
        const handleFullscreenChange = () => {
            if (isActiveRef.current) {
                setTimeout(() => requestWakeLock(), 100);
            }
        };

        // Handle orientation change on mobile
        const handleOrientationChange = () => {
            if (isActiveRef.current) {
                setTimeout(() => requestWakeLock(), 300);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('pageshow', handlePageShow);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        window.addEventListener('orientationchange', handleOrientationChange);

        // More aggressive interval check
        const intervalTime = isMobile() ? 10000 : 30000;

        keepAliveIntervalRef.current = setInterval(() => {
            if (isActiveRef.current && document.visibilityState === 'visible') {
                if ('wakeLock' in navigator) {
                    if (!wakeLockRef.current) {
                        // console.log('Wake lock lost, re-acquiring...');
                        requestWakeLock();
                    }
                } else if (!videoRef.current) {
                    // console.log('Video keep-awake lost, restarting...');
                    startVideoKeepAwake();
                }
            }
        }, intervalTime);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('pageshow', handlePageShow);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            window.removeEventListener('orientationchange', handleOrientationChange);
            releaseWakeLock();
        };
    }, [enabled, requestWakeLock, releaseWakeLock, isMobile, startTouchSimulation, startVideoKeepAwake]);

    return {
        isSupported: 'wakeLock' in navigator,
        isActive: !!wakeLockRef.current || !!videoRef.current,
        isMobile: isMobile(),
        requestWakeLock,
        releaseWakeLock,
    };
};

export default useWakeLock;
