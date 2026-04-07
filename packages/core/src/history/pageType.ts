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
  'account',
  'rewards',
  'subscriptions',
  'other',
] as const

export type PageType = (typeof PAGE_TYPE_ORDER)[number]

/**
 * Normalize to a pathname (lowercase) for matching. Handles full URLs e.g. from sitemaps.
 */
function pathnameOnly(input: string): string {
  const s = (input || '/').trim()
  if (!s)
    return '/'
  try {
    if (s.includes('://'))
      return new URL(s).pathname.toLowerCase() || '/'
  }
  catch {
    // not a valid absolute URL
  }
  const first = s.startsWith('/') ? s : `/${s}`
  return first.split('?')[0]!.toLowerCase()
}

/**
 * Urban Stems–style examples:
 * - Cart: `/cart`
 * - Checkout: `/checkouts`, `/checkouts/...` (Shopify)
 * - Search: `/search`, `/search?type=`, etc. (query ignored for bucket)
 */
export function classifyPagePath(path: string): PageType {
  const p = pathnameOnly(path)

  if (p === '/' || p === '')
    return 'homepage'

  if (p === '/cart' || p.endsWith('/cart'))
    return 'cart'

  if (p === '/checkouts' || p.startsWith('/checkouts/') || p === '/checkout' || p.startsWith('/checkout/'))
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

  if (p === '/account' || p.startsWith('/account/'))
    return 'account'

  if (p === '/rewards' || p.startsWith('/rewards/'))
    return 'rewards'

  if (p === '/subscriptions' || p.startsWith('/subscriptions/'))
    return 'subscriptions'

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
