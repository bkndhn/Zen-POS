import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Camera, ImagePlus, UploadCloud, ChevronRight, ChevronLeft, Sparkles, AlertCircle, CheckCircle2, Trash2, Edit2, Loader2, Save } from 'lucide-react';
import { useDropzone } from 'react-dropzone';

interface ParsedItem {
  id: number;
  name: string;
  price: number;
  category: string;
  description: string | null;
  selling_unit: string;
  selling_quantity: number;
  is_veg: boolean | null;
  error?: string;
  matched_image_url?: string;
}

interface Photo {
  id: string;
  file: File;
  preview: string;
}

interface Match {
  photoId: string;
  itemId: number | null;
  confidence: number;
}

const UNITS = ['Piece (pc)', 'Plate', 'Cup', 'Glass', 'Pack', 'Box', 'Kilogram (kg)', 'Gram (g)', 'Liter (l)', 'Milliliter (ml)'];

export default function AiMenuBuilder() {
  const { session, profile } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  // Step 1: Menu Upload
  const [menuImages, setMenuImages] = useState<{ url: string, name: string }[]>([]);
  
  // Step 2: Extracted Items
  const [items, setItems] = useState<ParsedItem[]>([]);
  
  // Step 3: Food Photos
  const [photos, setPhotos] = useState<Photo[]>([]);
  
  // Step 4: Matches
  const [matches, setMatches] = useState<Match[]>([]);

  // Helpers
  const fileToDataUrl = (f: File): Promise<string> => new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(f);
  });

  // --- Step 1 Handlers ---
  const handleMenuUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const arr = Array.from(e.target.files).slice(0, 3);
    const next = [...menuImages];
    for (const f of arr) {
      if (!f.type.startsWith('image/')) continue;
      const url = await fileToDataUrl(f);
      next.push({ url, name: f.name });
    }
    setMenuImages(next.slice(0, 5));
  };

  const extractMenu = async () => {
    if (!menuImages.length) {
      toast({ title: 'Please upload a menu image first', variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-menu-parse', {
        body: { images: menuImages.map(m => m.url) }
      });
      if (error) throw error;
      if (data?.items) {
        setItems(data.items.map((it: any, idx: number) => ({ ...it, id: idx + 1 })));
        setStep(2);
      }
    } catch (err: any) {
      toast({ title: 'Extraction Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // --- Step 2 Handlers ---
  const updateItem = (id: number, field: keyof ParsedItem, val: any) => {
    setItems(items.map(it => it.id === id ? { ...it, [field]: val } : it));
  };
  const removeItem = (id: number) => setItems(items.filter(i => i.id !== id));

  // --- Step 3 Handlers ---
  const onDropPhotos = useCallback((acceptedFiles: File[]) => {
    const newPhotos: Photo[] = [];
    acceptedFiles.forEach(file => {
      // Basic quality check (e.g. > 10KB, < 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast({ title: 'File too large', description: `${file.name} is over 10MB.`, variant: 'destructive' });
        return;
      }
      // Duplicate detection by name+size
      if (photos.some(p => p.file.name === file.name && p.file.size === file.size)) return;
      
      newPhotos.push({
        id: Math.random().toString(36).substr(2, 9),
        file,
        preview: URL.createObjectURL(file)
      });
    });
    setPhotos(prev => [...prev, ...newPhotos]);
  }, [photos]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: onDropPhotos,
    accept: { 'image/*': [] },
    multiple: true
  });

  const removePhoto = (id: string) => {
    const photo = photos.find(p => p.id === id);
    if (photo) URL.revokeObjectURL(photo.preview);
    setPhotos(photos.filter(p => p.id !== id));
  };

  const matchImages = async () => {
    if (!photos.length) {
      setStep(4);
      return;
    }
    setLoading(true);
    try {
      const b64Images = await Promise.all(photos.map(async p => ({
        id: p.id,
        url: await fileToDataUrl(p.file)
      })));

      const menuNames = items.map(i => i.name);

      const { data, error } = await supabase.functions.invoke('ai-image-match', {
        body: { images: b64Images, menuItems: menuNames }
      });
      if (error) throw error;

      if (data?.matches) {
        const newMatches: Match[] = data.matches.map((m: any) => {
          const matchedItem = items.find(i => i.name.toLowerCase() === m.matched_item?.toLowerCase());
          return {
            photoId: m.image_id,
            itemId: matchedItem ? matchedItem.id : null,
            confidence: m.confidence_score || 0
          };
        });
        setMatches(newMatches);
      }
      setStep(4);
    } catch (err: any) {
      toast({ title: 'Matching Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // --- Step 4 Handlers ---
  const handleOverrideMatch = (photoId: string, itemId: number | null) => {
    setMatches(matches.map(m => m.photoId === photoId ? { ...m, itemId, confidence: 100 } : m));
  };

  const publishItems = async () => {
    if (!profile?.admin_id) return;
    setLoading(true);
    try {
      const branchId = localStorage.getItem('zenpos_branch_id') || profile.admin_id; // fallback if no branch selected

      const uploadPromises = photos.map(async (photo) => {
        const match = matches.find(m => m.photoId === photo.id);
        if (!match?.itemId) return null; // Unmatched photo
        
        const fileExt = photo.file.name.split('.').pop();
        const fileName = `${profile.admin_id}/${Math.random().toString(36).substring(2)}.${fileExt}`;
        const { error: uploadErr } = await supabase.storage.from('items').upload(fileName, photo.file);
        if (uploadErr) throw uploadErr;
        
        const { data: { publicUrl } } = supabase.storage.from('items').getPublicUrl(fileName);
        return { itemId: match.itemId, url: publicUrl };
      });

      const uploadedImages = (await Promise.all(uploadPromises)).filter(Boolean);

      const toInsert = items.map(it => {
        const img = uploadedImages.find(u => u?.itemId === it.id);
        return {
          admin_id: profile.admin_id,
          name: it.name,
          category: it.category,
          price: it.price,
          description: it.description,
          selling_unit: it.selling_unit,
          selling_quantity: it.selling_quantity,
          is_veg: it.is_veg,
          image_url: img ? img.url : null,
          is_available: true,
          type: 'product',
        };
      });

      const { error } = await supabase.from('items').insert(toInsert);
      if (error) throw error;

      toast({ title: 'Success', description: `${toInsert.length} items published to your menu.` });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      navigate('/items');

    } catch (err: any) {
      toast({ title: 'Publishing Failed', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Sparkles className="text-blue-500 w-8 h-8" />
          AI Menu Builder
        </h1>
        <p className="text-gray-500">Automate your menu creation and photo matching in minutes.</p>
      </div>

      {/* Stepper Headers */}
      <div className="flex justify-between items-center mb-8 border-b pb-4">
        {[1, 2, 3, 4].map(num => (
          <div key={num} className={`flex items-center gap-2 ${step >= num ? 'text-blue-600' : 'text-gray-400'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step === num ? 'bg-blue-600 text-white' : step > num ? 'bg-blue-100 text-blue-600' : 'bg-gray-100'}`}>
              {step > num ? <CheckCircle2 className="w-5 h-5" /> : num}
            </div>
            <span className="hidden sm:inline font-medium">
              {num === 1 ? 'Upload Menu' : num === 2 ? 'Review Text' : num === 3 ? 'Food Photos' : 'Match & Publish'}
            </span>
          </div>
        ))}
      </div>

      {/* STEP 1: UPLOAD MENU */}
      {step === 1 && (
        <div className="space-y-6 animate-in fade-in zoom-in duration-300">
          <Card>
            <CardHeader>
              <CardTitle>1. Upload Menu Images</CardTitle>
              <CardDescription>Upload clear photos of your physical menu or a menu PDF/screenshot.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 gap-4">
                <Label className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors">
                  <ImagePlus className="w-12 h-12 text-gray-400" />
                  <span className="font-medium">Browse Gallery</span>
                  <Input type="file" accept="image/*" multiple className="hidden" onChange={handleMenuUpload} />
                </Label>
                <Label className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-gray-50 transition-colors">
                  <Camera className="w-12 h-12 text-gray-400" />
                  <span className="font-medium">Take Photo</span>
                  <Input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleMenuUpload} />
                </Label>
              </div>

              {menuImages.length > 0 && (
                <div className="mt-6 flex gap-4 overflow-x-auto py-2">
                  {menuImages.map((img, i) => (
                    <div key={i} className="relative shrink-0">
                      <img src={img.url} alt="menu" className="h-32 w-24 object-cover rounded-lg border" />
                      <button onClick={() => setMenuImages(menuImages.filter((_, idx) => idx !== i))} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex justify-end">
            <Button size="lg" onClick={extractMenu} disabled={!menuImages.length || loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Extracting...</> : 'Extract Items with AI'}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 2: REVIEW TEXT */}
      {step === 2 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
          <Card>
            <CardHeader>
              <CardTitle>2. Verify Menu Items</CardTitle>
              <CardDescription>We found {items.length} items. Review and correct any AI mistakes before adding photos.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-xl overflow-hidden overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50">
                      <TableHead>Item Name</TableHead>
                      <TableHead>Price (₹)</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map(it => (
                      <TableRow key={it.id}>
                        <TableCell><Input value={it.name} onChange={e => updateItem(it.id, 'name', e.target.value)} /></TableCell>
                        <TableCell><Input type="number" value={it.price} onChange={e => updateItem(it.id, 'price', Number(e.target.value))} className="w-24" /></TableCell>
                        <TableCell><Input value={it.category} onChange={e => updateItem(it.id, 'category', e.target.value)} /></TableCell>
                        <TableCell>
                          <select className="flex h-10 w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:outline-none" value={it.is_veg === true ? 'veg' : it.is_veg === false ? 'nonveg' : 'unknown'} onChange={e => updateItem(it.id, 'is_veg', e.target.value === 'veg' ? true : e.target.value === 'nonveg' ? false : null)}>
                            <option value="veg">Veg</option>
                            <option value="nonveg">Non-Veg</option>
                            <option value="unknown">N/A</option>
                          </select>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => removeItem(it.id)} className="text-red-500 hover:text-red-700"><Trash2 className="w-4 h-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button size="lg" onClick={() => setStep(3)}>Continue to Photos <ChevronRight className="w-4 h-4 ml-1" /></Button>
          </div>
        </div>
      )}

      {/* STEP 3: UPLOAD PHOTOS */}
      {step === 3 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
          <Card>
            <CardHeader>
              <CardTitle>3. Bulk Upload Food Photos</CardTitle>
              <CardDescription>Drag and drop all your food photos here. AI will match them to the items you just reviewed.</CardDescription>
            </CardHeader>
            <CardContent>
              <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'}`}>
                <input {...getInputProps()} />
                <UploadCloud className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold">Drag & Drop images here</h3>
                <p className="text-sm text-gray-500 mt-1">or click to select files from your device</p>
              </div>

              {photos.length > 0 && (
                <div className="mt-6">
                  <h4 className="font-semibold mb-3">Selected Photos ({photos.length})</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-4">
                    {photos.map(p => (
                      <div key={p.id} className="relative group rounded-lg overflow-hidden border bg-white aspect-square">
                        <img src={p.preview} alt="preview" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <button onClick={() => removePhoto(p.id)} className="text-white p-2 bg-red-600 rounded-full hover:bg-red-700">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button size="lg" onClick={matchImages} disabled={loading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Matching Images...</> : 'Match with AI'}
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: REVIEW MATCHES & PUBLISH */}
      {step === 4 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300">
          <Card>
            <CardHeader>
              <CardTitle>4. Verify AI Matches & Publish</CardTitle>
              <CardDescription>Review the suggested matches. You can reassign photos manually if the AI made a mistake.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-6">
                {photos.map(photo => {
                  const match = matches.find(m => m.photoId === photo.id);
                  const confidence = match?.confidence || 0;
                  const isHigh = confidence >= 80;
                  const isMid = confidence >= 50 && confidence < 80;
                  const isLow = confidence < 50;

                  return (
                    <div key={photo.id} className="border rounded-xl p-4 bg-white shadow-sm flex flex-col gap-4">
                      <img src={photo.preview} alt="food" className="w-full h-40 object-cover rounded-lg" />
                      
                      <div className="flex-1">
                        <Label className="text-xs text-gray-500 uppercase tracking-wider font-bold mb-1 block">Matched Item</Label>
                        <select 
                          className="w-full text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 p-2 border bg-gray-50"
                          value={match?.itemId || ''}
                          onChange={e => handleOverrideMatch(photo.id, e.target.value ? Number(e.target.value) : null)}
                        >
                          <option value="">-- No Match / Ignore --</option>
                          {items.map(it => (
                            <option key={it.id} value={it.id}>{it.name} (₹{it.price})</option>
                          ))}
                        </select>
                      </div>

                      {match?.itemId && (
                        <div className="flex items-center gap-2 text-sm">
                          <span className={`flex h-2 w-2 rounded-full ${isHigh ? 'bg-green-500' : isMid ? 'bg-yellow-500' : 'bg-red-500'}`}></span>
                          <span className="font-medium text-gray-700">AI Confidence: {confidence}%</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border">
            <Button variant="outline" onClick={() => setStep(3)}>Back to Photos</Button>
            <div className="text-center text-sm text-gray-600">
              <p>Total Items: <strong>{items.length}</strong></p>
              <p>Matched Photos: <strong>{matches.filter(m => m.itemId).length}</strong></p>
            </div>
            <Button size="lg" onClick={publishItems} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Publishing...</> : <><Save className="w-4 h-4 mr-2" /> Approve & Publish</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
