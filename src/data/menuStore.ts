
import {
  DEFAULT_MENU_ITEMS,
  type MenuItem,
  type MenuKind,
} from './menu'

import { getAdminAuthHeaders } from '../admin-auth'

/* ==========================================
   ZEN CAFÉ — MENU STORAGE
========================================== */

const STORAGE_KEY = 'zen-admin-menu-catalog-v35'
const VERSION_KEY = 'zen-admin-menu-version-v35'
const EVENT_NAME = 'zen-menu-catalog-updated'

const MENU_MEDIA_DB = 'zen-cafe-menu-media-v119'
const MENU_MEDIA_STORE = 'menu-images'
const MENU_MEDIA_PREFIX = 'zen-menu-media:'

const LEGACY_WARRIOR_IMAGE_REPLACEMENTS: Record<
  string,
  string
> = {
  '/assets/menu-warrior-strawberry.png':
    '/assets/signature-drinks/zen-drink-character-01.png',

  '/assets/menu-warrior-berry.png':
    '/assets/signature-drinks/zen-drink-character-02.png',

  '/assets/menu-warrior-chocolate.png':
    '/assets/signature-drinks/zen-drink-character-03.png',

  '/assets/menu-warrior-mojito.png':
    '/assets/signature-drinks/zen-drink-character-04.png',

  '/assets/menu-warrior-coffee.png':
    '/assets/signature-drinks/zen-drink-character-05.png',
}

/* ==========================================
   PRODUCT NORMALISATION
========================================== */

const inferDietaryType = (item: Partial<MenuItem>) => {
  if (item.kind !== 'food') {
    return undefined
  }

  if (
    item.dietaryType === 'veg' ||
    item.dietaryType === 'non-veg'
  ) {
    return item.dietaryType
  }

  const text = `
    ${item.name || ''}
    ${item.category || ''}
    ${item.ingredients || ''}
    ${item.description || ''}
  `.toLowerCase()

  return /(chicken|beef|mutton|lamb|fish|seafood|prawn|shrimp|crab|tuna|salmon|sausage|meat|egg)/.test(
    text
  )
    ? 'non-veg'
    : 'veg'
}

const inferDairyType = (item: Partial<MenuItem>) => {
  if (item.kind !== 'drink') {
    return undefined
  }

  if (
    item.dairyType === 'milk' ||
    item.dairyType === 'milk-powder' ||
    item.dairyType === 'dairy-free'
  ) {
    return item.dairyType
  }

  const text = `
    ${item.name || ''}
    ${item.category || ''}
    ${item.ingredients || ''}
    ${item.description || ''}
  `.toLowerCase()

  if (
    /(milk powder|powdered milk|dairy powder)/.test(
      text
    )
  ) {
    return 'milk-powder'
  }

  if (/(milk|cream|latte|milkshake)/.test(text)) {
    return 'milk'
  }

  return 'dairy-free'
}

const normalise = (item: MenuItem): MenuItem => {
  const kind: MenuKind =
    item.kind === 'food' ? 'food' : 'drink'

  const price =
    typeof item.price === 'number' &&
    Number.isFinite(item.price) &&
    item.price >= 0
      ? item.price
      : undefined

  return {
    ...item,

    kind,

    name:
      item.name?.trim() || 'Unnamed Product',

    category:
      item.category?.trim() ||
      (kind === 'food'
        ? 'Other Food'
        : 'Other Drinks'),

    description:
      item.description?.trim() || '',

    ingredients:
      item.ingredients?.trim() || '',

    serving:
      item.serving?.trim() || '',

    image:
      LEGACY_WARRIOR_IMAGE_REPLACEMENTS[
        item.image || ''
      ] ||
      item.image ||
      '/assets/menu-panda-main.png',

    accent:
      /^#[0-9a-f]{6}$/i.test(item.accent || '')
        ? item.accent
        : '#a32722',

    available: item.available !== false,
    featured: item.featured !== false,
    isNew: item.isNew === true,

    price,

    spiceLevel:
      kind === 'food' &&
      (
        item.spiceLevel === 'none' ||
        item.spiceLevel === 'mild' ||
        item.spiceLevel === 'medium' ||
        item.spiceLevel === 'hot'
      )
        ? item.spiceLevel
        : undefined,

    createdAt:
      item.createdAt ||
      new Date().toISOString(),

    dietaryType: inferDietaryType({
      ...item,
      kind,
    }),

    dairyType: inferDairyType({
      ...item,
      kind,
    }),
  }
}

