import { config } from '../../config.js'

export async function getConfig(ctx): Promise<void> {
  ctx.body = {
    config: {
      misc: {
        download_dir: config.downloadDir,
        complete_dir: config.downloadDir,
        history_retention: '0',
      },
      categories: [
        {
          name: 'ebook',
          order: 0,
          dir: '',
        },
        {
          name: 'Readarr',
          order: 1,
          dir: '',
        },
      ],
    },
  }
}
