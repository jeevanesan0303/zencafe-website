
/* ==========================================
   ZEN CAFÉ — MENU DATA & TYPES
   File: src/data/menu.ts

   Product types:
   - Food
   - Drink
   - Snacks

   Snacks are displayed in Zen Kitchen.

   Existing products and gallery data
   are preserved.
========================================== */

/* ==========================================
   PRODUCT TYPES
========================================== */

export type MenuKind =
  | 'drink'
  | 'food'
  | 'snacks'

export type DietaryType =
  | 'veg'
  | 'non-veg'

export type DairyType =
  | 'milk'
  | 'milk-powder'
  | 'dairy-free'

export type SpiceLevel =
  | 'none'
  | 'mild'
  | 'medium'
  | 'hot'

/* ==========================================
   MENU PRODUCT DATA MODEL
========================================== */

export type MenuItem = {
  id: string

  // Product type
  kind: MenuKind

  // Basic product information
  name: string
  category: string
  description: string
  ingredients: string
  serving: string

  // Image and styling
  image: string
  accent: string

  // Product settings
  available: boolean
  featured: boolean
  createdAt: string

  // Optional product information
  price?: number
  isNew?: boolean
  spiceLevel?: SpiceLevel

  // Food and Snacks information
  dietaryType?: DietaryType

  // Drink-specific information
  dairyType?: DairyType
}

/* ==========================================
   PRODUCT TYPE CONFIGURATION

   Central configuration for the admin
   dashboard and customer website.
========================================== */

export const MENU_KINDS: MenuKind[] = [
  'food',
  'drink',
  'snacks',
]

export const MENU_KIND_LABELS: Record<
  MenuKind,
  string
> = {
  food: 'Food',
  drink: 'Drink',
  snacks: 'Snacks',
}

/* ==========================================
   ZEN KITCHEN PRODUCT TYPES

   Both Food and Snacks belong to
   the Zen Kitchen customer page.
========================================== */

export const ZEN_KITCHEN_KINDS: MenuKind[] = [
  'food',
  'snacks',
]

/* ==========================================
   PRODUCT TYPE HELPERS
========================================== */

/**
 * Check whether a value is a valid
 * Zen Café product type.
 */
export function isMenuKind(
  value: unknown
): value is MenuKind {
  return (
    value === 'food' ||
    value === 'drink' ||
    value === 'snacks'
  )
}

/**
 * Check whether a product belongs
 * to Zen Kitchen.
 *
 * Food and Snacks are displayed
 * in Zen Kitchen.
 */
export function isZenKitchenKind(
  kind: MenuKind
): boolean {
  return (
    kind === 'food' ||
    kind === 'snacks'
  )
}

/**
 * Get the display label for a
 * product type.
 */
export function getMenuKindLabel(
  kind: MenuKind
): string {
  return MENU_KIND_LABELS[kind]
}

/* ==========================================
   DEFAULT MENU PRODUCTS

   All existing products are preserved.

   Snacks can be created through the
   admin dashboard after the API and
   database support the new type.
========================================== */