/* ==========================================
   CATALOG CACHE & BACKEND API SYNC
========================================== */

let catalogCache: MenuItem[] | null = null
let fetchInFlight: Promise<MenuItem[]> | null = null

export async function loadMenuCatalog(
  options?: { all?: boolean }
): Promise<MenuItem[]> {
  const query = options?.all ? '?all=true' : ''
  const response = await fetch(`/api/products${query}`, {
    headers: {
      Accept: 'application/json',
      ...getAdminAuthHeaders(),
    },
  })

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('Products API is unreachable or returned invalid response.')
  }

  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.error || `Server error: ${response.status}`)
  }

  const items = Array.isArray(json.data)
    ? (json.data as MenuItem[]).map(normalise)
    : []

  catalogCache = items
  writeLocalCache(items)

  window.dispatchEvent(
    new CustomEvent(EVENT_NAME)
  )

  return items
}

/* ==========================================
   READ MENU
========================================== */

export function readMenuCatalog(): MenuItem[] {
  if (catalogCache !== null) {
    return catalogCache
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        catalogCache = (parsed as MenuItem[]).map(normalise)
        return catalogCache
      }
    }
  } catch {
    // Local storage parse error
  }

  // Trigger background load if running in browser
  if (typeof window !== 'undefined' && !fetchInFlight) {
    fetchInFlight = loadMenuCatalog().catch(() => []).finally(() => {
      fetchInFlight = null
    })
  }

  return []
}

/* ==========================================
   WRITE LOCAL CACHE
========================================== */

const isQuotaError = (error: unknown) =>
  error instanceof DOMException &&
  (
    error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
  )

function writeLocalCache(
  items: MenuItem[]
): void {
  const payload = JSON.stringify(
    items.map(normalise)
  )

  try {
    localStorage.setItem(STORAGE_KEY, payload)
  } catch (error) {
    if (!isQuotaError(error)) return

    const previous =
      localStorage.getItem(STORAGE_KEY)

    localStorage.removeItem(STORAGE_KEY)

    try {
      localStorage.setItem(
        STORAGE_KEY,
        payload
      )
    } catch {
      try {
        if (previous) {
          localStorage.setItem(
            STORAGE_KEY,
            previous
          )
        }
      } catch {
        // Ignore restoration failure.
      }
    }
  }

  try {
    localStorage.setItem(
      VERSION_KEY,
      String(Date.now())
    )
  } catch {
    // The catalog has already been saved.
  }
}

export function writeMenuCatalog(
  items: MenuItem[]
): void {
  catalogCache = items.map(normalise)
  writeLocalCache(items)

  window.dispatchEvent(
    new CustomEvent(EVENT_NAME)
  )
}

/* ==========================================
   ADD PRODUCT (POST /api/products)
========================================== */

export async function addMenuProduct(
  product: MenuItem
): Promise<MenuItem> {
  const response = await fetch('/api/products', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...getAdminAuthHeaders(),
    },
    body: JSON.stringify(product),
  })

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('Server returned non-JSON response while adding product.')
  }

  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.error || `Failed to add product (${response.status})`)
  }

  const savedProduct = normalise(json.data as MenuItem)
  const current = readMenuCatalog()
  const next = [
    ...current.filter(item => item.id !== savedProduct.id),
    savedProduct,
  ]

  writeMenuCatalog(next)
  return savedProduct
}

/* ==========================================
   UPDATE PRODUCT (PUT /api/products/:id)
========================================== */

export async function updateMenuProduct(
  id: string,
  updates: Partial<MenuItem>
): Promise<MenuItem> {
  const response = await fetch(
    `/api/products/${encodeURIComponent(id)}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...getAdminAuthHeaders(),
      },
      body: JSON.stringify(updates),
    }
  )

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('Server returned non-JSON response while updating product.')
  }

  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.error || `Failed to update product (${response.status})`)
  }

  const updatedProduct = normalise(json.data as MenuItem)
  const current = readMenuCatalog()
  const next = current.map(item =>
    item.id === id ? updatedProduct : item
  )

  writeMenuCatalog(next)
  return updatedProduct
}

/* ==========================================
   DELETE PRODUCT (DELETE /api/products/:id)
========================================== */

export async function deleteMenuProduct(
  id: string
): Promise<void> {
  const response = await fetch(
    `/api/products/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
      headers: {
        Accept: 'application/json',
        ...getAdminAuthHeaders(),
      },
    }
  )

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new Error('Server returned non-JSON response while deleting product.')
  }

  const json = await response.json()
  if (!response.ok || !json.success) {
    throw new Error(json.error || `Failed to delete product (${response.status})`)
  }

  const current = readMenuCatalog()
  const next = current.filter(item => item.id !== id)

  writeMenuCatalog(next)
}

