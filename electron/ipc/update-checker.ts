import { BrowserWindow, shell } from 'electron'
import { app } from 'electron'

const REPO = 'pontus-espe/sparkflow'
const CHECK_INTERVAL = 4 * 60 * 60 * 1000 // 4 hours

function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, ...args)
  }
}

export async function checkForUpdates(): Promise<void> {
  try {
    const currentVersion = app.getVersion()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)

    const response = await fetch(
      `https://api.github.com/repos/${REPO}/releases/latest`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: controller.signal
      }
    )
    clearTimeout(timeout)

    if (!response.ok) return

    const data = await response.json()
    const latestTag = (data.tag_name || '').replace(/^v/, '')
    const htmlUrl = data.html_url || `https://github.com/${REPO}/releases/latest`

    if (!latestTag) return

    if (isNewerVersion(latestTag, currentVersion)) {
      console.log(`[Update] New version available: v${latestTag} (current: v${currentVersion})`)
      broadcast('app:update-available', {
        currentVersion,
        latestVersion: latestTag,
        url: htmlUrl
      })
    } else {
      console.log(`[Update] Up to date (v${currentVersion})`)
    }
  } catch (err) {
    // Silent fail — update check is non-critical
    console.log('[Update] Check failed:', err instanceof Error ? err.message : err)
  }
}

/** Compare semver strings: returns true if latest > current */
function isNewerVersion(latest: string, current: string): boolean {
  const l = latest.split('.').map(Number)
  const c = current.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const lv = l[i] || 0
    const cv = c[i] || 0
    if (lv > cv) return true
    if (lv < cv) return false
  }
  return false
}

export function startUpdateChecker(): void {
  // Check after a short delay on startup (don't block app launch)
  setTimeout(() => checkForUpdates(), 15_000)

  // Then check periodically
  setInterval(() => checkForUpdates(), CHECK_INTERVAL)
}

export function openReleaseUrl(url: string): void {
  shell.openExternal(url)
}
