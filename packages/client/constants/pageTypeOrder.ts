/** Must match `PAGE_TYPE_ORDER` in `@unlighthouse/core` history/pageType. */
export const HISTORY_PAGE_TYPE_ORDER = [
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

export const HISTORY_PAGE_TYPE_LABELS: Record<(typeof HISTORY_PAGE_TYPE_ORDER)[number], string> = {
  homepage: 'Homepage',
  pages: 'Pages',
  collections: 'Collections',
  products: 'Products',
  cart: 'Cart',
  checkout: 'Checkout',
  search: 'Search',
  blog: 'Blog',
  account: 'Account',
  rewards: 'Rewards',
  subscriptions: 'Subscriptions',
  other: 'Other',
}