/* ==========================================
   RESET MENU
========================================== */

export function resetMenuCatalog(): void {
  writeMenuCatalog(
    DEFAULT_MENU_ITEMS.map(
      item => ({ ...item })
    )
  )
}

/* ==========================================
   PUBLIC MENU
========================================== */

export function getVisibleMenu(
  kind: MenuKind
): MenuItem[] {
  return readMenuCatalog()
    .filter(
      item =>
        item.kind === kind &&
        item.available
    )
    .sort(
      (a, b) =>
        Number(b.featured) -
          Number(a.featured) ||
        a.createdAt.localeCompare(
          b.createdAt
        )
    )
}

/* ==========================================
   SUBSCRIBE TO MENU UPDATES
========================================== */

export function subscribeMenuCatalog(
  callback: () => void
): () => void {
  const local = () => callback()

  const storage = (
    event: StorageEvent
  ) => {
    if (
      event.key === STORAGE_KEY ||
      event.key === VERSION_KEY
    ) {
      callback()
    }
  }

  window.addEventListener(
    EVENT_NAME,
    local
  )

  window.addEventListener(
    'storage',
    storage
  )

  return () => {
    window.removeEventListener(
      EVENT_NAME,
      local
    )

    window.removeEventListener(
      'storage',
      storage
    )
  }
}

/* ==========================================
   IMAGE FILE HELPERS
========================================== */

const readFileDataUrl = (
  file: File
): Promise<string> =>
  new Promise<string>(
    (resolve, reject) => {
      const reader = new FileReader()

      reader.onload = () =>
        resolve(
          String(reader.result || '')
        )

      reader.onerror = () =>
        reject(
          new Error('Could not read image.')
        )

      reader.readAsDataURL(file)
    }
  )

const loadImage = (
  source: string
): Promise<HTMLImageElement> =>
  new Promise<HTMLImageElement>(
    (resolve, reject) => {
      const image = new Image()

      image.onload = () =>
        resolve(image)

      image.onerror = () =>
        reject(
          new Error(
            'Could not process image.'
          )
        )

      image.src = source
    }
  )

const findOpaqueBounds = (
  data: Uint8ClampedArray,
  w: number,
  h: number,
  alphaThreshold = 18
) => {
  let minX = w
  let minY = h
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (
        data[
          (y * w + x) * 4 + 3
        ] > alphaThreshold
      ) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return {
      minX: 0,
      minY: 0,
      maxX: w - 1,
      maxY: h - 1,
    }
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
  }
}

const hasTransparentPixels = (
  data: Uint8ClampedArray
): boolean => {
  for (
    let i = 3;
    i < data.length;
    i += 4
  ) {
    if (data[i] < 245) {
      return true
    }
  }

  return false
}

const exportTrimmedTransparentImage = (
  sourceCanvas: HTMLCanvasElement,
  bounds: {
    minX: number
    minY: number
    maxX: number
    maxY: number
  }
): string => {
  const bw =
    bounds.maxX - bounds.minX + 1

  const bh =
    bounds.maxY - bounds.minY + 1

  const pad = Math.round(
    Math.max(bw, bh) * 0.08
  )

  const out =
    document.createElement('canvas')

  out.width = Math.max(
    1,
    bw + pad * 2
  )

  out.height = Math.max(
    1,
    bh + pad * 2
  )

  const outCtx =
    out.getContext('2d')

  if (!outCtx) {
    throw new Error(
      'Dish image export is unavailable.'
    )
  }

  outCtx.clearRect(
    0,
    0,
    out.width,
    out.height
  )

  outCtx.drawImage(
    sourceCanvas,
    bounds.minX,
    bounds.minY,
    bw,
    bh,
    pad,
    pad,
    bw,
    bh
  )

  return out.toDataURL('image/png')
}

/* ==========================================
   INDEXEDDB IMAGE STORAGE
========================================== */

let menuMediaDbPromise:
  Promise<IDBDatabase> | null = null