export const DEFAULT_MENU_ITEMS: MenuItem[] = [
  {
    id: 'zen-strawberry-cloud',
    kind: 'drink',
    name: 'Zen Strawberry Cloud',
    category: 'Milkshake',
    description:
      'A creamy strawberry signature drink with a bright fruit finish and a premium Zen presentation.',
    ingredients:
      'Strawberry, chilled milk, cream, house syrup',
    serving: 'Served chilled',
    image:
      '/assets/signature-drinks/zen-drink-character-01.png',
    accent: '#c43b5b',
    available: true,
    featured: true,
    isNew: false,
    createdAt: '2026-08-01T00:00:00.000Z',
    dairyType: 'milk',
  },
  {
    id: 'zen-berry-bliss',
    kind: 'drink',
    name: 'Zen Berry Bliss',
    category: 'Berry Special',
    description:
      'A smooth purple berry shake with a bold, refreshing fruit profile.',
    ingredients:
      'Mixed berries, chilled milk, cream, house syrup',
    serving: 'Served chilled',
    image:
      '/assets/signature-drinks/zen-drink-character-02.png',
    accent: '#7a55c5',
    available: true,
    featured: true,
    isNew: false,
    createdAt: '2026-08-01T00:00:01.000Z',
    dairyType: 'milk',
  },
  {
    id: 'zen-choco-armor',
    kind: 'drink',
    name: 'Zen Choco Armor',
    category: 'Chocolate',
    description:
      'A rich chocolate milkshake layered with cream and a deep café-style finish.',
    ingredients:
      'Chocolate, chilled milk, cream, cocoa drizzle',
    serving: 'Served chilled',
    image:
      '/assets/signature-drinks/zen-drink-character-03.png',
    accent: '#8c5a42',
    available: true,
    featured: true,
    isNew: false,
    createdAt: '2026-08-01T00:00:02.000Z',
    dairyType: 'milk-powder',
  },
  {
    id: 'zen-citrus-mojito',
    kind: 'drink',
    name: 'Zen Citrus Mojito',
    category: 'Mojito',
    description:
      'A cool citrus mojito with mint and lemon for a light, sparkling finish.',
    ingredients:
      'Lemon, mint, soda, citrus syrup, ice',
    serving: 'Served over ice · non-alcoholic',
    image:
      '/assets/signature-drinks/zen-drink-character-04.png',
    accent: '#4a9a68',
    available: true,
    featured: true,
    isNew: false,
    createdAt: '2026-08-01T00:00:03.000Z',
    dairyType: 'dairy-free',
  },
  {
    id: 'zen-iced-brew',
    kind: 'drink',
    name: 'Zen Iced Brew',
    category: 'Iced Coffee',
    description:
      'A chilled coffee creation with a soft premium finish and mellow café aroma.',
    ingredients:
      'Coffee, chilled milk, ice, house sweetener',
    serving: 'Served chilled',
    image:
      '/assets/signature-drinks/zen-drink-character-05.png',
    accent: '#976544',
    available: true,
    featured: true,
    isNew: false,
    createdAt: '2026-08-01T00:00:04.000Z',
    dairyType: 'milk',
  },
  {
    id: 'zen-panda-welcome',
    kind: 'food',
    name: 'Zen Panda Welcome',
    category: 'Signature',
    description:
      'The visual signature of Zen Kitchen and the opening hero of the restaurant experience.',
    ingredients:
      'Zen Kitchen signature presentation',
    serving: 'Featured restaurant welcome',
    image: '/assets/menu-panda-main.png',
    accent: '#a32722',
    available: true,
    featured: true,
    isNew: false,
    spiceLevel: 'none',
    createdAt: '2026-08-01T00:01:00.000Z',
    dietaryType: 'veg',
  },
  {
    id: 'samurai-feast-rice',
    kind: 'food',
    name: 'Samurai Feast Rice',
    category: 'Rice Specials',
    description:
      'A generous spiced rice platter with roasted chicken, herbs and garnish.',
    ingredients:
      'Seasoned rice, roasted chicken, herbs, cashews, house garnish',
    serving: 'Main course · hearty serving',
    image: '/assets/menu-panda-rice.png',
    accent: '#b14d2b',
    available: true,
    featured: true,
    isNew: false,
    spiceLevel: 'medium',
    createdAt: '2026-08-01T00:01:01.000Z',
    dietaryType: 'non-veg',
  },
  {
    id: 'warrior-fire-wraps',
    kind: 'food',
    name: 'Warrior Fire Wraps',
    category: 'Wraps',
    description:
      'Hot stuffed wraps with smoky filling, fresh herbs and sauce.',
    ingredients:
      'Flatbread, seasoned filling, fresh herbs, vegetables, house sauce',
    serving: 'Street-food style · warm',
    image: '/assets/menu-panda-wraps.png',
    accent: '#9f241f',
    available: true,
    featured: true,
    isNew: false,
    spiceLevel: 'hot',
    createdAt: '2026-08-01T00:01:02.000Z',
    dietaryType: 'non-veg',
  },
  {
    id: 'zen-street-dogs',
    kind: 'food',
    name: 'Zen Street Dogs',
    category: 'Street Grill',
    description:
      'Grilled hot dogs with layered sauces and dips in a playful Zen Kitchen presentation.',
    ingredients:
      'Grilled sausage, bun, fresh garnish, house sauces',
    serving: 'Grill favourite · served warm',
    image: '/assets/menu-panda-dogs.png',
    accent: '#a33f1f',
    available: true,
    featured: true,
    isNew: false,
    spiceLevel: 'mild',
    createdAt: '2026-08-01T00:01:03.000Z',
    dietaryType: 'non-veg',
  },
  {
    id: 'black-armor-burger',
    kind: 'food',
    name: 'Black Armor Burger Set',
    category: 'Burgers',
    description:
      'A full double burger and fries set with a premium café presentation.',
    ingredients:
      'Burger bun, double filling, cheese, vegetables, fries, house dip',
    serving: 'Main course · served with fries',
    image: '/assets/menu-panda-burger.png',
    accent: '#7f2d19',
    available: true,
    featured: true,
    isNew: false,
    spiceLevel: 'mild',
    createdAt: '2026-08-01T00:01:04.000Z',
    dietaryType: 'non-veg',
  },
]

/* ==========================================
   EXISTING DRINK MENU EXPORT

   Preserved for components that use
   MENU_ITEMS for the drink menu.
========================================== */

export const MENU_ITEMS: MenuItem[] =
  DEFAULT_MENU_ITEMS.filter(
    item => item.kind === 'drink'
  )

/* ==========================================
   ZEN KITCHEN MENU EXPORTS

   These exports can be used by the
   Zen Kitchen page.

   The live website should still use
   the database-backed menu store.
========================================== */

export const ZEN_KITCHEN_MENU_ITEMS: MenuItem[] =
  DEFAULT_MENU_ITEMS.filter(
    item => isZenKitchenKind(item.kind)
  )

export const DEFAULT_SNACK_ITEMS: MenuItem[] =
  DEFAULT_MENU_ITEMS.filter(
    item => item.kind === 'snacks'
  )

/* ==========================================
   EXISTING GALLERY DATA

   Preserved without changes.
========================================== */

export const GALLERY_SEED = [
  {
    id: 'seed-1',
    user: 'Zen Café',
    caption:
      'Golden-hour calm around the Zen garden.',
    image:
      '/assets/gallery-samples/sample-01-landscape.jpg',
  },
  {
    id: 'seed-2',
    user: 'Zen Café',
    caption:
      'A warm vertical frame from a quiet evening.',
    image:
      '/assets/gallery-samples/sample-02-portrait.jpg',
  },
  {
    id: 'seed-3',
    user: 'Zen Café',
    caption:
      'The round door — one of our favourite Zen details.',
    image:
      '/assets/gallery-samples/sample-03-square.jpg',
  },
  {
    id: 'seed-4',
    user: 'Zen Café',
    caption:
      'A playful café character moment from the menu world.',
    image:
      '/assets/gallery-samples/sample-04-wide.jpg',
  },
]
