import { config } from './config.js'
import { DownloadManager } from './downloader/downloadManager.js'
import { LibgenSource } from './sources/Libgen.js'
import { LibgenPlusSource } from './sources/LibgenPlus.js'

export const downloader = new DownloadManager(
  config.downloadDir,
  config.completedDir,
)
export const libgen = new LibgenSource(
  downloader,
  config.libgenMirror.url,
  config.libgenMirror.dlUrl,
  config.ipfsGw,
)
export const libgenPlus = new LibgenPlusSource(
  downloader,
  config.libgenPlusMirror.url,
  config.ipfsGw,
)
