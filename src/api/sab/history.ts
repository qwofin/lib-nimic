import { downloader } from '../../services.js'
import { DownloadStatus } from '../../downloader/downloader.js'
import { mapToSabStatus } from './queue.js'

// ref https://github.com/Readarr/Readarr/blob/develop/src/NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdHistoryItem.cs
export async function history(ctx): Promise<void> {
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
      history: {
        slots: downloader
          .filterDownloads([DownloadStatus.FINISHED, DownloadStatus.FAILED])
          .map(([id, dl]) => {
            return {
              fail_message: '',
              bytes: dl.info().onDisk,
              category: ctx.query.category,
              nzb_name: dl.info().filename + '.nzb',
              download_time: Math.round(
                (dl.info().endedAt.getTime() - dl.info().startedAt.getTime()) /
                  1000,
              ),
              storage: dl.info().path,
              path: dl.info().path,
              status: mapToSabStatus(dl.info().status),
              nzo_id: id,
              name: dl.info().filename,
            }
          }),
      },
    }
  }
}
