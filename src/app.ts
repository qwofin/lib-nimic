import Koa from 'koa'
// import logger from 'koa-pino-logger'
import { pinoHttp } from 'pino-http'
import { router } from './api/routes.js'
import { config } from './config.js'
const app = new Koa()
const logger = config.logger.child({ module: 'api' })
const logWrapper = pinoHttp({ logger })
// const apiLogger = logger(config.pinoOptions)
// apiLogger.logger.setBindings({ module: 'api' })

app.use(async (ctx, next) => {
  try {
    await next()
  } catch (err) {
    ctx.status = err.statusCode || err.status || 500
    ctx.body = {
      error: err.message,
    }
  }
})
app.use(async (ctx, next) => {
  logWrapper(ctx.req, ctx.res)
  try {
    await next()
  } catch (err) {
    ctx.req.log.error({ err })
    throw err
  }
})
app.use(router.routes())
export default app
