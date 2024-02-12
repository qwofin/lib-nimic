import type { DownloadManager } from '../downloader/downloadManager.js'
import { BaseSource, LookupResult, SearchResult } from './BaseSource.js'

export abstract class IPFSCapablseSource extends BaseSource {
  ipfsGWHost?: string
  constructor(dlManager: DownloadManager, ipfsGWHost: string | null) {
    super(dlManager)
    this.ipfsGWHost = ipfsGWHost
  }

  protected generateSearchResult(item: LookupResult): SearchResult[] {
    const results = []
    if (item.ipfs_cid && this.ipfsGWHost) {
      results.push(
        ...super.generateSearchResult(item).map(result => {
          result.dlurl = this.ipfsGWHost + '/ipfs/' + item.ipfs_cid
          return result
        }),
      )
    }
    item.ipfs_cid = ''
    results.push(...super.generateSearchResult(item))

    return results
  }
}
