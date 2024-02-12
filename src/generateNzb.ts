import Path from 'path'
import xml2js from 'xml2js'
const META_PREFIX = 'x-lib-nimic'

export interface ParsedNzb {
  dlurl: string
  md5: string
  filename: string
  size: number
  sourcetype: string
}

export function generateNzb(
  dlurl: string,
  filename: string,
  size: number,
  md5: string,
  sourcetype: string,
): [string, string] {
  const name = Path.parse(filename).name
  const xAttribs: { [key: string]: string } = {
    dlurl,
    md5,
    filename,
    size: size.toString(),
    sourcetype,
  }

  const builder = new xml2js.Builder({
    doctype: {
      pubID: '-//newzBin//DTD NZB 1.1//EN',
      sysID: 'http://www.newzbin.com/DTD/nzb/nzb-1.1.dtd',
    },
  })
  const body = builder.buildObject({
    nzb: {
      $: { xmlns: 'http://www.newzbin.com/DTD/2003/nzb' },
      head: {
        meta: [
          { $: { type: 'category' }, _: 'Books > Ebooks' },
          { $: { type: 'name' }, _: name },
          ...Object.entries(xAttribs).map(([key, value]) => {
            return { $: { type: `${META_PREFIX}:${key}` }, _: value }
          }),
        ],
      },
      file: {
        $: { subject: filename },
        groups: { group: 'alt.binaries.e-book' },
        segments: {
          segment: {
            $: { bytes: size, number: 1 },
            _: `1@lib-nimic`,
          },
        },
      },
    },
  })

  return [`${filename}.nzb`, body]
}

export async function parseNzb(nzb: string): Promise<ParsedNzb> {
  const parser = new xml2js.Parser()
  const parsed = await parser.parseStringPromise(nzb)
  const meta = parsed.nzb.head[0].meta

  return {
    dlurl: meta.find(item => item['$'].type == `${META_PREFIX}:dlurl`)['_'],
    md5: meta.find(item => item['$'].type == `${META_PREFIX}:md5`)['_'],
    filename: meta.find(item => item['$'].type == `${META_PREFIX}:filename`)[
      '_'
    ],
    size: parseInt(
      meta.find(item => item['$'].type == `${META_PREFIX}:size`)['_'],
    ),
    sourcetype: meta.find(
      item => item['$'].type == `${META_PREFIX}:sourcetype`,
    )['_'],
  }
}
