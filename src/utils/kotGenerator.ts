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

  if (meta.shopName) {
    chunks.push(bytes(meta.shopName));
    chunks.push(FEED_LINE);
  }

  chunks.push(ALIGN_LEFT);
  chunks.push(bytes(SEP));
  chunks.push(FEED_LINE);
  chunks.push(BOLD_ON);
  chunks.push(bytes(`KOT #${meta.billNo}`));
  chunks.push(FEED_LINE);
  chunks.push(BOLD_OFF);

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
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

  chunks.push(BOLD_ON);
  chunks.push(bytes(pad('ITEM', LINE - 8) + pad('QTY', 8)));
  chunks.push(FEED_LINE);
  chunks.push(BOLD_OFF);
  chunks.push(bytes(SEP));
  chunks.push(FEED_LINE);

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

  chunks.push(bytes(SEP));
  chunks.push(FEED_LINE);
  chunks.push(FEED_N(3));

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
  meta: KOTMeta
): Promise<{ ok: number; failed: number }> => {
  const { printerManager } = await import('./printerManager');
  const groups = groupItemsByStation(items, categoryStationMap);
  const stations = Object.keys(groups).filter(s => groups[s].length > 0);
  if (stations.length === 0) return { ok: 0, failed: 0 };

  // Build all tickets up-front (sync bytes) then dispatch
  const tickets = stations.map(station => ({
    station,
    deviceName: getStationDeviceName(station),
    bytes: buildKOTBytes(station, groups[station], meta),
  }));

  let ok = 0, failed = 0;
  // Route sequentially to avoid Web Bluetooth concurrent-connection issues
  for (const t of tickets) {
    try {
      const success = await (printerManager as any).printRawBytes(t.bytes, t.deviceName || undefined);
      if (success) ok++; else failed++;
    } catch (e) {
      console.error('KOT print failed for station', t.station, e);
      failed++;
    }
  }
  return { ok, failed };
};

export { DEFAULT_STATIONS };
