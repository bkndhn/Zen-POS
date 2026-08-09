import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CustomItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (item: { name: string; price: number }) => void;
}

export const CustomItemDialog: React.FC<CustomItemDialogProps> = ({ open, onOpenChange, onAdd }) => {
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');

  const handleAdd = () => {
    if (!name.trim() || !price || isNaN(Number(price))) return;
    onAdd({ name: name.trim(), price: Number(price) });
    setName('');
    setPrice('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Add Custom Item</DialogTitle>
          <DialogDescription>Add a one-time item to the cart that is not on the menu.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Item Name</Label>
            <Input 
              placeholder="e.g. Special Fruit Platter" 
              value={name} 
              onChange={e => setName(e.target.value)} 
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>Price (₹)</Label>
            <Input 
              type="number" 
              placeholder="0.00" 
              value={price} 
              onChange={e => setPrice(e.target.value)} 
              onKeyDown={e => e.key === 'Enter' && handleAdd()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleAdd} disabled={!name.trim() || !price || isNaN(Number(price))}>Add to Cart</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
