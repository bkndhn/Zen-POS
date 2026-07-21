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
import { FileUp, Download, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { validateAndNormalizeQuickChips } from '@/utils/timeUtils';

interface BulkAddItemDialogProps {
  branchId: string | null;
  adminId: string;
  categories: string[];
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

const UNIT_CATEGORIES: Record<string, string> = {
  'Piece (pc)': 'piece',
  'Box': 'piece',
  'Pack': 'piece',
  'Cup': 'piece',
  'Glass': 'piece',
  'Plate': 'piece',
  'Kilogram (kg)': 'weight',
  'Gram (g)': 'weight',
  'Liter (l)': 'volume',
  'Milliliter (ml)': 'volume'
};
const ALLOWED_UNITS = Object.keys(UNIT_CATEGORIES);

const EXPIRY_MODES = ['none', 'optional', 'mandatory'];
const QUICK_CHIPS_MODES = ['qty', 'amount'];

export const BulkAddItemDialog: React.FC<BulkAddItemDialogProps> = ({ branchId, adminId, categories = [], onItemsAdded, disabled }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const EXPECTED_HEADERS = [
    { header: 'NAME*', key: 'name', width: 25 },
    { header: 'PRICE*', key: 'price', width: 12 },
    { header: 'CATEGORY', key: 'category', width: 20 },
    { header: 'SELLING QTY*', key: 'selling_quantity', width: 15 },
    { header: 'SELLING UNIT*', key: 'selling_unit', width: 18 },
    { header: 'INVENTORY QTY*', key: 'inventory_quantity', width: 18 },
    { header: 'INVENTORY UNIT*', key: 'inventory_unit', width: 20 },
    { header: 'STOCK (Leave blank for Unlimited)', key: 'stock_quantity', width: 35 },
    { header: 'MIN STOCK ALERT', key: 'minimum_stock_alert', width: 20 },
    { header: 'QTY STEP (e.g. 1)', key: 'quantity_step', width: 20 },
    { header: 'EXPIRY MODE', key: 'expiry_mode', width: 15 },
    { header: 'QUICK CHIPS MODE', key: 'quick_chips_mode', width: 22 },
    { header: 'QUICK CHIPS (Comma separated)', key: 'quick_chips', width: 35 },
    { header: 'ZOMATO PRICE', key: 'price_zomato', width: 18 },
    { header: 'SWIGGY PRICE', key: 'price_swiggy', width: 18 },
    { header: 'PURCHASE RATE', key: 'purchase_rate', width: 18 },
    { header: 'DESCRIPTION', key: 'description', width: 30 }
  ];

  const handleDownloadTemplate = async () => {
    try {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Bulk Items Template');

      // Setup Headers
      sheet.columns = EXPECTED_HEADERS.map(h => ({
        header: h.header,
        key: h.key,
        width: h.width
      }));

      // Style Header Row
      const headerRow = sheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FF4F46E5' } // Indigo-600
        };
        cell.font = {
          color: { argb: 'FFFFFFFF' },
          bold: true,
          size: 11
        };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      });
      headerRow.height = 30;

      // Safe categories for data validation (limit to 255 chars for Excel formula limit)
      let safeCategoriesList = categories.join(',');
      if (safeCategoriesList.length > 255) {
        // Fallback if there are too many categories to fit in inline formula
        safeCategoriesList = '';
      }

      // Add Data Validation (Dropdowns) up to 1000 rows
      for (let i = 2; i <= 1000; i++) {
        // Category
        if (safeCategoriesList) {
          sheet.getCell(`C${i}`).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [`"${safeCategoriesList}"`]
          };
        }
        // Selling Unit
        sheet.getCell(`E${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${ALLOWED_UNITS.join(',')}"`]
        };
        // Inventory Unit
        sheet.getCell(`G${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${ALLOWED_UNITS.join(',')}"`]
        };
        // Expiry Mode
        sheet.getCell(`K${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${EXPIRY_MODES.join(',')}"`]
        };
        // Quick Chips Mode
        sheet.getCell(`L${i}`).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [`"${QUICK_CHIPS_MODES.join(',')}"`]
        };
      }

      // Add a sample row
      sheet.addRow({
        name: 'Sample Item',
        price: 150,
        category: categories.length > 0 ? categories[0] : 'Main Course',
        selling_quantity: 1,
        selling_unit: 'Piece (pc)',
        inventory_quantity: 1,
        inventory_unit: 'Piece (pc)',
        stock_quantity: '',
        minimum_stock_alert: 5,
        quantity_step: 1,
        expiry_mode: 'none',
        quick_chips_mode: 'qty',
        quick_chips: '100g, 250g, 500g',
        price_zomato: 180,
        price_swiggy: 180,
        purchase_rate: 100,
        description: 'A delicious sample item.'
      });

      // Generate file and trigger download
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      saveAs(blob, 'bulk_item_template.xlsx');

    } catch (error) {
      console.error("Error generating template:", error);
      toast({ title: "Template Error", description: "Could not generate Excel template.", variant: "destructive" });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const sheet = workbook.getWorksheet(1);
      
      if (!sheet) {
        throw new Error("No worksheet found in Excel file.");
      }

      const items: ParsedItem[] = [];
      const keys = EXPECTED_HEADERS.map(h => h.key);

      sheet.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return; // Skip header

        const rowData: any = {};
        let hasAnyData = false;

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          if (colNumber <= keys.length) {
            const val = cell.value?.toString().trim() || '';
            rowData[keys[colNumber - 1]] = val;
            if (val) hasAnyData = true;
          }
        });

        if (!hasAnyData) return; // Skip completely empty rows

        const errors: string[] = [];
        
        // Validation: Required
        if (!rowData.name) errors.push("NAME* is required");
        const price = parseFloat(rowData.price);
        if (isNaN(price) || price < 0) errors.push("Valid PRICE* is required");

        // Quantity validation
        const sQty = parseFloat(rowData.selling_quantity);
        if (isNaN(sQty) || sQty <= 0) errors.push("Valid SELLING QTY* is required");
        
        const iQty = parseFloat(rowData.inventory_quantity);
        if (isNaN(iQty) || iQty <= 0) errors.push("Valid INVENTORY QTY* is required");

        // Validation: Unit Compatibility
        const unit = rowData.selling_unit || 'Piece (pc)';
        const invUnit = rowData.inventory_unit || unit;
        
        const unitCat = UNIT_CATEGORIES[unit];
        const invUnitCat = UNIT_CATEGORIES[invUnit];

        if (!unitCat) {
          errors.push(`Invalid SELLING UNIT: ${unit}`);
        } else if (!invUnitCat) {
          errors.push(`Invalid INVENTORY UNIT: ${invUnit}`);
        } else if (unitCat !== invUnitCat) {
          errors.push(`Unit mismatch! ${unit} is ${unitCat}, but ${invUnit} is ${invUnitCat}. They must be of the same type.`);
        }

        const isValid = errors.length === 0;

        items.push({
          id: Math.random(), // Unique ID for key mapping and deletion
          rowNumber,
          data: { ...rowData, selling_unit: unit, inventory_unit: invUnit, selling_quantity: isNaN(sQty) ? 1 : sQty, inventory_quantity: isNaN(iQty) ? 1 : iQty },
          isValid,
          errors
        });
      });

      setParsedItems(items);
      if (fileInputRef.current) fileInputRef.current.value = '';

    } catch (error: any) {
      toast({
        title: "Error Parsing File",
        description: error.message || "Failed to read Excel file.",
        variant: "destructive"
      });
    }
  };

  const removeParsedItem = (id: number) => {
    setParsedItems(prev => prev.filter(item => item.id !== id));
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
        const rawStock = row.stock_quantity;
        
        return {
          admin_id: adminId,
          branch_id: branchId,
          name: row.name.trim(),
          price: parseFloat(row.price),
          category: row.category?.trim() || null,
          description: row.description?.trim() || null,
          purchase_rate: row.purchase_rate ? parseFloat(row.purchase_rate) : null,
          
          selling_unit: row.selling_unit,
          selling_quantity: row.selling_quantity,
          inventory_unit: row.inventory_unit,
          inventory_quantity: row.inventory_quantity,
          
          // Legacy mappings required by schema
          unit: row.selling_unit,
          base_value: row.selling_quantity,
          
          stock_quantity: (rawStock === undefined || rawStock === null || rawStock === '') ? null : parseFloat(rawStock),
          minimum_stock_alert: row.minimum_stock_alert ? parseFloat(row.minimum_stock_alert) : null,
          quantity_step: row.quantity_step ? parseFloat(row.quantity_step) : 1,
          price_zomato: row.price_zomato ? parseFloat(row.price_zomato) : null,
          price_swiggy: row.price_swiggy ? parseFloat(row.price_swiggy) : null,
          expiry_mode: ['none', 'optional', 'mandatory'].includes(row.expiry_mode?.toLowerCase()) ? row.expiry_mode.toLowerCase() : 'none',
          quick_chips_mode: ['qty', 'amount'].includes(row.quick_chips_mode?.toLowerCase()) ? row.quick_chips_mode.toLowerCase() : 'qty',
          quick_chips: row.quick_chips ? validateAndNormalizeQuickChips(row.quick_chips) : [],
          is_active: true,
          is_saleable: true,
          unlimited_stock: (rawStock === undefined || rawStock === null || rawStock === '')
        };
      });

      // Supabase batch insert limit
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
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Bulk Add Items (Excel / XLSX)</DialogTitle>
          <DialogDescription>
            Download the styled Excel template, fill it out, and upload it back here.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col flex-1 overflow-hidden">
          {parsedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl border-muted-foreground/20 bg-muted/10 gap-4 mt-4">
              <div className="flex gap-4">
                <Button variant="outline" onClick={handleDownloadTemplate} className="gap-2">
                  <Download className="w-4 h-4" />
                  Download Excel Template
                </Button>
                <Button onClick={() => fileInputRef.current?.click()} className="gap-2">
                  <FileUp className="w-4 h-4" />
                  Upload Filled Excel
                </Button>
              </div>
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileUpload}
              />
              <p className="text-xs text-muted-foreground max-w-sm text-center">
                Only .xlsx files generated from the template are supported.
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
                      <TableHead>Selling Info</TableHead>
                      <TableHead>Inventory Info</TableHead>
                      <TableHead>Errors</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
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
                        <TableCell>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {item.data.selling_quantity} {item.data.selling_unit}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-muted-foreground whitespace-nowrap">
                            {item.data.inventory_quantity} {item.data.inventory_unit}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-red-600 font-medium whitespace-pre-wrap">
                          {item.errors.join('\n')}
                        </TableCell>
                        <TableCell>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-7 w-7 text-muted-foreground hover:text-red-600"
                            onClick={() => removeParsedItem(item.id)}
                            title="Remove item"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
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
