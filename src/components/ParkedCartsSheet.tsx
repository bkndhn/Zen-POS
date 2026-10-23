import { useState } from 'react';
import { Clock, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatINR } from '@/utils/formatters';
import { MAX_PARKED, minutesAgo, type ParkedCart } from '@/utils/parkedCarts';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  parked: ParkedCart[];
  currentCount: number;
  onPark: (note: string) => void;
  onRecall: (id: string) => void;
  onDelete: (id: string) => void;
}

export function ParkedCartsSheet({ open, onOpenChange, parked, currentCount, onPark, onRecall, onDelete }: Props) {
  const [note, setNote] = useState('');
  const full = parked.length >= MAX_PARKED;

  const park = () => {
    onPark(note);
    setNote('');
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md flex flex-col gap-4">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><PauseCircle className="h-5 w-5 text-primary" /> Parked bills</SheetTitle>
          <SheetDescription>Hold up to {MAX_PARKED} bills on this device and bring any one back later.</SheetDescription>
        </SheetHeader>

        {currentCount > 0 && (
          <div className="rounded-xl border bg-muted/40 p-3 space-y-2">
            <p className="text-sm font-medium">Park the current bill ({currentCount} item{currentCount === 1 ? '' : 's'})</p>
            <div className="flex gap-2">
              <Input
                aria-label="Name for parked bill"
                value={note}
                maxLength={40}
                placeholder="Name, table or phone (optional)"
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); park(); } }}
              />
              <Button onClick={park} disabled={full}>Park</Button>
            </div>
            {full && <p className="text-xs text-destructive">All {MAX_PARKED} slots are used. Recall or delete one first.</p>}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-2 -mx-1 px-1">
          {parked.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">No parked bills. Press F8 or tap Park to hold a bill.</p>
          ) : parked.map((p, idx) => (
            <div key={p.id} className="rounded-xl border bg-card p-3 flex items-center gap-3 animate-fade-in">
              <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-sm font-bold shrink-0">{idx + 1}</div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">{p.note || `Bill ${idx + 1}`}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {minutesAgo(p.parkedAt)} · {p.items.length} item{p.items.length === 1 ? '' : 's'}
                </p>
              </div>
              <span className="font-mono font-semibold text-sm shrink-0">{formatINR(p.total)}</span>
              <Button size="icon" variant="ghost" aria-label={`Delete ${p.note || `bill ${idx + 1}`}`} onClick={() => onDelete(p.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
              <Button size="sm" onClick={() => onRecall(p.id)} aria-label={`Recall ${p.note || `bill ${idx + 1}`}`}>
                <PlayCircle className="h-4 w-4 mr-1" /> Recall
              </Button>
            </div>
          ))}
        </div>
        {currentCount > 0 && parked.length > 0 && (
          <p className="text-xs text-muted-foreground">Recalling a bill parks the current one automatically, so nothing is lost.</p>
        )}
      </SheetContent>
    </Sheet>
  );
}
