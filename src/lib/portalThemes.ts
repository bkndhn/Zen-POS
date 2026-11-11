/**
 * ZenPOS Portal Theme System — 20 selectable visual presets
 * Each shop picks one; PublicMenu.tsx reads and applies it.
 */

export interface PortalThemeThumbnail {
  /** CSS background for 6 item thumb slots (Breakfast/Meals/Snacks/Drinks/Dessert/Default) */
  backgrounds: [string, string, string, string, string, string];
  /** Text color shown over those backgrounds */
  textColor: string;
  /** Whether to show emoji (true) or a minimal SVG icon (false) */
  showEmoji: boolean;
}

export interface PortalTheme {
  id: string;
  name: string;
  emoji: string;
  tagline: string;
  /** CSS background for hero area when no cover photo */
  heroBg: string;
  heroTextColor: string;
  heroSubColor: string;
  /** Tailwind-compatible border radius token: 'none'|'sm'|'md'|'lg'|'xl'|'2xl'|'3xl' */
  cardRadius: string;
  /** Item thumbnail fallback style */
  thumb: PortalThemeThumbnail;
  /** Accent/primary color if shop hasn't set menu_primary_color */
  defaultPrimary: string;
  /** Suggested for these restaurant types */
  bestFor: string;
}

const T = (
  id: string, name: string, emoji: string, tagline: string,
  heroBg: string, heroTextColor: string, heroSubColor: string,
  cardRadius: string,
  thumbBgs: [string, string, string, string, string, string],
  thumbText: string, showEmoji: boolean,
  defaultPrimary: string, bestFor: string
): PortalTheme => ({
  id, name, emoji, tagline, heroBg, heroTextColor, heroSubColor, cardRadius,
  thumb: { backgrounds: thumbBgs, textColor: thumbText, showEmoji },
  defaultPrimary, bestFor
});

