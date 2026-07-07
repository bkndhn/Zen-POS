/**
 * Station → Printer mapping registry (localStorage).
 * Stations: 'kitchen' | 'bar' | 'dessert' | custom string.
 * Maps each station to a Bluetooth device NAME (as reported by Web Bluetooth).
 * If a station has no explicit mapping, KOT falls back to the active printer.
 */

const STATION_MAP_KEY = 'hotel_pos_station_printer_map';

export type StationName = string; // 'kitchen' | 'bar' | 'dessert' | custom

export interface StationPrinterMap {
  [station: string]: string; // station -> device name
}

export const getStationMap = (): StationPrinterMap => {
  try {
    const raw = localStorage.getItem(STATION_MAP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

export const setStationMap = (map: StationPrinterMap): void => {
  localStorage.setItem(STATION_MAP_KEY, JSON.stringify(map));
};

export const assignStationPrinter = (station: StationName, deviceName: string): void => {
  const map = getStationMap();
  map[station.toLowerCase()] = deviceName;
  setStationMap(map);
};

export const removeStationPrinter = (station: StationName): void => {
  const map = getStationMap();
  delete map[station.toLowerCase()];
  setStationMap(map);
};

export const getStationDeviceName = (station: StationName): string | null => {
  const map = getStationMap();
  return map[station.toLowerCase()] || null;
};

/** Ordered list of well-known stations for UI defaults. */
export const DEFAULT_STATIONS: StationName[] = ['kitchen', 'bar', 'dessert'];
