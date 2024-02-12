import Router from 'koa-router'
import { generateNzb } from '../generateNzb.js'
import { config } from '../config.js'
import * as sabApi from './sab/index.js'
import * as newznabApi from './newznab/index.js'

export const router = new Router()

router.get('/api/nzb', ctx => {
  const dlurl = ctx.request.query.dlurl as string
  const size = parseInt(ctx.request.query.size as string)
  const md5 = ctx.request.query.md5 as string
  const filename = ctx.request.query.filename as string
  const sourcetype = ctx.request.query.sourcetype as string

  config.logger.info(`NZB requested for ${dlurl}`)
  const [nzbFilename, content] = generateNzb(
    dlurl,
    filename,
    size,
    md5,
    sourcetype,
  )
  ctx.body = content
  ctx.attachment(nzbFilename)
})

router.get('/api/sab/api', async ctx => {
  const query = ctx.request.query
  const endpoint = query.mode as string
  ctx.type = 'application/json'
  if (endpoint in sabApi) {
    await sabApi[endpoint](ctx)
  }
})

router.post('/api/sab/api', async ctx => {
  const query = ctx.request.query
  const endpoint = query.mode as string
  ctx.type = 'application/json'
  if (endpoint in sabApi) {
    await sabApi[endpoint](ctx)
  }
})

router.get('/api/:type/api', async ctx => {
  const query = ctx.request.query
  const endpoint = query.t as string
  ctx.type = 'application/rss+xml'
  if (endpoint in newznabApi) {
    await newznabApi[endpoint](ctx)
  }
})
