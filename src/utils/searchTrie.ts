// In-memory prefix index for instant item search on the billing screen.
// Every word of each indexed field is inserted, so "tea" finds "Masala Tea".
interface Node { c: Map<string, Node>; ids: Set<string>; }
const node = (): Node => ({ c: new Map(), ids: new Set() });

export class SearchTrie {
  private root = node();

  add(id: string, text: string | null | undefined) {
    if (!text) return;
    for (const word of String(text).toLowerCase().split(/[\s\-_/,.()]+/)) {
      let n = this.root;
      for (const ch of word) {
        let next = n.c.get(ch);
        if (!next) { next = node(); n.c.set(ch, next); }
        n = next;
        n.ids.add(id);
      }
    }
  }

  /** Returns ids whose words start with every query word; null = empty query. */
  search(query: string): Set<string> | null {
    const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return null;
    let result: Set<string> | null = null;
    for (const w of words) {
      let n: Node | undefined = this.root;
      for (const ch of w) { n = n.c.get(ch); if (!n) return new Set(); }
      result = result ? new Set([...result].filter(id => n!.ids.has(id))) : new Set(n.ids);
    }
    return result;
  }
}

export const buildItemTrie = (items: Array<Record<string, any>>) => {
  const t = new SearchTrie();
  for (const it of items) {
    const id = String(it.id);
    ['name', 'regional_name', 'short_code', 'barcode', 'category', 'sku'].forEach(k => t.add(id, it[k]));
  }
  return t;
};
