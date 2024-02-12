import { EventEmitter } from 'node:events'
import fs from 'fs'
import Path from 'path'
import crypto from 'crypto'

export class DownloaderError extends Error {
  get name() {
    return this.constructor.name
  }
}

export class DownloaderFSError extends DownloaderError {}
export class DownloaderValidationError extends DownloaderError {}
export class DownloaderRequestError extends DownloaderError {
  response: Response
  constructor(message: string, response: Response) {
    super(message)
    this.response = response
  }
}

export enum DownloadStatus {
  INIT = 0,
  DOWNLOADING = 1,
  FINISHED = 2,
  FAILED = -1,
  ABORTED = -2,
}

export interface DownloaderEvents {
  start: (info: DownloadInfo) => any
  error: (info: DownloadInfo, error: Error) => any
  failed: (info: DownloadInfo, error: Error) => any
  retry: (info: DownloadInfo) => any
  resume: (info: DownloadInfo) => any
  headers: (info: DownloadInfo, response: Response) => any
  chunk: (info: DownloadInfo, chunk: Uint8Array) => any
  end: (info: DownloadInfo, response: Response) => any
}

export interface DownloaderState {
  info: DownloadInfo
  options: Omit<DownloadOptions, 'shouldRetry' | 'retryDelay'>
}

export interface DownloadOptions {
  attemptResumeOnExistingFile: boolean
  retryAttempts: number
  completedDir?: string
  expectedMd5?: string
  retryDelay: (attempt: number, error?: Error) => number
  shouldRetry: (attempt: number, error: Error) => Promise<boolean>
}

export interface DownloadInfo {
  url: string
  path: string
  dir: string
  filename: string
  resumable: boolean
  skipped: number
  downloaded: number
  onDisk: number
  attempts: number
  maxAttempts: number
  avgSpeed: number
  status: DownloadStatus
  eta: number
  elapsed: number
  startedAt?: Date
  endedAt?: Date
  total?: number
  failReason?: string
}

const defaultOpts: DownloadOptions = {
  attemptResumeOnExistingFile: false,
  retryAttempts: 0,

  retryDelay: attempt => 1000 * attempt,
  shouldRetry: async (attempt, error) => {
    if (error instanceof DownloaderFSError) return false
    if (error instanceof DownloaderValidationError) return false
    if (error instanceof DownloaderRequestError) {
      if (error.response.status >= 400 && error.response.status < 500) {
        return false
      }

      if (error.response.status > 505) {
        return false
      }
    }
    return true
  },
}

export class Downloader {
  protected events: EventEmitter
  protected fStream: null | fs.WriteStream = null
  protected abortController: AbortController
  protected _options: DownloadOptions
  protected _info: DownloadInfo
  protected _end: {
    promise: Promise<Response>
    resolve: (value: Response) => void
    reject: (reason?: any) => void
  }

  constructor(
    url: string,
    downloadDir: string,
    filename: string,
    options: Partial<DownloadOptions> = {},
  ) {
    const name = Path.parse(filename).name
    this.loadFrom(
      this.updateInfo({
        url,
        filename,
        dir: Path.join(downloadDir, name),
        path: Path.join(downloadDir, name, filename),
        resumable: false,
        skipped: 0,
        downloaded: 0,
        total: null,
        status: DownloadStatus.INIT,
        attempts: 0,
        maxAttempts: (options.retryAttempts ?? defaultOpts.retryAttempts) + 1,
        startedAt: null,
        endedAt: null,
        avgSpeed: 0,
        eta: 0,
        elapsed: 0,
      }),
      options,
    )
  }

  static from(
    info: DownloadInfo,
    options: Partial<DownloadOptions>,
  ): Downloader {
    const dl = new Downloader('', '', '')
    dl.loadFrom(info, options)
    return dl
  }

  loadFrom(info: DownloadInfo, options: Partial<DownloadOptions>) {
    this._options = Object.assign({}, defaultOpts, options)
    this.events = new EventEmitter()
    this.abortController = new AbortController()
    // we must attach at least 1 error listener
    this.events.on('error', () => {})
    const prom: any = {}
    prom.promise = new Promise((resolve, reject) => {
      prom.resolve = resolve
      prom.reject = reject
    })
    if (info.status === DownloadStatus.DOWNLOADING) {
      info.status = DownloadStatus.INIT
    }
    this.updateInfo(info)

    this._end = prom
  }

