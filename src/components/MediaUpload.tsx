import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { X, Upload, Image as ImageIcon, Film, Loader2, Camera, AlertCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { uploadItemImage, compressGifToImage, compressVideo } from '@/utils/imageUtils';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface MediaUploadProps {
    imageUrl?: string;
    videoUrl?: string;
    mediaType: 'image' | 'gif' | 'video';
    onImageChange: (url: string) => void;
    onVideoChange: (url: string) => void;
    onMediaTypeChange: (type: 'image' | 'gif' | 'video') => void;
    itemId?: string;
    hasPremiumAccess: boolean;
}

export const MediaUpload: React.FC<MediaUploadProps> = ({
    imageUrl,
    videoUrl,
    mediaType,
    onImageChange,
    onVideoChange,
    onMediaTypeChange,
    itemId,
    hasPremiumAccess
}) => {
    const [isUploading, setIsUploading] = useState(false);
    const [showPermissionDialog, setShowPermissionDialog] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const videoInputRef = useRef<HTMLInputElement>(null);
    const { toast } = useToast();
    const { profile } = useAuth();

    const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;

    // Request camera permission and handle denial
    const handleCameraClick = async () => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        const isAndroid = /Android/.test(navigator.userAgent);

        try {
            // Pre-check permission status using Permissions API (if available)
            // Note: camera permission query may not work on all browsers
            try {
                if (navigator.permissions && !isIOS) {
                    const permissionStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });

                    if (permissionStatus.state === 'denied') {
                        // Permission is blocked at browser/OS level
                        setShowPermissionDialog(true);
                        return;
                    }
                }
            } catch (permError) {
                // Permissions API not supported for camera - continue with getUserMedia
                console.log('Camera permissions query not supported, trying getUserMedia directly');
            }

            // Try to get camera access to trigger browser permission prompt
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                // Permission granted - stop the stream and trigger file input
                stream.getTracks().forEach(track => track.stop());
                cameraInputRef.current?.click();
            } catch (err: any) {
                if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError' || err.name === 'SecurityError') {
                    // Permission denied
                    setShowPermissionDialog(true);
                } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
                    // No camera found - try to open file input directly
                    toast({
                        title: "No Camera Found",
                        description: "No camera detected. Please use file upload instead.",
                        variant: "destructive"
                    });
                } else {
                    // Other error - try to open camera input directly as fallback
                    cameraInputRef.current?.click();
                }
            }
        } catch (err) {
            // Fallback: just try to open camera directly (older browsers)
            cameraInputRef.current?.click();
        }
    };

    // Re-request camera permission
    const handleRequestPermission = async () => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        setShowPermissionDialog(false);

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            stream.getTracks().forEach(track => track.stop());
            toast({
                title: "Camera Enabled",
                description: "You can now capture photos",
            });
            // Now trigger camera input
            cameraInputRef.current?.click();
        } catch (err) {
            const errorMessage = isIOS
                ? "Go to Settings > Safari > Camera and enable access"
                : "Please enable camera access in your browser or device settings";
            toast({
                title: "Camera Access Denied",
                description: errorMessage,
                variant: "destructive"
            });
        }
    };

    const clearInputs = () => {
        if (fileInputRef.current) fileInputRef.current.value = '';
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        if (videoInputRef.current) videoInputRef.current.value = '';
    };

    const handleImageSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/') || file.type === 'image/gif') {
            toast({
                title: "Invalid file type",
                description: "Please select an image file (JPG, PNG, WEBP)",
                variant: "destructive"
            });
            clearInputs();
            return;
        }

        // Validate file size (max 2MB for images per spec)
        if (file.size > 2 * 1024 * 1024) {
            toast({
                title: "File too large",
                description: `Image is ${(file.size / 1024 / 1024).toFixed(1)}MB. Max allowed is 2MB.`,
                variant: "destructive"
            });
            clearInputs();
            return;
        }

        try {
            setIsUploading(true);
            const url = await uploadItemImage(file, itemId || Date.now().toString());
            // Order matters: switch type first, then clear the other URL, then set the new one
            onMediaTypeChange('image');
            onVideoChange('');
            onImageChange(url);
            toast({
                title: "Image uploaded",
                description: "Image has been compressed and uploaded"
            });
        } catch (error: any) {
            console.error('Upload error:', error);
            toast({
                title: "Upload failed",
                description: error?.message || "Failed to upload image. Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsUploading(false);
            clearInputs();
        }
    };

    const handleVideoSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Check if it's GIF or video
        const isGif = file.type === 'image/gif';
        const isVideo = file.type.startsWith('video/');

        if (!isGif && !isVideo) {
            toast({
                title: "Invalid file type",
                description: "Please select a GIF or video file (MP4, WebM)",
                variant: "destructive"
            });
            clearInputs();
            return;
        }

        // Validate file size (max 5MB for GIF/video per spec)
        if (file.size > 5 * 1024 * 1024) {
            toast({
                title: "File too large",
                description: `${isGif ? 'GIF' : 'Video'} is ${(file.size / 1024 / 1024).toFixed(1)}MB. Max allowed is 5MB.`,
                variant: "destructive"
            });
            clearInputs();
            return;
        }

        try {
            setIsUploading(true);

            let uploadBlob: Blob = file;
            let finalType = file.type;
            const targetSizeKB = 1024; // try to keep CDN payload under 1MB for fast playback

            // Best-effort compression for files over 1MB
            if (file.size > targetSizeKB * 1024) {
                try {
                    if (isGif) {
                        uploadBlob = await compressGifToImage(file, targetSizeKB);
                        finalType = 'image/jpeg';
                        toast({
                            title: "GIF compressed",
                            description: `Converted to image: ${(uploadBlob.size / 1024).toFixed(0)}KB`,
                        });
                    } else {
                        uploadBlob = await compressVideo(file, targetSizeKB);
                        finalType = 'video/webm';
                        toast({
                            title: "Video compressed",
                            description: `Reduced to ${(uploadBlob.size / 1024).toFixed(0)}KB`,
                        });
                    }
                } catch (compressionError) {
                    console.warn('Compression failed, uploading original:', compressionError);
                    uploadBlob = file;
                    finalType = file.type;
                }
            }

            const compressedGif = isGif && uploadBlob.type === 'image/jpeg';
            const fileExt = compressedGif ? 'jpg'
                : isGif ? 'gif'
                : (isVideo && uploadBlob.type === 'video/webm') ? 'webm'
                : (file.name.split('.').pop() || 'mp4');

            // Always-unique filename so re-uploads cannot collide / hit stale CDN cache
            const rand = Math.random().toString(36).slice(2, 8);
            const fileName = `${adminId}/${itemId || Date.now()}_${Date.now()}_${rand}.${fileExt}`;

            const { error: uploadError } = await supabase.storage
                .from('item-images')
                .upload(fileName, uploadBlob, { upsert: true, contentType: finalType });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabase.storage
                .from('item-images')
                .getPublicUrl(fileName);

            const mediaType = compressedGif ? 'image' : (isGif ? 'gif' : 'video');

            // Order matters: switch type first, clear the other URL, then set the new one
            onMediaTypeChange(mediaType as 'image' | 'gif' | 'video');
            if (mediaType === 'image') {
                onVideoChange('');
                onImageChange(publicUrl);
            } else {
                onImageChange('');
                onVideoChange(publicUrl);
            }

            toast({
                title: isGif ? "GIF uploaded" : "Video uploaded",
                description: `${isGif ? 'GIF' : 'Video'} has been uploaded successfully`
            });
        } catch (error: any) {
            console.error('Upload error:', error);
            toast({
                title: "Upload failed",
                description: error?.message || "Failed to upload media. Please try again.",
                variant: "destructive"
            });
        } finally {
            setIsUploading(false);
            clearInputs();
        }
    };

    const handleRemove = () => {
        onImageChange('');
        onVideoChange('');
        onMediaTypeChange('image');
        clearInputs();
    };


    // Check which URL is present - image_url for images, video_url for gif/video
    const currentUrl = videoUrl || imageUrl;

    return (
        <div className="space-y-3">
            {/* Hidden file inputs */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
            />
            <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageSelect}
                className="hidden"
            />
            <input
                ref={videoInputRef}
                type="file"
                accept=".gif,video/mp4,video/webm"
                onChange={handleVideoSelect}
                className="hidden"
            />

            {/* Permission Dialog */}
            <AlertDialog open={showPermissionDialog} onOpenChange={setShowPermissionDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <Camera className="w-5 h-5" />
                            Camera Access Required
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2">
                                <p>Camera access was denied. To capture photos, please grant camera permission.</p>
                                <div className="bg-muted/50 p-3 rounded-lg text-sm space-y-1">
                                    <p className="font-medium">How to enable:</p>
                                    <p className="text-muted-foreground">
                                        <strong>iPhone/iPad:</strong> Settings → Safari → Camera → Allow
                                    </p>
                                    <p className="text-muted-foreground">
                                        <strong>Android:</strong> Tap the lock icon in browser address bar → Permissions → Camera → Allow
                                    </p>
                                </div>
                                <p className="text-sm">Click "Enable Camera" to try again.</p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRequestPermission}>
                            Enable Camera
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {currentUrl ? (
                <div className="relative">
                    {mediaType === 'video' ? (
                        <video
                            src={currentUrl}
                            className="w-full h-32 object-cover rounded-lg border"
                            autoPlay
                            loop
                            muted
                            playsInline
                        />
                    ) : mediaType === 'gif' ? (
                        <img
                            src={currentUrl}
                            alt="Item GIF"
                            className="w-full h-32 object-cover rounded-lg border"
                        />
                    ) : (
                        <img
                            src={currentUrl}
                            alt="Item"
                            className="w-full h-32 object-cover rounded-lg border"
                        />
                    )}
                    <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleRemove();
                        }}
                        className="absolute top-2 right-2 h-6 w-6 p-0"
                    >
                        <X className="h-3 w-3" />
                    </Button>
                    <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                        {mediaType.toUpperCase()}
                    </div>
                    {/* Replace buttons — swap media without removing first */}
                    <div className="absolute bottom-2 right-2 flex gap-1">
                        <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={isUploading}
                            onClick={(e) => { e.preventDefault(); e.stopPropagation(); fileInputRef.current?.click(); }}
                            className="h-7 px-2 text-[11px]"
                            title="Replace with image"
                        >
                            {isUploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageIcon className="h-3 w-3 mr-1" />}
                            Image
                        </Button>
                        {hasPremiumAccess && (
                            <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                disabled={isUploading}
                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); videoInputRef.current?.click(); }}
                                className="h-7 px-2 text-[11px]"
                                title="Replace with GIF/video"
                            >
                                <Film className="h-3 w-3 mr-1" />
                                GIF/Video
                            </Button>
                        )}
                    </div>
                </div>

            ) : (
                <div className="space-y-2">
                    {/* Image Options Row */}
                    <div className="flex gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={isUploading}
                            className="flex-1 h-16 border-2 border-dashed"
                        >
                            <div className="flex flex-col items-center space-y-1">
                                {isUploading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <ImageIcon className="h-4 w-4" />
                                )}
                                <span className="text-xs">Gallery</span>
                            </div>
                        </Button>

                        <Button
                            type="button"
                            variant="outline"
                            onClick={handleCameraClick}
                            disabled={isUploading}
                            className="flex-1 h-16 border-2 border-dashed border-blue-300 bg-blue-50/50"
                        >
                            <div className="flex flex-col items-center space-y-1">
                                {isUploading ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <Camera className="h-4 w-4 text-blue-600" />
                                )}
                                <span className="text-xs text-blue-600">Camera</span>
                            </div>
                        </Button>

                        {hasPremiumAccess && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => videoInputRef.current?.click()}
                                disabled={isUploading}
                                className="flex-1 h-16 border-2 border-dashed border-purple-300 bg-purple-50/50"
                            >
                                <div className="flex flex-col items-center space-y-1">
                                    {isUploading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Film className="h-4 w-4 text-purple-600" />
                                    )}
                                    <span className="text-xs text-purple-600">GIF/Video</span>
                                </div>
                            </Button>
                        )}
                    </div>
                </div>
            )}

            <p className="text-xs text-muted-foreground text-center">
                Image: Max 5MB (compressed) |
                {hasPremiumAccess && <span className="text-purple-600"> GIF/Video: Max 1MB</span>}
            </p>
        </div>
    );
};
