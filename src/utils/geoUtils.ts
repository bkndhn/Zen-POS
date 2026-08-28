/**
 * Coordinate resolution with graceful fallback.
 *
 * Order rows come from several sources (public menu, WhatsApp, aggregators) and
 * may store coordinates under different column names — or not at all. This
 * resolver picks whatever is available and falls back to an address search so
 * the "Navigate" action always renders something useful.
 */
import { reportMissingField } from './monitoring';

export interface ResolvedLocation {
  /** true when we have real lat/lng numbers */
  hasCoords: boolean;
  lat: number | null;
  lng: number | null;
  address: string | null;
  /** Google Maps directions URL, or null when nothing at all is known. */
  mapsUrl: string | null;
  /** Human label for the button/tooltip. */
  label: string;
}

const LAT_KEYS = ['customer_latitude', 'customer_lat', 'latitude', 'lat', 'delivery_latitude'];
const LNG_KEYS = ['customer_longitude', 'customer_lng', 'customer_long', 'longitude', 'lng', 'lon', 'delivery_longitude'];
const ADDRESS_KEYS = ['delivery_address', 'customer_address', 'address', 'location_text'];

const pickNumber = (row: Record<string, any>, keys: string[]): number | null => {
  for (const key of keys) {
    const raw = row?.[key];
    if (raw === null || raw === undefined || raw === '') continue;
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(num) && num !== 0) return num;
  }
  return null;
};

const pickText = (row: Record<string, any>, keys: string[]): string | null => {
  for (const key of keys) {
    const raw = row?.[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
  }
  return null;
};

export function resolveOrderLocation(order: Record<string, any> | null | undefined): ResolvedLocation {
  const row = order || {};
  const lat = pickNumber(row, LAT_KEYS);
  const lng = pickNumber(row, LNG_KEYS);
  const address = pickText(row, ADDRESS_KEYS);

  const validCoords =
    lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

  if (validCoords) {
    return {
      hasCoords: true,
      lat,
      lng,
      address,
      mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
      label: 'Navigate',
    };
  }

  if (address) {
    // Coordinates missing but we can still route by address.
    if (row.order_type === 'delivery' && row.id) {
      reportMissingField('remote_order', 'customer_latitude/longitude', { orderId: row.id });
    }
    return {
      hasCoords: false,
      lat: null,
      lng: null,
      address,
      mapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
      label: 'Search address',
    };
  }

  return { hasCoords: false, lat: null, lng: null, address: null, mapsUrl: null, label: 'No location' };
}
