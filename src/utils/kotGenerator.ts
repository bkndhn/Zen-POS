/**
 * KOT (Kitchen Order Ticket) generator with per-station routing.
 * Groups cart items by their category's print_station and prints one
 * compact ESC/POS ticket per station. Routes to a station-mapped
 * printer if assigned; otherwise falls back to the active printer.
 */

import { formatQuantityWithUnit } from './timeUtils';
import { getStationDeviceName, DEFAULT_STATIONS, StationName } from './stationPrinters';

const ESC = 0x1B;
const GS = 0x1D;
const INIT = new Uint8Array([ESC, 0x40]);
const ALIGN_CENTER = new Uint8Array([ESC, 0x61, 0x01]);
const ALIGN_LEFT = new Uint8Array([ESC, 0x61, 0x00]);
const BOLD_ON = new Uint8Array([ESC, 0x45, 0x01]);
const BOLD_OFF = new Uint8Array([ESC, 0x45, 0x00]);
const DOUBLE_SIZE = new Uint8Array([GS, 0x21, 0x11]);
const NORMAL_SIZE = new Uint8Array([GS, 0x21, 0x00]);
const FEED_LINE = new Uint8Array([0x0A]);
const FEED_N = (n: number) => new Uint8Array([ESC, 0x64, n]);
const CUT_FULL = new Uint8Array([GS, 0x56, 0x00]);

const enc = new TextEncoder();
const bytes = (s: string) => enc.encode(s);
const pad = (s: string, w: number) =>
  s.length >= w ? s.substring(0, w) : s + ' '.repeat(w - s.length);

export interface KOTItem {
  name: string;
  quantity: number;
  unit?: string;
  selling_unit?: string;
  category?: string;
  notes?: string;
}

export interface KOTMeta {
  billNo: string;
  tableNo?: string;
  orderType?: 'dine_in' | 'parcel';
  printerWidth?: '58mm' | '80mm';
  shopName?: string;
}

export interface KOTPrintStationResult {
  station: StationName;
  deviceName: string | null;
  ok: boolean;
  error?: string;
}

export interface KOTPrintResult {
  ok: number;
  failed: number;
  results: KOTPrintStationResult[];
}

export interface KOTPrintOptions {
  stationFilter?: StationName[];
  onProgress?: (event: {
    station: StationName;
    deviceName: string | null;
    status: 'printing' | 'success' | 'failed';
    index: number;
    total: number;
    error?: string;
  }) => void;
}

/** Group items by station using categoryStationMap (categoryName → station). */
export const groupItemsByStation = (
  items: KOTItem[],
  categoryStationMap: Record<string, string>
): Record<StationName, KOTItem[]> => {
  const groups: Record<string, KOTItem[]> = {};
  for (const it of items) {
    const catKey = (it.category || '').toLowerCase();
    const station = (categoryStationMap[catKey] || 'kitchen').toLowerCase();
    if (!groups[station]) groups[station] = [];
    groups[station].push(it);
  }
  return groups;
};

