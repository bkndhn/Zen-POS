import { useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { printerManager } from '@/utils/printerManager';
import { buildAlignmentTicket, getReceiptCalibration, normalizeCalibration, saveReceiptCalibration, type ReceiptCalibration } from '@/utils/receiptCalibration';

export function ReceiptCalibrationControls() {
  const [value, setValue] = useState(getReceiptCalibration);
  const [printing, setPrinting] = useState(false);
  const update = (patch: Partial<ReceiptCalibration>) => {
    const next = normalizeCalibration({ ...value, ...patch });
    try { saveReceiptCalibration(next); setValue(next); }
    catch { toast.error('Paper settings could not be saved on this device'); }
  };
  const test = async () => {
    setPrinting(true);
    try {
      const ok = await printerManager.printRawBytes(buildAlignmentTicket(value));
      if (ok) toast.success('Alignment ticket sent — check both edges and footer');
      else toast.error('Ticket was not sent. Connect the printer first.');
    } catch { toast.error('Printer did not accept the alignment ticket'); }
    finally { setPrinting(false); }
  };
  return <section className="space-y-3 border-t border-border pt-4">
    <h4 className="text-sm font-semibold">Paper & alignment</h4>
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1"><Label>Paper width</Label><Select value={value.width} onValueChange={width => update({ width: width === '80mm' ? '80mm' : '58mm' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="58mm">58 mm</SelectItem><SelectItem value="80mm">80 mm</SelectItem></SelectContent></Select></div>
      <div className="space-y-1"><Label>Cutter</Label><Select value={value.cutMode} onValueChange={cutMode => update({ cutMode: cutMode === 'none' || cutMode === 'partial' ? cutMode : 'full' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Tear by hand</SelectItem><SelectItem value="partial">Partial cut</SelectItem><SelectItem value="full">Full cut</SelectItem></SelectContent></Select></div>
      <div className="space-y-1"><Label htmlFor="receipt-margin">Left margin (0–4)</Label><Input id="receipt-margin" type="number" min={0} max={4} value={value.leftMarginChars} onChange={e => update({ leftMarginChars: Number(e.target.value) })} /></div>
      <div className="space-y-1"><Label htmlFor="receipt-feed">Feed lines (1–8)</Label><Input id="receipt-feed" type="number" min={1} max={8} value={value.feedLines} onChange={e => update({ feedLines: Number(e.target.value) })} /></div>
    </div>
    <Button variant="outline" className="w-full" disabled={printing} onClick={test}><Printer className="mr-2 h-4 w-4" />{printing ? 'Sending…' : 'Print alignment ticket'}</Button>
  </section>;
}