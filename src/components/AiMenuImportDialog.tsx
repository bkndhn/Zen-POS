import React, { useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sparkles, X, Loader2, Trash2, CheckCircle2, AlertCircle, ImagePlus, Camera, FolderOpen, Merge } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface Props {
  branchId: string | null;
  adminId: string;
  categories: string[];
  onItemsAdded: () => void;
  disabled?: boolean;
}

interface Parsed {
  id: number;
  name: string;
  price: number;
  category: string;
  description: string | null;
  selling_unit: string;
  selling_quantity: number;
  is_veg: boolean | null;
  error?: string;
}

const UNITS = ['Piece (pc)', 'Plate', 'Cup', 'Glass', 'Pack', 'Box', 'Kilogram (kg)', 'Gram (g)', 'Liter (l)', 'Milliliter (ml)'];

const fileToDataUrl = (f: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(f);
  });

// Row-level validation → list of issues per row
function validateRow(r: Parsed, allCategories: string[]): string[] {
  const issues: string[] = [];
  if (!r.name || r.name.trim().length < 2) issues.push('Name too short');
  if (r.name && r.name.length > 100) issues.push('Name >100 chars');
  if (!(r.price >= 0) || Number.isNaN(r.price)) issues.push('Invalid price');
  if (r.price === 0) issues.push('Price is 0');
  if (!r.category || !r.category.trim()) issues.push('Category missing');
  if (!UNITS.includes(r.selling_unit)) issues.push('Unknown unit');
  if (!(r.selling_quantity > 0)) issues.push('Qty must be > 0');
  return issues;
}

