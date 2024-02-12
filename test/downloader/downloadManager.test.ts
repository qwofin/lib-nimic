import TmpFs from '../helpers/tmpFs.js'
import fs from 'fs'
import {
  bytesToMb,
  DownloadManager,
} from '../../src/downloader/downloadManager.js'
import {
  Downloader,
  DownloadInfo,
  DownloadStatus,
} from '../../src/downloader/downloader.js'
import { config } from '../../src/config.js'
jest.mock('../../src/downloader/downloader.js')

describe('download manager module', () => {
  let _tmp: TmpFs
  let _downloadDir: string
  let _completeDir: string
  beforeEach(() => {
    _tmp = new TmpFs({
      '/downloads': {},
      '/completed': {},
    })
    _downloadDir = _tmp.dirPath + '/downloads/'
    _completeDir = _tmp.dirPath + '/completed/'
  })

  afterEach(() => {
    _tmp.reset()
  })
  test('bytesToMb', () => {
    expect(bytesToMb(1)).toEqual(0)
    expect(bytesToMb(1024 * 1024)).toEqual(1)
    expect(bytesToMb(1024 * 1024 * 1.14)).toEqual(1.1)
    expect(bytesToMb(1024 * 1024 * 1.15)).toEqual(1.2)
  })

  test('download dedups', async () => {
    jest
      .spyOn(Downloader.prototype, 'info')
      .mockReturnValue({} as unknown as DownloadInfo)
    jest
      .spyOn(Downloader.prototype, 'start')
      .mockResolvedValue(jest.mocked(Response) as unknown as Response)

    const downloader = new DownloadManager(_downloadDir, _completeDir)
    const [id, result] = await downloader.download(
      'https://test.com/test.file',
      'test.file',
    )
    const [id2, duplicate] = await downloader.download(
      'https://test.com/test.file',
      'test.file',
    )
    expect(duplicate).toBe(result)
    expect(id2).toBe(id)
    expect(Downloader).toHaveBeenCalledWith(
      'https://test.com/test.file',
      _downloadDir,
      'test.file',
      expect.anything(),
    )
    await downloader.download('https://test.com/test.file2', 'test.file2')
    expect(Downloader).toHaveBeenCalledTimes(2)
    expect(Downloader).toHaveBeenCalledWith(
      'https://test.com/test.file2',
      _downloadDir,
      'test.file2',
      expect.anything(),
    )
  })

  test('failed download does not crash', async () => {
    jest
      .spyOn(Downloader.prototype, 'info')
      .mockReturnValue({ elapsed: 0 } as unknown as DownloadInfo)
    jest
      .spyOn(Downloader.prototype, 'start')
      .mockRejectedValue(new Error('foo'))
    const downloader = new DownloadManager(_downloadDir, _completeDir)
    await downloader.download('https://test.com/test.file', 'test.file')
    // the goal is to just not throw an error, so if it gets here it passes
  })

  test('cleanup removes files older than a day', async () => {
    _tmp.writeFiles({
      '/completed/test/test.file': 'foo',
    })
    const downloadedFilePath = _completeDir + '/test/test.file'
    const date = new Date()
    date.setDate(date.getDate() - 2)
    jest.spyOn(Downloader.prototype, 'info').mockReturnValue({
      endedAt: date,
      path: downloadedFilePath,
      dir: _completeDir + '/test',
      elapsed: 10,
      status: DownloadStatus.FINISHED,
    } as unknown as DownloadInfo)

    jest
      .spyOn(Downloader.prototype, 'start')
      .mockResolvedValue(jest.mocked(Response) as unknown as Response)

    const downloader = new DownloadManager(_downloadDir, _completeDir)
    await downloader.download('https://test.com/test.file', 'test.file')
    expect(fs.existsSync(downloadedFilePath)).toBe(true)
    await downloader.cleanup()
    expect(fs.existsSync(downloadedFilePath)).toBe(false)
  })
})
