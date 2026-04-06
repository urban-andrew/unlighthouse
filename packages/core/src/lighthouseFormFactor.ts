import type { Flags } from 'lighthouse'

/**
 * Clone resolved Lighthouse flags and apply screen emulation + UA for a single form factor.
 * Used when `scanner.dualDevice` runs separate mobile and desktop audits.
 */
export function applyFormFactorFlags(base: Flags, formFactor: 'mobile' | 'desktop'): Flags {
  const merged: Flags = { ...base, formFactor }
  if (formFactor === 'desktop') {
    merged.screenEmulation = {
      mobile: false,
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
      disabled: false,
    }
    merged.emulatedUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
  }
  else {
    merged.screenEmulation = {
      mobile: true,
      width: 412,
      height: 823,
      deviceScaleFactor: 1.75,
      disabled: false,
    }
    merged.emulatedUserAgent = 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36'
  }
  return merged
}
