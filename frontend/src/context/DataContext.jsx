/**
 * DataContext — central cache for all API data.
 *
 * Eliminates duplicate fetches when navigating between pages.
 * Each cache entry has a TTL (default 60s). Stale data is shown
 * immediately while a background refresh runs silently.
 *
 * Usage:
 *   const { userQuizzes, myResults, adminStats, ... } = useData()
 *   userQuizzes.data   → cached array (or null while loading first time)
 *   userQuizzes.loading → true only on the very first fetch
 *   userQuizzes.refresh() → force refetch
 */

import { createContext, useContext, useRef, useCallback, useState, useEffect } from 'react'
import { api } from '../api'
import { useAuth } from './AuthContext'

const DataContext = createContext(null)

const TTL = {
  userQuizzes:  60_000,   // 60s  — quiz list changes rarely
  myResults:    30_000,   // 30s  — results after submit
  adminStats:   20_000,   // 20s  — dashboard counters
  adminQuizzes: 45_000,   // 45s
  adminUsers:   60_000,   // 60s  — user list rarely changes
}

function makeEntry() {
  return { data: null, fetchedAt: 0, promise: null }
}

export function DataProvider({ children }) {
  const { token } = useAuth()

  // Stable cache ref — survives re-renders, clears on token change
  const cache = useRef({
    userQuizzes:  makeEntry(),
    myResults:    makeEntry(),
    adminStats:   makeEntry(),
    adminQuizzes: makeEntry(),
    adminUsers:   makeEntry(),
  })

  // Force-update subscribers when a key's data changes
  const [version, setVersion] = useState(0)
  const bump = useCallback(() => setVersion(v => v + 1), [])

  // Clear cache on logout / token change
  useEffect(() => {
    if (!token) {
      Object.keys(cache.current).forEach(k => { cache.current[k] = makeEntry() })
      bump()
    }
  }, [token])

  /**
   * Generic fetch-with-cache.
   * Returns cached data if fresh; otherwise fetches, updates cache, bumps state.
   * Deduplicates concurrent fetches (in-flight promise reuse).
   */
  const fetch = useCallback((key, fetcher, ttl) => {
    const entry = cache.current[key]
    const now = Date.now()

    // Fresh data — return immediately, no fetch
    if (entry.data !== null && now - entry.fetchedAt < ttl) {
      return entry.data
    }

    // Already fetching — don't fire a second request
    if (!entry.promise) {
      entry.promise = fetcher()
        .then(data => {
          cache.current[key] = { data, fetchedAt: Date.now(), promise: null }
          bump()
        })
        .catch(err => {
          cache.current[key].promise = null
          console.error(`[cache] ${key} failed:`, err)
        })
    }

    return entry.data  // Return stale (or null) while fetching
  }, [token, bump])

  const isLoading = useCallback((key) => {
    const e = cache.current[key]
    return e.data === null && e.promise !== null
  }, [version])

  const getData = useCallback((key) => cache.current[key].data, [version])

  const refresh = useCallback((key, fetcher, ttl) => {
    cache.current[key].fetchedAt = 0   // Expire immediately
    fetch(key, fetcher, ttl)
  }, [fetch])

  // ── Public interface ────────────────────────────────────

  const userQuizzes = {
    get data() { return getData('userQuizzes') },
    get loading() { return isLoading('userQuizzes') },
    load: (params = '') => fetch('userQuizzes', () => api.userQuizzes(token, params), TTL.userQuizzes),
    refresh: (params = '') => refresh('userQuizzes', () => api.userQuizzes(token, params), TTL.userQuizzes),
  }

  const myResults = {
    get data() { return getData('myResults') },
    get loading() { return isLoading('myResults') },
    load: () => fetch('myResults', () => api.myResults(token), TTL.myResults),
    refresh: () => refresh('myResults', () => api.myResults(token), TTL.myResults),
  }

  const adminStats = {
    get data() { return getData('adminStats') },
    get loading() { return isLoading('adminStats') },
    load: () => fetch('adminStats', () => api.adminStats(token), TTL.adminStats),
    refresh: () => refresh('adminStats', () => api.adminStats(token), TTL.adminStats),
  }

  const adminQuizzes = {
    get data() { return getData('adminQuizzes') },
    get loading() { return isLoading('adminQuizzes') },
    load: () => fetch('adminQuizzes', () => api.adminQuizzes(token), TTL.adminQuizzes),
    refresh: () => refresh('adminQuizzes', () => api.adminQuizzes(token), TTL.adminQuizzes),
  }

  const adminUsers = {
    get data() { return getData('adminUsers') },
    get loading() { return isLoading('adminUsers') },
    load: () => fetch('adminUsers', () => api.adminUsers(token), TTL.adminUsers),
    refresh: () => refresh('adminUsers', () => api.adminUsers(token), TTL.adminUsers),
  }

  const [link,setLink]=useState('')

  const [fullscreen, setFullscreen] = useState(false)

  const [countTabSwitch,setCountTabSwitch] =useState(0)


  return (
    <DataContext.Provider value={{ userQuizzes, myResults, adminStats, adminQuizzes, adminUsers, cacheVersion: version,link ,setLink,fullscreen,setFullscreen,countTabSwitch,setCountTabSwitch}}>
      {children}
    </DataContext.Provider>
  )
}

export const useData = () => useContext(DataContext)
