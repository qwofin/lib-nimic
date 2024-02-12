import { bytesToMb, formatDuration } from '../../downloader/downloadManager.js'
import { downloader } from '../../services.js'
import { DownloadStatus } from '../../downloader/downloader.js'

export function mapToSabStatus(dlstatus: DownloadStatus): string {
  switch (dlstatus) {
    case DownloadStatus.DOWNLOADING:
      return 'Downloading'
    case DownloadStatus.INIT:
      return 'Queued'
    case DownloadStatus.FINISHED:
      return 'Completed'
    case DownloadStatus.FAILED:
      return 'Failed'
  }
}
// ref https://github.com/Readarr/Readarr/blob/develop/src/NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdQueueItem.cs
export async function queue(ctx): Promise<void> {
  if (ctx.query.name === 'delete') {
    const ids = ctx.query.value.split(',')
    const removeFile = ctx.query.del_files === '1' || false
    for (const id of ids) {
      await downloader.remove(id, removeFile)
    }
    ctx.body = {
      status: true,
    }
  } else {
    ctx.body = {
      paused: false,
      queue: {
        slots: downloader.getQueue().map(([id, dl], idx) => {
          const info = dl.info()
          const mbLeft = info.total ? info.total - info.onDisk : 0
          const pct = info.total ? info.onDisk / info.total : 0
          return {
            status: mapToSabStatus(info.status),
            timeleft: formatDuration(info.eta),
            mb: bytesToMb(info.total).toString(),
            filename: info.filename,
            priority: 'Normal',
            index: idx,
            cat: ctx.query.category,
            mbleft: bytesToMb(mbLeft).toString(),
            percentage: Math.floor(pct * 100).toString(),
            nzo_id: id,
          }
        }),
      },
    }
  }
}
