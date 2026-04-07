/**
 * Coarse page-type buckets for local history dashboards (Shopify-style paths + common patterns).
 */
export const PAGE_TYPE_ORDER = [
  'homepage',
  'pages',
  'collections',
  'products',
  'cart',
  'checkout',
  'search',
  'blog',
  'other',
] as const

export type PageType = (typeof PAGE_TYPE_ORDER)[number]

export function classifyPagePath(path: string): PageType {
  const raw = (path || '/').split('?')[0] || '/'
  const p = raw.toLowerCase()

  if (p === '/' || p === '')
    return 'homepage'

  if (p === '/cart' || p.endsWith('/cart'))
    return 'cart'

  if (p.includes('/checkout') || p.includes('/checkouts'))
    return 'checkout'

  if (p === '/search' || p.startsWith('/search/'))
    return 'search'

  if (p.includes('/collections/'))
    return 'collections'

  if (p.includes('/products/'))
    return 'products'

  if (p.includes('/blogs/') || p.startsWith('/blog/') || p.includes('/blog/'))
    return 'blog'

  if (p.startsWith('/pages/'))
    return 'pages'

  return 'other'
}

export function emptyByType(): Record<PageType, number | null> {
  const o = {} as Record<PageType, number | null>
  for (const t of PAGE_TYPE_ORDER)
    o[t] = null
  return o
}

export function averageScores(scores: number[]): number | null {
  const vals = scores.filter(v => typeof v === 'number' && !Number.isNaN(v))
  if (!vals.length)
    return null
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100
}
