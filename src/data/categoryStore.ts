import { MenuItem, MenuKind } from './menu'

const STORAGE_KEY = 'zen-admin-custom-categories-v46'
const EVENT_NAME = 'zen-menu-categories-updated'

export const DEFAULT_FOOD_CATEGORIES = [
  'Signature','Rice Specials','Burgers','Wraps','Street Grill','Noodles','Chicken','Seafood','Desserts','Sides','Combo Meals'
]

export const DEFAULT_DRINK_CATEGORIES = [
  'Milkshake','Mojito','Iced Coffee','Fresh Juice','Smoothie','Cooler','Tea','Coffee','Berry Special','Chocolate'
]

type CategoryState = { food: string[]; drink: string[] }

const emptyState = (): CategoryState => ({ food: [], drink: [] })
const clean = (value: string) => value.trim().replace(/\s+/g, ' ')
const uniq = (values: string[]) => Array.from(new Map(values.filter(Boolean).map(v => [v.toLowerCase(), v])).values())

export function readCustomCategories(): CategoryState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyState()
    const parsed = JSON.parse(raw) as Partial<CategoryState>
    return {
      food: uniq((parsed.food || []).map(clean)),
      drink: uniq((parsed.drink || []).map(clean)),
    }
  } catch {
    return emptyState()
  }
}

function writeCustomCategories(next: CategoryState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ food: uniq(next.food), drink: uniq(next.drink) }))
  window.dispatchEvent(new CustomEvent(EVENT_NAME))
}

export function addCustomCategory(kind: MenuKind, name: string) {
  const value = clean(name)
  if (!value) throw new Error('Enter a category name.')
  if (value.length > 48) throw new Error('Category name is too long.')
  const state = readCustomCategories()
  state[kind] = uniq([...state[kind], value])
  writeCustomCategories(state)
  return value
}

export function removeCustomCategory(kind: MenuKind, name: string) {
  const target = clean(name).toLowerCase()
  const state = readCustomCategories()
  state[kind] = state[kind].filter(item => item.toLowerCase() !== target)
  writeCustomCategories(state)
}

export function getCategoryOptions(kind: MenuKind, items: MenuItem[] = []) {
  const defaults = kind === 'food' ? DEFAULT_FOOD_CATEGORIES : DEFAULT_DRINK_CATEGORIES
  const custom = readCustomCategories()[kind]
  const live = items.filter(item => item.kind === kind).map(item => clean(item.category || ''))
  return uniq([...defaults, ...custom, ...live]).sort((a, b) => a.localeCompare(b))
}

export function isCustomCategory(kind: MenuKind, name: string) {
  const custom = readCustomCategories()[kind].map(item => item.toLowerCase())
  return custom.includes(clean(name).toLowerCase())
}

export function subscribeCategories(callback: () => void) {
  const local = () => callback()
  const storage = (event: StorageEvent) => { if (event.key === STORAGE_KEY) callback() }
  window.addEventListener(EVENT_NAME, local)
  window.addEventListener('storage', storage)
  return () => {
    window.removeEventListener(EVENT_NAME, local)
    window.removeEventListener('storage', storage)
  }
}
