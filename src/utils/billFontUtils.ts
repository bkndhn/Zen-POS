/**
 * ZenPOS Bill Typography & Font Utilities
 * 
 * Provides 60+ market-popular fonts for Bill Print, On-Screen View, and WhatsApp Image Share.
 * Includes auto-adjusting font size calculations for 58mm (2-inch) and 80mm (3-inch) paper widths
 * ensuring zero text overflow outside page boundaries.
 */

export interface FontOption {
  id: string;
  name: string;
  category: 'sans' | 'mono' | 'condensed' | 'serif' | 'display';
  googleFont: string; // Name for Google Fonts API
  fallback: string;   // CSS fallback stack
  isRecommended?: boolean;
  tag?: string;       // e.g. "Default Recommended", "Thermal Classic", "Compact 58mm"
}

export const MARKET_FONTS: FontOption[] = [
  // --- Modern Sans-Serif (Recommended Market Standards) ---
  { id: 'Inter', name: 'Inter', category: 'sans', googleFont: 'Inter:wght@400;500;600;700;800', fallback: 'sans-serif', isRecommended: true, tag: 'Default Recommended' },
  { id: 'Outfit', name: 'Outfit', category: 'sans', googleFont: 'Outfit:wght@400;500;600;700', fallback: 'sans-serif', isRecommended: true, tag: 'Modern Premium' },
  { id: 'Roboto', name: 'Roboto', category: 'sans', googleFont: 'Roboto:wght@400;500;700', fallback: 'sans-serif', isRecommended: true, tag: 'Market Standard' },
  { id: 'Poppins', name: 'Poppins', category: 'sans', googleFont: 'Poppins:wght@400;500;600;700', fallback: 'sans-serif' },
  { id: 'Montserrat', name: 'Montserrat', category: 'sans', googleFont: 'Montserrat:wght@400;500;600;700', fallback: 'sans-serif' },
  { id: 'Open Sans', name: 'Open Sans', category: 'sans', googleFont: 'Open+Sans:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'Plus Jakarta Sans', name: 'Plus Jakarta Sans', category: 'sans', googleFont: 'Plus+Jakarta+Sans:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'Lato', name: 'Lato', category: 'sans', googleFont: 'Lato:wght@400;700', fallback: 'sans-serif' },
  { id: 'Manrope', name: 'Manrope', category: 'sans', googleFont: 'Manrope:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'Urbanist', name: 'Urbanist', category: 'sans', googleFont: 'Urbanist:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'Sora', name: 'Sora', category: 'sans', googleFont: 'Sora:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'Noto Sans', name: 'Noto Sans', category: 'sans', googleFont: 'Noto+Sans:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'DM Sans', name: 'DM Sans', category: 'sans', googleFont: 'DM+Sans:wght@400;500;700', fallback: 'sans-serif' },
  { id: 'Work Sans', name: 'Work Sans', category: 'sans', googleFont: 'Work+Sans:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'Fira Sans', name: 'Fira Sans', category: 'sans', googleFont: 'Fira+Sans:wght@400;500;700', fallback: 'sans-serif' },
  { id: 'Jost', name: 'Jost', category: 'sans', googleFont: 'Jost:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'Rubik', name: 'Rubik', category: 'sans', googleFont: 'Rubik:wght@400;500;700', fallback: 'sans-serif' },
  { id: 'Quicksand', name: 'Quicksand', category: 'sans', googleFont: 'Quicksand:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'Nunito', name: 'Nunito', category: 'sans', googleFont: 'Nunito:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'Space Grotesk', name: 'Space Grotesk', category: 'sans', googleFont: 'Space+Grotesk:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'Raleway', name: 'Raleway', category: 'sans', googleFont: 'Raleway:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'Hind', name: 'Hind', category: 'sans', googleFont: 'Hind:wght@400;600;700', fallback: 'sans-serif', tag: 'Indian Regional' },
  { id: 'Mukta', name: 'Mukta', category: 'sans', googleFont: 'Mukta:wght@400;600;700', fallback: 'sans-serif', tag: 'Indian Regional' },
  { id: 'Public Sans', name: 'Public Sans', category: 'sans', googleFont: 'Public+Sans:wght@400;600;700', fallback: 'sans-serif' },

  // --- Monospaced & Thermal Receipt Classics ---
  { id: 'Courier Prime', name: 'Courier Prime', category: 'mono', googleFont: 'Courier+Prime:wght@400;700', fallback: 'monospace', isRecommended: true, tag: 'Thermal Classic' },
  { id: 'JetBrains Mono', name: 'JetBrains Mono', category: 'mono', googleFont: 'JetBrains+Mono:wght@400;700', fallback: 'monospace', isRecommended: true, tag: 'Crisp Tech Mono' },
  { id: 'Space Mono', name: 'Space Mono', category: 'mono', googleFont: 'Space+Mono:wght@400;700', fallback: 'monospace' },
  { id: 'Fira Code', name: 'Fira Code', category: 'mono', googleFont: 'Fira+Code:wght@400;600;700', fallback: 'monospace' },
  { id: 'Source Code Pro', name: 'Source Code Pro', category: 'mono', googleFont: 'Source+Code+Pro:wght@400;600;700', fallback: 'monospace' },
  { id: 'Inconsolata', name: 'Inconsolata', category: 'mono', googleFont: 'Inconsolata:wght@400;700', fallback: 'monospace' },
  { id: 'IBM Plex Mono', name: 'IBM Plex Mono', category: 'mono', googleFont: 'IBM+Plex+Mono:wght@400;600;700', fallback: 'monospace' },
  { id: 'Anonymous Pro', name: 'Anonymous Pro', category: 'mono', googleFont: 'Anonymous+Pro:wght@400;700', fallback: 'monospace' },
  { id: 'Roboto Mono', name: 'Roboto Mono', category: 'mono', googleFont: 'Roboto+Mono:wght@400;600;700', fallback: 'monospace' },
  { id: 'Share Tech Mono', name: 'Share Tech Mono', category: 'mono', googleFont: 'Share+Tech+Mono', fallback: 'monospace' },

  // --- Compact & Condensed (Best for 58mm / 2-inch Narrow Receipt Paper) ---
  { id: 'Roboto Condensed', name: 'Roboto Condensed', category: 'condensed', googleFont: 'Roboto+Condensed:wght@400;700', fallback: 'sans-serif', isRecommended: true, tag: 'Best for 58mm' },
  { id: 'Open Sans Condensed', name: 'Open Sans Condensed', category: 'condensed', googleFont: 'Open+Sans+Condensed:wght@300;700', fallback: 'sans-serif' },
  { id: 'Oswald', name: 'Oswald', category: 'condensed', googleFont: 'Oswald:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'Fjalla One', name: 'Fjalla One', category: 'condensed', googleFont: 'Fjalla+One', fallback: 'sans-serif' },
  { id: 'Archivo Narrow', name: 'Archivo Narrow', category: 'condensed', googleFont: 'Archivo+Narrow:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'PT Sans Narrow', name: 'PT Sans Narrow', category: 'condensed', googleFont: 'PT+Sans+Narrow:wght@400;700', fallback: 'sans-serif' },
  { id: 'Saira Condensed', name: 'Saira Condensed', category: 'condensed', googleFont: 'Saira+Condensed:wght@400;600;700', fallback: 'sans-serif' },
  { id: 'Barlow Condensed', name: 'Barlow Condensed', category: 'condensed', googleFont: 'Barlow+Condensed:wght@400;600;700', fallback: 'sans-serif' },

  // --- Serif & Elegant ---
  { id: 'Playfair Display', name: 'Playfair Display', category: 'serif', googleFont: 'Playfair+Display:wght@400;600;700', fallback: 'serif' },
  { id: 'Merriweather', name: 'Merriweather', category: 'serif', googleFont: 'Merriweather:wght@400;700', fallback: 'serif' },
  { id: 'Lora', name: 'Lora', category: 'serif', googleFont: 'Lora:wght@400;600;700', fallback: 'serif' },
  { id: 'PT Serif', name: 'PT Serif', category: 'serif', googleFont: 'PT+Serif:wght@400;700', fallback: 'serif' },
  { id: 'Cormorant Garamond', name: 'Cormorant Garamond', category: 'serif', googleFont: 'Cormorant+Garamond:wght@400;600;700', fallback: 'serif' },
  { id: 'Cinzel', name: 'Cinzel', category: 'serif', googleFont: 'Cinzel:wght@400;600;700', fallback: 'serif' },
  { id: 'EB Garamond', name: 'EB Garamond', category: 'serif', googleFont: 'EB+Garamond:wght@400;600;700', fallback: 'serif' },
  { id: 'Bodoni Moda', name: 'Bodoni Moda', category: 'serif', googleFont: 'Bodoni+Moda:wght@400;600;700', fallback: 'serif' },
  { id: 'Spectral', name: 'Spectral', category: 'serif', googleFont: 'Spectral:wght@400;600;700', fallback: 'serif' },
  { id: 'Libre Baskerville', name: 'Libre Baskerville', category: 'serif', googleFont: 'Libre+Baskerville:wght@400;700', fallback: 'serif' },

  // --- Display & Stylized ---
  { id: 'Pacifico', name: 'Pacifico', category: 'display', googleFont: 'Pacifico', fallback: 'cursive' },
  { id: 'Caveat', name: 'Caveat', category: 'display', googleFont: 'Caveat:wght@400;700', fallback: 'cursive' },
  { id: 'Dancing Script', name: 'Dancing Script', category: 'display', googleFont: 'Dancing+Script:wght@500;700', fallback: 'cursive' },
  { id: 'Lobster', name: 'Lobster', category: 'display', googleFont: 'Lobster', fallback: 'cursive' }
];

export const DEFAULT_BILL_FONT = 'Inter';

/**
 * Helper to retrieve active selected font option
 */
export function getSelectedBillFont(fontId?: string, branchId?: string): FontOption {
  const targetId = fontId || getStoredBillFont(branchId);
  return MARKET_FONTS.find(f => f.id === targetId) || MARKET_FONTS[0];
}

/**
 * Retrieve saved bill font ID from localStorage (strictly branch isolated)
 */
export function getStoredBillFont(branchId?: string): string {
  try {
    if (branchId) {
      const scoped = localStorage.getItem(`hotel_pos_bill_font_family_${branchId}`);
      if (scoped) return scoped;
    }
    const activeBranchId = localStorage.getItem('hotel_pos_active_branch_id');
    if (activeBranchId) {
      const activeScoped = localStorage.getItem(`hotel_pos_bill_font_family_${activeBranchId}`);
      if (activeScoped) return activeScoped;
    }
    return localStorage.getItem('hotel_pos_bill_font_family') || DEFAULT_BILL_FONT;
  } catch {
    return DEFAULT_BILL_FONT;
  }
}

/**
 * Retrieve saved bill font scale (strictly branch isolated)
 */
export function getStoredBillFontScale(branchId?: string): number {
  try {
    if (branchId) {
      const scoped = localStorage.getItem(`hotel_pos_bill_font_scale_${branchId}`);
      if (scoped) {
        const p = parseFloat(scoped);
        if (!isNaN(p) && p > 0) return p;
      }
    }
    const activeBranchId = localStorage.getItem('hotel_pos_active_branch_id');
    if (activeBranchId) {
      const activeScoped = localStorage.getItem(`hotel_pos_bill_font_scale_${activeBranchId}`);
      if (activeScoped) {
        const p = parseFloat(activeScoped);
        if (!isNaN(p) && p > 0) return p;
      }
    }
    const val = localStorage.getItem('hotel_pos_bill_font_scale');
    const parsed = parseFloat(val || '1');
    return isNaN(parsed) || parsed <= 0 ? 1 : parsed;
  } catch {
    return 1;
  }
}

export const DEFAULT_FOOTER_MESSAGE = 'THANK YOU! VISIT AGAIN';

/**
 * Retrieve saved receipt footer message (strictly branch isolated)
 */
export function getStoredFooterMessage(branchId?: string): string {
  try {
    if (branchId) {
      const scoped = localStorage.getItem(`hotel_pos_footer_message_${branchId}`);
      if (scoped !== null && scoped !== undefined) return scoped;
    }
    const activeBranchId = localStorage.getItem('hotel_pos_active_branch_id');
    if (activeBranchId) {
      const activeScoped = localStorage.getItem(`hotel_pos_footer_message_${activeBranchId}`);
      if (activeScoped !== null && activeScoped !== undefined) return activeScoped;
    }
    const val = localStorage.getItem('hotel_pos_footer_message');
    return val !== null && val !== undefined ? val : DEFAULT_FOOTER_MESSAGE;
  } catch {
    return DEFAULT_FOOTER_MESSAGE;
  }
}

/**
 * Save receipt footer message (strictly branch isolated)
 */
export function setStoredFooterMessage(message: string, branchId?: string): void {
  try {
    if (branchId) {
      localStorage.setItem(`hotel_pos_footer_message_${branchId}`, message);
    }
    const activeBranchId = localStorage.getItem('hotel_pos_active_branch_id');
    if (activeBranchId) {
      localStorage.setItem(`hotel_pos_footer_message_${activeBranchId}`, message);
    }
    localStorage.setItem('hotel_pos_footer_message', message);
  } catch (e) {
    console.error('Error saving footer message:', e);
  }
}

/**
 * Inject Google Font link tag into document head if not present
 */
export function loadGoogleFont(font: FontOption): string {
  if (!font.googleFont) return '';
  const fontUrl = `https://fonts.googleapis.com/css2?family=${font.googleFont}&display=swap`;
  if (typeof document !== 'undefined') {
    const existing = document.querySelector(`link[href="${fontUrl}"]`);
    if (!existing) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = fontUrl;
      document.head.appendChild(link);
    }
  }
  return fontUrl;
}

/**
 * Auto-calculate font sizes and column widths tailored for specific printer widths (58mm, 80mm)
 * to guarantee that text fits comfortably without wrapping poorly or going off-page.
 */
export interface BillTypographyMetrics {
  fontFamilyCss: string;
  googleFontUrl: string;
  bodyFontSizePx: number;
  headerFontSizePx: number;
  shopTitleFontSizePx: number;
  grandTotalFontSizePx: number;
  paddingPx: number;
  nameColWidthPct: number;
  qtyColWidthPct: number;
  rateColWidthPct: number;
  valColWidthPct: number;
}

export function calculateBillTypography(paperWidth: string = '58mm', customScale?: number): BillTypographyMetrics {
  const font = getSelectedBillFont();
  const fontUrl = loadGoogleFont(font);
  const scale = customScale ?? getStoredBillFontScale();
  const is80mm = paperWidth === '80mm' || paperWidth === '3inch';
  const isCondensed = font.category === 'condensed';

  let baseBody = is80mm ? 13 : 11;
  let baseHeader = is80mm ? 15 : 13;
  let baseShopTitle = is80mm ? 22 : 16;
  let baseTotal = is80mm ? 18 : 14;

  if (isCondensed) {
    baseBody += 1;
    baseHeader += 1;
  }

  const safeScale = Math.max(0.7, Math.min(1.4, scale));
  const fontFamilyCss = `"${font.name}", ${font.fallback}`;

  if (is80mm) {
    return {
      fontFamilyCss,
      googleFontUrl: fontUrl,
      bodyFontSizePx: Math.round(baseBody * safeScale),
      headerFontSizePx: Math.round(baseHeader * safeScale),
      shopTitleFontSizePx: Math.round(baseShopTitle * safeScale),
      grandTotalFontSizePx: Math.round(baseTotal * safeScale),
      paddingPx: 6,
      nameColWidthPct: 38,
      qtyColWidthPct: 16,
      rateColWidthPct: 24,
      valColWidthPct: 22,
    };
  } else {
    // 58mm (2-inch Narrow thermal receipt)
    return {
      fontFamilyCss,
      googleFontUrl: fontUrl,
      bodyFontSizePx: Math.round(baseBody * safeScale),
      headerFontSizePx: Math.round(baseHeader * safeScale),
      shopTitleFontSizePx: Math.round(baseShopTitle * safeScale),
      grandTotalFontSizePx: Math.round(baseTotal * safeScale),
      paddingPx: 4,
      nameColWidthPct: 52,
      qtyColWidthPct: 20,
      rateColWidthPct: 0,
      valColWidthPct: 28,
    };
  }
}

/**
 * Generate CSS style block for Thermal Printing HTML to ensure text never overflows page bounds
 */
export function generatePrintStyleHeader(paperWidth: string = '58mm', customScale?: number): string {
  const metrics = calculateBillTypography(paperWidth, customScale);
  const widthCss = paperWidth === '80mm' || paperWidth === '3inch' ? '80mm' : '58mm';

  return `
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    ${metrics.googleFontUrl ? `<link href="${metrics.googleFontUrl}" rel="stylesheet">` : ''}
    <style>
      @page {
        size: ${widthCss} auto;
        margin: 0mm;
      }
      *, *:before, *:after {
        box-sizing: border-box !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      html, body {
        width: 100% !important;
        max-width: ${widthCss} !important;
        margin: 0 auto !important;
        padding: 0 !important;
        font-family: ${metrics.fontFamilyCss} !important;
        font-size: ${metrics.bodyFontSizePx}px !important;
        line-height: 1.3 !important;
        color: #000 !important;
        background: #fff !important;
        overflow-x: hidden !important;
      }
      .receipt-container {
        width: 100% !important;
        max-width: ${widthCss} !important;
        padding: ${metrics.paddingPx}px !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        word-wrap: break-word !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
      }
      table {
        width: 100% !important;
        table-layout: fixed !important;
        border-collapse: collapse !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
      }
      td, th {
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        word-break: break-word !important;
        overflow-wrap: anywhere !important;
        vertical-align: top !important;
      }
      .shop-title {
        font-size: ${metrics.shopTitleFontSizePx}px !important;
        font-weight: 800 !important;
        text-align: center !important;
        line-height: 1.1 !important;
      }
      .bill-header {
        font-size: ${metrics.headerFontSizePx}px !important;
        font-weight: 700 !important;
      }
      .grand-total {
        font-size: ${metrics.grandTotalFontSizePx}px !important;
        font-weight: 800 !important;
      }
    </style>
  `;
}
