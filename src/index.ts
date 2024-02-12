import { config } from './config.js'
import app from './app.js'
import { downloader } from './services.js'

const apiServer = app.listen(config.apiPort, () => {
  config.logger.info(`API Server is running on port ${config.apiPort}`)
})
// downloader.cleanup()
// config.logger.info("Scheduling download cleanup")
// setInterval(() => downloader.cleanup(), 1000*60*60*24)

function shutdown() {
  config.logger.info('Shutting down...')
  downloader.saveState()
  apiServer.close()
  process.exit(0)
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
