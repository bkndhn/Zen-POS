// ESC/POS Commands
const ESC = 0x1B;
const GS = 0x1D;
const INIT = new Uint8Array([ESC, 0x40]);
const ALIGN_LEFT = new Uint8Array([ESC, 0x61, 0x00]);
const ALIGN_CENTER = new Uint8Array([ESC, 0x61, 0x01]);
const ALIGN_RIGHT = new Uint8Array([ESC, 0x61, 0x02]);
const BOLD_ON = new Uint8Array([ESC, 0x45, 0x01]);
const BOLD_OFF = new Uint8Array([ESC, 0x45, 0x00]);
const DOUBLE_SIZE = new Uint8Array([GS, 0x21, 0x11]);
const NORMAL_SIZE = new Uint8Array([GS, 0x21, 0x00]);
const FEED_LINE = new Uint8Array([0x0A]);
const FEED_LINES = (n: number) => new Uint8Array([ESC, 0x64, n]);

// Paper Cut Commands - Multiple formats for different printers
const CUT_FULL = new Uint8Array([GS, 0x56, 0x00]); // Full cut immediately
const CUT_PARTIAL = new Uint8Array([GS, 0x56, 0x01]); // Partial cut immediately
const CUT_FEED_FULL = new Uint8Array([GS, 0x56, 0x41, 0x03]); // Feed 3 lines then full cut
const CUT_FEED_PARTIAL = new Uint8Array([GS, 0x56, 0x42, 0x03]); // Feed 3 lines then partial cut

// Alternative cut command for some printers
const CUT_ALT = new Uint8Array([ESC, 0x69]); // ESC i - full cut
const CUT_ALT_PARTIAL = new Uint8Array([ESC, 0x6D]); // ESC m - partial cut