const openMenuMediaDb = ():
  Promise<IDBDatabase> => {
  if (menuMediaDbPromise) {
    return menuMediaDbPromise
  }

  menuMediaDbPromise =
    new Promise<IDBDatabase>(
      (resolve, reject) => {
        if (
          !('indexedDB' in window)
        ) {
          reject(
            new Error(
              'Browser media storage is unavailable.'
            )
          )
          return
        }

        const request =
          indexedDB.open(
            MENU_MEDIA_DB,
            1
          )

        request.onupgradeneeded = () => {
          const db = request.result

          if (
            !db.objectStoreNames.contains(
              MENU_MEDIA_STORE
            )
          ) {
            db.createObjectStore(
              MENU_MEDIA_STORE
            )
          }
        }

        request.onsuccess = () =>
          resolve(request.result)

        request.onerror = () =>
          reject(
            request.error ||
            new Error(
              'Could not open browser media storage.'
            )
          )
      }
    ).catch(error => {
      menuMediaDbPromise = null
      throw error
    })

  return menuMediaDbPromise
}

const putMenuImageBlob = async (
  blob: Blob
): Promise<string> => {
  const db = await openMenuMediaDb()

  const key =
    `menu-${crypto.randomUUID()}`

  await new Promise<void>(
    (resolve, reject) => {
      const tx = db.transaction(
        MENU_MEDIA_STORE,
        'readwrite'
      )

      tx.objectStore(
        MENU_MEDIA_STORE
      ).put(blob, key)

      tx.oncomplete = () =>
        resolve()

      tx.onerror = () =>
        reject(
          tx.error ||
          new Error(
            'Could not save the product photo.'
          )
        )

      tx.onabort = () =>
        reject(
          tx.error ||
          new Error(
            'Could not save the product photo.'
          )
        )
    }
  )

  return `${MENU_MEDIA_PREFIX}${key}`
}

const getMenuImageBlob = async (
  source: string
): Promise<Blob | null> => {
  if (
    !source.startsWith(
      MENU_MEDIA_PREFIX
    )
  ) {
    return null
  }

  const key = source.slice(
    MENU_MEDIA_PREFIX.length
  )

  const db = await openMenuMediaDb()

  return await new Promise<
    Blob | null
  >((resolve, reject) => {
    const tx = db.transaction(
      MENU_MEDIA_STORE,
      'readonly'
    )

    const request = tx
      .objectStore(
        MENU_MEDIA_STORE
      )
      .get(key)

    request.onsuccess = () =>
      resolve(
        request.result instanceof Blob
          ? request.result
          : null
      )

    request.onerror = () =>
      reject(
        request.error ||
        new Error(
          'Could not load the product photo.'
        )
      )
  })
}

const dataUrlToBlob = async (
  source: string
): Promise<Blob> => {
  const response = await fetch(source)

  if (!response.ok) {
    throw new Error(
      'Could not prepare the saved product photo.'
    )
  }

  return await response.blob()
}

export const isStoredMenuImageRef = (
  source: string
): boolean =>
  source.startsWith(
    MENU_MEDIA_PREFIX
  )

export async function resolveStoredMenuImage(
  source: string
): Promise<string> {
  if (
    !isStoredMenuImageRef(source)
  ) {
    return source
  }

  const blob =
    await getMenuImageBlob(source)

  if (!blob) {
    throw new Error(
      'Saved product photo was not found in browser storage.'
    )
  }

  return URL.createObjectURL(blob)
}

export async function deleteStoredMenuImage(
  source: string
): Promise<void> {
  if (
    !isStoredMenuImageRef(source)
  ) {
    return
  }

  const key = source.slice(
    MENU_MEDIA_PREFIX.length
  )

  const db = await openMenuMediaDb()

  await new Promise<void>(
    (resolve, reject) => {
      const tx = db.transaction(
        MENU_MEDIA_STORE,
        'readwrite'
      )

      tx.objectStore(
        MENU_MEDIA_STORE
      ).delete(key)

      tx.oncomplete = () =>
        resolve()

      tx.onerror = () =>
        reject(
          tx.error ||
          new Error(
            'Could not remove the saved product photo.'
          )
        )
    }
  )
}

/* ==========================================
   PREPARE AND STORE UPLOADED IMAGE
========================================== */

export async function prepareStoredMenuImage(
  file: File
): Promise<string> {
  const prepared =
    await prepareTransparentMenuImage(
      file
    )

  const blob =
    await dataUrlToBlob(prepared)

  return await putMenuImageBlob(
    blob
  )
}

/* ==========================================
   PERSIST MENU + MIGRATE OLD IMAGES
========================================== */

