import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MessageSquare, Star, Loader2, Search, Download, RefreshCw, Trash2, Lock } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { exportFeedbackToCsv } from '@/utils/feedbackExport';

interface FieldMeta { field_key: string; label: string; }

interface Submission {
  id: string;
  form_id: string;
  admin_id: string;
  branch_id: string;
  customer_mobile: string;
  customer_name: string | null;
  responses: Record<string, any>;
  overall_rating: number | null;
  status: string;
  reply_notes: string | null;
  replied_at: string | null;
  submitted_at: string;
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-slate-100 text-slate-700',
  replied: 'bg-emerald-100 text-emerald-700',
  resolved: 'bg-green-100 text-green-700',
  ignored: 'bg-zinc-100 text-zinc-500',
  needs_attention: 'bg-red-100 text-red-700',
};

const CRMFeedbackTab: React.FC = () => {
  const { profile, adminProfileId } = useAuth() as any;
  const { operatingBranchId, isAllBranchesView, branches } = useBranch();
  const allowFeedback = profile?.client_permissions?.allow_feedback_module === true;

  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [fields, setFields] = useState<FieldMeta[]>([]);
  const [replyTemplates, setReplyTemplates] = useState<string[]>([]);
  const [shopName, setShopName] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [minRating, setMinRating] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState<Submission | null>(null);
  const [replyText, setReplyText] = useState('');

  const fetchAll = useCallback(async () => {
    if (!adminProfileId) return;
    setLoading(true);
    try {
      // Fetch forms (for field labels + templates) for the current scope
      let formsQuery = (supabase as any).from('feedback_forms').select('*').eq('admin_id', adminProfileId);
      if (!isAllBranchesView && operatingBranchId) formsQuery = formsQuery.eq('branch_id', operatingBranchId);
      const { data: forms } = await formsQuery;

      const formIds = (forms || []).map((f: any) => f.id);
      let allFields: any[] = [];
      if (formIds.length) {
        const { data: fs } = await (supabase as any)
          .from('feedback_form_fields')
          .select('field_key,label,display_order,form_id')
          .in('form_id', formIds)
          .order('display_order', { ascending: true });
        allFields = fs || [];
      }
      // Deduplicate field labels across forms (by field_key)
      const seen = new Set<string>();
      const merged: FieldMeta[] = [];
      allFields.forEach((f: any) => {
        if (!seen.has(f.field_key)) { seen.add(f.field_key); merged.push({ field_key: f.field_key, label: f.label }); }
      });
      setFields(merged);

      // Reply templates union
      const templates = new Set<string>();
      (forms || []).forEach((f: any) => (f.whatsapp_reply_templates || []).forEach((t: string) => templates.add(t)));
      setReplyTemplates(Array.from(templates));

      // Shop name for reply template
      const b = branches.find(x => x.id === operatingBranchId);
      setShopName(b?.name || '');

      // Submissions
      let q = (supabase as any).from('feedback_submissions').select('*').eq('admin_id', adminProfileId).order('submitted_at', { ascending: false }).limit(500);
      if (!isAllBranchesView && operatingBranchId) q = q.eq('branch_id', operatingBranchId);
      const { data: rows, error } = await q;
      if (error) throw error;
      setSubs(rows || []);
    } catch (e: any) {
      toast({ title: 'Failed to load feedback', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [adminProfileId, operatingBranchId, isAllBranchesView, branches]);

  useEffect(() => { if (allowFeedback) fetchAll(); }, [fetchAll, allowFeedback]);

  // Realtime updates
  useEffect(() => {
    if (!allowFeedback || !adminProfileId) return;
    const channel = supabase
      .channel('crm-feedback')
      .on('postgres_changes' as any,
        { event: '*', schema: 'public', table: 'feedback_submissions', filter: `admin_id=eq.${adminProfileId}` },
        () => fetchAll()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [allowFeedback, adminProfileId, fetchAll]);

  const filtered = useMemo(() => {
    return subs.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (minRating !== 'all' && (s.overall_rating ?? 0) < Number(minRating)) return false;
      if (search) {
        const t = search.toLowerCase();
        const hay = [s.customer_mobile, s.customer_name || '', JSON.stringify(s.responses || {}), s.reply_notes || ''].join(' ').toLowerCase();
        if (!hay.includes(t)) return false;
      }
      return true;
    });
  }, [subs, statusFilter, minRating, search]);

  const stats = useMemo(() => {
    const total = subs.length;
    const withRating = subs.filter(s => s.overall_rating != null);
    const avg = withRating.length ? withRating.reduce((a, s) => a + (s.overall_rating || 0), 0) / withRating.length : 0;
    const replied = subs.filter(s => s.status === 'replied' || s.status === 'resolved').length;
    const respRate = total ? Math.round((replied / total) * 100) : 0;
    const unread = subs.filter(s => s.status === 'new' || s.status === 'needs_attention').length;
    return { total, avg, respRate, unread };
  }, [subs]);

  const updateStatus = async (id: string, status: string, extra: Partial<Submission> = {}) => {
    const { error } = await (supabase as any)
      .from('feedback_submissions')
      .update({ status, ...extra })
      .eq('id', id);
    if (error) { toast({ title: 'Update failed', description: error.message, variant: 'destructive' }); return; }
    setSubs(prev => prev.map(s => (s.id === id ? { ...s, status, ...extra } as Submission : s)));
    if (detail?.id === id) setDetail({ ...detail, status, ...extra } as Submission);
  };

  const sendWhatsApp = (s: Submission, text: string) => {
    const shop = shopName || 'our store';
    const body = text
      .replace(/{name}/g, s.customer_name || 'there')
      .replace(/{shop}/g, shop);
    const url = `https://wa.me/91${s.customer_mobile}?text=${encodeURIComponent(body)}`;
    window.open(url, '_blank');
    updateStatus(s.id, 'replied', { reply_notes: body, replied_at: new Date().toISOString() });
  };

  const deleteSubmission = async (id: string) => {
    if (!confirm('Delete this feedback permanently?')) return;
    const { error } = await (supabase as any).from('feedback_submissions').delete().eq('id', id);
    if (error) { toast({ title: 'Delete failed', variant: 'destructive' }); return; }
    setSubs(prev => prev.filter(s => s.id !== id));
    setDetail(null);
  };

  const doExport = () => {
    if (!filtered.length) { toast({ title: 'No data to export' }); return; }
    const today = new Date().toISOString().split('T')[0];
    exportFeedbackToCsv(filtered, fields, `feedback-${today}.csv`);
    toast({ title: 'Exported CSV' });
  };

  if (!allowFeedback) {
    return (
      <Card className="p-6 text-center space-y-3">
        <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
          <Lock className="w-6 h-6 text-muted-foreground" />
        </div>
        <h3 className="font-semibold text-sm">Feedback Module Locked</h3>
        <p className="text-xs text-muted-foreground">Ask your Super Admin to enable the Feedback add-on.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card className="p-3"><p className="text-[10px] text-muted-foreground">Total</p><p className="text-lg font-bold">{stats.total}</p></Card>
        <Card className="p-3"><p className="text-[10px] text-muted-foreground">Avg Rating</p><p className="text-lg font-bold flex items-center gap-1"><Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />{stats.avg.toFixed(1)}</p></Card>
        <Card className="p-3"><p className="text-[10px] text-muted-foreground">Response Rate</p><p className="text-lg font-bold">{stats.respRate}%</p></Card>
        <Card className="p-3"><p className="text-[10px] text-muted-foreground">Unread</p><p className="text-lg font-bold text-primary">{stats.unread}</p></Card>
      </div>

      {/* Filters */}
      <Card className="p-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
        <div className="flex-1 relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search mobile, name, response..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-9 text-xs" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 text-xs sm:w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="needs_attention">Needs Attention</SelectItem>
            <SelectItem value="reviewed">Reviewed</SelectItem>
            <SelectItem value="replied">Replied</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="ignored">Ignored</SelectItem>
          </SelectContent>
        </Select>
        <Select value={minRating} onValueChange={setMinRating}>
          <SelectTrigger className="h-9 text-xs sm:w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Ratings</SelectItem>
            <SelectItem value="1">≥ 1★</SelectItem>
            <SelectItem value="2">≥ 2★</SelectItem>
            <SelectItem value="3">≥ 3★</SelectItem>
            <SelectItem value="4">≥ 4★</SelectItem>
            <SelectItem value="5">= 5★</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={fetchAll} className="h-9"><RefreshCw className="w-3.5 h-3.5" /></Button>
        <Button variant="outline" size="sm" onClick={doExport} className="h-9 text-xs"><Download className="w-3 h-3 mr-1" />CSV</Button>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-xs text-muted-foreground">No feedback yet. Share your Feedback QR to start collecting responses.</Card>
      ) : (
        <div className="space-y-2">
          {filtered.map(s => {
            const branch = branches.find(b => b.id === s.branch_id);
            return (
              <Card key={s.id} className="p-3 cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setDetail(s); setReplyText(''); }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{s.customer_name || s.customer_mobile}</span>
                      <span className="text-[10px] text-muted-foreground">{s.customer_mobile}</span>
                      {s.overall_rating != null && (
                        <span className="text-[11px] flex items-center gap-0.5 font-semibold">
                          <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />{s.overall_rating}
                        </span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[s.status] || 'bg-muted'}`}>{s.status.replace('_', ' ')}</span>
                      {isAllBranchesView && branch && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">{branch.name}</span>}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">{new Date(s.submitted_at).toLocaleString()}</p>
                    {/* First two responses */}
                    <div className="mt-1 text-xs text-foreground/80 line-clamp-2">
                      {fields.slice(0, 2).map(f => s.responses?.[f.field_key] != null && (
                        <span key={f.field_key} className="mr-2">
                          <span className="text-muted-foreground">{f.label}:</span> {Array.isArray(s.responses[f.field_key]) ? s.responses[f.field_key].join(', ') : String(s.responses[f.field_key])}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!detail} onOpenChange={v => !v && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Feedback Details</DialogTitle></DialogHeader>
          {detail && (
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap gap-2 items-center">
                <span className="font-semibold">{detail.customer_name || 'Anonymous'}</span>
                <span className="text-xs text-muted-foreground">+91 {detail.customer_mobile}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[detail.status] || 'bg-muted'}`}>{detail.status.replace('_', ' ')}</span>
              </div>
              <div className="text-[11px] text-muted-foreground">{new Date(detail.submitted_at).toLocaleString()}</div>
              {detail.overall_rating != null && (
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(n => (
                    <Star key={n} className={`w-4 h-4 ${n <= (detail.overall_rating || 0) ? 'text-yellow-500 fill-yellow-500' : 'text-muted-foreground/30'}`} />
                  ))}
                </div>
              )}
              <div className="space-y-1.5">
                {fields.map(f => {
                  const val = detail.responses?.[f.field_key];
                  if (val == null || val === '') return null;
                  return (
                    <div key={f.field_key} className="text-xs">
                      <span className="text-muted-foreground">{f.label}:</span>{' '}
                      <span className="font-medium">{Array.isArray(val) ? val.join(', ') : String(val)}</span>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t space-y-2">
                <label className="text-xs font-medium">Reply via WhatsApp</label>
                {replyTemplates.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {replyTemplates.map((t, i) => (
                      <Button key={i} type="button" variant="outline" size="sm" className="h-7 text-[10px]" onClick={() => setReplyText(t)}>
                        Template {i + 1}
                      </Button>
                    ))}
                  </div>
                )}
                <Textarea
                  rows={3}
                  placeholder="Hi {name}, thanks for your feedback at {shop}..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                />
                <Button size="sm" className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={() => {
                  if (!replyText.trim()) { toast({ title: 'Type a reply first', variant: 'destructive' }); return; }
                  sendWhatsApp(detail, replyText);
                }}>
                  <MessageSquare className="w-3.5 h-3.5 mr-1" /> Send on WhatsApp
                </Button>
              </div>

              <div className="pt-2 border-t space-y-2">
                <label className="text-xs font-medium">Change Status</label>
                <div className="flex flex-wrap gap-1">
                  {['reviewed', 'resolved', 'ignored'].map(st => (
                    <Button key={st} size="sm" variant="outline" className="h-7 text-[10px] capitalize" onClick={() => updateStatus(detail.id, st)}>
                      {st}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            {detail && (
              <Button variant="destructive" size="sm" onClick={() => deleteSubmission(detail.id)}>
                <Trash2 className="w-3.5 h-3.5 mr-1" />Delete
              </Button>
            )}
            <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CRMFeedbackTab;
