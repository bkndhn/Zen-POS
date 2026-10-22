import { useState } from 'react';
import { ChefHat, Usb } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { kitchenPrinter } from '@/utils/kitchenPrinter';
import { buildKOTBytes } from '@/utils/kotGenerator';
import { getKitchenSlipEnabled, setKitchenSlipEnabled } from '@/utils/kitchenSlip';

export function KitchenPrinterControls() {
  const [config, setConfig] = useState(kitchenPrinter.getConfig);
  const [slipOn, setSlipOn] = useState(getKitchenSlipEnabled);
  const [busy, setBusy] = useState(false);
  const refresh = () => setConfig(kitchenPrinter.getConfig());
  const supported = kitchenPrinter.isSupported();

  const pair = async () => {
    setBusy(true);
    try {
      const res = await kitchenPrinter.pair(config?.width || '58mm');
      if (res.ok) toast.success(`Kitchen printer ready: ${res.name}`);
      else toast.error(res.error || 'Kitchen printer not added');
    } finally { setBusy(false); refresh(); }
  };

  const test = async () => {
    setBusy(true);
    try {
      const bytes = buildKOTBytes('kitchen', [{ name: 'Test item', quantity: 1 }], { billNo: 'TEST', printerWidth: config?.width || '58mm' });
      if (await kitchenPrinter.print(bytes)) toast.success('Test kitchen ticket sent');
      else toast.error('Kitchen printer did not respond. Check the cable and power.');
    } finally { setBusy(false); }
  };

  const forget = async () => { await kitchenPrinter.forget(); refresh(); toast.success('Kitchen printer removed'); };

  return <section className="space-y-3 border-t border-border pt-4">
    <h4 className="text-sm font-semibold flex items-center gap-2"><ChefHat className="h-4 w-4" />Kitchen printer (USB)</h4>
    <p className="text-xs text-muted-foreground">A second printer for the kitchen. The kitchen ticket prints at the same time as the customer bill.</p>
    <div className="flex items-center justify-between gap-3 rounded-md bg-muted p-3">
      <div className="min-w-0"><div className="text-sm font-medium">Kitchen ticket on customer bill</div><div className="text-xs text-muted-foreground">Prints the kitchen details under the bill so the cashier can check them.</div></div>
      <Switch checked={slipOn} onCheckedChange={v => { setKitchenSlipEnabled(v); setSlipOn(v); }} aria-label="Kitchen ticket on customer bill" />
    </div>
    {!supported ? <p className="text-xs rounded-md bg-muted p-3">This screen can't use USB printers. Use Chrome on a computer, or on an Android tablet with an OTG cable. In the installed app, set the kitchen to a Bluetooth printer under station printers instead.</p>
    : !config ? <Button variant="outline" size="sm" onClick={pair} disabled={busy}><Usb className="h-4 w-4 mr-2" />Add kitchen USB printer</Button>
    : <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-md bg-muted p-3">
        <div className="min-w-0"><div className="text-sm font-medium truncate">{config.name}</div><div className="text-xs text-muted-foreground">{config.enabled ? 'Kitchen tickets print here' : 'Turned off'}</div></div>
        <Switch checked={config.enabled} onCheckedChange={v => { kitchenPrinter.setEnabled(v); refresh(); }} aria-label="Use kitchen printer" />
      </div>
      <div className="grid grid-cols-2 gap-3 items-end">
        <div className="space-y-1"><Label className="text-xs">Kitchen paper</Label>
          <Select value={config.width} onValueChange={v => { kitchenPrinter.setWidth(v as '58mm' | '80mm'); refresh(); }}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="58mm">58 mm</SelectItem><SelectItem value="80mm">80 mm</SelectItem></SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={test} disabled={busy}>Print test ticket</Button>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={pair} disabled={busy}>Change printer</Button>
        <Button size="sm" variant="ghost" onClick={forget} disabled={busy}>Remove</Button>
      </div>
    </div>}
  </section>;
}
