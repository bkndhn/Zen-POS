import React, { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Lock, Copy, Download, Loader2, MessageSquare } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { useFeedbackForm } from '@/hooks/useFeedbackForm';
import { FeedbackFieldBuilder } from './FeedbackFieldBuilder';

const generateQRCodeUrl = (text: string, size = 300, fg = '1a1a6c', bg = 'ffffff') =>
  `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&margin=10&color=${fg}&bgcolor=${bg}`;

const FeedbackQRSettings: React.FC = () => {
  const { profile } = useAuth() as any;
  const { operatingBranchId, branches } = useBranch();
  const branch = branches.find(b => b.id === operatingBranchId);
  const allowFeedback = (profile as any)?.client_permissions?.allow_feedback_module === true;
  const { form, fields, loading, saveForm, addField, updateField, deleteField, moveField, applyStarterPack } = useFeedbackForm();
  const [savingSettings, setSavingSettings] = useState(false);

  const publicUrl = useMemo(() => {
    if (!form) return '';
    return `${window.location.origin}/feedback/${form.slug}?src=qr`;
  }, [form]);

  if (!allowFeedback) {
    return (
      <Card className="p-6 text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
          <Lock className="w-6 h-6 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold">Feedback Module Locked</h3>
          <p className="text-xs text-muted-foreground mt-1">
            This is a premium add-on. Please contact your Super Admin to enable the Feedback module for your account.
          </p>
        </div>
      </Card>
    );
  }

  if (loading || !form) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  const persistPatch = async (patch: Partial<typeof form>) => {
    setSavingSettings(true);
    const { error } = await saveForm(patch);
    setSavingSettings(false);
    if (error) toast({ title: 'Save failed', description: (error as any).message, variant: 'destructive' });
  };

  return (
    <div className="space-y-4">
      {/* QR + Link */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Your Feedback QR</h3>
          {branch && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">{branch.name}</span>}
        </div>
        <div className="flex flex-col sm:flex-row gap-4 items-center">
          <img src={generateQRCodeUrl(publicUrl, 240, form.primary_color.replace('#',''))} alt="Feedback QR" className="rounded-md border" />
          <div className="flex-1 w-full space-y-2">
            <div className="flex items-center gap-2">
              <Input readOnly value={publicUrl} className="text-xs" />
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(publicUrl); toast({ title: 'Link copied' }); }}>
                <Copy className="w-3 h-3" />
              </Button>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => window.open(generateQRCodeUrl(publicUrl, 600), '_blank')}>
                <Download className="w-3 h-3 mr-1" /> Download
              </Button>
              <Button size="sm" variant="outline" onClick={() => window.open(publicUrl, '_blank')}>
                Preview
              </Button>
            </div>
            <div className="flex items-center justify-between pt-2">
              <Label className="text-xs">Form Active</Label>
              <Switch checked={form.is_active} onCheckedChange={v => persistPatch({ is_active: v })} disabled={savingSettings} />
            </div>
          </div>
        </div>
      </Card>

      {/* Form content settings */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Form Content</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Title</Label>
            <Input value={form.title} onChange={e => saveForm({ title: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Subtitle</Label>
            <Input value={form.subtitle || ''} onChange={e => saveForm({ subtitle: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Submit Button Label</Label>
            <Input value={form.submit_button_label} onChange={e => saveForm({ submit_button_label: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Cooldown (days per customer)</Label>
            <Input type="number" min={0} max={365} value={form.cooldown_days}
              onChange={e => saveForm({ cooldown_days: Math.max(0, Number(e.target.value) || 0) })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">Thank-You Message</Label>
            <Textarea rows={2} value={form.thank_you_message} onChange={e => saveForm({ thank_you_message: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between">
            <Label className="text-xs">Show Shop Header (logo/name/address)</Label>
            <Switch checked={form.show_shop_header} onCheckedChange={v => persistPatch({ show_shop_header: v })} />
          </div>
        </div>
      </Card>

      {/* Theme */}
      <Card className="p-4 space-y-3">
        <h3 className="text-sm font-semibold">Theme</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <Label className="text-xs">Primary</Label>
            <Input type="color" value={form.primary_color} onChange={e => saveForm({ primary_color: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Background</Label>
            <Input type="color" value={form.background_color} onChange={e => saveForm({ background_color: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Text</Label>
            <Input type="color" value={form.text_color} onChange={e => saveForm({ text_color: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">Radius (px)</Label>
            <Input value={form.border_radius} onChange={e => saveForm({ border_radius: e.target.value })} />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <Label className="text-xs">Font Family</Label>
            <Input value={form.font_family} onChange={e => saveForm({ font_family: e.target.value })}
              placeholder="Inter, Poppins, Roboto..." />
          </div>
        </div>
      </Card>

      {/* Fields */}
      <Card className="p-4">
        <FeedbackFieldBuilder
          fields={fields}
          addField={addField}
          updateField={updateField}
          deleteField={deleteField}
          moveField={moveField}
          applyStarterPack={applyStarterPack}
        />
      </Card>

      {/* WhatsApp templates */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-green-600" />
          <h3 className="text-sm font-semibold">WhatsApp Reply Templates</h3>
        </div>
        <p className="text-[11px] text-muted-foreground">One template per line. Used when replying to feedback from CRM.</p>
        <Textarea
          rows={4}
          value={(form.whatsapp_reply_templates || []).join('\n')}
          onChange={e => saveForm({ whatsapp_reply_templates: e.target.value.split('\n').filter(Boolean) as any })}
          placeholder={'Thank you for your feedback!\nWe apologise for the inconvenience — please visit again for a complimentary treat.\nWe value your input. Our team will look into it right away.'}
        />
      </Card>
    </div>
  );
};

export default FeedbackQRSettings;
