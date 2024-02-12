import { config } from '../../src/config.js'
import request from 'supertest'
import app from '../../src/app.js'
import { parseNzb } from '../../src/generateNzb.js'

describe('nzb generation', () => {
  test('generates valid nzb', async () => {
    config.chunkSize = 1024
    const response = await request(app.callback()).get(
      `/api/nzb?dlurl=https://test.com/test.epub&size=3073&md5=abcdef&filename=test.epub&sourcetype=libgen`,
    )
    expect(response.status).toBe(200)
    expect(response.text).toMatchSnapshot()
  })

  test('parses valid nzb', async () => {
    expect(
      await parseNzb(
        (
          await request(app.callback()).get(
            `/api/nzb?dlurl=https://test.com/test.epub&size=3073&md5=abcdef&filename=test.epub&sourcetype=libgen`,
          )
        ).text,
      ),
    ).toEqual({
      dlurl: 'https://test.com/test.epub',
      size: 3073,
      md5: 'abcdef',
      filename: 'test.epub',
      sourcetype: 'libgen',
    })
    expect(
      await parseNzb(
        (
          await request(app.callback()).get(
            `/api/nzb?dlurl=https://test.com/test.epub&size=3073&md5=abcdef&filename=test.epub&sourcetype=libgen`,
          )
        ).text,
      ),
    ).toEqual({
      dlurl: 'https://test.com/test.epub',
      size: 3073,
      md5: 'abcdef',
      filename: 'test.epub',
      sourcetype: 'libgen',
    })
  })
})
