import pino from 'pino'

class Config {
  downloadDir: string
  completedDir: string
  apiPort: number
  nntpPort: number
  chunkSize: number
  logger: pino.Logger
  nzbHostOverride?: string
  pinoOptions: pino.LoggerOptions
  libgenMirror: { url: string; dlUrl: string }
  libgenPlusMirror: { url: string }
  rateLimit: {
    rate: number
    timeframe: number
  }
  ipfsGw: string

  constructor() {
    this.rateLimit = {
      rate: 40,
      timeframe: 300,
    }

    this.downloadDir = process.env.DOWNLOAD_DIR
    this.completedDir = process.env.COMPLETED_DIR
    if (!this.completedDir) throw new Error('COMPLETED_DIR must be set')
    if (!this.downloadDir) throw new Error('DOWNLOAD_DIR must be set')
    this.apiPort = parseInt(process.env.API_PORT ?? '3000')
    this.chunkSize = parseInt(process.env.CHUNK_SIZE ?? String(1024 * 1024 * 3))
    this.pinoOptions = {
      level: process.env.LOG_LEVEL ?? 'info',
      enabled: process.env.NODE_ENV !== 'test',
      mixin: (_context, level) => {
        return { severity: pino.levels.labels[level] }
      },
    }

    if (process.env.LOG_FORMAT === 'pretty') {
      this.pinoOptions.transport = {
        target: 'pino-pretty',
        options: {
          hideObject: true,
          ignore: 'pid,hostname',
          messageFormat: '{module}| {msg}',
          translateTime: 'yyyy-mm-dd HH:MM:ss',
        },
      }
      if (process.env.LOG_COLORS === 'false') {
        this.pinoOptions.transport.options.colorize = false
      }
      if (process.env.LOG_SHOW_OBJECTS === 'true') {
        this.pinoOptions.transport.options.hideObject = false
      }
    }
    this.logger = pino.pino(this.pinoOptions).child({ module: 'main' })
    this.libgenMirror = {
      url: (process.env.LIBGEN_MIRROR ?? '').replace('/*$', '/'),
      dlUrl: (process.env.LIBGEN_MIRROR_FILEHOST ?? '').replace('/*$', '/'),
    }
    this.libgenPlusMirror = {
      url: (process.env.LIBGENPLUS_MIRROR ?? '').replace('/*$', '/'),
    }

    if (this.libgenMirror.url && !this.libgenMirror.dlUrl)
      throw new Error(
        'When LIBGEN_MIRROR is set LIBGEN_MIRROR_FILEHOST must also be set',
      )
    if (!this.libgenMirror.url && !this.libgenPlusMirror.url)
      throw new Error('No sources configured')

    this.ipfsGw = (process.env.IPFS_GW ?? '').replace('/*$', '/')
  }
}
export const config: Config = new Config()