// Social Media Icons (Base64 SVGs for Canvas)
// We use simple black versions for printing validity
const FB_SVG = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTI0IDEyLjA3M2MwLTYuNjI3LTUuMzczLTEyLTEyLTEyczLTEyIDUuMzczLTEyIDEyYzAgNS45OSA0LjM4OCAxMC45NTQgMTAuMTI1IDExLjg1NHYtOC4zODVINy4wNzh2LTMuNDdoMy4wNDdWOS40M2MwLTMuMDA3IDEuNzkxLTQuNjY5IDQuNTMzLTQuNjY5IDEuMzEyIDAgMi42ODYuMjM1IDIuNjg2LjIzNXYyLjk1M0gxNS44M2MtMS40OTEgMC0xLjk1Ni45MjUtMS45NTYgMS44NzR2Mi4yNWgzLjMyOGwtLjUzMiAzLjQ3aC0yLjc5NnY4LjM4NUMxOS42MTIgMjMuMDI3IDI0IDE4LjA2MiAyNCAxMi4wNzN6Ii8+PC9zdmc+`;
const IG_SVG = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTTEyIDIuMTYzYzMuMjA0IDAgMy41ODQuMDEyIDQuODUuMDcgMy4yNTIuMTQ4IDQuNzcxIDEuNjkxIDQuOTE5IDQuOTE5LjA1OCAxLjI2NS4wNjkgMS42NDUuMDY5IDQuODQ5IDAgMy4yMDUtLjAxMiAzLjU4NC0uMDY5IDQuODQ5LS4xNDkgMy4yMjUtMS42NjQgNC43NzEtNC45MTkgNC45MTktMS4yNjYuMDU4LTEuNjQ0LjA3LTQuODUuMDctMy4yMDQgMC0zLjU4NC0uMDEyLTQuODQ5LS4wNy0zLjI2LS4xNDktNC43NzEtMS42OTktNC45MTktNC45MjAtLjA1OC0xLjI2NS0uMDctMS42NDQtLjA3LTQuODQ5IDAtMy4yMDQuMDEzLTMuNTgzLjA3LTQuODQ5LjE0OS0zLjIyNyAxLjY2NC00Ljc3MSA0LjkxOS00LjkxOSAxLjI2Ni0uMDU3IDEuNjQ1LS4wNjkgNC44NDktLjA2OXptMC0yLjE2M2MtMy4yNTkgMC0zLjY2Ny4wMTQtNC45NDcuMDcyLTQuMzU4LjItNi43OCAyLjYxOC02Ljk4IDYuOTgtLjA1OSAxLjI4MS0uMDczIDEuNjg5LS4wNzMgNC45NDggMCAzLjI1OS4wMTQgMy42NjguMDcyIDQuOTQ4LjIgNC4zNTggMi42MTggNi43OCA2Ljk4IDYuOTggMS4yODEuMDU4IDEuNjg5LjA3MiA0Ljk0OC4wNzIgMy4yNTkgMCAzLjY2OC0uMDE0IDQuOTQ4LS4wNzIgNC4zNTQtLjIgNi43ODItMi42MTggNi45NzktNi45OC4wNTktMS4yOC4wNzMtMS42ODkuMDczLTQuOTQ4IDAtMy4yNTktLjAxNC0zLjY2Ny0uMDcyLTQuOTQ3LS4xOTYtNC4zNTQtMi42MTctNi43OC02Ljk3OS02Ljk4LTEuMjgxLS4wNTktMS42OS0uMDczLTQuOTQ5LS4wNzN6bTAgNS44MzhjLTMuNDAzIDAtNi4xNjIgMi43NTktNi4xNjIgNi4xNjJzMi43NTkgNi4xNjMgNi4xNjIgNi4xNjMgNi4xNjItMi43NTkgNi4xNjItNi4xNjNjMC0zLjQwMy0yLjc1OS02LjE2Mi02LjE2Mi02LjE2MnptMCAxMC4xNjJjLTIuMjA5IDAtNC0xLjc5LTQtNCAwLTIuMjA5IDEuNzkxLTQgNC00czQgMS43OTEgNCA0YzAgMi4yMS0xLjc5MSA0LTQgNHptNi40MDYtMTEuODQ1Yy0uNzk2IDAtMS40NDEuNjQ1LTEuNDQxIDEuNDRzLjY0NSAxLjQ0IDEuNDQxIDEuNDRjLjc5NSAwIDEuNDM5LS42NDUgMS40MzktMS40NHMtLjY0NC0xLjQ0LTEuNDM5LTEuNDR6Ii8+PC9zdmc+`;
const WA_SVG = `data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZD0iTS4wNTcgMjRsMS42ODctNi4xNjNjLTEuMDQxLTEuODA0LTEuNTg4LTMuODQ5LTEuNTg3LTUuOTQ2LjAwMy02LjU1NiA1LjMzOC0xMS44OTEgMTEuODkzLTExLjg5MSAzLjE4MS4wMDEgNi4xNjcgMS4yNCA4LjQxMyAzLjQ4OCAyLjI0NSAyLjI0OCAzLjQ4MSA1LjIzNiAzLjQ4IDguNDE0LS4wMDMgNi41NTctNS4zMzggMTEuODkyLTExLjg5MyAxMS44OTItMS45OS0uMDAxLTMuOTUxLS41LTUuNjg4LTEuNDQ4bC02LjMwNSAxLjY1NHptNi41OTctMy44MDdjMS42NzYuOTk1IDMuMjc2IDEuNTkxIDUuMzkyIDEuNTkyIDUuNDQ4IDAgOS44ODYtNC40MzQgOS44ODktOS44ODUuMDAyLTUuNDYyLTQuNDE1LTkuODktOS44ODEtOS44OTItNS40NTIgMC05Ljg4NyA0LjQzNC05Ljg4OSA5Ljg4NC0uMDAxIDIuMjI1LjY1MSAzLjg5MSAxLjc0NiA1LjYzNGwtLjk5OSAzLjY0OCAzLjc0Mi0uOTgxeiIvPjwvc3ZnPg==`;

