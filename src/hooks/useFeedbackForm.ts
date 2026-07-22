import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';

export type FeedbackFieldType =
  | 'text' | 'long_text' | 'number' | 'date'
  | 'dropdown' | 'radio' | 'checkbox' | 'rating'
  | 'email' | 'phone' | 'yes_no';

export interface FeedbackField {
  id: string;
  form_id: string;
  admin_id: string;
  branch_id: string;
  field_key: string;
  label: string;
  placeholder?: string | null;
  helper_text?: string | null;
  field_type: FeedbackFieldType;
  options: any[];
  validation: Record<string, any>;
  is_required: boolean;
  display_order: number;
  is_active: boolean;
}

export interface FeedbackForm {
  id: string;
  admin_id: string;
  branch_id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  thank_you_message: string;
  submit_button_label: string;
  show_shop_header: boolean;
  header_logo_url?: string | null;
  primary_color: string;
  background_color: string;
  text_color: string;
  font_family: string;
  border_radius: string;
  layout_style: string;
  cooldown_days: number;
  is_active: boolean;
  whatsapp_reply_templates: string[];
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 40);

export function useFeedbackForm() {
  const { adminProfileId } = useAuth() as any;
  const { operatingBranchId } = useBranch();
  const [form, setForm] = useState<FeedbackForm | null>(null);
  const [fields, setFields] = useState<FeedbackField[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!adminProfileId || !operatingBranchId) {
      setForm(null); setFields([]); setLoading(false); return;
    }
    setLoading(true);
    try {
      const { data: existing } = await (supabase as any)
        .from('feedback_forms')
        .select('*')
        .eq('admin_id', adminProfileId)
        .eq('branch_id', operatingBranchId)
        .maybeSingle();

      let formRow = existing as FeedbackForm | null;
      if (!formRow) {
        // Auto-create a default form so admin can start using it immediately
        const baseSlug = slugify(`fb-${adminProfileId.slice(0, 6)}-${operatingBranchId.slice(0, 6)}-${Date.now().toString(36)}`);
        const { data: created, error } = await (supabase as any)
          .from('feedback_forms')
          .insert({
            admin_id: adminProfileId,
            branch_id: operatingBranchId,
            slug: baseSlug,
          })
          .select('*')
          .single();
        if (!error) formRow = created as FeedbackForm;
      }
      setForm(formRow);

      if (formRow) {
        const { data: fs } = await (supabase as any)
          .from('feedback_form_fields')
          .select('*')
          .eq('form_id', formRow.id)
          .order('display_order', { ascending: true });
        setFields((fs as FeedbackField[]) || []);
      }
    } finally {
      setLoading(false);
    }
  }, [adminProfileId, operatingBranchId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const saveForm = async (patch: Partial<FeedbackForm>) => {
    if (!form) return { error: new Error('No form') };
    const { error } = await (supabase as any)
      .from('feedback_forms')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', form.id);
    if (!error) setForm({ ...form, ...patch } as FeedbackForm);
    return { error };
  };

  const addField = async (partial: Partial<FeedbackField> & { label: string; field_type: FeedbackFieldType }) => {
    if (!form) return { error: new Error('No form') };
    const nextOrder = (fields[fields.length - 1]?.display_order ?? 0) + 1;
    const baseKey = slugify(partial.label) || `field_${Date.now().toString(36)}`;
    let key = baseKey;
    let i = 1;
    while (fields.some(f => f.field_key === key)) { key = `${baseKey}_${i++}`; }
    const { error, data } = await (supabase as any)
      .from('feedback_form_fields')
      .insert({
        form_id: form.id,
        admin_id: form.admin_id,
        branch_id: form.branch_id,
        field_key: key,
        display_order: nextOrder,
        options: partial.options ?? [],
        validation: partial.validation ?? {},
        is_required: partial.is_required ?? false,
        placeholder: partial.placeholder ?? null,
        helper_text: partial.helper_text ?? null,
        label: partial.label,
        field_type: partial.field_type,
      })
      .select('*')
      .single();
    if (!error && data) setFields([...fields, data as FeedbackField]);
    return { error };
  };

  const updateField = async (id: string, patch: Partial<FeedbackField>) => {
    const { error } = await (supabase as any)
      .from('feedback_form_fields')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (!error) setFields(fields.map(f => (f.id === id ? { ...f, ...patch } as FeedbackField : f)));
    return { error };
  };

  const deleteField = async (id: string) => {
    const { error } = await (supabase as any).from('feedback_form_fields').delete().eq('id', id);
    if (!error) setFields(fields.filter(f => f.id !== id));
    return { error };
  };

  const moveField = async (id: string, dir: -1 | 1) => {
    const idx = fields.findIndex(f => f.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= fields.length) return;
    const a = fields[idx];
    const b = fields[next];
    // swap display_order
    await (supabase as any).from('feedback_form_fields').update({ display_order: b.display_order }).eq('id', a.id);
    await (supabase as any).from('feedback_form_fields').update({ display_order: a.display_order }).eq('id', b.id);
    const copy = [...fields];
    copy[idx] = { ...b, display_order: a.display_order };
    copy[next] = { ...a, display_order: b.display_order };
    setFields(copy.sort((x, y) => x.display_order - y.display_order));
  };

  const applyStarterPack = async () => {
    if (!form) return;
    const starter: Array<Partial<FeedbackField> & { label: string; field_type: FeedbackFieldType }> = [
      { label: 'Overall Rating', field_type: 'rating', is_required: true },
      { label: 'Food Quality', field_type: 'rating', is_required: false },
      { label: 'Service', field_type: 'rating', is_required: false },
      { label: 'Cleanliness', field_type: 'rating', is_required: false },
      { label: 'Your Name', field_type: 'text', placeholder: 'Optional', is_required: false },
      { label: 'Suggestions', field_type: 'long_text', placeholder: 'Tell us more...', is_required: false },
    ];
    for (const s of starter) { await addField(s); }
  };

  return { form, fields, loading, refresh: fetchAll, saveForm, addField, updateField, deleteField, moveField, applyStarterPack };
}
