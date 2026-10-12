import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Check, X, AlertCircle } from 'lucide-react';
import { useLandingConfig } from '@/hooks/useLandingConfig';

type Status = 'yes' | 'partial' | 'no';

const features: { label: string; zenpos: Status; legacy: Status; legacyNote?: string; manual: Status }[] = [
  { label: '100% Offline Billing (Zero internet dependence)', zenpos: 'yes', legacy: 'partial', legacyNote: 'Partial – cloud sync fails offline', manual: 'no' },
  { label: 'No Hardware Lock-in (Phone, Tablet, PC, Thermal)', zenpos: 'yes', legacy: 'no', manual: 'no' },
  { label: 'Free AI Menu & 360° Dish Studio', zenpos: 'yes', legacy: 'no', manual: 'no' },
  { label: 'Direct WhatsApp Bills (Zero SMS fees)', zenpos: 'yes', legacy: 'partial', legacyNote: 'SMS charges apply', manual: 'no' },
  { label: 'Transparent Flat Pricing (No hidden AMC)', zenpos: 'yes', legacy: 'no', manual: 'no' },
  { label: 'GST & FSSAI Compliant Invoices', zenpos: 'yes', legacy: 'yes', manual: 'no' },
  { label: 'Kitchen Display System (KDS)', zenpos: 'yes', legacy: 'partial', legacyNote: 'Paid add-on', manual: 'no' },
  { label: 'QR Self-Ordering by Customers', zenpos: 'yes', legacy: 'partial', legacyNote: 'Extra subscription', manual: 'no' },
  { label: 'Export Bills & Data Anytime (CSV/Excel)', zenpos: 'yes', legacy: 'partial', legacyNote: 'Limited formats', manual: 'no' },
  { label: 'Single-Tenant RLS Isolation (Data Privacy)', zenpos: 'yes', legacy: 'no', manual: 'no' },
];

const StatusIcon: React.FC<{ s: Status; note?: string }> = ({ s, note }) => {
  if (s === 'yes') return <Check className="w-5 h-5 text-green-600 mx-auto" />;
  if (s === 'partial') return (
    <div className="flex flex-col items-center gap-0.5">
      <AlertCircle className="w-4 h-4 text-amber-500 mx-auto" />
      {note && <span className="text-[9px] text-amber-600 leading-tight text-center max-w-[80px]">{note}</span>}
    </div>
  );
  return <X className="w-5 h-5 text-red-500 mx-auto" />;
};

export const CompetitorComparison: React.FC = () => {
  const cfg = useLandingConfig();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? features : features.slice(0, 6);

  return (
    <section className="py-16 sm:py-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-10">
          <Badge className="mb-3" variant="outline">Why ZenPOS</Badge>
          <h2 className="text-2xl sm:text-3xl font-bold mb-3">ZenPOS vs The Competition</h2>
          <p className="text-muted-foreground">A fair comparison — no marketing fluff.</p>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-border shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50">
                <th className="text-left px-4 py-3 font-semibold text-foreground w-1/2">Feature</th>
                <th className="text-center px-3 py-3 font-bold text-primary min-w-[90px]">
                  ZenPOS
                  <div className="text-[10px] font-normal text-muted-foreground">₹{cfg.monthlyPrice}/mo</div>
                </th>
                <th className="text-center px-3 py-3 font-semibold text-foreground min-w-[90px]">
                  Petpooja / Posist
                  <div className="text-[10px] font-normal text-muted-foreground">₹3,000+/mo</div>
                </th>
                <th className="text-center px-3 py-3 font-semibold text-foreground min-w-[90px]">
                  Bill Book
                  <div className="text-[10px] font-normal text-muted-foreground">Manual</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((f, i) => (
                <tr key={f.label} className={i % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                  <td className="px-4 py-3 text-foreground font-medium">{f.label}</td>
                  <td className="px-3 py-3 text-center"><StatusIcon s={f.zenpos} /></td>
                  <td className="px-3 py-3 text-center"><StatusIcon s={f.legacy} note={f.legacyNote} /></td>
                  <td className="px-3 py-3 text-center"><StatusIcon s={f.manual} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!expanded && (
          <div className="text-center mt-4">
            <button onClick={() => setExpanded(true)} className="text-primary text-sm font-medium hover:underline">
              Show all {features.length} features ↓
            </button>
          </div>
        )}

        <div className="flex justify-center gap-6 mt-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-green-600" /> Fully Supported</span>
          <span className="flex items-center gap-1.5"><AlertCircle className="w-3.5 h-3.5 text-amber-500" /> Partial / Paid Extra</span>
          <span className="flex items-center gap-1.5"><X className="w-3.5 h-3.5 text-red-500" /> Not Available</span>
        </div>
      </div>
    </section>
  );
};
