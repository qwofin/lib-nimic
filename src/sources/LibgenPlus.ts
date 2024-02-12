import axios from 'axios'
import cheerio from 'cheerio'
import { LookupResult, SearchResult } from './BaseSource.js'
import { IPFSCapablseSource } from './IPFSCapableSource.js'
import type { DownloadManager } from '../downloader/downloadManager.js'

interface LibgenPlusLookupResult {
  title: string
  author: string
  year: string
  time_added: string
  publisher: string
  series_name: string
  edition: string
  files: { [fid: string]: { f_id: string; md5: string; time_added: string } }
  add?: {
    [k: string]: {
      name_en: string
      value: string
      key: string
    }
  }
}

interface LibgenPlusFileLookupResult {
  md5: string
  filesize: string
  extension: string
  editions: {
    [k: string]: {
      e_id: string
      time_added: string
    }
  }
  eid: string
  time_added: string
  add?: {
    [k: string]: {
      name_en: string
      value: string
      key: string
    }
  }
}

export class LibgenPlusSource extends IPFSCapablseSource {
  mirrorHost: string
  constructor(
    dlManager: DownloadManager,
    mirrorHost: string,
    ipfsGWHost: string = null,
  ) {
    super(dlManager, ipfsGWHost)
    this.mirrorHost = mirrorHost
  }

  protected maxDepth = 2
  protected fileQueryFields =
    'object=f&fields=md5,filesize,extension,editions&addkeys=877'
  protected editionQueryFields =
    'object=e&addkeys=101,401,630&fields=title,author,year,language,time_added,extension,publisher,series,edition'
  get type() {
    return 'libgenplus'
  }

  protected generateDlUrl(item: LookupResult): string {
    return `${this.mirrorHost}/ads${item.md5}`
  }

  protected async getActualDlUrl(dlurl: string): Promise<string> {
    const response = await axios.get(dlurl)
    const dom = cheerio.load(response.data)
    return dom('a:contains(GET)').attr('href').replace('\\', '/')
  }

  protected async expandLookup(files: {
    [id: string]: LibgenPlusFileLookupResult
  }): Promise<SearchResult[]> {
    if (!Object.keys(files).length) {
      return []
    }
    this.logger.debug(`Looked up ${Object.keys(files).length} files`)
    for (const [id, file] of Object.entries(files)) {
      if (!file.editions || !Object.values(file.editions).length) {
        // no associated edition, we can't return it as a search result
        delete files[id]
        this.logger.debug(`Discarding file ${id}, no editions associated`)
        continue
      }

      file.eid = Object.values(file.editions)[0].e_id
      file.time_added = Object.values(file.editions)[0].time_added
    }

    const editionIds: string[] = Object.values(files).map(file => file.eid)
    if (!editionIds.length) {
      return []
    }
    const editionResponse: { [e_id: string]: LibgenPlusLookupResult } = (
      await axios.get(
        `${
          this.mirrorHost
        }/json.php?${this.editionQueryFields}&ids=${editionIds.join(',')}`,
      )
    ).data

    this.logger.debug(
      `Looked up ${Object.keys(editionResponse).length} editions`,
    )
    const results: LookupResult[] = []
    for (const [fId, file] of Object.entries(files)) {
      const edition = editionResponse[file.eid]
      if (!edition) {
        // we didn't get an edition for this so we can't deal with it
        continue
      }

      if (!edition.add) {
        edition.add = {}
      }

      if (!file.add) {
        file.add = {}
      }

      const languageAdd = Object.values(edition.add).find(
        add => add.key === '101',
      )
      const authorAdd = Object.values(edition.add).find(
        add => add.key === '401',
      )
      const seriesAdd = Object.values(edition.add).find(
        add => add.key === '630',
      )

      const ipfsAdd = Object.values(file.add).find(add => add.key === '877')
      results.push({
        id: fId,
        title: edition.title,
        year: edition.year,
        author: edition.author || (authorAdd ? authorAdd.value : ''),
        edition: edition.edition,
        md5: file.md5,
        language: languageAdd ? languageAdd.value : '',
        ipfs_cid: ipfsAdd ? ipfsAdd.value : '',
        extension: file.extension,
        filesize: file.filesize,
        timeadded: file.time_added,
        publisher: edition.publisher,
        series: edition.series_name || (seriesAdd ? seriesAdd.value : ''),
      })
    }

    return results.map(item => this.generateSearchResult(item)).flat()
  }

  async _search(query): Promise<SearchResult[]> {
    if (!query) {
      return this._rss()
    }

    let response
    try {
      response = await axios.get(
        `${this.mirrorHost}/index.php?req=${query}&objects[]=f`,
      )
    } catch (err) {
      this.logger.error(
        `Failed to GET ${err.config.url}, got status ${err.status} (the body is plain html, so we don't log it)`,
      )
      throw err
    }
    const dom = cheerio.load(response.data)
    const ids = dom('table#tablelibgen tbody tr')
      .toArray()
      .map(elem => {
        const row = cheerio.load(elem)
        const link = row('td:nth-child(7) a:first').attr('href').trim()
        try {
          return link.match(/id=(\d+)/)[1]
        } catch {
          this.logger.warn(`Failed to parse ID from ${link}, skipping`)
        }
      })
      .filter(Boolean)
    this.logger.debug(`Found ${ids.length} results`)

    if (!ids.length) return []
    const fileResponse = await axios.get(
      `${this.mirrorHost}/json.php?${this.fileQueryFields}&ids=${ids.join(
        ',',
      )}`,
    )

    return this.expandLookup(fileResponse.data)
  }

  protected async _rss(start: Date = null, depth = 0): Promise<SearchResult[]> {
    if (!start) {
      start = new Date()
      start.setDate(start.getDate() - 1)
    }
    // expects YYYY-MM-DD hh:mm:ss
    const timeStartString = start.toISOString().replace('T', ' ').slice(0, 19)
    this.logger.debug(`RSS search starting at ${timeStartString}`)
    const fileResponse = await axios.get(
      `${this.mirrorHost}/json.php?${this.fileQueryFields}&mode=last&timefirst=${timeStartString}`,
    )
    const data: { [id: string]: LibgenPlusFileLookupResult } = fileResponse.data
    if (!Object.keys(data).length) {
      start.setDate(start.getDate() - 1)
      if (depth >= this.maxDepth) {
        return []
      }
      return this._rss(start, depth + 1)
    }
    this.logger.debug(`RSS returned ${Object.keys(data).length} results`)

    return this.expandLookup(data)
  }

  async download(url: string, filename: string, md5: string) {
    if (this.ipfsGWHost && url.startsWith(this.ipfsGWHost)) {
      return super.download(url, filename, md5)
    }
    const actualUrl = await this.getActualDlUrl(url)
    return super.download(actualUrl, filename, md5)
  }
}