// Helper to convert Base64 to bitmap data for ESC/POS
const processImageForPrinting = async (base64Url: string, targetWidth: number = 384): Promise<Uint8Array | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "Anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      // Calculate height to maintain aspect ratio
      const height = Math.floor((img.height * targetWidth) / img.width);
      canvas.width = targetWidth;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }

      // Draw image to canvas (white background)
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, targetWidth, height);

      const imageData = ctx.getImageData(0, 0, targetWidth, height);
      const data = imageData.data;

      // Convert to monochrome (thresholding)
      // We need to pack bits: 1 bit per pixel. 0 = white, 1 = black.
      // Width must be divisible by 8 for standard raster command
      const validWidth = Math.ceil(targetWidth / 8) * 8;
      const xBytes = validWidth / 8;
      const yBits = height;

      // GS v 0 m xL xH yL yH d1...dk
      // m = 0 (normal), xL, xH = width in bytes, yL, yH = height in dots

      const commandHeader = new Uint8Array([
        0x1D, 0x76, 0x30, 0x00,
        xBytes % 256, Math.floor(xBytes / 256),
        yBits % 256, Math.floor(yBits / 256)
      ]);

      const imageBuffer = new Uint8Array(xBytes * yBits);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < xBytes; x++) {
          let byte = 0;
          for (let bit = 0; bit < 8; bit++) {
            const currentX = x * 8 + bit;
            if (currentX < targetWidth) {
              const pixelIndex = (y * targetWidth + currentX) * 4;
              // Simple luminance formula
              const r = data[pixelIndex];
              const g = data[pixelIndex + 1];
              const b = data[pixelIndex + 2];
              const luminance = 0.299 * r + 0.587 * g + 0.114 * b;

              // If dark enough, set bit (1 = print/black)
              if (luminance < 128) {
                byte |= (1 << (7 - bit));
              }
            }
          }
          imageBuffer[y * xBytes + x] = byte;
        }
      }

      // Merge header and body
      const finalCommand = new Uint8Array(commandHeader.length + imageBuffer.length);
      finalCommand.set(commandHeader);
      finalCommand.set(imageBuffer, commandHeader.length);

      resolve(finalCommand);
    };

    img.onerror = () => resolve(null);
    img.src = base64Url;
  });
};

// Helper: Generate Social Media Row Image
const generateSocialMediaImage = async (
  facebook?: string,
  instagram?: string,
  whatsapp?: string,
  targetWidth: number = 384
): Promise<Uint8Array | null> => {
  return (async () => {
    // 1. Create a canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // 2. Measure content
    ctx.font = 'bold 20px sans-serif';
    const iconSize = 24;
    const padding = 10;
    const gap = 20; // Gap between items

    // Items to draw
    const items = [];
    if (facebook) items.push({ icon: FB_SVG, text: facebook, type: 'fb' });
    if (instagram) items.push({ icon: IG_SVG, text: instagram, type: 'ig' });
    if (whatsapp) items.push({ icon: WA_SVG, text: whatsapp, type: 'wa' });

    if (items.length === 0) return null;

    // Function to measure an item
    const measureItem = (item: any) => {
      return iconSize + padding + ctx.measureText(item.text).width;
    };

    // Calculate Layout (Rows)
    const rows: any[][] = [];
    let currentRow: any[] = [];
    let currentRowWidth = 0;

    items.forEach((item) => {
      const itemWidth = measureItem(item);

      // Check if adding this item would exceed width (account for gap if not first item)
      const gapWidth = currentRow.length > 0 ? gap : 0;

      if (currentRowWidth + gapWidth + itemWidth > targetWidth) {
        // Wrap to next line
        if (currentRow.length > 0) {
          rows.push(currentRow);
          currentRow = [];
          currentRowWidth = 0;
        }
      }

      // Add to current row
      if (currentRow.length > 0) currentRowWidth += gap;
      currentRow.push(item);
      currentRowWidth += itemWidth;
    });
    // Push last row
    if (currentRow.length > 0) rows.push(currentRow);

    // 3. Setup Canvas
    const rowHeight = 40;
    const canvasHeight = rows.length * rowHeight; // Tighter packing

    canvas.width = targetWidth;
    canvas.height = canvasHeight;
    // White bg
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Load images helper
    const loadImg = (src: string) => new Promise<HTMLImageElement>((r) => {
      const i = new Image();
      i.onload = () => r(i);
      i.src = src;
    });

    try {
      // Draw Rows
      let currentY = 0;

      for (const row of rows) {
        // Calculate total width of this row to center it
        let rowContentWidth = 0;
        row.forEach((item, idx) => {
          rowContentWidth += measureItem(item);
          if (idx < row.length - 1) rowContentWidth += gap;
        });

        let currentX = Math.max(0, (targetWidth - rowContentWidth) / 2);

        for (const item of row) {
          const iconImg = await loadImg(item.icon);

          // Draw Icon
          ctx.drawImage(iconImg, currentX, currentY + (rowHeight - iconSize) / 2, iconSize, iconSize);
          currentX += iconSize + padding;

          // Draw Text
          ctx.fillStyle = 'black';
          ctx.font = 'bold 20px sans-serif'; // Reset font just in case
          ctx.textBaseline = 'middle';
          ctx.fillText(item.text, currentX, currentY + rowHeight / 2);

          currentX += ctx.measureText(item.text).width + gap;
        }

        currentY += rowHeight;
      }

      const dataUrl = canvas.toDataURL('image/png');
      const printBytes = await processImageForPrinting(dataUrl, targetWidth);
      return printBytes;

    } catch (e) {
      console.error("Failed to generate social image", e);
      return null;
    }
  })();
};

