import { config } from '../../src/config.js'
import { app } from '../helpers/faultyServer.js'
import TmpFs from '../helpers/tmpFs.js'
import fs from 'fs'
import type { AddressInfo } from 'net'
import { Downloader } from '../../src/downloader/downloader.js'

describe('downloader module', () => {
  let _server
  let _address
  let _tmp
  beforeEach(done => {
    _tmp = new TmpFs({
      '/downloads': {},
      '/completed': {},
    })
    config.downloadDir = _tmp.dirPath + '/downloads/'
    _server = app.listen(() => {
      const port = (<AddressInfo>_server.address()).port
      _address = `http://localhost:${port}/`
      done()
    })
  })

  afterEach(done => {
    _tmp.reset()
    _server.close(done)
  })

  test('download succeeds from healthy server', async () => {
    const downloader = new Downloader(
      _address + '?work=1&throttle=0',
      config.downloadDir,
      '1.test',
      {
        retryDelay: () => 0,
        retryAttempts: 5,
      },
    )
    await downloader.start()
    const downloadedFilePath = _tmp.dirPath + '/downloads/1/1.test'
    const fixtureFilePath = __dirname + '/../fixtures/test.file'
    expect(downloader.info().path).toBe(downloadedFilePath)
    expect(fs.existsSync(downloadedFilePath)).toBe(true)
    expect(fs.statSync(downloadedFilePath).size).toBe(
      fs.statSync(fixtureFilePath).size,
    )
    expect(downloader.info().onDisk).toBe(fs.statSync(downloadedFilePath).size)
    expect(fs.readFileSync(downloadedFilePath)).toEqual(
      fs.readFileSync(fixtureFilePath),
    )
    expect(downloader.info().attempts).toBe(1)
  })

  test('download succeeds from faulty server with resumes', async () => {
    const downloader = new Downloader(
      _address + '?throttle=100',
      config.downloadDir,
      '1.test',
      {
        retryDelay: () => 0,
        retryAttempts: 10,
      },
    )
    await downloader.start()
    const downloadedFilePath = _tmp.dirPath + '/downloads/1/1.test'
    const fixtureFilePath = __dirname + '/../fixtures/test.file'
    expect(downloader.info().path).toBe(downloadedFilePath)
    expect(fs.existsSync(downloadedFilePath)).toBe(true)
    expect(fs.statSync(downloadedFilePath).size).toBe(
      fs.statSync(fixtureFilePath).size,
    )
    expect(downloader.info().onDisk).toBe(fs.statSync(downloadedFilePath).size)
    expect(fs.readFileSync(downloadedFilePath)).toEqual(
      fs.readFileSync(fixtureFilePath),
    )
    expect(downloader.info().attempts).toBeGreaterThan(1)
  }, 10000)

  test('download succeeds from partial file on disk', async () => {
    const downloadedFilePath = _tmp.dirPath + '/downloads/1/1.test'
    const fixtureFilePath = __dirname + '/../fixtures/test.file'
    const partialFilePath = __dirname + '/../fixtures/test.file.partial'
    _tmp.writeFiles({ '/downloads/1/1.test': _tmp.copy(partialFilePath) })
    const downloader = new Downloader(
      _address + '?work=1',
      config.downloadDir,
      '1.test',
      {
        retryDelay: () => 0,
        retryAttempts: 10,
        attemptResumeOnExistingFile: true,
      },
    )
    await downloader.start()
    expect(downloader.info().skipped).toBe(fs.statSync(partialFilePath).size)
    expect(downloader.info().path).toBe(downloadedFilePath)
    expect(fs.existsSync(downloadedFilePath)).toBe(true)
    expect(fs.statSync(downloadedFilePath).size).toBe(
      fs.statSync(fixtureFilePath).size,
    )
    expect(downloader.info().onDisk).toBe(fs.statSync(downloadedFilePath).size)
    expect(fs.readFileSync(downloadedFilePath)).toEqual(
      fs.readFileSync(fixtureFilePath),
    )
    expect(downloader.info().downloaded).toBe(
      downloader.info().onDisk - downloader.info().skipped,
    )
  })

  test('download overwrites when resuming from file is not set', async () => {
    const downloadedFilePath = _tmp.dirPath + '/downloads/1/1.test'
    const fixtureFilePath = __dirname + '/../fixtures/test.file'
    const partialFilePath = __dirname + '/../fixtures/test.file.partial'
    _tmp.writeFiles({ '/downloads/1.test': _tmp.copy(partialFilePath) })
    const downloader = new Downloader(
      _address + '?work=1',
      config.downloadDir,
      '1.test',
      {
        retryDelay: () => 0,
        retryAttempts: 1,
      },
    )
    await downloader.start()
    expect(downloader.info().path).toBe(downloadedFilePath)
    expect(fs.existsSync(downloadedFilePath)).toBe(true)
    expect(fs.statSync(downloadedFilePath).size).toBe(
      fs.statSync(fixtureFilePath).size,
    )
    expect(downloader.info().onDisk).toBe(fs.statSync(downloadedFilePath).size)
    expect(fs.readFileSync(downloadedFilePath)).toEqual(
      fs.readFileSync(fixtureFilePath),
    )
    expect(downloader.info().skipped).toBe(0)
    expect(downloader.info().downloaded).toBe(downloader.info().onDisk)
  }, 10000)

  test('download fails when out of retries', async () => {
    const downloader = new Downloader(
      _address + '?throttle=300',
      config.downloadDir,
      '1.test',
      {
        retryDelay: () => 0,
        retryAttempts: 1,
      },
    )
    await expect(downloader.start()).rejects.toThrow()
    const downloadedFilePath = _tmp.dirPath + '/downloads/1/1.test'
    const fixtureFilePath = __dirname + '/../fixtures/test.file'
    expect(downloader.info().path).toBe(downloadedFilePath)
    expect(fs.existsSync(downloadedFilePath)).toBe(true)
    expect(downloader.info().onDisk).toBe(fs.statSync(downloadedFilePath).size)
    expect(fs.statSync(downloadedFilePath).size).toBeLessThan(
      fs.statSync(fixtureFilePath).size,
    )
    expect(downloader.info().attempts).toBe(2)
  }, 10000)

  test('download validates md5', async () => {
    const downloader = new Downloader(
      _address + '?work=1',
      config.downloadDir,
      '1.test',
      {
        expectedMd5: '5994a01ac0113c1f2d185fda1dc0ee80', // md5 of the fixture file
      },
    )
    await downloader.start()
    // we don't need to assert anything, if it fails it would throw
  })

  test('download fails when given incorrect md5', async () => {
    const downloader = new Downloader(
      _address + '?work=1',
      config.downloadDir,
      '1.test',
      {
        expectedMd5: 'foo', // md5 of the fixture file
      },
    )
    await expect(downloader.start()).rejects.toThrow()
  })

  test('download renames on completetion', async () => {
    const downloader = new Downloader(
      _address + '?work=1',
      config.downloadDir,
      '1.test',
      {
        completedDir: _tmp.dirPath + '/completed/',
      },
    )
    await downloader.start()
    const downloadedDir = _tmp.dirPath + '/downloads/1/'
    const downloadedFilePath = downloadedDir + '/1.test'
    const completedFilePath = _tmp.dirPath + '/completed/1/1.test'
    const fixtureFilePath = __dirname + '/../fixtures/test.file'
    expect(downloader.info().path).toBe(completedFilePath)
    expect(fs.existsSync(downloadedDir)).toBe(false)
    expect(fs.existsSync(downloadedFilePath)).toBe(false)
    expect(fs.existsSync(completedFilePath)).toBe(true)
    expect(fs.statSync(completedFilePath).size).toBe(
      fs.statSync(fixtureFilePath).size,
    )
    expect(downloader.info().onDisk).toBe(fs.statSync(completedFilePath).size)
    expect(fs.readFileSync(completedFilePath)).toEqual(
      fs.readFileSync(fixtureFilePath),
    )
    expect(downloader.info().attempts).toBe(1)
  }, 10000)
})