export async function persistMenuCatalog(
  items: MenuItem[]
): Promise<MenuItem[]> {
  const migrated: MenuItem[] = []

  for (const item of items) {
    let image =
      LEGACY_WARRIOR_IMAGE_REPLACEMENTS[
        item.image
      ] ||
      item.image

    if (
      image?.startsWith(
        'data:image/'
      )
    ) {
      const blob =
        await dataUrlToBlob(image)

      image =
        await putMenuImageBlob(blob)
    }

    migrated.push(
      normalise({
        ...item,
        image,
      })
    )
  }

  writeMenuCatalog(migrated)

  return migrated
}

/* ==========================================
   IMAGE COMPRESSION
========================================== */

export async function compressMenuImage(
  file: File
): Promise<string> {
  if (
    !file.type.startsWith(
      'image/'
    )
  ) {
    throw new Error(
      'Please choose an image file.'
    )
  }

  if (
    file.size >
    12 * 1024 * 1024
  ) {
    throw new Error(
      'Image must be smaller than 12 MB.'
    )
  }

  const dataUrl =
    await readFileDataUrl(file)

  const image =
    await loadImage(dataUrl)

  const max = 1000

  const ratio = Math.min(
    1,
    max /
      Math.max(
        image.width,
        image.height
      )
  )

  const canvas =
    document.createElement('canvas')

  canvas.width = Math.max(
    1,
    Math.round(
      image.width * ratio
    )
  )

  canvas.height = Math.max(
    1,
    Math.round(
      image.height * ratio
    )
  )

  const context =
    canvas.getContext('2d')

  if (!context) {
    throw new Error(
      'Image processing is unavailable.'
    )
  }

  context.drawImage(
    image,
    0,
    0,
    canvas.width,
    canvas.height
  )

  return canvas.toDataURL(
    'image/jpeg',
    0.82
  )
}

/* ==========================================
   TRANSPARENT PRODUCT IMAGE PROCESSING
========================================== */