interface BillItem {
  name: string;
  quantity: number;
  price: number;
  total: number;
  unit?: string;
  base_value?: number;
  selling_unit?: string;
  selling_quantity?: number;
}

interface PrintData {
  billNo: string;
  date: string;
  time: string;
  items: BillItem[];
  subtotal: number;
  additionalCharges?: Array<{ name: string; amount: number }>;
  discount?: number;
  total: number;
  paymentMethod: string;
  hotelName?: string;
  shopName?: string;
  address?: string;
  contactNumber?: string;
  paymentDetails?: Record<string, number>;
  facebook?: string;
  instagram?: string;
  whatsapp?: string;
  printerWidth?: '58mm' | '80mm';
  logoUrl?: string;
  totalItemsCount?: number;
  smartQtyCount?: number;
  tableNo?: string;
  // GST fields
  gstin?: string;
  customerGstin?: string;
  customerMobile?: string;
  taxSummary?: string; // JSON string of tax summary
  totalTax?: number;
  isComposition?: boolean;
  roundOff?: number;
  // Order type
  orderType?: 'dine_in' | 'parcel';
}

const textToBytes = (text: string): Uint8Array => {
  const encoder = new TextEncoder();
  return encoder.encode(text);
};

const padRight = (text: string, length: number): string => {
  return text.length >= length ? text.substring(0, length) : text + ' '.repeat(length - text.length);
};

const formatLine = (left: string, right: string, width: number = 32): string => {
  const rightLen = right.length;
  const leftLen = width - rightLen - 1;
  return padRight(left, leftLen) + ' ' + right;
};

