import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Play, Instagram, UploadCloud, Loader2, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { getCDNUrl } from '@/utils/urlUtils';
import imageCompression from 'browser-image-compression';

export const PromoWidgetManager = () => {
    const { profile } = useAuth();
    const { operatingBranchId } = useBranch();
    const adminId = profile?.role === 'admin' ? profile.id : profile?.admin_id;
    const branchId = operatingBranchId || profile?.id;

    const [reelUrl, setReelUrl] = useState('');
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (!adminId) return;
        const load = async () => {
            const { data } = await supabase
                .from('shop_settings')
                .select('promo_reel_url, promo_reel_image_url')
                .eq('user_id', adminId)
                .eq('branch_id', branchId ?? adminId)
                .maybeSingle();

            if (data) {
                setReelUrl(data.promo_reel_url || '');
                setImageUrl(data.promo_reel_image_url || null);
            }
            setLoading(false);
        };
        load();
    }, [adminId, branchId]);

    const handleSave = async (imgUrl: string | null = imageUrl) => {
        if (!adminId) return;
        setSaving(true);
        try {
            await supabase.from('shop_settings').update({
                promo_reel_url: reelUrl,
                promo_reel_image_url: imgUrl,
            }).eq('user_id', adminId).eq('branch_id', branchId ?? adminId);
            toast({ title: 'Saved successfully' });
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        setSaving(true);
        try {
            // Compress image locally before upload (shrink to ~100kb max)
            const options = {
                maxSizeMB: 0.1,
                maxWidthOrHeight: 1024,
                useWebWorker: true
            };
            const compressedFile = await imageCompression(file, options);
            
            const fileExt = file.name.split('.').pop();
            const fileName = promo_\_\_\.\;
            const filePath = promo_widgets/\;

            const { error: uploadError } = await supabase.storage
                .from('logos')
                .upload(filePath, compressedFile);

            if (uploadError) throw uploadError;

            const newImageUrl = filePath;
            setImageUrl(newImageUrl);
            await handleSave(newImageUrl);
        } catch (error: any) {
            toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
        } finally {
            setSaving(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleDelete = async () => {
        if (!adminId) return;
        setSaving(true);
        try {
            await supabase.from('shop_settings').update({
                promo_reel_image_url: null,
            }).eq('user_id', adminId).eq('branch_id', branchId ?? adminId);
            setImageUrl(null);
            toast({ title: 'Thumbnail deleted' });
        } catch (e: any) {
            toast({ title: 'Error', description: e.message, variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) return null;

    return (
        <Card className="border-indigo-100 dark:border-indigo-900/40 shadow-sm">
            <CardHeader className="p-4 sm:p-6 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20 rounded-t-xl">
                <CardTitle className="flex items-center space-x-2 text-indigo-900 dark:text-indigo-100">
                    <Instagram className="w-5 h-5 text-pink-500" />
                    <span className="text-base sm:text-lg">Instagram Promo Widget</span>
                </CardTitle>
                <CardDescription>
                    Add a floating bubble to your public menu. When customers click it, they'll be taken to your Instagram Reel!
                </CardDescription>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 space-y-6">
                <div className="space-y-3">
                    <Label>Instagram Reel Link</Label>
                    <div className="flex gap-2">
                        <Input 
                            placeholder="https://www.instagram.com/reel/..."
                            value={reelUrl}
                            onChange={(e) => setReelUrl(e.target.value)}
                        />
                        <Button onClick={() => handleSave()} disabled={saving} variant="secondary">Save</Button>
                    </div>
                </div>

                <div className="space-y-3">
                    <Label>Thumbnail Image (Will be shown in the corner)</Label>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept="image/*" 
                        className="hidden" 
                    />
                    
                    {imageUrl ? (
                        <div className="relative w-32 h-48 rounded-xl overflow-hidden border border-gray-200 group">
                            <img src={getCDNUrl(imageUrl)} alt="Promo" className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                                <Play className="w-8 h-8 text-white opacity-80" fill="white" />
                            </div>
                            <Button 
                                variant="destructive" 
                                size="icon" 
                                className="absolute top-2 right-2 w-8 h-8 opacity-0 group-hover:opacity-100 transition-opacity rounded-full shadow-lg"
                                onClick={handleDelete}
                                disabled={saving}
                            >
                                <Trash2 className="w-4 h-4" />
                            </Button>
                        </div>
                    ) : (
                        <div 
                            onClick={() => fileInputRef.current?.click()}
                            className="w-32 h-48 border-2 border-dashed border-gray-300 dark:border-zinc-700 rounded-xl flex flex-col items-center justify-center text-muted-foreground hover:bg-gray-50 dark:hover:bg-zinc-800/50 hover:border-indigo-300 transition-colors cursor-pointer"
                        >
                            {saving ? (
                                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                            ) : (
                                <>
                                    <UploadCloud className="w-8 h-8 mb-2 opacity-50" />
                                    <span className="text-xs text-center px-2">Upload Screenshot</span>
                                </>
                            )}
                        </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">Image is automatically shrunk to ~100kb for fast loading.</p>
                </div>
            </CardContent>
        </Card>
    );
};
