import Sitemapper from 'sitemapper'
import { parse, walk } from 'ultrahtml'
import { $URL, withBase } from 'ufo'
import { useLogger } from '../logger'
import { isScanOrigin } from '../router'
import { useUnlighthouse } from '../unlighthouse'
import { fetchUrlRaw } from '../util'

function validSitemapEntry(url: string) {
  return url && (url.startsWith('http') || url.startsWith('/'))
}

/**
 * Some sites expose a human-readable HTML sitemap (e.g. `/pages/sitemap`) instead of XML.
 * Extract same-origin links from anchor tags.
 */
async function extractUrlsFromHtmlSitemapPage(sitemapUrl: string, site: string): Promise<string[]> {
  const unlighthouse = useUnlighthouse()
  const res = await fetchUrlRaw(sitemapUrl, unlighthouse.resolvedConfig)
  if (!res.valid || !res.response)
    return []
  const html = typeof res.response.data === 'string' ? res.response.data : String(res.response.data ?? '')
  const contentType = res.response.headers['content-type']
  const ct = typeof contentType === 'string' ? contentType : ''
  if (!ct.includes('text/html') && !html.trim().startsWith('<'))
    return []
  const origin = new $URL(site).origin
  const paths: string[] = []
  const ast = parse(html)
  await walk(ast, async (node) => {
    if (node.type === 1 && node.name === 'a') {
      const href = node.attributes?.href
      if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:') || href.startsWith('tel:'))
        return
      const abs = href.startsWith('http') ? href : withBase(href, origin)
      if (isScanOrigin(abs))
        paths.push(abs)
    }
  })
  return [...new Set(paths)]
}

/**
 * Fetches routes from a sitemap file.
 */
export async function extractSitemapRoutes(site: string, sitemaps: true | (string[])) {
  // make sure we're working from the host name
  site = new $URL(site).origin
  const unlighthouse = useUnlighthouse()
  const logger = useLogger()
  if (sitemaps === true || sitemaps.length === 0)
    sitemaps = [`${site}/sitemap.xml`]
  const sitemap = new Sitemapper({
    timeout: 15000, // 15 seconds
    debug: unlighthouse.resolvedConfig.debug,
  })
  let paths: string[] = []
  for (let sitemapUrl of new Set(sitemaps)) {
    logger.debug(`Attempting to fetch sitemap at ${sitemapUrl}`)
    // make sure it's absolute
    if (!sitemapUrl.startsWith('http'))
      sitemapUrl = withBase(sitemapUrl, site)
    // sitemapper does not support txt sitemaps
    if (sitemapUrl.endsWith('.txt')) {
      const sitemapTxt = await fetchUrlRaw(
        sitemapUrl,
        unlighthouse.resolvedConfig,
      )
      if (sitemapTxt.valid) {
        const sites = (sitemapTxt.response!.data as string).trim().split('\n').filter(validSitemapEntry)
        if (sites?.length)
          paths = [...paths, ...sites]

        logger.debug(`Fetched ${sitemapUrl} with ${sites.length} URLs.`)
      }
    }
    else {
      let fromUrl: string[] = []
      try {
        const { sites } = await sitemap.fetch(sitemapUrl)
        fromUrl = sites || []
      }
      catch {
        // Non-XML responses (e.g. HTML sitemap pages) fail here; try link extraction below.
      }
      if (!fromUrl.length) {
        const htmlUrls = await extractUrlsFromHtmlSitemapPage(sitemapUrl, site)
        fromUrl = [...fromUrl, ...htmlUrls]
        if (htmlUrls.length)
          logger.info(`Parsed ${htmlUrls.length} URLs from HTML sitemap at ${sitemapUrl}.`)
      }
      if (fromUrl.length)
        paths = [...paths, ...fromUrl]
      logger.debug(`Fetched ${sitemapUrl} with ${fromUrl.length} URLs.`)
    }
  }
  const filtered = paths.filter(isScanOrigin)
  // for the paths we need to validate that they will be scanned
  return { paths: filtered, ignored: paths.length - filtered.length, sitemaps }
}
