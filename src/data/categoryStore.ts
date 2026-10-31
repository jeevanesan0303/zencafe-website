
import type { MenuItem, MenuKind } from './menu'

/* ==========================================
   STORAGE CONFIGURATION
========================================== */

const STORAGE_KEY = 'zen-admin-custom-categories-v46'
const EVENT_NAME = 'zen-menu-categories-updated'

/* ==========================================
   DEFAULT CATEGORIES
========================================== */

export const DEFAULT_FOOD_CATEGORIES: string[] = [
  'Signature',
  'Rice Specials',
  'Burgers',
  'Wraps',
  'Street Grill',
  'Noodles',
  'Chicken',
  'Seafood',
  'Desserts',
  'Sides',
  'Combo Meals',
]

export const DEFAULT_DRINK_CATEGORIES: string[] = [
  'Milkshake',
  'Mojito',
  'Iced Coffee',
  'Fresh Juice',
  'Smoothie',
  'Cooler',
  'Tea',
  'Coffee',
  'Berry Special',
  'Chocolate',
]

export const DEFAULT_SNACK_CATEGORIES: string[] = [
  'Signature Snacks',
  'Savory Snacks',
  'Quick Bites',
  'Fried Snacks',
  'Baked Snacks',
  'Sandwiches',
  'Pastries',
  'Sweet Snacks',
  'Evening Snacks',
  'Snack Combos',
]

/* ==========================================
   TYPES
========================================== */

type CategoryState = Record<MenuKind, string[]>

/* ==========================================
   STATE HELPERS
========================================== */

const emptyState = (): CategoryState => ({
  food: [],
  drink: [],
  snacks: [],
})

const clean = (value: string): string =>
  value.trim().replace(/\s+/g, ' ')

const uniq = (values: string[]): string[] =>
  Array.from(
    new Map(
      values
        .filter(Boolean)
        .map((value) => [value.toLowerCase(), value]),
    ).values(),
  )

/* ==========================================
   READ CUSTOM CATEGORIES
========================================== */

export function readCustomCategories(): CategoryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)

    if (!raw) {
      return emptyState()
    }

    const parsed: unknown = JSON.parse(raw)

    if (
      !parsed ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      return emptyState()
    }

    const stored = parsed as Record<string, unknown>

    const readList = (value: unknown): string[] => {
      if (!Array.isArray(value)) {
        return []
      }

      return uniq(
        value
          .filter(
            (item): item is string =>
              typeof item === 'string',
          )
          .map(clean)
          .filter(Boolean),
      )
    }

    return {
      food: readList(stored.food),
      drink: readList(stored.drink),
      snacks: readList(stored.snacks),
    }
  } catch {
    return emptyState()
  }
}

/* ==========================================
   WRITE CUSTOM CATEGORIES
========================================== */

function writeCustomCategories(next: CategoryState): void {
  const normalized: CategoryState = {
    food: uniq(next.food),
    drink: uniq(next.drink),
    snacks: uniq(next.snacks),
  }

  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(normalized),
  )

  window.dispatchEvent(new CustomEvent(EVENT_NAME))
}

/* ==========================================
   ADD CUSTOM CATEGORY
========================================== */

export function addCustomCategory(
  kind: MenuKind,
  name: string,
): string {
  const value = clean(name)

  if (!value) {
    throw new Error('Enter a category name.')
  }

  if (value.length > 48) {
    throw new Error('Category name is too long.')
  }

  const state = readCustomCategories()

  state[kind] = uniq([
    ...state[kind],
    value,
  ])

  writeCustomCategories(state)

  return value
}

/* ==========================================
   REMOVE CUSTOM CATEGORY
========================================== */

export function removeCustomCategory(
  kind: MenuKind,
  name: string,
): void {
  const target = clean(name).toLowerCase()

  const state = readCustomCategories()

  state[kind] = state[kind].filter(
    (item: string) =>
      item.toLowerCase() !== target,
  )

  writeCustomCategories(state)
}

/* ==========================================
   GET CATEGORY OPTIONS
========================================== */

export function getCategoryOptions(
  kind: MenuKind,
  items: MenuItem[] = [],
): string[] {
  const defaultCategories: Record<MenuKind, string[]> = {
    food: DEFAULT_FOOD_CATEGORIES,
    drink: DEFAULT_DRINK_CATEGORIES,
    snacks: DEFAULT_SNACK_CATEGORIES,
  }

  const defaults = defaultCategories[kind]

  const custom = readCustomCategories()[kind]

  const live = items
    .filter((item: MenuItem) => item.kind === kind)
    .map((item: MenuItem) =>
      clean(item.category || ''),
    )

  return uniq([
    ...defaults,
    ...custom,
    ...live,
  ]).sort((a: string, b: string) =>
    a.localeCompare(b),
  )
}

/* ==========================================
   CHECK CUSTOM CATEGORY
========================================== */

export function isCustomCategory(
  kind: MenuKind,
  name: string,
): boolean {
  const custom = readCustomCategories()[kind].map(
    (item: string) => item.toLowerCase(),
  )

  return custom.includes(
    clean(name).toLowerCase(),
  )
}

/* ==========================================
   SUBSCRIBE TO CATEGORY CHANGES
========================================== */

export function subscribeCategories(
  callback: () => void,
): () => void {
  const local = () => {
    callback()
  }

  const storage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      callback()
    }
  }

  window.addEventListener(EVENT_NAME, local)
  window.addEventListener('storage', storage)

  return () => {
    window.removeEventListener(EVENT_NAME, local)
    window.removeEventListener('storage', storage)
  }
}