  protected async handleError(error: Error) {
    this.emit('error', [this.info(), error])
    if (
      this._info.attempts > this._options.retryAttempts ||
      !(await this._options.shouldRetry(this._info.attempts, error))
    ) {
      if (this.fStream) {
        this.fStream.close()
      }
      this.updateInfo({
        status: DownloadStatus.FAILED,
        endedAt: new Date(),
      })

      this.emit('failed', [this.info(), error])
      throw error
    } else {
      await this.backoff(error)
      return this._start()
    }
  }

  protected updateInfo(update: Partial<DownloadInfo>): DownloadInfo {
    const info = Object.assign({}, this._info ?? {}, update) as DownloadInfo
    info.onDisk = info.skipped + info.downloaded
    if (info.startedAt) {
      if (info.endedAt) {
        info.elapsed = Math.ceil(
          (info.endedAt.getTime() - info.startedAt.getTime()) / 1000,
        )
      } else {
        info.elapsed = Math.ceil((Date.now() - info.startedAt.getTime()) / 1000)
      }
    }
    if (info.elapsed) {
      const remaining = info.total - info.onDisk
      info.avgSpeed = info.downloaded / info.elapsed
      if (
        info.status == DownloadStatus.DOWNLOADING &&
        remaining > 0 &&
        info.avgSpeed > 0
      ) {
        info.eta = Math.ceil(remaining / info.avgSpeed)
      }
    }
    this._info = info
    return info
  }

  info(): DownloadInfo {
    // never give out the actual info object as modifying it outside would
    // break things
    return Object.assign({}, this._info)
  }

  getState(): DownloaderState {
    return {
      info: this.info(),
      options: {
        attemptResumeOnExistingFile: this._options.attemptResumeOnExistingFile,
        retryAttempts: this._options.retryAttempts,
        expectedMd5: this._options.expectedMd5,
      },
    }
  }

  get end(): Promise<Response> {
    return this._end.promise
  }

  on<E extends keyof DownloaderEvents>(
    event: E,
    callback: DownloaderEvents[E],
  ) {
    this.events.on(event, callback)
  }

  once<E extends keyof DownloaderEvents>(
    event: E,
    callback: DownloaderEvents[E],
  ) {
    this.events.once(event, callback)
  }

  off<E extends keyof DownloaderEvents>(
    event: E,
    callback: DownloaderEvents[E],
  ) {
    this.events.off(event, callback)
  }

  emit<E extends keyof DownloaderEvents>(
    event: E,
    params: Parameters<DownloaderEvents[E]>,
  ) {
    this.events.emit(event, ...params)
  }

  async backoff(error): Promise<void> {
    return new Promise(resolve =>
      setTimeout(resolve, this._options.retryDelay(this._info.attempts, error)),
    )
  }

  async loadFromFile() {
    try {
      // only try to re-load things if we don't have an open file already
      if (!this.fStream) {
        const stats = await fs.promises.stat(this._info.path)
        this.fStream = await this.createFstream(true)
        this.updateInfo({
          skipped: stats.size,
          downloaded: 0,
          resumable: this._options.attemptResumeOnExistingFile,
        })
      }
    } catch (error) {
      // does not exist
      if (error.code === 'ENOENT') {
        return
      }
      throw error
    }
  }

  protected async createFstream(
    append: boolean = false,
  ): Promise<fs.WriteStream> {
    if (this.fStream) {
      return this.fStream
    }
    if (!fs.existsSync(this._info.dir + Path.sep)) {
      const parentDir = '/' + Path.dirname(this._info.dir)
      if (!fs.existsSync(parentDir + Path.sep)) {
        throw new DownloaderError(`Download dir does not exist ${parentDir}`)
      }

      await fs.promises.mkdir(this._info.dir)
    }
    const opts = {
      flags: append ? 'a' : 'w',
    }
    this.fStream = fs.createWriteStream(this._info.path, opts)
    return this.fStream
  }

  protected requestOpts() {
    const opts: { [k: string]: any } = {
      signal: this.abortController.signal,
      headers: {
        'accept-encoding': 'identity',
        accept: '*/*',
      },
    }

    if (
      (this._info.attempts > 1 || this._options.attemptResumeOnExistingFile) &&
      this._info.onDisk
    ) {
      opts.headers.range = `bytes=${this._info.onDisk}-`
    }
    return opts
  }

