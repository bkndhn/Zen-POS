import React, { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileUp, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import Papa from 'papaparse';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface BulkAddItemDialogProps {
  branchId: string | null;
  adminId: string;
  onItemsAdded: () => void;
  disabled?: boolean;
}

interface ParsedItem {
  id: number;
  rowNumber: number;
  data: any;
  isValid: boolean;
  errors: string[];
}

export const BulkAddItemDialog: React.FC<BulkAddItemDialogProps> = ({ branchId, adminId, onItemsAdded, disabled }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const EXPECTED_HEADERS = [
    'name', 'price', 'category', 'description', 
    'purchase_rate', 'unit', 'inventory_unit', 'base_value', 
    'stock_quantity', 'minimum_stock_alert', 'quantity_step', 
    'price_zomato', 'price_swiggy'
  ];

  const handleDownloadTemplate = () => {
    const csvContent = EXPECTED_HEADERS.join(',') + '\n' +
      '"Sample Item",100,"Main Course","Delicious meal",80,"piece","piece",1,50,5,1,120,130\n';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'bulk_item_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const items: ParsedItem[] = results.data.map((row: any, index: number) => {
          const errors: string[] = [];
          
          // Validation
          if (!row.name || row.name.trim() === '') errors.push("Name is required");
          
          const price = parseFloat(row.price);
          if (isNaN(price) || price < 0) errors.push("Valid price is required");

          const isValid = errors.length === 0;

          return {
            id: index,
            rowNumber: index + 2, // Excel rows are 1-indexed and header is row 1
            data: row,
            isValid,
            errors
          };
        });

        setParsedItems(items);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: (error: any) => {
        toast({
          title: "Error Parsing File",
          description: error.message,
          variant: "destructive"
        });
      }
    });
  };

  const handleUploadToDB = async () => {
    const validItems = parsedItems.filter(i => i.isValid);
    if (validItems.length === 0) {
      toast({ title: "No Valid Items", description: "Please fix errors before uploading.", variant: "destructive" });
      return;
    }

    setLoading(true);

    try {
      const recordsToInsert = validItems.map(item => {
        const row = item.data;
        return {
          admin_id: adminId,
          branch_id: branchId,
          name: row.name.trim(),
          price: parseFloat(row.price),
          category: row.category?.trim() || null,
          description: row.description?.trim() || null,
          purchase_rate: row.purchase_rate ? parseFloat(row.purchase_rate) : null,
          unit: row.unit?.trim() || 'piece',
          inventory_unit: row.inventory_unit?.trim() || row.unit?.trim() || 'piece',
          base_value: row.base_value ? parseFloat(row.base_value) : 1,
          stock_quantity: row.stock_quantity ? parseFloat(row.stock_quantity) : null,
          minimum_stock_alert: row.minimum_stock_alert ? parseFloat(row.minimum_stock_alert) : null,
          quantity_step: row.quantity_step ? parseFloat(row.quantity_step) : 1,
          price_zomato: row.price_zomato ? parseFloat(row.price_zomato) : null,
          price_swiggy: row.price_swiggy ? parseFloat(row.price_swiggy) : null,
          is_active: true
        };
      });

      // Supabase has a limit on inserts, batching 100 at a time is safe.
      const BATCH_SIZE = 100;
      for (let i = 0; i < recordsToInsert.length; i += BATCH_SIZE) {
        const batch = recordsToInsert.slice(i, i + BATCH_SIZE);
        const { error } = await supabase.from('items').insert(batch);
        if (error) throw error;
      }

      toast({
        title: "Success",
        description: `Successfully added ${validItems.length} items.`
      });
      setOpen(false);
      setParsedItems([]);
      onItemsAdded();
    } catch (error: any) {
      console.error("Bulk insert error:", error);
      toast({
        title: "Database Error",
        description: error.message || "Failed to insert items",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setParsedItems([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const validCount = parsedItems.filter(i => i.isValid).length;
  const errorCount = parsedItems.filter(i => !i.isValid).length;

  return (
    <Dialog open={open} onOpenChange={(val) => {
      setOpen(val);
      if (!val) reset();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="h-9 px-3 text-xs flex items-center gap-2 border-dashed bg-muted/20" disabled={disabled}>
          <FileUp className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Bulk Add</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Bulk Add Items (Excel / CSV)</DialogTitle>
          <DialogDescription>
            Download the template, fill it out, and upload it back here.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col flex-1 overflow-hidden">
          {parsedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl border-muted-foreground/20 bg-muted/10 gap-4 mt-4">
              <div className="flex gap-4">
                <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download Template
                </Button>
                <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <FileUp className="w-4 h-4" />
                  Upload Filled CSV
                </Button>
              </div>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <p className="text-xs text-muted-foreground max-w-sm text-center">
                Only CSV files are supported. You can save your Excel file as a CSV (Comma Delimited) file.
              </p>
            </div>
          ) : (
            <div className="flex flex-col h-full mt-4 min-h-[300px]">
              <div className="flex items-center justify-between mb-2 shrink-0">
                <div className="flex gap-4 text-sm font-medium">
                  <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-4 h-4" /> {validCount} Valid</span>
                  {errorCount > 0 && (
                    <span className="text-red-600 flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {errorCount} Errors</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={reset}>Cancel</Button>
                  <Button size="sm" onClick={handleUploadToDB} disabled={loading || validCount === 0}>
                    {loading ? 'Uploading...' : `Upload ${validCount} Items`}
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[50px]">Row</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedItems.map((item) => (
                      <TableRow key={item.id} className={item.isValid ? '' : 'bg-red-50/50 dark:bg-red-950/20'}>
                        <TableCell className="font-mono text-xs">{item.rowNumber}</TableCell>
                        <TableCell>
                          {item.isValid ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Valid</Badge>
                          ) : (
                            <Badge variant="destructive">Error</Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{item.data.name || '-'}</TableCell>
                        <TableCell>₹{item.data.price || '-'}</TableCell>
                        <TableCell>{item.data.category || '-'}</TableCell>
                        <TableCell className="text-xs text-red-600 font-medium">
                          {item.errors.join(', ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
