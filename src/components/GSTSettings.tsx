import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useBranch } from '@/contexts/BranchContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Receipt, Plus, Edit, Trash2, Shield, Info, Percent } from 'lucide-react';
import { isValidGSTIN } from '@/utils/gstCalculator';

interface TaxRate {
    id: string;
    name: string;
    rate: number;
    cess_rate: number;
    hsn_code: string | null;
    is_active: boolean;
}

// Default tax rates for India
const DEFAULT_TAX_RATES = [
    { name: 'Exempt', rate: 0, cess_rate: 0 },
    { name: 'GST 5%', rate: 5, cess_rate: 0 },
    { name: 'GST 12%', rate: 12, cess_rate: 0 },
    { name: 'GST 18%', rate: 18, cess_rate: 0 },
    { name: 'GST 28%', rate: 28, cess_rate: 0 },
];

export const GSTSettings: React.FC = () => {
    const { profile } = useAuth();
    const { operatingBranchId, branches, isAllBranchesView } = useBranch();
    const mainBranchId = branches.find(b => b.is_main)?.id || null;
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // GST master settings
    const [gstEnabled, setGstEnabled] = useState(false);
    const [gstin, setGstin] = useState('');
    const [isComposition, setIsComposition] = useState(false);
    const [compositionRate, setCompositionRate] = useState(1);

    // Tax rates
    const [taxRates, setTaxRates] = useState<TaxRate[]>([]);
    const [taxRateDialogOpen, setTaxRateDialogOpen] = useState(false);
    const [editingTaxRate, setEditingTaxRate] = useState<TaxRate | null>(null);
    const [taxRateForm, setTaxRateForm] = useState({ name: '', rate: '', cess_rate: '0', hsn_code: '' });
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

    const [adminAuthId, setAdminAuthId] = useState<string | null>(null);

    useEffect(() => {
        const resolveAdminAuthId = async () => {
            if (!profile) return;
            if (profile.role === 'admin' || profile.role === 'super_admin') {
                setAdminAuthId(profile.user_id);
            } else if (profile.role === 'user' && profile.admin_id) {
                const { data } = await supabase
                    .from('profiles')
                    .select('user_id')
                    .eq('id', profile.admin_id)
                    .single();
                if (data?.user_id) {
                    setAdminAuthId(data.user_id);
                }
            }
        };
        resolveAdminAuthId();
    }, [profile]);

    useEffect(() => {
        if (adminAuthId && operatingBranchId) {
            setLoading(true);
            fetchSettings();
            fetchTaxRates();
        }
    }, [adminAuthId, operatingBranchId]);

    const fetchSettings = async () => {
        if (!adminAuthId) return;
        try {
            let { data } = await (supabase as any)
                .from('shop_settings')
                .select('gst_enabled, gstin, is_composition_scheme, composition_rate')
                .eq('user_id', adminAuthId)
                .eq('branch_id', operatingBranchId)
                .maybeSingle();
            if (!data && mainBranchId && mainBranchId !== operatingBranchId) {
                const { data: mainRow } = await (supabase as any)
                    .from('shop_settings')
                    .select('gst_enabled, gstin, is_composition_scheme, composition_rate')
                    .eq('user_id', adminAuthId)
                    .eq('branch_id', mainBranchId)
                    .maybeSingle();
                data = mainRow;
            }

            if (data) {
                setGstEnabled(data.gst_enabled || false);
                setGstin(data.gstin || '');
                setIsComposition(data.is_composition_scheme || false);
                setCompositionRate(data.composition_rate || 1);
            }
        } catch (e) {
            // silent
        } finally {
            setLoading(false);
        }
    };

    const fetchTaxRates = async () => {
        if (!adminAuthId) return;
        try {
            let query = (supabase as any)
                .from('tax_rates')
                .select('*')
                .eq('admin_id', adminAuthId);

            // Scope to current branch + legacy rows (null branch_id)
            if (operatingBranchId) {
                query = query.or(`branch_id.eq.${operatingBranchId},branch_id.is.null`);
            }

            const { data } = await query.order('rate', { ascending: true });

            if (data) setTaxRates(data);
        } catch (e) {
            // silent
        }
    };

    const handleSaveSettings = async () => {
        if (!profile?.user_id) return;

        // Validate GSTIN if provided
        if (gstin && !isValidGSTIN(gstin)) {
            toast({ title: 'Invalid GSTIN', description: 'Please enter a valid 15-character GSTIN', variant: 'destructive' });
            return;
        }

        if (!operatingBranchId) {
            toast({ title: 'No branch selected', variant: 'destructive' });
            return;
        }
        setSaving(true);
        try {
            const payload = {
                gst_enabled: gstEnabled,
                gstin: gstin.trim().toUpperCase() || null,
                is_composition_scheme: isComposition,
                composition_rate: compositionRate,
                updated_at: new Date().toISOString()
            };
            const { data: existing } = await (supabase as any)
                .from('shop_settings')
                .select('id')
                .eq('user_id', adminAuthId)
                .eq('branch_id', operatingBranchId)
                .maybeSingle();
            const { error } = existing?.id
                ? await (supabase as any).from('shop_settings').update(payload).eq('id', existing.id)
                : await (supabase as any).from('shop_settings').insert({ ...payload, user_id: adminAuthId, branch_id: operatingBranchId });

            if (error) throw error;

            // Also mirror GST details onto the branch row
            await supabase.from('branches').update({
                gstin: gstEnabled ? (gstin.trim().toUpperCase() || null) : null,
                gst_enabled: gstEnabled,
                is_composition_scheme: gstEnabled ? isComposition : null,
                composition_rate: gstEnabled ? compositionRate : null
            }).eq('id', operatingBranchId);

            // Update local cache
            const headerKey = operatingBranchId ? `hotel_pos_bill_header_${operatingBranchId}` : 'hotel_pos_bill_header';
            const existingCache = localStorage.getItem(headerKey) ?? localStorage.getItem('hotel_pos_bill_header');
            if (existingCache) {
                const parsed = JSON.parse(existingCache);
                parsed.gstEnabled = gstEnabled;
                parsed.gstin = gstin.trim().toUpperCase();
                parsed.isComposition = isComposition;
                parsed.compositionRate = compositionRate;
                localStorage.setItem(headerKey, JSON.stringify(parsed));
            }

            // Seed default tax rates on first enable
            if (gstEnabled && taxRates.length === 0 && adminAuthId) {
                await seedDefaultTaxRates();
            }

            toast({ title: 'GST Settings Saved', description: gstEnabled ? 'GST is now enabled for your bills' : 'GST has been disabled' });
        } catch (e) {
            toast({ title: 'Error', description: 'Failed to save GST settings', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    };

    const seedDefaultTaxRates = async () => {
        if (!adminAuthId) return;
        try {
            const rows = DEFAULT_TAX_RATES.map(r => ({
                admin_id: adminAuthId,
                branch_id: operatingBranchId || null,
                name: r.name,
                rate: r.rate,
                cess_rate: r.cess_rate,
                is_active: true
            }));

            await (supabase as any).from('tax_rates').insert(rows);
            await fetchTaxRates();
        } catch (e) {
            // silent
        }
    };

    const handleSaveTaxRate = async () => {
        if (!adminAuthId) return;
        if (!taxRateForm.name.trim()) {
            toast({ title: 'Name required', variant: 'destructive' });
            return;
        }

        const rate = parseFloat(taxRateForm.rate);
        if (isNaN(rate) || rate < 0 || rate > 100) {
            toast({ title: 'Invalid rate', description: 'Enter a rate between 0 and 100', variant: 'destructive' });
            return;
        }

        try {
            const payload = {
                admin_id: adminAuthId,
                branch_id: operatingBranchId || null,
                name: taxRateForm.name.trim(),
                rate,
                cess_rate: parseFloat(taxRateForm.cess_rate) || 0,
                hsn_code: taxRateForm.hsn_code.trim() || null,
                is_active: true
            };

            if (editingTaxRate) {
                await (supabase as any).from('tax_rates').update(payload).eq('id', editingTaxRate.id);
            } else {
                await (supabase as any).from('tax_rates').insert(payload);
            }

            setTaxRateDialogOpen(false);
            setEditingTaxRate(null);
            setTaxRateForm({ name: '', rate: '', cess_rate: '0', hsn_code: '' });
            await fetchTaxRates();
            toast({ title: editingTaxRate ? 'Tax Rate Updated' : 'Tax Rate Added' });
        } catch (e) {
            toast({ title: 'Error', description: 'Failed to save tax rate', variant: 'destructive' });
        }
    };

    const handleDeleteTaxRate = async (id: string) => {
        try {
            await (supabase as any).from('tax_rates').delete().eq('id', id);
            setDeleteConfirmId(null);
            await fetchTaxRates();
            toast({ title: 'Tax Rate Deleted' });
        } catch (e) {
            toast({ title: 'Error', description: 'Cannot delete — may be in use by items', variant: 'destructive' });
        }
    };

    const openEditDialog = (rate: TaxRate) => {
        setEditingTaxRate(rate);
        setTaxRateForm({
            name: rate.name,
            rate: String(rate.rate),
            cess_rate: String(rate.cess_rate),
            hsn_code: rate.hsn_code || ''
        });
        setTaxRateDialogOpen(true);
    };

    const openAddDialog = () => {
        setEditingTaxRate(null);
        setTaxRateForm({ name: '', rate: '', cess_rate: '0', hsn_code: '' });
        setTaxRateDialogOpen(true);
    };

    if (loading) return <div className="animate-pulse h-32 bg-muted rounded-lg" />;

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Receipt className="w-5 h-5 text-orange-600" />
                        GST / Tax Settings
                    </CardTitle>
                    <CardDescription>Configure GST for your bills and invoices</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    {/* Master Toggle */}
                    <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border">
                        <div className="space-y-0.5">
                            <Label htmlFor="gst-master" className="text-sm font-medium">Enable GST</Label>
                            <p className="text-xs text-muted-foreground">
                                Show tax details on bills, receipts, and reports
                            </p>
                        </div>
                        <Switch id="gst-master" checked={gstEnabled} onCheckedChange={setGstEnabled} />
                    </div>

                    {gstEnabled && (
                        <>
                            {/* GSTIN */}
                            <div className="space-y-2">
                                <Label htmlFor="gstin" className="text-sm font-medium flex items-center gap-1.5">
                                    <Shield className="w-3.5 h-3.5" /> GSTIN (GST Number)
                                </Label>
                                <Input
                                    id="gstin"
                                    placeholder="e.g., 33AABCT1234Z1Z5"
                                    value={gstin}
                                    onChange={e => setGstin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15))}
                                    maxLength={15}
                                    className="font-mono tracking-wider"
                                />
                                {gstin && !isValidGSTIN(gstin) && (
                                    <p className="text-xs text-destructive">Invalid GSTIN format</p>
                                )}
                                {gstin && isValidGSTIN(gstin) && (
                                    <p className="text-xs text-green-600">✓ Valid GSTIN</p>
                                )}
                            </div>

                            {/* Composition Scheme */}
                            <div className="p-4 rounded-lg border space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-sm font-medium flex items-center gap-1.5">
                                            Composition Scheme
                                        </Label>
                                        <p className="text-xs text-muted-foreground">
                                            For turnover under ₹1.5 Cr — flat tax rate, no CGST/SGST split
                                        </p>
                                    </div>
                                    <Switch checked={isComposition} onCheckedChange={setIsComposition} />
                                </div>
                                {isComposition && (
                                    <div className="flex items-center gap-3 pt-2 border-t">
                                        <Label className="text-sm whitespace-nowrap">Flat Rate:</Label>
                                        <div className="flex items-center gap-1">
                                            <Input
                                                type="number"
                                                value={compositionRate}
                                                onChange={e => setCompositionRate(Math.max(0, Math.min(10, parseFloat(e.target.value) || 0)))}
                                                className="w-20 text-center"
                                                min={0}
                                                max={10}
                                                step={0.5}
                                            />
                                            <Percent className="w-4 h-4 text-muted-foreground" />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Tax Rates */}
                            {!isComposition && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-sm font-medium flex items-center gap-1.5">
                                            <Percent className="w-3.5 h-3.5" /> Tax Rates
                                        </Label>
                                        <Button size="sm" variant="outline" onClick={openAddDialog} className="h-8 gap-1">
                                            <Plus className="w-3.5 h-3.5" /> Add Rate
                                        </Button>
                                    </div>

                                    {taxRates.length === 0 && (
                                        <div className="text-center py-6 text-muted-foreground text-sm">
                                            <Info className="w-8 h-8 mx-auto mb-2 opacity-40" />
                                            No tax rates configured.<br />
                                            Save settings to auto-create default Indian GST rates.
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        {taxRates.map(rate => (
                                            <div
                                                key={rate.id}
                                                className="flex items-center justify-between p-3 bg-muted/30 rounded-lg border"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${rate.rate === 0 ? 'bg-gray-100 text-gray-600' :
                                                            rate.rate <= 5 ? 'bg-green-100 text-green-700' :
                                                                rate.rate <= 12 ? 'bg-blue-100 text-blue-700' :
                                                                    rate.rate <= 18 ? 'bg-orange-100 text-orange-700' :
                                                                        'bg-red-100 text-red-700'
                                                        }`}>
                                                        {rate.rate}%
                                                    </div>
                                                    <div>
                                                        <span className="font-medium text-sm">{rate.name}</span>
                                                        {rate.cess_rate > 0 && (
                                                            <Badge variant="outline" className="ml-2 text-[9px] h-4">
                                                                +{rate.cess_rate}% cess
                                                            </Badge>
                                                        )}
                                                        {rate.hsn_code && (
                                                            <span className="text-[10px] text-muted-foreground ml-2">HSN: {rate.hsn_code}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditDialog(rate)}>
                                                        <Edit className="w-3.5 h-3.5" />
                                                    </Button>
                                                    {deleteConfirmId === rate.id ? (
                                                        <div className="flex gap-1">
                                                            <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => handleDeleteTaxRate(rate.id)}>
                                                                Yes
                                                            </Button>
                                                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDeleteConfirmId(null)}>
                                                                No
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => setDeleteConfirmId(rate.id)}>
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    <Button onClick={handleSaveSettings} disabled={saving || isAllBranchesView} className="w-full sm:w-auto">
                        {saving ? 'Saving...' : 'Save GST Settings'}
                    </Button>
                </CardContent>
            </Card>

            {/* Add/Edit Tax Rate Dialog */}
            <Dialog open={taxRateDialogOpen} onOpenChange={setTaxRateDialogOpen}>
                <DialogContent className="max-w-[90vw] sm:max-w-md bg-background text-foreground">
                    <DialogHeader>
                        <DialogTitle>{editingTaxRate ? 'Edit Tax Rate' : 'Add Tax Rate'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Name *</Label>
                            <Input
                                placeholder="e.g., GST 5%"
                                value={taxRateForm.name}
                                onChange={e => setTaxRateForm(f => ({ ...f, name: e.target.value }))}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label>Tax Rate (%) *</Label>
                                <Input
                                    type="number"
                                    placeholder="5"
                                    value={taxRateForm.rate}
                                    onChange={e => setTaxRateForm(f => ({ ...f, rate: e.target.value }))}
                                    min={0}
                                    max={100}
                                    step={0.1}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Cess Rate (%)</Label>
                                <Input
                                    type="number"
                                    placeholder="0"
                                    value={taxRateForm.cess_rate}
                                    onChange={e => setTaxRateForm(f => ({ ...f, cess_rate: e.target.value }))}
                                    min={0}
                                    max={100}
                                    step={0.1}
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Default HSN Code (optional)</Label>
                            <Input
                                placeholder="e.g., 9963"
                                value={taxRateForm.hsn_code}
                                onChange={e => setTaxRateForm(f => ({ ...f, hsn_code: e.target.value }))}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTaxRateDialogOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveTaxRate}>
                            {editingTaxRate ? 'Update' : 'Add'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
};
