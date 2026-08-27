const GITHUB_REPO = 'kiln-dev/kiln'
const CURRENT_VERSION = '0.1.0'
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const LAST_CHECK_KEY = 'kiln:lastUpdateCheck'
const CACHED_UPDATE_KEY = 'kiln:cachedUpdate'

export interface UpdateInfo {
  version: string
  url: string
}

export async function checkForUpdates(): Promise<UpdateInfo | null> {
  // Skip if checked recently (persists across app restarts)
  const lastCheck = localStorage.getItem(LAST_CHECK_KEY)
  if (lastCheck && Date.now() - Number(lastCheck) < CHECK_INTERVAL_MS) {
    const cached = localStorage.getItem(CACHED_UPDATE_KEY)
    return cached ? JSON.parse(cached) : null
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      { headers: { Accept: 'application/vnd.github.v3+json' } },
    )
    if (!res.ok) return null
    const data = await res.json()
    const latestVersion = (data.tag_name as string | undefined)?.replace(/^v/, '') ?? ''
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()))
    if (
      latestVersion &&
      latestVersion !== CURRENT_VERSION &&
      isNewerVersion(latestVersion, CURRENT_VERSION)
    ) {
      const update = { version: latestVersion, url: data.html_url as string }
      localStorage.setItem(CACHED_UPDATE_KEY, JSON.stringify(update))
      return update
    }
    localStorage.removeItem(CACHED_UPDATE_KEY)
    return null
  } catch {
    return null
  }
}

function isNewerVersion(latest: string, current: string): boolean {
  const l = latest.split('.').map(Number)
  const c = current.split('.').map(Number)
  for (let i = 0; i < Math.max(l.length, c.length); i++) {
    const lv = l[i] ?? 0
    const cv = c[i] ?? 0
    if (lv > cv) return true
    if (lv < cv) return false
  }
  return false
}
