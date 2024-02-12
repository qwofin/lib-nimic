import xml2js from 'xml2js'
import { libgen } from '../../services.js'
import { config } from '../../config.js'
import { libgenPlus } from '../../services.js'
import { SourceRateLimitError, SearchResult } from '../../sources/BaseSource.js'

export async function search(ctx): Promise<void> {
  const query = ctx.request.query
  const sourcetype = ctx.params.type
  let results: SearchResult[]
  if (parseInt(query.offset || '0') > 0) {
    // avoid readarr trying to fetch further pages since we don't support pagination
    results = []
  } else {
    try {
      if (sourcetype === libgen.type && config.libgenMirror.url) {
        results = await libgen.search(query.q)
      } else if (
        sourcetype === libgenPlus.type &&
        config.libgenPlusMirror.url
      ) {
        results = await libgenPlus.search(query.q)
      } else {
        ctx.status = 400
        ctx.body = `Invalid source type.`
        return
      }
    } catch (err) {
      if (err instanceof SourceRateLimitError) {
        ctx.status = 429
        ctx.set('retry-after', config.rateLimit.timeframe)
        return
      }

      throw err
    }
  }

  const builder = new xml2js.Builder()
  const articles = results.map(result => {
    const meta = [
      result.year,
      result.extension,
      result.language,
      result.ipfs_cid ? 'ipfs' : null,
    ]
      .filter(Boolean)
      .join(', ')

    const name = `${result.displayTitle} (${meta})`
    const host =
      config.nzbHostOverride ?? `${ctx.request.protocol}://${ctx.request.host}`
    const nzbParams = {
      sourcetype: sourcetype,
      size: result.filesize,
      md5: result.md5,
      filename: result.filename,
      dlurl: result.dlurl,
    }

    if (result.ipfs_cid) {
      nzbParams['ipfs'] = result.ipfs_cid
    }

    return {
      title: name,
      description: name,
      guid: result.ipfs_cid || result.md5,
      size: result.filesize,
      category: [7020, 10720],
      pubDate: result.timeadded,
      'newznab:attr': [
        { $: { name: 'category', value: '107020' } },
        { $: { name: 'category', value: '7020' } },
        { $: { name: 'files', value: '1' } },
        { $: { name: 'author', value: result.author } },
        { $: { name: 'booktitle', value: result.title } },
      ],
      enclosure: {
        $: {
          url: `${host}/api/nzb?${new URLSearchParams(nzbParams).toString()}`,
          length: result.filesize,
          type: 'application/x-nzb',
        },
      },
    }
  })

  ctx.body = builder.buildObject({
    rss: {
      $: {
        version: '1.0',
        'xmlns:atom': 'http://www.w3.org/2005/Atom',
        'xmlns:newznab': 'http://www.newznab.com/DTD/2010/feeds/attributes/',
      },
      channel: {
        title: 'lib-nimic',
        item: articles,
      },
    },
  })
}
