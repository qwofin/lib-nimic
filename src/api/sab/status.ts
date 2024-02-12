import { config } from '../../config.js'

// ref https://github.com/Readarr/Readarr/blob/develop/src/NzbDrone.Core/Download/Clients/Sabnzbd/SabnzbdFullStatus.cs
// ref https://sabnzbd.org/wiki/configuration/4.2/api#fullstatus
export async function status(ctx): Promise<void> {
  ctx.body = {
    status: {
      completeddir: config.downloadDir,
    },
  }
}