// Export the receipt byte generation for use by PrinterManager
export const generateReceiptBytes = async (data: PrintData): Promise<Uint8Array> => {
  const commands: Uint8Array[] = [];

  // COMPACT mode: 58mm = 32 chars, 80mm = 48 chars
  const LINE_WIDTH = data.printerWidth === '80mm' ? 48 : 32;
  const IMAGE_WIDTH = data.printerWidth === '80mm' ? 576 : 384;
  const SEP = '-'.repeat(LINE_WIDTH);
  const SEP_DOUBLE = '='.repeat(LINE_WIDTH);

  const { formatQuantityWithUnit, getShortUnit, calculateSmartQtyCount } = await import('./timeUtils');

  // Compact format helper - fits more on line
  const fmtLine = (left: string, right: string) => formatLine(left, right, LINE_WIDTH);

  // Compact item line - name x qty @ price/unit = total (or name x qty = total on 58mm)
  const fmtItem = (item: BillItem) => {
    const targetUnit = item.selling_unit || item.unit;
    const qtyWithUnit = formatQuantityWithUnit(item.quantity, targetUnit);
    const shortUnit = getShortUnit(targetUnit);
    const baseValue = item.selling_quantity || item.base_value;
    const baseValStr = baseValue && baseValue !== 1 ? `${baseValue}` : '';
    const right = LINE_WIDTH >= 48
      ? `x${qtyWithUnit} @ ${item.price.toFixed(0)}/${baseValStr}${shortUnit} = ${item.total.toFixed(0)}`
      : `x${qtyWithUnit} = ${item.total.toFixed(0)}`;
    const maxName = LINE_WIDTH - right.length - 1;
    if (maxName >= 10) {
      const shortName = item.name.length > maxName ? item.name.substring(0, maxName) : item.name;
      return padRight(shortName, maxName) + ' ' + right;
    } else {
      return `${item.name}\n${' '.repeat(LINE_WIDTH - right.length)}${right}`;
    }
  };

  // Paper saving mode flag (used throughout)
  const paperSaving = localStorage.getItem('hotel_pos_paper_saving_mode') === 'true';

  // Initialize
  commands.push(INIT);


  // COMPACT HEADER - Shop name only (no logo for thermal to save paper)
  const headerName = data.shopName || data.hotelName;
  if (headerName) {
    commands.push(ALIGN_CENTER);
    commands.push(BOLD_ON);
    commands.push(textToBytes(headerName.toUpperCase()));
    commands.push(FEED_LINE);
    commands.push(BOLD_OFF);
  }

  // Address (skip in paper saving mode)
  if (data.address && !paperSaving) {
    commands.push(ALIGN_CENTER);
    commands.push(textToBytes(data.address));
    commands.push(FEED_LINE);
  }

  // Phone and GSTIN (compact in paper saving mode)
  if (data.contactNumber && !paperSaving) {
    commands.push(ALIGN_CENTER);
    if (data.gstin && LINE_WIDTH >= 48) {
      commands.push(textToBytes(`Ph: ${data.contactNumber} | GSTIN: ${data.gstin}`));
    } else {
      commands.push(textToBytes(`Ph: ${data.contactNumber}`));
    }
    commands.push(FEED_LINE);
  }
  
  if (data.gstin && !paperSaving && (LINE_WIDTH < 48 || !data.contactNumber)) {
    commands.push(ALIGN_CENTER);
    commands.push(textToBytes(`GSTIN: ${data.gstin}`));
    commands.push(FEED_LINE);
  }

  // Bill info & metadata
  if (paperSaving) {
    // Ultra compact single line info: e.g. #001 09/07 3:54 PM DINE
    commands.push(ALIGN_LEFT);
    const typeAbbr = data.orderType === 'parcel' ? 'PARCEL' : 'DINE';
    const shortBillNo = data.billNo.replace('BILL-', '');
    const compactInfo = `#${shortBillNo} | ${data.date.substring(0, 5)} | ${data.time} | ${typeAbbr}`;
    commands.push(textToBytes(compactInfo.substring(0, LINE_WIDTH)));
    commands.push(FEED_LINE);
  } else {
    // Standard format with separators
    commands.push(textToBytes(SEP));
    commands.push(FEED_LINE);
    commands.push(ALIGN_LEFT);
    commands.push(textToBytes(fmtLine(`#${data.billNo}`, data.date)));
    commands.push(FEED_LINE);
    commands.push(textToBytes(fmtLine('Time:', data.time)));
    commands.push(FEED_LINE);

    if (data.orderType) {
      commands.push(BOLD_ON);
      commands.push(textToBytes(fmtLine('Type:', data.orderType === 'parcel' ? 'PARCEL' : 'DINE IN')));
      commands.push(FEED_LINE);
      commands.push(BOLD_OFF);
    }
    commands.push(textToBytes(SEP));
    commands.push(FEED_LINE);
  }

  // ITEMS
  data.items.forEach(item => {
    commands.push(textToBytes(fmtItem(item)));
    commands.push(FEED_LINE);
  });

  if (!paperSaving) {
    commands.push(textToBytes(SEP));
    commands.push(FEED_LINE);
  }


  // Totals Area
  const totalItems = data.totalItemsCount !== undefined ? data.totalItemsCount : data.items.length;
  const smartQty = data.smartQtyCount !== undefined ? data.smartQtyCount : calculateSmartQtyCount(data.items);

  commands.push(textToBytes(fmtLine(`Items: ${totalItems}`, `Qty: ${smartQty}`)));
  commands.push(FEED_LINE);

  // Additional charges - compact
  if (data.additionalCharges && data.additionalCharges.length > 0) {
    data.additionalCharges.forEach(charge => {
      // Shorten charge name
      const shortName = charge.name.length > 12 ? charge.name.substring(0, 12) : charge.name;
      commands.push(textToBytes(fmtLine(shortName, `+${charge.amount.toFixed(0)}`)));
      commands.push(FEED_LINE);
    });
  }

  // Discount - compact
  if (data.discount > 0) {
    commands.push(textToBytes(fmtLine('Disc', `-${data.discount.toFixed(0)}`)));
    commands.push(FEED_LINE);
  }

  // GST Tax Summary - TaxName / Taxable / CGST / SGST table (80mm only)
  if (data.totalTax && data.totalTax > 0 && LINE_WIDTH >= 48) {
    commands.push(textToBytes(SEP));
    commands.push(FEED_LINE);
    if (data.isComposition) {
      commands.push(textToBytes(fmtLine('Tax (Comp)', `${data.totalTax.toFixed(0)}`)));
      commands.push(FEED_LINE);
    } else {
      try {
        const summary = data.taxSummary ? JSON.parse(data.taxSummary) : null;
        const entries = summary?.entries || [];
        if (entries.length > 0) {
          // Header row
          if (LINE_WIDTH >= 48) {
            commands.push(textToBytes(padRight('TaxName', 10) + padRight('Taxable', 10) + padRight('CGST', 9) + 'SGST'));
          } else {
            commands.push(textToBytes(padRight('TaxName', 8) + padRight('Taxable', 8) + padRight('CGST', 8) + 'SGST'));
          }
          commands.push(FEED_LINE);
          entries.forEach((entry: any) => {
            const name = (entry.taxName || `GST ${entry.taxRate}%`).substring(0, LINE_WIDTH >= 48 ? 10 : 8);
            if (LINE_WIDTH >= 48) {
              commands.push(textToBytes(padRight(name, 10) + padRight((entry.taxableAmount || 0).toFixed(2), 10) + padRight((entry.cgst || 0).toFixed(2), 9) + (entry.sgst || 0).toFixed(2)));
            } else {
              commands.push(textToBytes(padRight(name, 8) + padRight((entry.taxableAmount || 0).toFixed(2), 8) + padRight((entry.cgst || 0).toFixed(2), 8) + (entry.sgst || 0).toFixed(2)));
            }
            commands.push(FEED_LINE);
          });
        } else if (summary && typeof summary === 'object') {
          // Fallback: try top-level keys as rate entries (taxSummaryToJson format)
          const rateKeys = Object.keys(summary).filter(k => !isNaN(parseFloat(k)));
          if (rateKeys.length > 0) {
            if (LINE_WIDTH >= 48) {
              commands.push(textToBytes(padRight('TaxName', 10) + padRight('Taxable', 10) + padRight('CGST', 9) + 'SGST'));
            } else {
              commands.push(textToBytes(padRight('TaxName', 8) + padRight('Taxable', 8) + padRight('CGST', 8) + 'SGST'));
            }
            commands.push(FEED_LINE);
            rateKeys.forEach(rate => {
              const info = summary[rate];
              const name = (info.taxName || `GST ${rate}%`).substring(0, LINE_WIDTH >= 48 ? 10 : 8);
              if (LINE_WIDTH >= 48) {
                commands.push(textToBytes(padRight(name, 10) + padRight((info.taxable || 0).toFixed(2), 10) + padRight((info.cgst || 0).toFixed(2), 9) + (info.sgst || 0).toFixed(2)));
              } else {
                commands.push(textToBytes(padRight(name, 8) + padRight((info.taxable || 0).toFixed(2), 8) + padRight((info.cgst || 0).toFixed(2), 8) + (info.sgst || 0).toFixed(2)));
              }
              commands.push(FEED_LINE);
            });
          } else {
            const halfTax = data.totalTax / 2;
            commands.push(textToBytes(fmtLine('CGST', `${halfTax.toFixed(2)}`)));
            commands.push(FEED_LINE);
            commands.push(textToBytes(fmtLine('SGST', `${halfTax.toFixed(2)}`)));
            commands.push(FEED_LINE);
          }
        } else {
          const halfTax = data.totalTax / 2;
          commands.push(textToBytes(fmtLine('CGST', `${halfTax.toFixed(2)}`)));
          commands.push(FEED_LINE);
          commands.push(textToBytes(fmtLine('SGST', `${halfTax.toFixed(2)}`)));
          commands.push(FEED_LINE);
        }
      } catch {
        commands.push(textToBytes(fmtLine('Tax', `${data.totalTax.toFixed(0)}`)));
        commands.push(FEED_LINE);
      }
    }
  }

  // Round Off line
  if (data.roundOff && data.roundOff !== 0) {
    const sign = data.roundOff > 0 ? '+' : '';
    commands.push(textToBytes(fmtLine('Round Off', `${sign}${data.roundOff.toFixed(2)}`)));
    commands.push(FEED_LINE);
  }

  commands.push(textToBytes(SEP_DOUBLE));
  commands.push(FEED_LINE);

  // TOTAL - bold but NOT double size to save paper
  commands.push(BOLD_ON);
  commands.push(textToBytes(fmtLine('TOTAL', `Rs.${data.total.toFixed(0)}`)));
  commands.push(FEED_LINE);
  commands.push(BOLD_OFF);

  // Payment - if multiple methods, show breakdown; otherwise single line
  const pdEntries = data.paymentDetails
    ? Object.entries(data.paymentDetails).filter(([, amt]) => (amt as number) > 0)
    : [];
  if (pdEntries.length > 1) {
    commands.push(textToBytes(fmtLine('Paid', 'MULTIPLE')));
    commands.push(FEED_LINE);
    pdEntries.forEach(([method, amt]) => {
      commands.push(textToBytes(fmtLine(`  ${method.toUpperCase()}`, `Rs.${(amt as number).toFixed(2)}`)));
      commands.push(FEED_LINE);
    });
  } else {
    commands.push(textToBytes(fmtLine('Paid', data.paymentMethod.toUpperCase())));
    commands.push(FEED_LINE);
  }

  // Footer - minimal
  commands.push(ALIGN_CENTER);
  commands.push(textToBytes('Thank you!'));
  commands.push(FEED_LINE);

  // Check if autoCut is enabled in localStorage
  const autoCut = localStorage.getItem('hotel_pos_auto_cut') !== 'false';


  
  if (autoCut) {
    // Feed to clear cutter, then cut (1 line for paper saving, 2 lines otherwise)
    commands.push(FEED_LINES(paperSaving ? 1 : 2));
    commands.push(CUT_FULL); // Standard ESC/POS cut (GS V 0)
  } else {
    // Feed so it reaches tear-bar, but DO NOT cut
    commands.push(FEED_LINES(paperSaving ? 2 : 4));
  }

  // Combine all commands
  const totalLength = commands.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  commands.forEach(arr => {
    result.set(arr, offset);
    offset += arr.length;
  });

  return result;
};

