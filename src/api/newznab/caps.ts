import xml2js from 'xml2js'
export async function caps(ctx): Promise<void> {
  const builder = new xml2js.Builder()
  ctx.body = builder.buildObject({
    caps: {
      server: { $: { version: '1.0', title: 'lib-nimic' } },
      // the limit is technically 25, but we may get more file results back for
      // 25 books so it could be over, and if readarr gets as many as the limit
      // it'll think there's pagination to be done, but we never paginate
      limits: { $: { max: 1000, default: 1000 } },
      registration: { $: { available: 'no' } },
      searching: {
        search: { $: { available: 'yes' } },
      },
      categories: {
        category: {
          $: { id: 7000, name: 'Books' },
          subcat: [
            { $: { id: 7010, name: 'Books/Mags' } },
            { $: { id: 7020, name: 'Books/EBook' } },
            { $: { id: 7030, name: 'Books/Comics' } },
            { $: { id: 7040, name: 'Books/Technical' } },
            { $: { id: 7050, name: 'Books/Other' } },
            { $: { id: 7060, name: 'Books/Foreign' } },
          ],
        },
      },
    },
  })
}
