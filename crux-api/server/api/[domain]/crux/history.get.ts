import { createError, defineCachedEventHandler } from '#imports'
import { getQuery, getRouterParam } from 'h3'
import { fetchCrux } from '../../../app/services/crux'

const FORM_FACTORS = ['PHONE', 'DESKTOP', 'TABLET'] as const

function parseFormFactor(raw: unknown): (typeof FORM_FACTORS)[number] {
  const s = typeof raw === 'string' ? raw.toUpperCase() : ''
  if (s === 'DESKTOP' || s === 'TABLET' || s === 'PHONE')
    return s
  return 'PHONE'
}

export default defineCachedEventHandler(async (event) => {
  const domain = getRouterParam(event, 'domain', { decode: true })
  if (!domain) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Missing domain parameter',
    })
  }
  const formFactor = parseFormFactor(getQuery(event).formFactor)
  return fetchCrux(event, domain, formFactor).catch((e) => {
    throw createError({
      statusCode: 500,
      statusMessage: 'CrUX Lookup Failed',
      message: `CrUX lookup failed for "${domain}": ${e.message}`,
    })
  })
}, {
  base: 'crux2',
  swr: true,
  shouldBypassCache: () => true, // !!import.meta.dev,
  getKey: (event) => {
    const domain = getRouterParam(event, 'domain', { decode: true }) || ''
    const formFactor = parseFormFactor(getQuery(event).formFactor)
    return `${domain}:${formFactor}`
  },
  maxAge: 60 * 60,
  staleMaxAge: 24 * 60 * 60,
})
