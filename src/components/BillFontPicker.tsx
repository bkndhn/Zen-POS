import React, { useState, useEffect } from 'react';
import { 
  MARKET_FONTS, 
  DEFAULT_BILL_FONT, 
  getStoredBillFont, 
  getStoredBillFontScale, 
  getSelectedBillFont,
  loadGoogleFont,
  calculateBillTypography,
  FontOption
} from '@/utils/billFontUtils';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Type, Sparkles, Printer, Check, Search, RotateCcw } from 'lucide-react';
import { useBranchKey } from '@/hooks/useBranchScopedQuery';

interface BillFontPickerProps {
  onFontChange?: (fontId: string, scale: number) => void;
  compact?: boolean;
}

export const BillFontPicker: React.FC<BillFontPickerProps> = ({ onFontChange, compact = false }) => {
  const getBranchKey = useBranchKey();
  const activeBranchId = localStorage.getItem('hotel_pos_active_branch_id') || undefined;
  const [selectedFontId, setSelectedFontId] = useState<string>(DEFAULT_BILL_FONT);
  const [fontScale, setFontScale] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [paperPreviewWidth, setPaperPreviewWidth] = useState<'58mm' | '80mm'>('58mm');

  useEffect(() => {
    const savedFont = getStoredBillFont(activeBranchId);
    const savedScale = getStoredBillFontScale(activeBranchId);
    setSelectedFontId(savedFont);
    setFontScale(savedScale);
    loadGoogleFont(getSelectedBillFont(savedFont, activeBranchId));
  }, [activeBranchId]);

  const handleFontSelect = (fontId: string) => {
    setSelectedFontId(fontId);
    const fontObj = getSelectedBillFont(fontId);
    loadGoogleFont(fontObj);

    // Save branch-scoped and global
    localStorage.setItem(getBranchKey('hotel_pos_bill_font_family'), fontId);
    localStorage.setItem('hotel_pos_bill_font_family', fontId);

    // Broadcast change
    window.dispatchEvent(new CustomEvent('bill-font-changed', { detail: { fontId, fontScale } }));
    if (onFontChange) onFontChange(fontId, fontScale);
  };

  const handleScaleChange = (newScaleArr: number[]) => {
    const scale = newScaleArr[0];
    setFontScale(scale);

    localStorage.setItem(getBranchKey('hotel_pos_bill_font_scale'), scale.toString());
    localStorage.setItem('hotel_pos_bill_font_scale', scale.toString());

    window.dispatchEvent(new CustomEvent('bill-font-changed', { detail: { fontId: selectedFontId, fontScale: scale } }));
    if (onFontChange) onFontChange(selectedFontId, scale);
  };

  const handleReset = () => {
    handleFontSelect(DEFAULT_BILL_FONT);
    handleScaleChange([1]);
  };

  const currentFont = getSelectedBillFont(selectedFontId);
  const typographyMetrics = calculateBillTypography(paperPreviewWidth, fontScale);

  const filteredFonts = MARKET_FONTS.filter(f => 
    f.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (f.tag && f.tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const categories = [
    { key: 'sans', title: '✨ Modern Sans-Serif (Market Standards)' },
    { key: 'mono', title: '🖨️ Thermal Monospaced (Classic Receipts)' },
    { key: 'condensed', title: '⚡ Compact Condensed (Best for 58mm / 2-inch)' },
    { key: 'serif', title: '📜 Serif & Professional' },
    { key: 'display', title: '🎨 Decorative & Brand Style' },
  ];

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-gradient-to-br from-card to-muted/20 p-4 shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Type className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-semibold text-base flex items-center gap-2">
              Bill & Receipt Typography
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200">
                60+ Market Fonts
              </Badge>
            </h3>
            <p className="text-xs text-muted-foreground">
              Select font style & size for thermal bill print, on-screen view, and WhatsApp image share.
            </p>
          </div>
        </div>

        <Button variant="ghost" size="sm" onClick={handleReset} className="h-8 text-xs text-muted-foreground hover:text-foreground">
          <RotateCcw className="w-3.5 h-3.5 mr-1" />
          Reset Default (Inter)
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Left Column: Font Selection & Scaling */}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground flex items-center justify-between">
              <span>Font Family</span>
              <span className="text-[11px] text-muted-foreground font-mono">
                {currentFont.name} ({currentFont.category})
              </span>
            </Label>
            
            <Select value={selectedFontId} onValueChange={handleFontSelect}>
              <SelectTrigger className="h-10 text-sm font-medium border-border/80 bg-background shadow-xs">
                <SelectValue placeholder="Choose Font" />
              </SelectTrigger>
              <SelectContent className="max-h-[320px]">
                <div className="p-2 sticky top-0 bg-popover z-10 border-b border-border">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <Input
                      placeholder="Search 60+ fonts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="h-8 text-xs pl-8 bg-muted/40"
                    />
                  </div>
                </div>

                {categories.map(cat => {
                  const catFonts = filteredFonts.filter(f => f.category === cat.key);
                  if (catFonts.length === 0) return null;

                  return (
                    <SelectGroup key={cat.key}>
                      <SelectLabel className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider px-2 py-1.5 bg-muted/50">
                        {cat.title}
                      </SelectLabel>
                      {catFonts.map(font => (
                        <SelectItem key={font.id} value={font.id} className="text-sm py-2">
                          <div className="flex items-center justify-between w-full gap-4">
                            <span style={{ fontFamily: `"${font.name}", ${font.fallback}` }} className="font-medium">
                              {font.name}
                            </span>
                            {font.tag && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
                                {font.tag}
                              </Badge>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Font Scale Multiplier */}
          <div className="space-y-2 pt-1">
            <div className="flex justify-between items-center text-xs">
              <Label className="text-xs font-medium">Font Scale / Size Multiplier</Label>
              <span className="font-mono font-semibold text-primary">
                {Math.round(fontScale * 100)}%
              </span>
            </div>
            <Slider
              value={[fontScale]}
              min={0.8}
              max={1.25}
              step={0.05}
              onValueChange={handleScaleChange}
              className="py-1"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
              <span>80% (Compact)</span>
              <span>100% (Standard)</span>
              <span>125% (Large)</span>
            </div>
          </div>
        </div>

        {/* Right Column: Live Auto-Adjust Receipt Preview */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <Label className="text-xs font-semibold flex items-center gap-1.5">
              <Printer className="w-3.5 h-3.5 text-primary" />
              Live Receipt Auto-Fit Preview
            </Label>

            <div className="flex items-center gap-1 bg-muted p-0.5 rounded-lg border border-border">
              <button
                type="button"
                onClick={() => setPaperPreviewWidth('58mm')}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-all ${
                  paperPreviewWidth === '58mm' ? 'bg-background shadow-xs text-primary' : 'text-muted-foreground'
                }`}
              >
                58mm (2")
              </button>
              <button
                type="button"
                onClick={() => setPaperPreviewWidth('80mm')}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-all ${
                  paperPreviewWidth === '80mm' ? 'bg-background shadow-xs text-primary' : 'text-muted-foreground'
                }`}
              >
                80mm (3")
              </button>
            </div>
          </div>

          <div 
            className="mx-auto rounded-lg border border-slate-300 dark:border-slate-700 bg-white text-slate-900 p-3 shadow-sm transition-all overflow-hidden"
            style={{
              width: paperPreviewWidth === '80mm' ? '280px' : '220px',
              fontFamily: typographyMetrics.fontFamilyCss,
              fontSize: `${typographyMetrics.bodyFontSizePx}px`,
              lineHeight: 1.3
            }}
          >
            <div className="text-center pb-2 border-b border-dashed border-slate-300">
              <div style={{ fontSize: `${typographyMetrics.shopTitleFontSizePx}px` }} className="font-extrabold tracking-tight uppercase">
                ZEN CAFE & RESTO
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">Ph: +91 98765 43210 | GSTIN: 33AAAAA0000A1Z5</div>
            </div>

            <div className="py-1.5 border-b border-dashed border-slate-300 text-[11px] flex justify-between">
              <span>Bill #1042</span>
              <span>28/07/26 10:30 AM</span>
            </div>

            <table className="w-full my-1.5 border-collapse text-[11px]" style={{ tableLayout: 'fixed' }}>
              <thead>
                <tr className="font-bold border-b border-slate-300">
                  <th className="text-left py-0.5" style={{ width: `${typographyMetrics.nameColWidthPct}%` }}>ITEM</th>
                  <th className="text-center py-0.5" style={{ width: `${typographyMetrics.qtyColWidthPct}%` }}>QTY</th>
                  {typographyMetrics.rateColWidthPct > 0 && (
                    <th className="text-right py-0.5" style={{ width: `${typographyMetrics.rateColWidthPct}%` }}>RATE</th>
                  )}
                  <th className="text-right py-0.5" style={{ width: `${typographyMetrics.valColWidthPct}%` }}>TOTAL</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="truncate py-0.5">Chicken Biryani Special</td>
                  <td className="text-center py-0.5">2</td>
                  {typographyMetrics.rateColWidthPct > 0 && <td className="text-right py-0.5">₹220</td>}
                  <td className="text-right py-0.5">₹440</td>
                </tr>
                <tr>
                  <td className="truncate py-0.5">Butter Naan</td>
                  <td className="text-center py-0.5">4</td>
                  {typographyMetrics.rateColWidthPct > 0 && <td className="text-right py-0.5">₹40</td>}
                  <td className="text-right py-0.5">₹160</td>
                </tr>
              </tbody>
            </table>

            <div className="pt-1.5 border-t border-dashed border-slate-300 flex justify-between font-extrabold" style={{ fontSize: `${typographyMetrics.grandTotalFontSizePx}px` }}>
              <span>TOTAL</span>
              <span>₹600.00</span>
            </div>

            <div className="mt-2 text-center text-[10px] text-slate-500 font-semibold uppercase tracking-wider">
              Thank You! Visit Again
            </div>
          </div>

          <p className="text-[10px] text-center text-muted-foreground flex items-center justify-center gap-1">
            <Check className="w-3 h-3 text-emerald-500" />
            Auto-adjusted width & wrapping: Zero text clipping on {paperPreviewWidth} receipts.
          </p>
        </div>
      </div>
    </div>
  );
};