export const AiMenuImportDialog: React.FC<Props> = ({ branchId, adminId, categories, onItemsAdded, disabled }) => {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<{ url: string; name: string }[]>([]);
  const [text, setText] = useState('');
  const [hintCategory, setHintCategory] = useState('');
  const [defaultUnit, setDefaultUnit] = useState<string>('Piece (pc)');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<Parsed[]>([]);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setImages([]); setText(''); setParsed([]); setParsing(false); setSaving(false);
    if (cameraRef.current) cameraRef.current.value = '';
    if (galleryRef.current) galleryRef.current.value = '';
  };

  const addFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    const arr = Array.from(files).slice(0, 6 - images.length);
    const next = [...images];
    for (const f of arr) {
      if (!f.type.startsWith('image/')) continue;
      if (f.size > 8 * 1024 * 1024) { toast({ title: 'Image too large', description: `${f.name} exceeds 8MB`, variant: 'destructive' }); continue; }
      const url = await fileToDataUrl(f);
      next.push({ url, name: f.name });
    }
    setImages(next.slice(0, 6));
  };

  const dedupeItems = (items: any[]): { deduped: any[]; mergedCount: number } => {
    const map = new Map<string, any>();
    let merged = 0;
    for (const it of items) {
      const key = `${String(it?.name || '').trim().toLowerCase()}|${Number(it?.price) || 0}`;
      if (!key.startsWith('|')) {
        if (map.has(key)) { merged++; continue; }
        map.set(key, it);
      }
    }
    return { deduped: Array.from(map.values()), mergedCount: merged };
  };

  const runParse = async () => {
    if (!images.length && !text.trim()) {
      toast({ title: 'Add a menu photo or paste text first', variant: 'destructive' });
      return;
    }
    setParsing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-menu-parse', {
        body: { images: images.map(i => i.url), text, hint_category: hintCategory || undefined },
      });
      if (error) throw error;
      const items = (data as any)?.items || [];
      if (!items.length) {
        toast({ title: 'No items found', description: 'Try a clearer photo or paste text.', variant: 'destructive' });
      }
      // Dedupe (same name + price merges)
      const { deduped, mergedCount } = dedupeItems(items);
      const mapped: Parsed[] = deduped.map((it: any, i: number) => ({
        id: i + 1,
        name: it.name,
        price: it.price,
        category: (it.category && it.category.trim()) || hintCategory || 'General',
        description: it.description ?? null,
        selling_unit: UNITS.includes(it.selling_unit) ? it.selling_unit : defaultUnit,
        selling_quantity: it.selling_quantity > 0 ? it.selling_quantity : 1,
        is_veg: typeof it.is_veg === 'boolean' ? it.is_veg : null,
      }));
      setParsed(mapped);
      if (mergedCount > 0) {
        toast({ title: 'Duplicates merged', description: `${mergedCount} duplicate item(s) auto-merged.` });
      }
    } catch (e: any) {
      const msg = e?.context?.message || e?.message || 'AI parse failed';
      toast({ title: 'AI parse failed', description: msg, variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  const updateRow = (id: number, patch: Partial<Parsed>) => {
    setParsed(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
  };
  const removeRow = (id: number) => setParsed(prev => prev.filter(r => r.id !== id));

  const mergeDuplicatesInPreview = () => {
    const { deduped, mergedCount } = dedupeItems(parsed);
    if (mergedCount === 0) {
      toast({ title: 'No duplicates found' });
      return;
    }
    setParsed(deduped.map((r: any, i: number) => ({ ...r, id: i + 1 })));
    toast({ title: 'Merged', description: `Removed ${mergedCount} duplicate row(s).` });
  };

  const bulkApplyCategory = (cat: string) => {
    if (!cat) return;
    setParsed(prev => prev.map(r => ({ ...r, category: cat })));
  };
  const bulkApplyUnit = (unit: string) => {
    if (!unit) return;
    setParsed(prev => prev.map(r => ({ ...r, selling_unit: unit })));
  };

  // Row validation report
  const rowIssues = useMemo(() => parsed.map(r => ({ id: r.id, issues: validateRow(r, categories) })), [parsed, categories]);
  const validRows = parsed.filter(r => validateRow(r, categories).filter(i => i !== 'Price is 0').length === 0);
  const errorRows = parsed.length - validRows.length;
  const totalIssues = rowIssues.reduce((s, r) => s + r.issues.length, 0);

  const saveAll = async () => {
    if (!validRows.length) return;
    if (!branchId) { toast({ title: 'Select a branch first', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      const records = validRows.map(r => ({
        name: r.name.trim(),
        price: Number(r.price) || 0,
        category: r.category?.trim() || 'General',
        description: r.description || null,
        selling_unit: r.selling_unit,
        selling_quantity: r.selling_quantity,
        inventory_unit: r.selling_unit,
        inventory_quantity: r.selling_quantity,
        unit: r.selling_unit,
        base_value: r.selling_quantity,
        quantity_step: 1,
        is_active: true,
        is_saleable: true,
        unlimited_stock: true,
        admin_id: adminId,
        branch_id: branchId,
      }));
      const BATCH = 100;
      for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const { error } = await supabase.from('items').insert(batch as any);
        if (error) throw error;
      }
      toast({ title: 'Items imported', description: `Added ${records.length} items via AI` });
      onItemsAdded();
      setOpen(false);
      reset();
    } catch (e: any) {
      toast({ title: 'Save failed', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 px-3 text-xs flex items-center gap-2 border-dashed bg-gradient-to-r from-primary/5 to-primary/10" disabled={disabled}>
          <Sparkles className="w-3.5 h-3.5 text-primary" />
          <span className="hidden sm:inline">AI Import</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" /> AI Menu Import
          </DialogTitle>
          <DialogDescription>
            Snap a photo of your printed menu or pick one from your gallery — AI extracts items with prices. Preview and edit before saving.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {parsed.length === 0 ? (
            <>
              {/* Uploader */}
              <div className="border-2 border-dashed rounded-xl p-4 space-y-3 bg-muted/10">
                <div className="flex flex-wrap gap-2">
                  {images.map((im, i) => (
                    <div key={i} className="relative w-24 h-24 rounded-md overflow-hidden border">
                      <img src={im.url} alt={im.name} className="w-full h-full object-cover" />
                      <button
                        onClick={() => setImages(prev => prev.filter((_, k) => k !== i))}
                        className="absolute top-0 right-0 bg-black/60 text-white p-0.5 rounded-bl"
                        aria-label="Remove"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>

                {images.length < 6 && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => cameraRef.current?.click()}>
                      <Camera className="w-4 h-4" /> Take Photo
                    </Button>
                    <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => galleryRef.current?.click()}>
                      <FolderOpen className="w-4 h-4" /> Choose from Gallery
                    </Button>
                    <span className="text-[11px] text-muted-foreground self-center">{images.length}/6 selected</span>
                  </div>
                )}

                <input
                  ref={cameraRef}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <input
                  ref={galleryRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <p className="text-[11px] text-muted-foreground">Up to 6 clear photos. Good lighting & flat menu = better accuracy.</p>
              </div>

              <div>
                <Label className="text-xs">Or paste menu text (optional)</Label>
                <Textarea rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="Paste catalogue / menu text here..." />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Default category (optional)</Label>
                  <Select value={hintCategory || '__none__'} onValueChange={v => setHintCategory(v === '__none__' ? '' : v)}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Choose category" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="text-xs">-- AI decides --</SelectItem>
                      {categories.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Default unit (fallback)</Label>
                  <Select value={defaultUnit} onValueChange={setDefaultUnit}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {UNITS.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={runParse} disabled={parsing || (!images.length && !text.trim())} className="gap-2">
                  {parsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {parsing ? 'AI reading menu…' : 'Extract items with AI'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 sticky top-0 bg-background z-10 pb-2 border-b">
                <div className="flex gap-3 text-sm font-medium flex-wrap">
                  <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {validRows.length} ready</span>
                  {errorRows > 0 && (
                    <span className="text-red-600 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {errorRows} need fix</span>
                  )}
                  <Badge variant="outline" className="text-[10px]">{totalIssues} issue(s) total</Badge>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" onClick={mergeDuplicatesInPreview} className="gap-1"><Merge className="w-3.5 h-3.5" /> Merge dupes</Button>
                  <Button variant="outline" size="sm" onClick={() => setParsed([])}>Back</Button>
                  <Button size="sm" onClick={saveAll} disabled={saving || !validRows.length}>
                    {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Saving…</> : `Save ${validRows.length} items`}
                  </Button>
                </div>
              </div>

              {/* Bulk apply toolbar */}
              <div className="flex flex-wrap items-center gap-2 text-xs bg-muted/30 rounded-md p-2">
                <span className="text-muted-foreground">Bulk apply →</span>
                <Select onValueChange={bulkApplyCategory}>
                  <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue placeholder="Category to all" /></SelectTrigger>
                  <SelectContent>
                    {categories.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select onValueChange={bulkApplyUnit}>
                  <SelectTrigger className="h-7 text-xs w-[160px]"><SelectValue placeholder="Unit to all" /></SelectTrigger>
                  <SelectContent>
                    {UNITS.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="border rounded-md overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8">#</TableHead>
                      <TableHead className="min-w-[180px]">Name*</TableHead>
                      <TableHead className="w-[100px]">Price*</TableHead>
                      <TableHead className="min-w-[140px]">Category</TableHead>
                      <TableHead className="min-w-[140px]">Unit</TableHead>
                      <TableHead className="w-[90px]">Qty</TableHead>
                      <TableHead className="min-w-[180px]">Description</TableHead>
                      <TableHead className="min-w-[140px]">Validation</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.map((r, idx) => {
                      const issues = rowIssues.find(x => x.id === r.id)?.issues || [];
                      const blocking = issues.filter(i => i !== 'Price is 0').length > 0;
                      return (
                        <TableRow key={r.id} className={blocking ? 'bg-red-50/40 dark:bg-red-950/20' : ''}>
                          <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell>
                            <Input value={r.name} onChange={e => updateRow(r.id, { name: e.target.value })} className="h-8 text-xs" />
                          </TableCell>
                          <TableCell>
                            <Input type="number" step="0.01" value={r.price} onChange={e => updateRow(r.id, { price: Number(e.target.value) })} className="h-8 text-xs" />
                          </TableCell>
                          <TableCell>
                            <Select value={r.category} onValueChange={v => updateRow(r.id, { category: v })}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pick" /></SelectTrigger>
                              <SelectContent>
                                {[r.category, ...categories.filter(c => c !== r.category)].filter(Boolean).map(c => (
                                  <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select value={r.selling_unit} onValueChange={v => updateRow(r.id, { selling_unit: v })}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {UNITS.map(u => <SelectItem key={u} value={u} className="text-xs">{u}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input type="number" value={r.selling_quantity} onChange={e => updateRow(r.id, { selling_quantity: Number(e.target.value) || 1 })} className="h-8 text-xs" />
                          </TableCell>
                          <TableCell>
                            <Input value={r.description || ''} onChange={e => updateRow(r.id, { description: e.target.value })} className="h-8 text-xs" />
                          </TableCell>
                          <TableCell>
                            {issues.length === 0 ? (
                              <span className="text-[10px] text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> OK</span>
                            ) : (
                              <div className="flex flex-wrap gap-1">
                                {issues.map((iss, i) => (
                                  <Badge key={i} variant={iss === 'Price is 0' ? 'outline' : 'destructive'} className="text-[9px] px-1 py-0">
                                    {iss}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600" onClick={() => removeRow(r.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AiMenuImportDialog;