export const PORTAL_THEMES: PortalTheme[] = [
  // ── 1 ─────────────────────────────────────────────────────────────────────
  T('emerald-fresh', 'Emerald Fresh', '🌿', 'Clean & natural',
    'linear-gradient(135deg,#064e3b 0%,#065f46 60%,#047857 100%)',
    '#fff', '#6ee7b7', '2xl',
    ['linear-gradient(135deg,#fef9c3,#fde68a)',
     'linear-gradient(135deg,#dcfce7,#bbf7d0)',
     'linear-gradient(135deg,#fee2e2,#fecaca)',
     'linear-gradient(135deg,#ede9fe,#ddd6fe)',
     'linear-gradient(135deg,#fce7f3,#fbcfe8)',
     'linear-gradient(135deg,#e0f2fe,#bae6fd)'],
    '#374151', true, '#10b981',
    'Vegetarian • Health cafes • South Indian'),

  // ── 2 ─────────────────────────────────────────────────────────────────────
  T('midnight-dark', 'Midnight Dark', '🌙', 'Premium & sleek',
    'linear-gradient(135deg,#0f172a 0%,#1e293b 60%,#0f4c3f 100%)',
    '#fff', '#10b981', 'xl',
    ['#1e293b','#1e293b','#1e293b','#1e293b','#1e293b','#1e293b'],
    '#6ee7b7', true, '#10b981',
    'Fine dining • Bars • Upscale restaurants'),

  // ── 3 ─────────────────────────────────────────────────────────────────────
  T('spicy-red', 'Spicy Red', '🌶️', 'Bold & fiery',
    'linear-gradient(135deg,#7f1d1d 0%,#991b1b 50%,#b91c1c 100%)',
    '#fff', '#fca5a5', '2xl',
    ['linear-gradient(135deg,#fef2f2,#fecaca)',
     'linear-gradient(135deg,#fff7ed,#fed7aa)',
     'linear-gradient(135deg,#fef9c3,#fde68a)',
     'linear-gradient(135deg,#fee2e2,#fecaca)',
     'linear-gradient(135deg,#fce7f3,#fbcfe8)',
     'linear-gradient(135deg,#fef2f2,#fecaca)'],
    '#7f1d1d', true, '#ef4444',
    'Non-veg • Biryanis • Indian fast food • Dhabas'),

  // ── 4 ─────────────────────────────────────────────────────────────────────
  T('saffron-gold', 'Saffron Gold', '✨', 'Festive & warm',
    'linear-gradient(135deg,#78350f 0%,#92400e 40%,#b45309 100%)',
    '#fff', '#fcd34d', '3xl',
    ['linear-gradient(135deg,#fffbeb,#fef3c7)',
     'linear-gradient(135deg,#fef9c3,#fde68a)',
     'linear-gradient(135deg,#fff7ed,#fed7aa)',
     'linear-gradient(135deg,#fffbeb,#fde68a)',
     'linear-gradient(135deg,#fef3c7,#fde68a)',
     'linear-gradient(135deg,#fffbeb,#fef3c7)'],
    '#92400e', true, '#d97706',
    'Wedding caterers • Festive menus • Traditional Indian'),

  // ── 5 ─────────────────────────────────────────────────────────────────────
  T('ocean-blue', 'Ocean Blue', '🌊', 'Fresh & coastal',
    'linear-gradient(135deg,#0c4a6e 0%,#075985 50%,#0369a1 100%)',
    '#fff', '#7dd3fc', 'xl',
    ['linear-gradient(135deg,#eff6ff,#dbeafe)',
     'linear-gradient(135deg,#e0f2fe,#bae6fd)',
     'linear-gradient(135deg,#ecfeff,#cffafe)',
     'linear-gradient(135deg,#f0fdf4,#dcfce7)',
     'linear-gradient(135deg,#faf5ff,#ede9fe)',
     'linear-gradient(135deg,#eff6ff,#dbeafe)'],
    '#1e3a5f', true, '#0ea5e9',
    'Seafood • Fish & chips • Coastal cuisines • Juices'),

  // ── 6 ─────────────────────────────────────────────────────────────────────
  T('royal-purple', 'Royal Purple', '👑', 'Premium & regal',
    'linear-gradient(135deg,#2e1065 0%,#3b0764 50%,#4c1d95 100%)',
    '#fff', '#c4b5fd', 'xl',
    ['#2d1b69','#2d1b69','#2d1b69','#2d1b69','#2d1b69','#2d1b69'],
    '#c4b5fd', true, '#7c3aed',
    'Upscale dining • Bars • Premium bakeries'),

  // ── 7 ─────────────────────────────────────────────────────────────────────
  T('terracotta', 'Terracotta', '🏺', 'Warm & rustic',
    'linear-gradient(135deg,#431407 0%,#7c2d12 50%,#c2410c 100%)',
    '#fff', '#fdba74', '2xl',
    ['linear-gradient(135deg,#fff7ed,#fed7aa)',
     'linear-gradient(135deg,#fef3c7,#fde68a)',
     'linear-gradient(135deg,#fef2f2,#fecaca)',
     'linear-gradient(135deg,#fff7ed,#fed7aa)',
     'linear-gradient(135deg,#fffbeb,#fef3c7)',
     'linear-gradient(135deg,#fff7ed,#fed7aa)'],
    '#7c2d12', true, '#ea580c',
    'Traditional • Village restaurants • Dhabas • Heritage hotels'),

  // ── 8 ─────────────────────────────────────────────────────────────────────
  T('mint-breeze', 'Mint Breeze', '🌱', 'Fresh & healthy',
    'linear-gradient(135deg,#064e3b 0%,#047857 40%,#059669 100%)',
    '#fff', '#a7f3d0', '3xl',
    ['linear-gradient(135deg,#f0fdf4,#dcfce7)',
     'linear-gradient(135deg,#ecfdf5,#d1fae5)',
     'linear-gradient(135deg,#f0fdf4,#bbf7d0)',
     'linear-gradient(135deg,#ecfeff,#cffafe)',
     'linear-gradient(135deg,#f0fdf4,#d1fae5)',
     'linear-gradient(135deg,#f0fdf4,#dcfce7)'],
    '#064e3b', true, '#059669',
    'Vegan • Health bars • Salad cafes • Juice corners'),

  // ── 9 ─────────────────────────────────────────────────────────────────────
  T('charcoal', 'Charcoal Mono', '⬛', 'Minimal & sharp',
    'linear-gradient(135deg,#111827 0%,#1f2937 100%)',
    '#fff', '#9ca3af', 'lg',
    ['#1f2937','#1f2937','#1f2937','#1f2937','#1f2937','#1f2937'],
    '#e5e7eb', false, '#6b7280',
    'Premium cafes • Cocktail bars • Dark-mode lovers'),

  // ── 10 ────────────────────────────────────────────────────────────────────
  T('cherry-blossom', 'Cherry Blossom', '🌸', 'Sweet & delicate',
    'linear-gradient(135deg,#831843 0%,#9d174d 50%,#be185d 100%)',
    '#fff', '#f9a8d4', '3xl',
    ['linear-gradient(135deg,#fdf2f8,#fce7f3)',
     'linear-gradient(135deg,#fff1f2,#ffe4e6)',
     'linear-gradient(135deg,#fdf4ff,#fae8ff)',
     'linear-gradient(135deg,#fce7f3,#fbcfe8)',
     'linear-gradient(135deg,#fff1f2,#fecdd3)',
     'linear-gradient(135deg,#fdf2f8,#fce7f3)'],
    '#831843', true, '#db2777',
    'Bakeries • Dessert cafes • Ice cream • Cakes & pastries'),

  // ── 11 ────────────────────────────────────────────────────────────────────
  T('forest-wood', 'Forest Wood', '🌳', 'Earthy & rustic',
    'linear-gradient(135deg,#1a0a00 0%,#3d1a00 50%,#5c2a00 100%)',
    '#fef3c7', '#d97706', '2xl',
    ['linear-gradient(135deg,#fffbeb,#fef3c7)',
     'linear-gradient(135deg,#f7fee7,#ecfccb)',
     'linear-gradient(135deg,#fff7ed,#fed7aa)',
     'linear-gradient(135deg,#fefce8,#fef9c3)',
     'linear-gradient(135deg,#fffbeb,#fde68a)',
     'linear-gradient(135deg,#fffbeb,#fef3c7)'],
    '#78350f', true, '#92400e',
    'BBQ • Steakhouses • Rustic cafes • Village eateries'),

  // ── 12 ────────────────────────────────────────────────────────────────────
  T('neon-street', 'Neon Street', '⚡', 'Bold & electric',
    'linear-gradient(135deg,#0a0a0a 0%,#111111 50%,#1a1a2e 100%)',
    '#00ff88', '#39ff14', 'xl',
    ['#111111','#111111','#111111','#111111','#111111','#111111'],
    '#00ff88', true, '#00ff88',
    'Street food • Night markets • Food trucks • Quickservice'),

  // ── 13 ────────────────────────────────────────────────────────────────────
  T('cream-gold', 'Cream & Gold', '🥂', 'Elegant & refined',
    'linear-gradient(135deg,#1a1a1a 0%,#2d2416 50%,#3d3016 100%)',
    '#fef3c7', '#d4af37', 'xl',
    ['linear-gradient(135deg,#fffbeb,#fef3c7)',
     'linear-gradient(135deg,#fefce8,#fef9c3)',
     'linear-gradient(135deg,#fff7ed,#fef3c7)',
     'linear-gradient(135deg,#fffbeb,#fef3c7)',
     'linear-gradient(135deg,#fefce8,#fde68a)',
     'linear-gradient(135deg,#fffbeb,#fef3c7)'],
    '#78350f', true, '#d4af37',
    'Fine dining • Wedding halls • Premium hotels • Rooftop restaurants'),

  // ── 14 ────────────────────────────────────────────────────────────────────
  T('aurora', 'Aurora Gradient', '🌈', 'Vibrant & playful',
    'linear-gradient(135deg,#4f46e5 0%,#7c3aed 30%,#db2777 60%,#ea580c 100%)',
    '#fff', 'rgba(255,255,255,0.8)', '2xl',
    ['linear-gradient(135deg,#eff6ff,#dbeafe)',
     'linear-gradient(135deg,#faf5ff,#ede9fe)',
     'linear-gradient(135deg,#fdf2f8,#fce7f3)',
     'linear-gradient(135deg,#fff1f2,#ffe4e6)',
     'linear-gradient(135deg,#fff7ed,#fed7aa)',
     'linear-gradient(135deg,#eff6ff,#dbeafe)'],
    '#4f46e5', true, '#7c3aed',
    'Fusion • International • Trendy cafes • Young crowd'),

  // ── 15 ────────────────────────────────────────────────────────────────────
  T('indigo-tech', 'Indigo Tech', '💜', 'Modern SaaS feel',
    'linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#3730a3 100%)',
    '#fff', '#a5b4fc', 'xl',
    ['linear-gradient(135deg,#eef2ff,#e0e7ff)',
     'linear-gradient(135deg,#eff6ff,#dbeafe)',
     'linear-gradient(135deg,#faf5ff,#ede9fe)',
     'linear-gradient(135deg,#eef2ff,#e0e7ff)',
     'linear-gradient(135deg,#fdf2f8,#fce7f3)',
     'linear-gradient(135deg,#eef2ff,#e0e7ff)'],
    '#1e1b4b', true, '#4f46e5',
    'Cloud kitchens • QSR chains • Tech-forward brands'),

  // ── 16 ────────────────────────────────────────────────────────────────────
  T('sunset', 'Tropical Sunset', '🌅', 'Warm & vibrant',
    'linear-gradient(135deg,#c2410c 0%,#dc2626 40%,#9f1239 100%)',
    '#fff', '#fda4af', '3xl',
    ['linear-gradient(135deg,#fff7ed,#fed7aa)',
     'linear-gradient(135deg,#fef9c3,#fde68a)',
     'linear-gradient(135deg,#fef2f2,#fecaca)',
     'linear-gradient(135deg,#fff1f2,#ffe4e6)',
     'linear-gradient(135deg,#fce7f3,#fbcfe8)',
     'linear-gradient(135deg,#fff7ed,#fed7aa)'],
    '#c2410c', true, '#ea580c',
    'Beach shacks • Tropical cuisine • Juices • Resort dining'),

  // ── 17 ────────────────────────────────────────────────────────────────────
  T('bamboo', 'Bamboo Garden', '🎋', 'Calm & natural',
    'linear-gradient(135deg,#14532d 0%,#166534 50%,#15803d 100%)',
    '#fff', '#bbf7d0', '3xl',
    ['linear-gradient(135deg,#f0fdf4,#dcfce7)',
     'linear-gradient(135deg,#ecfdf5,#d1fae5)',
     'linear-gradient(135deg,#f0fdf4,#bbf7d0)',
     'linear-gradient(135deg,#ecfeff,#cffafe)',
     'linear-gradient(135deg,#fafff0,#ecfccb)',
     'linear-gradient(135deg,#f0fdf4,#dcfce7)'],
    '#14532d', true, '#16a34a',
    'Japanese • Thai • Pan-Asian • Zen eateries • Vegan'),

  // ── 18 ────────────────────────────────────────────────────────────────────
  T('galaxy', 'Galaxy Night', '🌌', 'Bold & cosmic',
    'radial-gradient(ellipse at 30% 30%, #1e1b4b 0%, #0f172a 50%, #000011 100%)',
    '#c4b5fd', '#7c3aed', 'xl',
    ['#0a0a1a','#0a0a1a','#0a0a1a','#0a0a1a','#0a0a1a','#0a0a1a'],
    '#a78bfa', true, '#7c3aed',
    'Night clubs • Rooftop bars • Lounge dining'),

  // ── 19 ────────────────────────────────────────────────────────────────────
  T('clay-earth', 'Clay & Earth', '🏔️', 'Natural & organic',
    'linear-gradient(135deg,#292524 0%,#44403c 50%,#57534e 100%)',
    '#fafaf9', '#d4c5b0', '2xl',
    ['linear-gradient(135deg,#fafaf9,#f5f5f4)',
     'linear-gradient(135deg,#fffbeb,#fef3c7)',
     'linear-gradient(135deg,#f7fee7,#ecfccb)',
     'linear-gradient(135deg,#fefce8,#fef9c3)',
     'linear-gradient(135deg,#fff7ed,#fed7aa)',
     'linear-gradient(135deg,#fafaf9,#f5f5f4)'],
    '#44403c', true, '#78716c',
    'Organic cafes • Farm-to-table • Wellness restaurants'),

  // ── 20 ────────────────────────────────────────────────────────────────────
  T('coral-reef', 'Coral Reef', '🪸', 'Vibrant & tropical',
    'linear-gradient(135deg,#0d9488 0%,#0891b2 40%,#06b6d4 100%)',
    '#fff', '#99f6e4', '3xl',
    ['linear-gradient(135deg,#ecfeff,#cffafe)',
     'linear-gradient(135deg,#f0fdfa,#ccfbf1)',
     'linear-gradient(135deg,#eff6ff,#dbeafe)',
     'linear-gradient(135deg,#ecfdf5,#d1fae5)',
     'linear-gradient(135deg,#fdf2f8,#fce7f3)',
     'linear-gradient(135deg,#ecfeff,#cffafe)'],
    '#0d9488', true, '#0d9488',
    'Seafood • Mediterranean • Coastal • Fusion'),
];

export const DEFAULT_THEME = PORTAL_THEMES[0]; // emerald-fresh

export function getPortalTheme(id?: string | null): PortalTheme {
  if (!id) return DEFAULT_THEME;
  return PORTAL_THEMES.find(t => t.id === id) ?? DEFAULT_THEME;
}

/** Returns the right thumbnail background for a given category name */
export function getThumbBg(theme: PortalTheme, category?: string): string {
  const cat = (category || '').toLowerCase();
  if (/breakfast|idli|dosa|poori|paratha|upma|pongal/.test(cat)) return theme.thumb.backgrounds[0];
  if (/meal|rice|biryani|lunch|dinner|thali|curry|sabji/.test(cat)) return theme.thumb.backgrounds[1];
  if (/snack|starter|fry|soup|salad|kebab|chaat|samosa/.test(cat)) return theme.thumb.backgrounds[2];
  if (/drink|beverage|juice|coffee|tea|chai|water|shake|smoothie/.test(cat)) return theme.thumb.backgrounds[3];
  if (/dessert|sweet|cake|ice.?cream|gulab|halwa|payasam|pudding/.test(cat)) return theme.thumb.backgrounds[4];
  return theme.thumb.backgrounds[5];
}