  abort() {
    this.abortController.abort()
    this.updateInfo({ status: DownloadStatus.ABORTED })
  }

  async start(): Promise<Response> {
    if (this._info.status === DownloadStatus.INIT) {
      this._start().then(this._end.resolve).catch(this._end.reject)
    }

    return this._end.promise
  }

  protected async _start(): Promise<Response> {
    this.updateInfo({
      status: DownloadStatus.DOWNLOADING,
      attempts: this._info.attempts + 1,
    })
    if (!this._info.startedAt) {
      this.updateInfo({
        startedAt: new Date(),
      })
    }
    if (this._info.attempts === 1) {
      this.emit('start', [this.info()])
      if (this._options.attemptResumeOnExistingFile) {
        await this.loadFromFile()
      }
    } else {
      this.emit('retry', [this.info()])
      if (this._info.resumable) {
        this.emit('resume', [this.info()])
      }
    }

    try {
      const response = await fetch(this._info.url, this.requestOpts())
      this.parseHeaders(response)
      if (this._info.onDisk !== this._info.total) {
        if (!response.ok) {
          throw new DownloaderRequestError(
            `Response status was ${response.status}, ${response.statusText}`,
            response,
          )
        }
        if (!response.body) {
          throw new DownloaderRequestError('Resposne body is empty', response)
        }
        await this.writeBodyToDisk(response)
      }
      if (this.fStream) {
        await new Promise((resolve, reject) => {
          this.fStream.close(err => {
            if (err) {
              reject(err)
            } else {
              resolve(null)
            }
            delete this.fStream
          })
        })
      }

      if (this._options.expectedMd5) {
        try {
          const md5 = await new Promise((resolve, reject) => {
            const output = crypto.createHash('md5')
            const file = fs.createReadStream(this._info.path)

            file.on('error', err => {
              reject(err)
            })

            output.once('readable', () => {
              resolve(output.read().toString('hex'))
            })

            file.pipe(output)
          })
          if (md5 !== this._options.expectedMd5) {
            throw new DownloaderValidationError(
              `md5 of downloaded file (${md5}) doesn't match expected md5 (${this._options.expectedMd5})`,
            )
          }
        } catch (err) {
          if (err instanceof DownloaderValidationError) throw err
          throw new DownloaderValidationError(
            `md5 validation of the download failed: ${err}`,
          )
        }
      }
      if (this._options.completedDir) {
        if (!fs.existsSync(this._options.completedDir + Path.sep)) {
          throw new DownloaderFSError(
            `Completed download dir does not exist ${this._options.completedDir}`,
          )
        }
        const targetDir = Path.join(
          this._options.completedDir,
          Path.basename(this._info.dir),
        )
        await fs.promises.rename(this._info.dir, targetDir)
        this.updateInfo({
          dir: targetDir,
          path: Path.join(targetDir, this._info.filename),
        })
      }

      this.updateInfo({
        status: DownloadStatus.FINISHED,
        endedAt: new Date(),
      })
      this.emit('end', [this.info(), response])
      return response
    } catch (err) {
      return this.handleError(err)
    }
  }

  protected parseHeaders(response: Response) {
    let total = null
    if (response.headers.get('content-range')) {
      const unitSplit = response.headers.get('content-range').split(' ')
      const sizeSplit = unitSplit[1].split('/')
      if (sizeSplit[1] !== '*') {
        total = parseInt(sizeSplit[1])
      }
    } else if (response.headers.get('content-length')) {
      total = parseInt(response.headers.get('content-length'))
    }
    this.updateInfo({
      total,
      resumable: response.headers.get('accept-ranges') === 'bytes',
    })
    this.emit('headers', [this.info(), response])
  }

  protected async writeBodyToDisk(response: Response) {
    const reader = response.body.getReader()
    if (!this.fStream) {
      this.fStream = await this.createFstream()
    }
    let done = false
    while (!done) {
      const result = await reader.read()
      done = result.done
      const chunk = result.value
      if (chunk) {
        this.fStream.write(chunk)
        this.updateInfo({
          downloaded: (this._info.downloaded += chunk.byteLength),
        })
        this.emit('chunk', [this.info(), chunk])
      }
    }
  }
}