export async function prepareTransparentMenuImage(
  file: File
): Promise<string> {
  const smartCutout = true

  if (
    !file.type.startsWith(
      'image/'
    )
  ) {
    throw new Error(
      'Please choose an image file.'
    )
  }

  if (
    file.size >
    12 * 1024 * 1024
  ) {
    throw new Error(
      'Dish image must be smaller than 12 MB.'
    )
  }

  const dataUrl =
    await readFileDataUrl(file)

  const image =
    await loadImage(dataUrl)

  const max = 820

  const ratio = Math.min(
    1,
    max /
      Math.max(
        image.width,
        image.height
      )
  )

  const canvas =
    document.createElement('canvas')

  canvas.width = Math.max(
    1,
    Math.round(
      image.width * ratio
    )
  )

  canvas.height = Math.max(
    1,
    Math.round(
      image.height * ratio
    )
  )

  const ctx = canvas.getContext(
    '2d',
    {
      willReadFrequently: true,
    }
  )

  if (!ctx) {
    throw new Error(
      'Dish image processing is unavailable.'
    )
  }

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  )

  ctx.drawImage(
    image,
    0,
    0,
    canvas.width,
    canvas.height
  )

  const baseImageData =
    ctx.getImageData(
      0,
      0,
      canvas.width,
      canvas.height
    )

  const basePx =
    baseImageData.data

  const w = canvas.width
  const h = canvas.height

  // Preserve original transparent PNG/WebP files.
  if (
    hasTransparentPixels(
      basePx
    )
  ) {
    return dataUrl
  }

  if (smartCutout) {
    const px =
      baseImageData.data

    const border: number[][] = []

    const step = Math.max(
      1,
      Math.floor(
        Math.min(w, h) / 70
      )
    )

    const push = (
      x: number,
      y: number
    ) => {
      const i =
        (y * w + x) * 4

      if (
        px[i + 3] > 24
      ) {
        border.push([
          px[i],
          px[i + 1],
          px[i + 2],
        ])
      }
    }

    for (
      let x = 0;
      x < w;
      x += step
    ) {
      push(x, 0)
      push(x, h - 1)
    }

    for (
      let y = 0;
      y < h;
      y += step
    ) {
      push(0, y)
      push(w - 1, y)
    }

    const avg = border.length
      ? border
          .reduce(
            (a, c) => [
              a[0] + c[0],
              a[1] + c[1],
              a[2] + c[2],
            ],
            [0, 0, 0]
          )
          .map(
            v =>
              v /
              border.length
          )
      : [255, 255, 255]

    const lum =
      (avg[0] +
        avg[1] +
        avg[2]) /
      3

    const spread =
      Math.max(...avg) -
      Math.min(...avg)

    const plainBackground =
      border.length === 0 ||
      spread < 75

    if (plainBackground) {
      const visited =
        new Uint8Array(
          w * h
        )

      const queueX =
        new Int32Array(
          w * h
        )

      const queueY =
        new Int32Array(
          w * h
        )

      let head = 0
      let tail = 0

      const threshold =
        lum > 210
          ? 72
          : lum < 60
            ? 54
            : 60

      const pushQ = (
        x: number,
        y: number
      ) => {
        if (
          x < 0 ||
          y < 0 ||
          x >= w ||
          y >= h
        ) {
          return
        }

        const idx =
          y * w + x

        if (
          visited[idx]
        ) {
          return
        }

        const p =
          idx * 4

        if (
          px[p + 3] < 18
        ) {
          visited[idx] = 1

          queueX[tail] = x
          queueY[tail] = y

          tail++
          return
        }

        const dr =
          px[p] - avg[0]

        const dg =
          px[p + 1] - avg[1]

        const db =
          px[p + 2] - avg[2]

        const dist =
          Math.sqrt(
            dr * dr +
            dg * dg +
            db * db
          )

        if (
          dist > threshold
        ) {
          return
        }

        visited[idx] = 1

        queueX[tail] = x
        queueY[tail] = y

        tail++
      }

      for (
        let x = 0;
        x < w;
        x += 2
      ) {
        pushQ(x, 0)
        pushQ(x, h - 1)
      }

      for (
        let y = 0;
        y < h;
        y += 2
      ) {
        pushQ(0, y)
        pushQ(w - 1, y)
      }

      while (
        head < tail
      ) {
        const x =
          queueX[head]

        const y =
          queueY[head]

        head++

        const idx =
          y * w + x

        const p =
          idx * 4

        const dr =
          px[p] - avg[0]

        const dg =
          px[p + 1] - avg[1]

        const db =
          px[p + 2] - avg[2]

        const dist =
          Math.sqrt(
            dr * dr +
            dg * dg +
            db * db
          )

        const feather =
          Math.max(
            0,
            Math.min(
              1,
              (
                dist -
                threshold * 0.42
              ) /
              (
                threshold * 0.58
              )
            )
          )

        px[p + 3] =
          Math.min(
            px[p + 3],
            Math.round(
              255 * feather
            )
          )

        pushQ(
          x + 1,
          y
        )

        pushQ(
          x - 1,
          y
        )

        pushQ(
          x,
          y + 1
        )

        pushQ(
          x,
          y - 1
        )
      }

      ctx.putImageData(
        baseImageData,
        0,
        0
      )
    }
  }

  const cleaned =
    ctx.getImageData(
      0,
      0,
      w,
      h
    ).data

  return exportTrimmedTransparentImage(
    canvas,
    findOpaqueBounds(
      cleaned,
      w,
      h,
      18
    )
  )
}

/* ==========================================
   GAMES & REWARDS — PRODUCT TYPES
========================================== */

export type ScratchRewardProduct = {
  id: string
  name: string
  kind: MenuKind
  category: string
  description: string
  image: string
  price?: number
}

/* ==========================================
   GAMES & REWARDS — ELIGIBLE PRODUCTS

   Only available food and drink products
   can be selected as scratch-card rewards.
========================================== */

export function getScratchRewardProducts():
  ScratchRewardProduct[] {
  return readMenuCatalog()
    .filter(
      product =>
        product.available === true &&
        (
          product.kind === 'food' ||
          product.kind === 'drink'
        )
    )
    .map(product => ({
      id: product.id,
      name: product.name,
      kind: product.kind,
      category: product.category,
      description:
        product.description || '',
      image: product.image,
      price: product.price,
    }))
    .sort((a, b) => {
      const kindComparison =
        a.kind.localeCompare(
          b.kind
        )

      if (
        kindComparison !== 0
      ) {
        return kindComparison
      }

      return a.name.localeCompare(
        b.name
      )
    })
}

/* ==========================================
   GAMES & REWARDS — FIND PRODUCT
========================================== */

export function getScratchRewardProduct(
  productId: string
): ScratchRewardProduct | null {
  return (
    getScratchRewardProducts().find(
      product =>
        product.id === productId
    ) ?? null
  )
}

/* ==========================================
   GAMES & REWARDS — CHECK ELIGIBILITY
========================================== */

export function isScratchRewardEligible(
  productId: string
): boolean {
  return (
    getScratchRewardProduct(
      productId
    ) !== null
  )
}
