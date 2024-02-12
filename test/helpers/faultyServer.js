import Koa from 'koa'
import { Duplex } from 'stream'
import fs from 'fs'

class Throttle extends Duplex {
  constructor(time) {
    super()
    this.delay = time
  }

  _read() {}

  _write(chunk, encoding, callback) {
    this.push(chunk)
    if (this.delay) {
      setTimeout(callback, this.delay)
    } else {
      callback()
    }
  }
  _final() {
    this.push(null)
  }
}

export const app = new Koa()
let lastResult = true

app.use(async ctx => {
  ctx.set('accept-ranges', 'bytes')
  if (lastResult && !ctx.request.query.work) {
    ctx.status = 502
  } else {
    ctx.attachment('test.file')
    // very difficult to co-relate this to real speed
    // guesswork number, if tests fail things may be happening too fast or too slow
    const throttle = new Throttle(parseInt(ctx.request.query.throttle || '0'))
    const file = __dirname + '/../fixtures/test.file'
    let startByte = 0
    if (ctx.request.headers.range) {
      let split = ctx.req.headers.range.split('=')
      if (split[0] == 'bytes') {
        let range = split[1].split('-')
        startByte = parseInt(range[0])
        ctx.set('content-range', `bytes ${startByte}/*`)
      }
    }
    ctx.set('content-length', fs.statSync(file).size - startByte)
    ctx.body = fs
      .createReadStream(file, { start: startByte, highWaterMark: 32 })
      .pipe(throttle)
    if (!ctx.request.query.work) {
      setTimeout(() => {
        ctx.res.destroy()
      }, 1000)
    }
  }

  lastResult = !lastResult
})
