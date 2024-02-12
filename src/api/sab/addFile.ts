import getRawBody from 'raw-body'
import { ParsedNzb, parseNzb } from '../../generateNzb.js'
import { Downloader } from '../../downloader/downloader.js'
import { libgen } from '../../services.js'
import { libgenPlus } from '../../services.js'
import { config } from '../../config.js'
const logger = config.logger.child({ module: 'sabapi/addfile' })

export async function addFile(ctx): Promise<void> {
  const body = await getRawBody(ctx.req, {
    length: ctx.request.headers['content-length'],
    limit: '5mb',
  })
  const boundary =
    '--' +
    ctx.request.headers['content-type'].split('; ')[1].replace('boundary=', '')
  const rawFile = body.toString().split(boundary)[1].replace('\r\n', '\n')
  const lines = rawFile.split('\n')
  for (const i in lines) {
    if (!lines[i].startsWith('<?xml')) {
      delete lines[i]
    } else {
      break
    }
  }
  const text = lines.filter(Boolean).join('\n')
  if (!text) {
    ctx.status = 400
    ctx.body = {
      status: false,
      nzo_ids: [],
      error: 'Could not find nzb in body.',
    }
    logger.error("Couldn't find nzb body in request")
    return
  }
  let parsed: ParsedNzb
  try {
    parsed = await parseNzb(text)
  } catch (err) {
    ctx.status = 400
    ctx.body = {
      status: false,
      nzo_ids: [],
      error: 'Failed to parse nzb body.',
    }
    logger.error(`Couldn't parse nzb body from request due to ${err}`)
    return
  }

  let id: string
  let dl: Downloader
  if (parsed.sourcetype === libgen.type) {
    ;[id, dl] = await libgen.download(parsed.dlurl, parsed.filename, parsed.md5)
  } else if (parsed.sourcetype === libgenPlus.type) {
    ;[id, dl] = await libgenPlus.download(
      parsed.dlurl,
      parsed.filename,
      parsed.md5,
    )
  } else {
    ctx.status = 400
    ctx.body = {
      status: false,
      nzo_ids: [],
      error: `Invalid sourcetype ${parsed.sourcetype}`,
    }
    return
  }
  ctx.body = {
    status: true,
    nzo_ids: [id],
  }
}