/** Build ESC/POS bytes for one KOT ticket. */
export const buildKOTBytes = (
  station: StationName,
  items: KOTItem[],
  meta: KOTMeta
): Uint8Array => {
  const LINE = meta.printerWidth === '80mm' ? 48 : 32;
  const SEP = '-'.repeat(LINE);
  const chunks: Uint8Array[] = [];

  chunks.push(INIT);
  chunks.push(ALIGN_CENTER);
  chunks.push(BOLD_ON);
  chunks.push(DOUBLE_SIZE);
  chunks.push(bytes(`*** ${station.toUpperCase()} ***`));
  chunks.push(FEED_LINE);
  chunks.push(NORMAL_SIZE);
  chunks.push(BOLD_OFF);

  const paperSaving = localStorage.getItem('hotel_pos_paper_saving_mode') === 'true';

  if (meta.shopName && !paperSaving) {
    chunks.push(bytes(meta.shopName));
    chunks.push(FEED_LINE);
  }

  chunks.push(ALIGN_LEFT);
  if (!paperSaving) {
    chunks.push(bytes(SEP));
    chunks.push(FEED_LINE);
  }
  chunks.push(BOLD_ON);
  chunks.push(bytes(`KOT #${meta.billNo}`));
  chunks.push(FEED_LINE);
  chunks.push(BOLD_OFF);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

  if (paperSaving) {
    // Ultra compact single line info: Table | Type | Time
    const tablePart = meta.tableNo ? `${meta.tableNo} | ` : '';
    const typePart = meta.orderType ? `${meta.orderType === 'parcel' ? 'PARCEL' : 'DINE'} | ` : '';
    const compactInfo = `${tablePart}${typePart}${timeStr}`;
    chunks.push(bytes(compactInfo.substring(0, LINE)));
    chunks.push(FEED_LINE);
  } else {
    chunks.push(bytes(`Time: ${timeStr}`));
    chunks.push(FEED_LINE);

    if (meta.tableNo) {
      chunks.push(BOLD_ON);
      chunks.push(bytes(`Table: ${meta.tableNo}`));
      chunks.push(BOLD_OFF);
      chunks.push(FEED_LINE);
    }
    if (meta.orderType) {
      chunks.push(bytes(`Type: ${meta.orderType === 'parcel' ? 'PARCEL' : 'DINE IN'}`));
      chunks.push(FEED_LINE);
    }
    chunks.push(bytes(SEP));
    chunks.push(FEED_LINE);
  }

  chunks.push(BOLD_ON);
  chunks.push(bytes(pad('ITEM', LINE - 8) + pad('QTY', 8)));
  chunks.push(FEED_LINE);
  chunks.push(BOLD_OFF);
  
  if (!paperSaving) {
    chunks.push(bytes(SEP));
    chunks.push(FEED_LINE);
  }

  for (const it of items) {
    const qty = formatQuantityWithUnit(it.quantity, it.selling_unit || it.unit);
    const name = it.name || 'Item';
    const nameCol = LINE - 10;
    if (name.length <= nameCol) {
      chunks.push(bytes(pad(name, nameCol) + ' ' + pad(qty, 9)));
    } else {
      // wrap
      chunks.push(bytes(name));
      chunks.push(FEED_LINE);
      chunks.push(bytes(pad('', nameCol) + ' ' + pad(qty, 9)));
    }
    chunks.push(FEED_LINE);
    if (it.notes) {
      chunks.push(bytes(`  * ${it.notes}`));
      chunks.push(FEED_LINE);
    }
  }

  if (!paperSaving) {
    chunks.push(bytes(SEP));
    chunks.push(FEED_LINE);
  }
  chunks.push(FEED_N(paperSaving ? 1 : 3));

  const autoCut = localStorage.getItem('hotel_pos_auto_cut') !== 'false';
  if (autoCut) chunks.push(CUT_FULL);

  const total = chunks.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
};

/**
 * Print KOTs split by station. Batches per station and routes to
 * mapped device if any, else uses the active printer. All station
 * tickets are sent in parallel where possible (Bluetooth serializes
 * inside a single connection but async gathers reduce overhead).
 */
export const printKOTs = async (
  items: KOTItem[],
  categoryStationMap: Record<string, string>,
  meta: KOTMeta,
  options: KOTPrintOptions = {}
): Promise<KOTPrintResult> => {
  const { printerManager } = await import('./printerManager');
  const groups = groupItemsByStation(items, categoryStationMap);
  const stationFilter = options.stationFilter?.map(s => s.toLowerCase());
  const stations = Object.keys(groups).filter(s =>
    groups[s].length > 0 && (!stationFilter || stationFilter.includes(s.toLowerCase()))
  );
  if (stations.length === 0) return { ok: 0, failed: 0, results: [] };

  // Build all tickets up-front (sync bytes) then dispatch
  const tickets = stations.map(station => ({
    station,
    deviceName: getStationDeviceName(station),
    bytes: buildKOTBytes(station, groups[station], meta),
  }));

  let ok = 0, failed = 0;
  const results: KOTPrintStationResult[] = [];
  // Route sequentially to avoid Web Bluetooth concurrent-connection issues
  for (let i = 0; i < tickets.length; i++) {
    const t = tickets[i];
    try {
      options.onProgress?.({ station: t.station, deviceName: t.deviceName, status: 'printing', index: i + 1, total: tickets.length });
      const success = await printerManager.printRawBytes(t.bytes, t.deviceName || undefined);
      if (success) {
        ok++;
        results.push({ station: t.station, deviceName: t.deviceName, ok: true });
        options.onProgress?.({ station: t.station, deviceName: t.deviceName, status: 'success', index: i + 1, total: tickets.length });
      } else {
        failed++;
        results.push({ station: t.station, deviceName: t.deviceName, ok: false, error: 'Printer did not respond' });
        options.onProgress?.({ station: t.station, deviceName: t.deviceName, status: 'failed', index: i + 1, total: tickets.length, error: 'Printer did not respond' });
      }
    } catch (e) {
      console.error('KOT print failed for station', t.station, e);
      const message = e instanceof Error ? e.message : 'Print failed';
      failed++;
      results.push({ station: t.station, deviceName: t.deviceName, ok: false, error: message });
      options.onProgress?.({ station: t.station, deviceName: t.deviceName, status: 'failed', index: i + 1, total: tickets.length, error: message });
    }
  }
  return { ok, failed, results };
};

export { DEFAULT_STATIONS };
