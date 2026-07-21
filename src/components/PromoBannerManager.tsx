import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Plus, Trash2, GripVertical, Image, Loader2, Calendar, X, Type, Palette } from 'lucide-react';
import { compressImage, compressGifToImage, getCDNUrl } from '@/utils/imageUtils';

interface Banner {
    id: string;
    title: string;
    description?: string;
    image_url: string;
    link_url?: string;
    is_active: boolean;
    display_order: number;
    start_date?: string;
    end_date?: string;
    // Text-only banner fields
    is_text_only?: boolean;
    text_color?: string;
    bg_color?: string;
}

export const PromoBannerManager = () => {
    const { profile , adminProfileId } = useAuth();
    const { operatingBranchId, isAllBranchesView } = useBranch();
    const [banners, setBanners] = useState<Banner[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [editingBanner, setEditingBanner] = useState<Banner | null>(null);
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Drag and drop refs
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    const [formData, setFormData] = useState({
        title: '',
        description: '',
        image_url: '',
        link_url: '',
        is_active: true,
        start_date: '',
        end_date: '',
        is_text_only: false,
        text_color: '#ffffff',
        bg_color: '#22c55e'
    });

    const adminId = adminProfileId;

    useEffect(() => {
        fetchBanners();
    }, [adminId, operatingBranchId]);

    const fetchBanners = async () => {
        if (!adminId) return;
        try {
            let q: any = supabase.from('promo_banners').select('*').eq('admin_id', adminId);
            if (operatingBranchId) q = q.eq('branch_id', operatingBranchId);
            const { data, error } = await q.order('display_order');
            if (error) throw error;
            setBanners(data || []);
        } catch (error) {
            console.error('Error fetching banners:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            toast({
                title: "Invalid file type",
                description: "Please select an image file",
                variant: "destructive"
            });
            return;
        }

        try {
            setSaving(true);
            const isGif = file.type === 'image/gif';
            let uploadBlob: Blob = file;
            let fileExt = 'webp';

            // Always compress/convert images to WebP format for maximum egress savings
            toast({
                title: "Optimizing Image...",
                description: `Processing banner for high-speed loading`,
            });

            if (isGif) {
                // Convert GIF to compressed JPEG
                uploadBlob = await compressGifToImage(file, 300);
                fileExt = 'jpg';
            } else {
                // Compress and convert to WebP format
                uploadBlob = await compressImage(file, 200); // 200KB is plenty for high quality banners
                fileExt = 'webp';
            }

            toast({
                title: "Image Optimized",
                description: `Reduced size to ${(uploadBlob.size / 1024).toFixed(0)}KB`,
            });

            const fileName = `${adminId}/banner-${Date.now()}.${fileExt}`;

            const { error } = await supabase.storage
                .from('promo-banners')
                .upload(fileName, uploadBlob, { 
                    cacheControl: '31536000, public', // Cache for a year since it's immutable (contains timestamp)
                    upsert: true,
                    contentType: fileExt === 'webp' ? 'image/webp' : 'image/jpeg'
                });

            if (error) throw error;

            const { data: publicData } = supabase.storage
                .from('promo-banners')
                .getPublicUrl(fileName);

            // Apply CDN rewriting to the returned URL
            const finalUrl = getCDNUrl(publicData.publicUrl);

            setFormData(prev => ({ ...prev, image_url: finalUrl }));
            toast({ title: "Image uploaded" });
        } catch (error) {
            console.error('Upload error:', error);
            toast({
                title: "Upload failed",
                description: "Failed to upload image. Ensure storage bucket exists.",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleSave = async () => {
        // Text-only banners don't require image
        if (!formData.title || (!formData.is_text_only && !formData.image_url)) {
            toast({
                title: "Error",
                description: formData.is_text_only ? "Title is required" : "Title and image are required",
                variant: "destructive"
            });
            return;
        }

        setSaving(true);
        try {
            const bannerData = {
                title: formData.title,
                description: formData.description || null,
                image_url: formData.is_text_only ? '' : formData.image_url,
                link_url: formData.link_url || null,
                is_active: formData.is_active,
                start_date: formData.start_date || null,
                end_date: formData.end_date || null,
                is_text_only: formData.is_text_only,
                text_color: formData.text_color,
                bg_color: formData.bg_color
            };

            if (editingBanner) {
                // Update existing banner
                const { error } = await supabase
                    .from('promo_banners')
                    .update(bannerData)
                    .eq('id', editingBanner.id);

                if (error) throw error;
                toast({ title: "Banner updated" });
            } else {
                // Create new banner
                const { error } = await supabase
                    .from('promo_banners')
                    .insert({
                        admin_id: adminId,
                        branch_id: operatingBranchId,
                        ...bannerData,
                        display_order: banners.length
                    });

                if (error) throw error;
                toast({ title: "Banner created" });
            }

            setShowAddDialog(false);
            setEditingBanner(null);
            resetForm();
            fetchBanners();
        } catch (error) {
            console.error('Save error:', error);
            toast({
                title: "Error",
                description: "Failed to save banner",
                variant: "destructive"
            });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (bannerId: string) => {
        if (!confirm('Are you sure you want to delete this banner?')) return;

        try {
            const { error } = await supabase
                .from('promo_banners')
                .delete()
                .eq('id', bannerId);

            if (error) throw error;
            toast({ title: "Banner deleted" });
            fetchBanners();
        } catch (error) {
            console.error('Delete error:', error);
            toast({
                title: "Error",
                description: "Failed to delete banner",
                variant: "destructive"
            });
        }
    };

    const handleToggleActive = async (banner: Banner) => {
        try {
            const { error } = await supabase
                .from('promo_banners')
                .update({ is_active: !banner.is_active })
                .eq('id', banner.id);

            if (error) throw error;
            fetchBanners();
        } catch (error) {
            console.error('Toggle error:', error);
        }
    };

    // Drag and drop handlers for reordering
    const handleDragStart = (index: number) => {
        dragItem.current = index;
    };

    const handleDragEnter = (index: number) => {
        dragOverItem.current = index;
    };

    const handleDragEnd = async () => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        if (dragItem.current === dragOverItem.current) {
            dragItem.current = null;
            dragOverItem.current = null;
            return;
        }

        // Reorder banners locally
        const reorderedBanners = [...banners];
        const draggedBanner = reorderedBanners[dragItem.current];
        reorderedBanners.splice(dragItem.current, 1);
        reorderedBanners.splice(dragOverItem.current, 0, draggedBanner);

        // Update local state immediately for responsiveness
        setBanners(reorderedBanners);

        // Save new order to database
        try {
            const updates = reorderedBanners.map((banner, idx) => ({
                id: banner.id,
                display_order: idx
            }));

            for (const update of updates) {
                await supabase
                    .from('promo_banners')
                    .update({ display_order: update.display_order })
                    .eq('id', update.id);
            }

            toast({ title: "Banner order updated" });
        } catch (error) {
            console.error('Error saving banner order:', error);
            fetchBanners(); // Revert on error
        }

        dragItem.current = null;
        dragOverItem.current = null;
    };

    const openEditDialog = (banner: Banner) => {
        setEditingBanner(banner);
        setFormData({
            title: banner.title,
            description: banner.description || '',
            image_url: banner.image_url,
            link_url: banner.link_url || '',
            is_active: banner.is_active,
            start_date: banner.start_date?.split('T')[0] || '',
            end_date: banner.end_date?.split('T')[0] || '',
            is_text_only: banner.is_text_only || false,
            text_color: banner.text_color || '#ffffff',
            bg_color: banner.bg_color || '#22c55e'
        });
        setShowAddDialog(true);
    };

    const resetForm = () => {
        setFormData({
            title: '',
            description: '',
            image_url: '',
            link_url: '',
            is_active: true,
            start_date: '',
            end_date: '',
            is_text_only: false,
            text_color: '#ffffff',
            bg_color: '#22c55e'
        });
    };

    const openAddDialog = () => {
        setEditingBanner(null);
        resetForm();
        setShowAddDialog(true);
    };

    if (loading) {
        return (
            <Card>
                <CardContent className="py-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </CardContent>
            </Card>
        );
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Image className="w-5 h-5" />
                                Promotional Banners
                            </CardTitle>
                            <CardDescription>
                                Create auto-swipe banners for special offers on your public menu
                            </CardDescription>
                        </div>
                        <Button size="sm" onClick={openAddDialog} disabled={isAllBranchesView}>
                            <Plus className="w-4 h-4 mr-1" />
                            Add Banner
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {banners.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Image className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p className="text-sm">No banners yet. Create your first promotional banner!</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {banners.map((banner, index) => (
                                <div
                                    key={banner.id}
                                    className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                                    draggable
                                    onDragStart={() => handleDragStart(index)}
                                    onDragEnter={() => handleDragEnter(index)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(e) => e.preventDefault()}
                                >
                                    <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab active:cursor-grabbing" />
                                    {/* Banner preview - show image or solid color for text-only */}
                                    {banner.is_text_only ? (
                                        <div
                                            className="w-20 h-12 rounded flex items-center justify-center"
                                            style={{ backgroundColor: banner.bg_color || '#22c55e' }}
                                        >
                                            <span className="text-xs font-medium truncate px-1" style={{ color: banner.text_color || '#ffffff' }}>
                                                Text
                                            </span>
                                        </div>
                                    ) : (
                                        <img
                                            src={banner.image_url}
                                            alt={banner.title}
                                            className="w-20 h-12 object-cover rounded"
                                        />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <p className="font-medium text-sm truncate">{banner.title}</p>
                                        {banner.description && (
                                            <p className="text-xs text-muted-foreground truncate">{banner.description}</p>
                                        )}
                                        {(banner.start_date || banner.end_date) && (
                                            <p className="text-xs text-orange-600 flex items-center gap-1 mt-0.5">
                                                <Calendar className="w-3 h-3" />
                                                {banner.start_date?.split('T')[0]} - {banner.end_date?.split('T')[0] || 'No end'}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Switch
                                            checked={banner.is_active}
                                            onCheckedChange={() => handleToggleActive(banner)}
                                            disabled={isAllBranchesView}
                                        />
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => openEditDialog(banner)}
                                            disabled={isAllBranchesView}
                                        >
                                            Edit
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="text-red-500 hover:text-red-700"
                                            onClick={() => handleDelete(banner.id)}
                                            disabled={isAllBranchesView}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Add/Edit Banner Dialog */}
            <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{editingBanner ? 'Edit Banner' : 'Add New Banner'}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div>
                            <Label>Title *</Label>
                            <Input
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                placeholder="Today's Special: 20% Off!"
                            />
                        </div>

                        <div>
                            <Label>Description (optional)</Label>
                            <Input
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                placeholder="Limited time offer on all biryanis"
                            />
                        </div>

                        {/* Text-Only Banner Toggle */}
                        <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Type className="w-4 h-4 text-muted-foreground" />
                                    <Label className="text-sm font-medium">Text-Only Banner</Label>
                                </div>
                                <Switch
                                    checked={formData.is_text_only}
                                    onCheckedChange={(v) => setFormData({ ...formData, is_text_only: v })}
                                />
                            </div>
                            <p className="text-xs text-muted-foreground">
                                Create a simple text banner without an image
                            </p>

                            {formData.is_text_only && (
                                <div className="flex gap-4 pt-2">
                                    <div className="flex-1">
                                        <Label className="text-xs">Background Color</Label>
                                        <div className="flex gap-2 mt-1">
                                            <input
                                                type="color"
                                                value={formData.bg_color}
                                                onChange={(e) => setFormData({ ...formData, bg_color: e.target.value })}
                                                className="w-10 h-8 rounded cursor-pointer"
                                            />
                                            <Input
                                                value={formData.bg_color}
                                                onChange={(e) => setFormData({ ...formData, bg_color: e.target.value })}
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <Label className="text-xs">Text Color</Label>
                                        <div className="flex gap-2 mt-1">
                                            <input
                                                type="color"
                                                value={formData.text_color}
                                                onChange={(e) => setFormData({ ...formData, text_color: e.target.value })}
                                                className="w-10 h-8 rounded cursor-pointer"
                                            />
                                            <Input
                                                value={formData.text_color}
                                                onChange={(e) => setFormData({ ...formData, text_color: e.target.value })}
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Image Upload - Only show if not text-only */}
                        {!formData.is_text_only && (
                            <div>
                                <Label>Banner Image/GIF *</Label>
                                <p className="text-xs text-muted-foreground mb-2">
                                    Upload an image or animated GIF (max 500KB). GIFs will auto-animate on the menu!
                                </p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*,.gif"
                                    onChange={handleImageUpload}
                                    className="hidden"
                                />
                                {formData.image_url ? (
                                    <div className="relative">
                                        <img
                                            src={formData.image_url}
                                            alt="Banner preview"
                                            className="w-full h-32 object-cover rounded-lg border"
                                        />
                                        <Button
                                            type="button"
                                            variant="destructive"
                                            size="sm"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setFormData({ ...formData, image_url: '' });
                                            }}
                                            className="absolute top-2 right-2 h-6 w-6 p-0"
                                        >
                                            <X className="h-3 w-3" />
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => fileInputRef.current?.click()}
                                        disabled={saving}
                                        className="w-full h-24 border-2 border-dashed"
                                    >
                                        {saving ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <div className="text-center">
                                                <Image className="w-6 h-6 mx-auto mb-1" />
                                                <span className="text-xs">Upload Image or GIF (max 500KB)</span>
                                            </div>
                                        )}
                                    </Button>
                                )}
                            </div>
                        )}

                        <div>
                            <Label>Link URL (optional)</Label>
                            <Input
                                value={formData.link_url}
                                onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
                                placeholder="https://..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Start Date</Label>
                                <Input
                                    type="date"
                                    value={formData.start_date}
                                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                                />
                            </div>
                            <div>
                                <Label>End Date</Label>
                                <Input
                                    type="date"
                                    value={formData.end_date}
                                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between">
                            <Label>Active</Label>
                            <Switch
                                checked={formData.is_active}
                                onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSave} disabled={saving}>
                            {saving ? 'Saving...' : editingBanner ? 'Update' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
