import React, { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sparkles, Upload, X, Loader2, Trash2, CheckCircle2, AlertCircle, ImagePlus, Camera, FolderOpen, Merge } from 'lucide-react';
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

export const AiMenuImportDialog: React.FC<Props> = ({ branchId, adminId, categories, onItemsAdded, disabled }) => {
  const [open, setOpen] = useState(false);
  const [images, setImages] = useState<{ url: string; name: string }[]>([]);
  const [text, setText] = useState('');
  const [hintCategory, setHintCategory] = useState('');
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsed, setParsed] = useState<Parsed[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setImages([]); setText(''); setParsed([]); setParsing(false); setSaving(false);
    if (fileRef.current) fileRef.current.value = '';
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
      setParsed(items.map((it: any, i: number) => ({ id: i + 1, ...it })));
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

  const validRows = parsed.filter(r => r.name.trim().length >= 2 && r.price >= 0);
  const errorRows = parsed.length - validRows.length;

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
            Snap a photo of your printed menu or paste catalogue text — AI extracts items with prices. Preview and edit before saving.
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
                  {images.length < 6 && (
                    <button
                      onClick={() => fileRef.current?.click()}
                      className="w-24 h-24 rounded-md border-2 border-dashed flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground hover:bg-muted/30"
                    >
                      <ImagePlus className="w-5 h-5" />
                      Add photo
                    </button>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  className="hidden"
                  onChange={(e) => addFiles(e.target.files)}
                />
                <p className="text-[11px] text-muted-foreground">Up to 6 clear photos. Good lighting = better accuracy.</p>
              </div>

              <div>
                <Label className="text-xs">Or paste menu text (optional)</Label>
                <Textarea rows={4} value={text} onChange={e => setText(e.target.value)} placeholder="Paste catalogue / menu text here..." />
              </div>

              <div>
                <Label className="text-xs">Default category hint (optional)</Label>
                <Input value={hintCategory} onChange={e => setHintCategory(e.target.value)} placeholder="e.g. Starters, Beverages" />
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
                <div className="flex gap-3 text-sm font-medium">
                  <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {validRows.length} ready</span>
                  {errorRows > 0 && (
                    <span className="text-red-600 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {errorRows} need fix</span>
                  )}
                  <Badge variant="outline" className="text-[10px]">Editable preview</Badge>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setParsed([])}>Back</Button>
                  <Button size="sm" onClick={saveAll} disabled={saving || !validRows.length}>
                    {saving ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> Saving…</> : `Save ${validRows.length} items`}
                  </Button>
                </div>
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
                      <TableHead className="min-w-[200px]">Description</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsed.map((r, idx) => {
                      const bad = r.name.trim().length < 2;
                      return (
                        <TableRow key={r.id} className={bad ? 'bg-red-50/40 dark:bg-red-950/20' : ''}>
                          <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell>
                            <Input value={r.name} onChange={e => updateRow(r.id, { name: e.target.value })} className="h-8 text-xs" />
                          </TableCell>
                          <TableCell>
                            <Input type="number" value={r.price} onChange={e => updateRow(r.id, { price: Number(e.target.value) })} className="h-8 text-xs" />
                          </TableCell>
                          <TableCell>
                            <Input list={`cats-${r.id}`} value={r.category} onChange={e => updateRow(r.id, { category: e.target.value })} className="h-8 text-xs" />
                            <datalist id={`cats-${r.id}`}>
                              {categories.map(c => <option key={c} value={c} />)}
                            </datalist>
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
