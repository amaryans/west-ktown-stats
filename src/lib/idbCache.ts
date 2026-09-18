/**
 * Minimal IndexedDB cache with TTL, used for the ~5 MB Sleeper players dump
 * (docs ask for at most one fetch per day). All failures degrade to a miss —
 * the app works without the cache, just slower.
 */
const DB_NAME = 'west-ktown-stats'
const STORE = 'cache'

interface CacheEntry<T> {
  value: T
  storedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function cacheGet<T>(key: string, maxAgeMs: number): Promise<T | undefined> {
  try {
    const db = await openDb()
    const entry = await new Promise<CacheEntry<T> | undefined>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      request.onsuccess = () => resolve(request.result as CacheEntry<T> | undefined)
      request.onerror = () => reject(request.error)
    })
    db.close()
    if (entry === undefined || Date.now() - entry.storedAt > maxAgeMs) return undefined
    return entry.value
  } catch {
    return undefined
  }
}

export async function cacheSet<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDb()
    const entry: CacheEntry<T> = { value, storedAt: Date.now() }
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite')
      tx.objectStore(STORE).put(entry, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  } catch {
    // Quota or availability problems just mean no cache this time.
  }
}
