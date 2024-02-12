import { config } from '../../src/config.js'
import request from 'supertest'
import app from '../../src/app.js'
import nock from 'nock'
import { libgen, libgenPlus } from '../../src/services.js'
nock.back.fixtures = __dirname + '/nockFixtures'
const NOCK_OPTIONS: nock.BackOptions = {
  afterRecord: list =>
    list.filter(value => !(value.scope as string).includes('127.0.0.1')),
}
describe('newznab api', () => {
  beforeEach(() => {
    libgen.resetRateLimit()
    libgenPlus.resetRateLimit()
  })

  afterEach(() => {
    nock.cleanAll()
    nock.enableNetConnect()
  })
  test('caps', async () => {
    const response = await request(app.callback()).get(`/api/libgen/api?t=caps`)
    expect(response.status).toBe(200)
    expect(response.text).toMatchSnapshot()
  })

  test('libgen/search with query', async () => {
    nock.back.setMode('lockdown')
    const { nockDone, context } = await nock.back(
      'libgenSearchFixture',
      NOCK_OPTIONS,
    )
    nock.enableNetConnect('127.0.0.1')
    config.nzbHostOverride = 'http://127.0.0.1:3000'
    const response = await request(app.callback()).get(
      `/api/libgen/api?t=search&q=Frankenstein Or The Modern Prometheus`,
    )
    expect(response.status).toBe(200)
    expect(response.text).toMatchSnapshot()
    nockDone()
  }, 15000)

  test('libgenplus/search with query', async () => {
    nock.back.setMode('lockdown')
    const { nockDone, context } = await nock.back(
      'libgenplusSearchFixture',
      NOCK_OPTIONS,
    )
    nock.enableNetConnect('127.0.0.1')
    config.nzbHostOverride = 'http://127.0.0.1:3000'
    const response = await request(app.callback()).get(
      `/api/libgenplus/api?t=search&q=Frankenstein Or The Modern Prometheus`,
    )
    expect(response.status).toBe(200)
    expect(response.text).toMatchSnapshot()
    nockDone()
  }, 15000)

  test('libgen/search is rate limited', async () => {
    nock.back.setMode('lockdown')
    const { nockDone, context } = await nock.back(
      'libgenSearchRateLimit',
      NOCK_OPTIONS,
    )
    nock.enableNetConnect('127.0.0.1')
    config.nzbHostOverride = 'http://127.0.0.1:3000'

    for (let i = 0; i < 4; i++) {
      expect(
        (
          await request(app.callback()).get(
            `/api/libgen/api?t=search&q=Frankenstein Or The Modern Prometheus`,
          )
        ).status,
      ).toBe(200)
    }
    expect(
      (
        await request(app.callback()).get(
          `/api/libgen/api?t=search&q=Frankenstein Or The Modern Prometheus`,
        )
      ).status,
    ).toBe(429)

    nockDone()
  }, 15000)
})
