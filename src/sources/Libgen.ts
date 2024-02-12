import axios from 'axios'
import cheerio from 'cheerio'
import { LookupResult, SearchResult } from './BaseSource.js'
import { IPFSCapablseSource } from './IPFSCapableSource.js'
import type { DownloadManager } from '../downloader/downloadManager.js'

export class LibgenSource extends IPFSCapablseSource {
  mirrorHost: string
  dlHost: string

  constructor(
    dlManager: DownloadManager,
    mirrorHost: string,
    dlHost: string,
    ipfsGWHost: string = null,
  ) {
    super(dlManager, ipfsGWHost)
    this.mirrorHost = mirrorHost
    this.dlHost = dlHost
  }

  get type() {
    return 'libgen'
  }

  protected generateDlUrl(item: LookupResult): string {
    const chunk = Math.floor(parseInt(item.id) / 1000) * 1000
    return `${
      this.dlHost
    }/main/${chunk}/${item.md5.toLowerCase()}/${item.md5.toLowerCase()}.${
      item.extension
    }`
  }

  protected async lookup(ids: string[]): Promise<SearchResult[]> {
    if (!ids.length) return []
    const response: LookupResult[] = (
      await axios.get(
        `${
          this.mirrorHost
        }/json.php?fields=id,title,author,year,edition,language,md5,timeadded,extension,publisher,filesize,series,ipfs_cid&ids=${ids.join(
          ',',
        )}`,
      )
    ).data

    this.logger.debug(`Looked up ${response.length} ids`)
    return response.map(item => this.generateSearchResult(item)).flat()
  }

  async _search(query: string): Promise<SearchResult[]> {
    // libgen doesn't support search with less than 3 characters
    // and their api doesn't support fetching without knowing ids
    // so we have to supplement _some_ value here otherwise readarr
    // would refuse adding it as an indexer, as it checks that they return
    // some results without providing a search query..
    if (!query) {
      query = 'test'
    }
    const response = await axios.get(
      `${this.mirrorHost}/search.php?req=${query}`,
    )
    this.logger.debug(`Got search results`)
    const dom = cheerio.load(response.data)
    const results = dom('table[rules="rows"] tr:not(:first)')
      .toArray()
      .map(elem => {
        const row = cheerio.load(elem)
        return row('td:nth-child(1)').text().trim()
      })
    this.logger.debug(`Parsed ${results.length} ids`)
    return this.lookup(results)
  }
}
