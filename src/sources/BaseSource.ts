import { config } from '../config.js'
import { DownloadManager } from '../downloader/downloadManager.js'
import type { Logger } from 'pino'
import { DownloadOptions } from '../downloader/downloader.js'

export interface LookupResult {
  id: string
  title: string
  author: string
  year: string
  edition: string
  language: string
  md5: string
  timeadded: string
  extension: string
  publisher: string
  filesize: string
  series: string
  ipfs_cid: string
}

export interface SearchResult extends LookupResult {
  dlurl: string
  filename: string
  displayTitle: string
}

export class SourceError extends Error {}
export class SourceRateLimitError extends Error {}

export abstract class BaseSource {
  protected _logger: Logger
  protected dlManager: DownloadManager
  protected _rateLimit: {
    rate: number
    timeframe: number
    allowance: number
    lastCheck: number
  }

  constructor(dlManager: DownloadManager) {
    this.dlManager = dlManager
    // 4 searches per 30 seconds
    this._rateLimit = {
      ...config.rateLimit,
      allowance: 10,
      lastCheck: Date.now(),
    }
  }

  get logger() {
    if (!this._logger) {
      this._logger = config.logger.child({ module: this.type })
    }

    return this._logger
  }

  abstract get type(): string
  protected abstract _search(query: string): Promise<SearchResult[]>
  protected abstract generateDlUrl(item: LookupResult): string

  // for API tests
  public resetRateLimit() {
    this._rateLimit.allowance = this._rateLimit.rate
  }

  protected shouldRateLimit(): boolean {
    const now = Date.now() // ms
    const timePassed = now - this._rateLimit.lastCheck // ms
    this._rateLimit.lastCheck = now
    this._rateLimit.allowance +=
      timePassed * (this._rateLimit.rate / (this._rateLimit.timeframe * 1000))
    // don't let allowance go above rate
    this._rateLimit.allowance = Math.min(
      this._rateLimit.rate,
      this._rateLimit.allowance,
    )
    const allowed = this._rateLimit.allowance >= 1.0

    if (allowed) {
      this._rateLimit.allowance -= 1.0
    }

    return !allowed
  }

  protected clearResult(item: LookupResult): LookupResult {
    for (const [key, val] of Object.entries(item)) {
      item[key] = val.trim()
    }

    return item
  }

  protected generateSearchResult(item: LookupResult): SearchResult[] {
    return [
      {
        ...this.clearResult(item),
        md5: item.md5.toLowerCase(),
        dlurl: this.generateDlUrl(item),
        filename: this.generateFileName(item),
        displayTitle: this.generateDisplayTitle(item),
      },
    ]
  }

  protected generateDisplayTitle(item: LookupResult): string {
    let name = item.author
    if (item.series) {
      name += ` - [${item.series}]`
    }

    name += ` - ${item.title}`
    return name
  }

  protected generateFileName(item: LookupResult): string {
    return `${this.generateDisplayTitle(item)}.${item.extension}`
  }

  async rss(): Promise<SearchResult[]> {
    throw new Error('The sourcetype does not support RSS.')
  }

  async search(query: string): Promise<SearchResult[]> {
    this.logger.debug(`Search request for ${query}`)
    if (this.shouldRateLimit()) {
      this.logger.info('Search query throttled')
      throw new SourceRateLimitError()
    }

    // return []
    return this._search(query)
  }

  async download(url: string, filename: string, md5: string) {
    const options: Partial<DownloadOptions> = {}
    if (md5) {
      options.expectedMd5 = md5
    }
    return this.dlManager.download(url, filename, options)
  }
}
