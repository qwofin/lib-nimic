// Original source from https://github.com/ryanblock/mock-tmp
// mock fs has issues with sync functions in modern node
import fs from 'fs'
import { tmpdir } from 'os'
import Path from 'path'
export default class TmpFs {
  _tmpDir

  constructor(files) {
    if (
      typeof files !== 'object' ||
      Array.isArray(files) ||
      !Object.keys(files).length
    ) {
      throw ReferenceError(
        'Specify one or more files in an object to write to tmp',
      )
    }
    this._tmpDir = fs.mkdtempSync(Path.join(tmpdir(), 'mock-tmp-fs-'))
    this.writeFiles(files)
    process.on('exit', this.reset)
  }

  get dirPath() {
    return this._tmpDir
  }

  writeFiles(files, dir = null) {
    if (!dir) {
      dir = this._tmpDir
    }
    Object.entries(files).forEach(([p, data]) => {
      const isBuf = data instanceof Buffer
      const isObj =
        typeof data == 'object' &&
        !Array.isArray(data) &&
        !isBuf &&
        data !== null
      if (isObj && data._path && data._options) {
        const { recursive = true } = data._options
        fs.cpSync(data._path, Path.join(dir, p), { recursive })
        return
      }
      if (typeof data !== 'string' && !isBuf && !isObj) {
        throw ReferenceError(`Files must be a string or buffer`)
      }
      // Normalize the destination path
      const filepath = Path.join(dir, p).replace(/[\\/]/g, Path.sep)
      const dest = isObj ? filepath : Path.parse(filepath).dir
      fs.mkdirSync(dest, { recursive: true })
      if (isObj) this.writeFiles(data, dest)
      else fs.writeFileSync(filepath, data)
    })
  }

  copy(path, options = {}) {
    return { _path: path, _options: options }
  }

  reset() {
    fs.rmSync(this._tmpDir, { recursive: true, force: true })
    try {
      fs.unlinkSync(this._tmpDir)
    } catch {
      /* noop */
    }
  }
}
