import { config } from '../config.js'
import {
  DownloadInfo,
  DownloadOptions,
  DownloadStatus,
  Downloader,
  DownloaderState,
} from './downloader.js'
import fs from 'fs'
const logger = config.logger.child({ module: 'downloadManager' })

export function bytesToMb(val: number | null): number {
  return Math.round((val / 1024 ** 2) * 10) / 10
}

export function formatDuration(seconds: number): string {
  return new Date(seconds * 1000).toISOString().substring(11, 19)
}

function formatDlInfo(info: DownloadInfo): string {
  const pct = Math.round((info.onDisk / info.total) * 100 * 10) / 10
  return `${info.path} - downloaded ${pct}% (${bytesToMb(info.onDisk)}/${bytesToMb(info.total)}) in ${formatDuration(info.elapsed)}, avg speed at ${bytesToMb(info.avgSpeed)}Mib/s`
}

interface StateFile {
  queue: string[]
  downloads: { [id: string]: DownloaderState }
}

export class DownloadManager {
  protected _queue: string[] = []
  protected _downloads: { [id: string]: Downloader } = {}
  protected maxInProgress: number
  protected dlOpts: Partial<DownloadOptions>
  protected dlDir: string

  constructor(
    downloadDir: string,
    completedDir: string,
    maxInProgress: number = 3,
  ) {
    this.dlDir = downloadDir
    this.maxInProgress = maxInProgress
    this.dlOpts = {
      retryAttempts: 10,
      attemptResumeOnExistingFile: true,
      completedDir: completedDir,
      // retryDelay: (attempt) => attempt * 1000,
    }

    this.loadState()
  }

  saveState() {
    const state: StateFile = {
      queue: this._queue,
      downloads: Object.fromEntries(
        Object.entries(this._downloads).map(([id, dl]) => [id, dl.getState()]),
      ),
    }
    fs.writeFileSync(this.dlDir + '/_downloads.json', JSON.stringify(state))
  }

  loadState() {
    if (!fs.existsSync(this.dlDir + '/_downloads.json')) {
      return
    }
    const file = fs.readFileSync(this.dlDir + '/_downloads.json')
    const state: StateFile = JSON.parse(file.toString(), (key, value) => {
      if (['startedAt', 'endedAt'].includes(key) && value) {
        return new Date(value)
      }

      return value
    })

    // restore the queue
    for (const id of state.queue) {
      const dlState = state.downloads[id]
      if (!dlState) {
        logger.warn(
          `Attempted to load download for ${id}, but could not find details for it - dropping it.`,
        )
      }

      this.enqueue(
        id,
        Downloader.from(
          dlState.info,
          Object.assign({}, this.dlOpts, dlState.options),
        ),
      )
    }

    // Restore the history
    for (const [id, dlState] of Object.entries(state.downloads)) {
      if (!this._downloads[id]) {
        const dl = Downloader.from(
          dlState.info,
          Object.assign({}, this.dlOpts, dlState.options),
        )
        this._downloads[id] = dl
      }
    }
    this.groomQueue()
  }

  protected enqueue(id: string, dl: Downloader) {
    const logParams = { id, filename: dl.info().filename }
    dl.on('retry', info =>
      logger.info(
        logParams,
        `Retrying download, attempt (${info.attempts}/${info.maxAttempts})`,
      ),
    )
    dl.on('resume', info =>
      logger.info(logParams, `Resuming download for ${formatDlInfo(info)}`),
    )

    let lastProgressLog = 0
    dl.on('chunk', info => {
      if (Date.now() >= lastProgressLog + 10000) {
        logger.debug(
          logParams,
          `Download in progress for ${formatDlInfo(info)}`,
        )
        lastProgressLog = Date.now()
      }
    })

    dl.on('end', info => {
      logger.info(logParams, `Download finished for ${formatDlInfo(info)}`)
    })

    this._downloads[id] = dl
    this._queue.push(id)
  }

  protected groomQueue() {
    this._queue = this._queue.filter(id => {
      const dl = this._downloads[id]
      return (
        dl &&
        [DownloadStatus.INIT, DownloadStatus.DOWNLOADING].includes(
          dl.info().status,
        )
      )
    })
    this.startNextInQ()
    this.saveState()
    logger.info(
      `${this.countActive()} active downloads of total ${this._queue.length} in queue.`,
    )
  }

  protected countActive(): number {
    return this._queue.reduce((total, id) => {
      const dl = this._downloads[id]
      if (dl && dl.info().status === DownloadStatus.DOWNLOADING) {
        return total + 1
      }
      return total
    }, 0)
  }

  protected findNextInQ(): Downloader | null {
    for (const id of this._queue) {
      const dl = this._downloads[id]
      if (dl && dl.info().status === DownloadStatus.INIT) {
        return dl
      }
    }

    return null
  }

  protected startNextInQ(): void {
    if (this.countActive() >= this.maxInProgress) {
      return
    }
    while (this.countActive() < this.maxInProgress) {
      const nextDl = this.findNextInQ()
      if (nextDl) {
        nextDl
          .start()
          .then(() => {
            this.groomQueue()
          })
          .catch(err => {
            this.groomQueue()
            logger.warn(
              { url: nextDl.info().url, filename: nextDl.info().filename },
              `Download failed due to ${err} for ${formatDlInfo(nextDl.info())}`,
            )
          })
      } else {
        break
      }
    }
  }

  async cleanup() {
    logger.debug('Starting download cleanup')
    const cutoff = Date.now() - 1000 * 60 * 60 * 24
    for (const [id, dl] of this.filterDownloads([
      DownloadStatus.FINISHED,
      DownloadStatus.FAILED,
    ])) {
      const info = dl.info()
      if (info.endedAt.getTime() < cutoff && fs.existsSync(info.dir)) {
        logger.info(`Cleaning up download for ${id} -> ${info.path}`)
        await this.remove(id)
      }
    }
  }

  async remove(id: string, removeFile: boolean = true) {
    if (this._downloads[id]) {
      this._downloads[id].abort()
      if (removeFile) {
        const dir = this._downloads[id].info().dir
        if (fs.existsSync(dir)) {
          await fs.promises.rm(dir, { recursive: true, force: true })
        }
      }
      delete this._downloads[id]
      this.groomQueue()
    }
  }

  getQueue(): [string, Downloader][] {
    return this._queue.map(id => [id, this._downloads[id]])
  }

  filterDownloads(states: DownloadStatus[] = []): [string, Downloader][] {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    return Object.entries(this._downloads).filter(([id, dl]) =>
      states.includes(dl.info().status),
    )
  }

  async download(
    url: string,
    filename: string,
    options: Partial<DownloadOptions> = {},
  ): Promise<[string, Downloader]> {
    const id = url
    if (this._downloads[id]) {
      return [id, this._downloads[id]]
    }
    const logParams = { filename, url }
    logger.debug(logParams, `Starting download for ${url}`)
    const dl = new Downloader(
      url,
      this.dlDir,
      filename,
      Object.assign({}, this.dlOpts, options),
    )
    this.enqueue(id, dl)
    this.groomQueue()
    return [id, dl]
  }
}
