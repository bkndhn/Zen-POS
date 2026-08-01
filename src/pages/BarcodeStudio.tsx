import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Printer, Settings, Maximize, Move } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

export default function BarcodeStudio() {
  const [labelWidth, setLabelWidth] = useState(50); // mm
  const [labelHeight, setLabelHeight] = useState(25); // mm
  const printRef = useRef<HTMLDivElement>(null);

  // Mock item for preview
  const previewItem = {
    name: "Classic Cotton T-Shirt",
    barcode: "890123456789",
    rsp: 999,
    size: "XL",
    color: "Navy Blue"
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const printContent = printRef.current.innerHTML;
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      toast({ title: 'Popup blocked', description: 'Allow popups to print barcodes.', variant: 'destructive' });
      return;
    }
    
    printWindow.document.write(`
      <html>
        <head>
          <title>Print Barcode</title>
          <style>
            @page {
              size: ${labelWidth}mm ${labelHeight}mm;
              margin: 0;
            }
            body {
              margin: 0;
              padding: 0;
              display: flex;
              justify-content: center;
              align-items: center;
              font-family: monospace;
            }
            .label-container {
              width: ${labelWidth}mm;
              height: ${labelHeight}mm;
              box-sizing: border-box;
              padding: 2mm;
              overflow: hidden;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              text-align: center;
            }
            .item-name { font-size: 10px; font-weight: bold; margin-bottom: 2px; }
            .barcode-placeholder {
              width: 80%;
              height: 10mm;
              background: repeating-linear-gradient(
                90deg,
                #000,
                #000 2px,
                #fff 2px,
                #fff 4px
              );
              margin: 2px 0;
            }
            .barcode-text { font-size: 8px; letter-spacing: 2px; }
            .price { font-size: 12px; font-weight: bold; margin-top: 2px; }
            .variants { font-size: 8px; }
          </style>
        </head>
        <body>
          <div class="label-container">
            ${printContent}
          </div>
          <script>
            setTimeout(() => {
              window.print();
              window.close();
            }, 500);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Printer className="text-indigo-600" />
            Barcode Studio
          </h1>
          <p className="text-gray-500 mt-1">Design and print custom thermal labels for retail items.</p>
        </div>
        <Button onClick={handlePrint} className="bg-indigo-600 hover:bg-indigo-700 gap-2">
          <Printer size={18} /> Print Preview
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Settings Panel */}
        <Card className="col-span-1 shadow-sm border-indigo-100">
          <CardHeader className="bg-indigo-50/50 border-b border-indigo-100">
            <CardTitle className="text-lg flex items-center gap-2">
              <Settings size={18} className="text-indigo-600" />
              Printer Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-6">
            <div className="space-y-4">
              <div>
                <Label className="flex justify-between">
                  <span>Label Width (mm)</span>
                  <span className="text-indigo-600 font-medium">{labelWidth} mm</span>
                </Label>
                <Slider 
                  value={[labelWidth]} 
                  min={30} max={100} step={1}
                  onValueChange={(val) => setLabelWidth(val[0])}
                  className="mt-2"
                />
              </div>
              <div>
                <Label className="flex justify-between">
                  <span>Label Height (mm)</span>
                  <span className="text-indigo-600 font-medium">{labelHeight} mm</span>
                </Label>
                <Slider 
                  value={[labelHeight]} 
                  min={15} max={80} step={1}
                  onValueChange={(val) => setLabelHeight(val[0])}
                  className="mt-2"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <Label className="mb-2 block">Visible Elements</Label>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked className="rounded text-indigo-600" /> Item Name</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked className="rounded text-indigo-600" /> Barcode</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked className="rounded text-indigo-600" /> Selling Price (RSP)</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked className="rounded text-indigo-600" /> Size / Color</label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Canvas Area */}
        <Card className="col-span-2 shadow-sm border-gray-200 bg-gray-50/50">
          <CardHeader className="border-b border-gray-100 pb-4">
            <CardTitle className="text-lg flex justify-between items-center">
              <span>Canvas Preview</span>
              <Maximize size={16} className="text-gray-400" />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 flex justify-center items-center min-h-[400px]">
            {/* Visual representation of the physical label */}
            <div 
              className="bg-white shadow-xl border border-gray-300 relative flex flex-col items-center justify-center p-2 transition-all duration-200"
              style={{
                width: `${labelWidth * 3.78}px`, // Rough conversion to pixels for screen
                height: `${labelHeight * 3.78}px`,
              }}
            >
              <div className="absolute top-1 right-1 opacity-20"><Move size={12}/></div>
              
              <div ref={printRef} className="w-full h-full flex flex-col items-center justify-center text-center">
                <div className="item-name">{previewItem.name}</div>
                <div className="barcode-placeholder"></div>
                <div className="barcode-text">{previewItem.barcode}</div>
                <div className="variants mt-1">{previewItem.size} | {previewItem.color}</div>
                <div className="price">₹{previewItem.rsp.toFixed(2)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