// Legacy printReceipt - now uses PrinterManager for persistent connection
export const printReceipt = async (data: PrintData): Promise<boolean> => {
  // Import dynamically to avoid circular dependency
  const { printerManager } = await import('./printerManager');
  return printerManager.print(data);
};

// Direct print function that always requests new device (for testing/fallback)
export const printReceiptDirect = async (data: PrintData): Promise<boolean> => {
  const nav = navigator as any;

  if (!nav.bluetooth) {
    console.error('Bluetooth not supported');
    return false;
  }

  try {
    // Request device
    const device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [
        '000018f0-0000-1000-8000-00805f9b34fb',
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '0000ffe5-0000-1000-8000-00805f9b34fb',
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '0000ffb0-0000-1000-8000-00805f9b34fb',
        '0000ae30-0000-1000-8000-00805f9b34fb',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2'
      ]
    });

    if (!device.gatt) {
      throw new Error('GATT not available');
    }

    // Connect to GATT server
    const server = await device.gatt.connect();

    // Get the primary service
    const services = await server.getPrimaryServices();

    if (services.length === 0) {
      throw new Error('No services found');
    }

    // Find writable characteristic
    for (const service of services) {
      const characteristics = await service.getCharacteristics();

      for (const char of characteristics) {
        if (char.properties.write || char.properties.writeWithoutResponse) {
          const receiptBytes = await generateReceiptBytes(data);

          // Conservative BLE packets work across inexpensive 58/80mm printers.
          const chunkSize = 100;
          for (let i = 0; i < receiptBytes.length; i += chunkSize) {
            const chunk = receiptBytes.slice(i, Math.min(i + chunkSize, receiptBytes.length));
            if (char.properties.writeWithoutResponse && typeof char.writeValueWithoutResponse === 'function') {
              await char.writeValueWithoutResponse(chunk);
            } else if (typeof char.writeValueWithResponse === 'function') {
              await char.writeValueWithResponse(chunk);
            } else {
              await char.writeValue(chunk);
            }
            await new Promise(resolve => setTimeout(resolve, 20));
          }

          server.disconnect();
          return true;
        }
      }
    }

    server.disconnect();
    throw new Error('No writable characteristic found');
  } catch (error) {
    console.error('Print error:', error);
    return false;
  }
};

export type { PrintData, BillItem };
