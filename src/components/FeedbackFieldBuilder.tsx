import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Trash2, Pencil, ArrowUp, ArrowDown, Plus, Sparkles } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { FeedbackField, FeedbackFieldType, useFeedbackForm } from '@/hooks/useFeedbackForm';

const TYPE_LABELS: Record<FeedbackFieldType, string> = {
  text: 'Short Text',
  long_text: 'Long Text',
  number: 'Number',
  date: 'Date',
  dropdown: 'Dropdown',
  radio: 'Radio Buttons',
  checkbox: 'Checkboxes',
  rating: 'Star Rating (1-5)',
  email: 'Email',
  phone: 'Phone Number',
  yes_no: 'Yes / No',
};

const HAS_OPTIONS: FeedbackFieldType[] = ['dropdown', 'radio', 'checkbox'];

interface Props {
  fields: FeedbackField[];
  addField: ReturnType<typeof useFeedbackForm>['addField'];
  updateField: ReturnType<typeof useFeedbackForm>['updateField'];
  deleteField: ReturnType<typeof useFeedbackForm>['deleteField'];
  moveField: ReturnType<typeof useFeedbackForm>['moveField'];
  applyStarterPack: ReturnType<typeof useFeedbackForm>['applyStarterPack'];
}

const emptyDraft = () => ({
  label: '',
  placeholder: '',
  helper_text: '',
  field_type: 'text' as FeedbackFieldType,
  is_required: false,
  options: [] as string[],
  optionsText: '',
});

export const FeedbackFieldBuilder: React.FC<Props> = ({
  fields, addField, updateField, deleteField, moveField, applyStarterPack,
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FeedbackField | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);

  const openAdd = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setDialogOpen(true);
  };

  const openEdit = (f: FeedbackField) => {
    setEditing(f);
    setDraft({
      label: f.label,
      placeholder: f.placeholder || '',
      helper_text: f.helper_text || '',
      field_type: f.field_type,
      is_required: f.is_required,
      options: Array.isArray(f.options) ? f.options : [],
      optionsText: (Array.isArray(f.options) ? f.options : []).join('\n'),
    });
    setDialogOpen(true);
  };

  const save = async () => {
    if (!draft.label.trim()) {
      toast({ title: 'Label required', variant: 'destructive' });
      return;
    }
    const options = HAS_OPTIONS.includes(draft.field_type)
      ? draft.optionsText.split('\n').map(s => s.trim()).filter(Boolean)
      : [];
    if (HAS_OPTIONS.includes(draft.field_type) && options.length < 2) {
      toast({ title: 'Add at least 2 options', variant: 'destructive' });
      return;
    }
    setSaving(true);
    if (editing) {
      const { error } = await updateField(editing.id, {
        label: draft.label.trim(),
        placeholder: draft.placeholder || null,
        helper_text: draft.helper_text || null,
        field_type: draft.field_type,
        is_required: draft.is_required,
        options,
      });
      if (error) toast({ title: 'Failed to update', description: (error as any).message, variant: 'destructive' });
      else toast({ title: 'Field updated' });
    } else {
      const { error } = await addField({
        label: draft.label.trim(),
        placeholder: draft.placeholder || null,
        helper_text: draft.helper_text || null,
        field_type: draft.field_type,
        is_required: draft.is_required,
        options,
      });
      if (error) toast({ title: 'Failed to add', description: (error as any).message, variant: 'destructive' });
      else toast({ title: 'Field added' });
    }
    setSaving(false);
    setDialogOpen(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-semibold">Form Fields</h3>
          <p className="text-xs text-muted-foreground">Custom fields shown on the feedback form</p>
        </div>
        <div className="flex gap-2">
          {fields.length === 0 && (
            <Button size="sm" variant="outline" onClick={applyStarterPack} className="h-8 text-xs">
              <Sparkles className="w-3 h-3 mr-1" /> Starter Pack
            </Button>
          )}
          <Button size="sm" onClick={openAdd} className="h-8 text-xs">
            <Plus className="w-3 h-3 mr-1" /> Add Field
          </Button>
        </div>
      </div>

      {fields.length === 0 && (
        <Card className="p-4 text-center text-xs text-muted-foreground">
          No fields yet. Click <strong>Starter Pack</strong> for a restaurant preset, or <strong>Add Field</strong>.
        </Card>
      )}

      <div className="space-y-2">
        {fields.map((f, i) => (
          <Card key={f.id} className="p-3 flex items-center gap-2">
            <div className="flex flex-col gap-0.5">
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === 0} onClick={() => moveField(f.id, -1)}>
                <ArrowUp className="w-3 h-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" disabled={i === fields.length - 1} onClick={() => moveField(f.id, 1)}>
                <ArrowDown className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-medium truncate">{f.label}</span>
                {f.is_required && <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/10 text-destructive">Required</span>}
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{TYPE_LABELS[f.field_type]}</span>
              </div>
              {f.placeholder && <div className="text-[11px] text-muted-foreground truncate">Placeholder: {f.placeholder}</div>}
            </div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(f)}>
                <Pencil className="w-3.5 h-3.5" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"
                onClick={async () => {
                  if (confirm(`Delete field "${f.label}"?`)) {
                    const { error } = await deleteField(f.id);
                    if (error) toast({ title: 'Delete failed', variant: 'destructive' });
                  }
                }}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Field' : 'Add Field'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Field Type</Label>
              <Select value={draft.field_type} onValueChange={(v: any) => setDraft({ ...draft, field_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TYPE_LABELS) as FeedbackFieldType[]).map(t => (
                    <SelectItem key={t} value={t}>{TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Label</Label>
              <Input value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder="e.g. Overall Experience" />
            </div>
            <div>
              <Label className="text-xs">Placeholder</Label>
              <Input value={draft.placeholder} onChange={e => setDraft({ ...draft, placeholder: e.target.value })} placeholder="Optional hint text" />
            </div>
            <div>
              <Label className="text-xs">Helper Text</Label>
              <Input value={draft.helper_text} onChange={e => setDraft({ ...draft, helper_text: e.target.value })} placeholder="Optional description shown below label" />
            </div>
            {HAS_OPTIONS.includes(draft.field_type) && (
              <div>
                <Label className="text-xs">Options (one per line)</Label>
                <Textarea rows={4} value={draft.optionsText} onChange={e => setDraft({ ...draft, optionsText: e.target.value })} placeholder={'Option 1\nOption 2\nOption 3'} />
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label className="text-xs">Required</Label>
              <Switch checked={draft.is_required} onCheckedChange={v => setDraft({ ...draft, is_required: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FeedbackFieldBuilder;
