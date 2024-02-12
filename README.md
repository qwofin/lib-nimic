# [lib]rary [n]ewnzab m[imic]

> This project does not host any files, it only helps 2 existing projects interface. It is for learning purposes.

> This is definitely a hack, not a fully fleshed integration. Expect things to break, downloads to fail etc. I have created this as a hobby/learning project and have no plans to actively maintain it or provide support. I appreciate bug reports and suggestions - just keep in mind they may yield nothing. If anybody is interested in maintaining it actively and/or providing support for it - you're more than welcome to fork it and shepherd people towards it, I'm happy to include a link in the readme.

## What it does

It allows readarr to search and fetch things from libgen/libgenplus.

> Keep in mind that using tools like this can put more strain on the sources than humans querying them, and at the same time take away any ad-based revenue they may have which they need to survive. Make sure to support the sources you use.

It performs the searches on libgen using html parsing/the json.php api where available and returns the results on a partial newznab API (only as much is implemented as readarr seemed to require). The NZBs in the newznab API are fake and are generated dynamically based on the information provided by the libgen search, they can't be fulfilled by regular usenet download clients. The nzb files have a few added meta headers which contain the information on how to download the files, readarr is expected to send the nzbs back to this application as a download client - pretending to be a sabnzbd instance - which allows it to download the files which then readarr can import.

## Setup

1. Run the application where readarr can access it on http, they need to also have access to a shared volume.
    1. It requires a few environmental variables to be set to configure, see below in [Configuration options](#configuration-options)
    2. For the shared volume I _highly_ recommend to use a folder that is explicitly for lib-nimic, i.e. it doesn't have any other files in it other than what it puts there. There is always a chance it has bugs which could make it delete files it shouldn't, best not to give it access to more than it needs.
2. Configure readarr with this application as a download client
    1. In readarr, navigate to download clients and make sure advanced options are shown
    2. Add a new download client of SABnzbd type
    3. In the modal, set the host/port to point to this application (the port is 3000 by default)
    4. set the Url base to `api/sab` (no need for any slashes around it)
    5. set the api key to anything (it can't be empty, but it's ignored)
3. If you need to, add a remote path mapping to match the download dir in the application to the same dir in readarr (same as for any other arr and download client)
4. Add it as a newznab type indexer in readarr for each sourcetype you use (currently supports `libgen` and `libgenplus`). 
    1. In readarr, navigate to indexers and make sure advanced options are shown
    2. Add a new indexer of newznab type
    3. For `libgen`, disable RSS - I've not found a way to implement it for libgen, only for libgenplus.
    4. Set URL to `http://[host]:[port]/api/[sourcetype]` i.e. for adding libgen it's `/api/libgen/`, libgenplus it's `/api/libgenplus/` (note, the endpoint will be `/api/[sourcetype]/api`, so make sure to leave API path on the default, which is `/api`)
    5. Set Categories to Books/EBook only
    6. Set the download client to the one you created in step 2.
5. Set _all_ other newznab indexers download client to your actual usenet client if you use one, this is to avoid messing up your other downloads by accidentally sending them to this application. If you use prowlarr, you'll have to set it to either not sync, or only sync added/removed for readarr, otherwise it'll undo this.
6. (Optional) ipfs downloads are supported if you configured an IPFS gateway in step 1. The application will return the download for ipfs and directly to libgen as 2 separate search results, with the ipfs one having `ipfs` in the name. You can configure release profiles to only use IPFS or custom formats to prefer ipfs/prefer not ipfs etc - the settings for these work the same as any other arr instance preference/exclusion settings do.

Then simply do a "manual search" for a book in readarr and hopefully it'll work. Read the note in [libgen search](#libgen-search) regarding rate limits and flickering errors in readarr.

### Configuration options

At least 1 of `LIBGEN_MIRROR` or `LIBGENPLUS_MIRROR` has to be set.
(The libgen ones are purposefully not included, they're trivial to get though)
- `DOWNLOAD_DIR` - required - Path to the downloads dir.
- `COMPLETED_DIR` - required - Path to the dir completed downloads should be moved, this needs to be accessible to Readarr as well.
- `LIBGEN_MIRROR` - optional - The host for the libgen mirror to use (e.g. `http://libgen.foo/` - obviously use a real one). Note: this is libgen, _not_ libgen+
- `LIBGEN_MIRROR_FILEHOST` - required when `LIBGEN_MIRROR`` is set - The filehost domain for the mirror. To find it, go to your libgen mirror and click to download any book, click on the libgen/ipfs link which will take you to a different domain. Use that domain.
- `LIBGENPLUS_MIRROR` - optional - The host for the libgen+ mirror to use (e.g. `http://libgen.foo/` - obviously use a real one). Note: this is libgen+, _not_ libgen
- `IPFS_GW` - optional - IPFS gateway to use (e.g. `https://gateway.ipfs.io`)
- `API_PORT` - default 3000 - port for the api server
- `LOG_LEVEL` - default info - log level (race, debug, info, warn, error, and fatal)
- `LOG_FORMAT` - default empty (means `json`) - not set (json) or `pretty` (human readable)
- `LOG_COLOR` - default true - Only applicable when log format is pretty, true/false to use colors.
- `LOG_SHOW_OBJECTS` - default false - Only applicable when log format is pretty, true/false to print additional context around logging

> On libgen vs libgenplus: libgenplus will always have more results since it supports searching all the libraries, whereas libgen only supports the core libgen library. This is particularly impactful for fantasy and science queries. On the other hand, libgenplus seems to be down fairly frequently. Neither are a golden bullet.

If using docker and a volume that's shared to both readarr and nimic, it's necessary to set the file ownership of the downloads to something that readarr can read. I.e. nimic should ideally run either as the same UID or GUID as readarr does, in their respective containers. To do this the following env vars allow setting these 2 in the built docker container. The defaults match the LSIO defaults (i.e. no need to change them if you use LSIO for readarr and haven't changed them there).

- `PUID` - default 99  - the user id to set for the user running nimic in the container
- `PGID` - default 100 - the group id to set for the user running nimic in the container

## More notes

The order of operations here are:

1. Readarr starts search for a new book
2. Readarr sends `.../api/libgen/api?t=search&q=BookTitle` to nimic (assuming it's using libgen, if more than one sourcetype is configured the searches happen in parallel to the other `/api/sourcetype/api` newznab endpoints - similar to how prowlarr proxies searches)
2. Nimic searches libgen and formats the results into newznab xml, sending it back to readarr with the nzb link pointing back to nimic with a few query params, like the download url, generated filename etc. (also similar to prowlarr)
3. Readarr/the user asks to download a book
4. Readarr requests `.../api/nzb?<...said libgen information from step 2>`
5. Nimic constructs an NZB file based on the query params and sends it back to Readarr, the file segments in it are useless but the nzb will include the query params we passed from step 2 -> step 4, with some more if needed (e.g. for libgenplus to resolve from the file detail url to the actual download url, which is not returned by the api)
6. Readarr sends the NZB file back to the application on the fake SABnzbd api (`.../api/sab/api`)
7. The download will start and Readarr will monitor it like any download in the real SAB through the same api
8. At the end, readarr will import the file and tell the application to delete it through the api

### Troubleshooting

To troubleshoot most things:
- check that libgen actually works and you can perform the steps yourself (i.e. open website, search for book, download book)
- set `LOG_LEVEL` to `debug`
- set `LOG_SHOW_OBJECTS` to `true`
- if you can use some sort of log aggregator which can parse json I'd recommend setting `LOG_FORMAT` to `json`
- also worth inspecting the `_downloads.json` file in the `DOWNLOAD_DIR`. It is basically the "database" of the downloads known to nimic. It's possible for it to get mixed up in scenarios I didn't expect, which could result in "ghost" downloads (i.e. it _thinks_ it has a download in the history but it doesn't, which would make it refuse to attempt to download the same file). There is no harm in deleting this file if you need to, just make sure to first stop nimic, then delete the file, then restart - otherwise it just re-creates it when nimic stops. If the file is deleted, I'd also recommend deleting all other files from the download dir, technically nimic could continue a download from an existing file, but I'd not recommend it.


### Libgen search

Searching libgen or libgenplus is obviously not intended to be done automatically (or at leats neither has direct support for it). They both have a JSON api but it is different between the 2. On Libgen, the api does not cover anything past the "libgen" library (e.g. fiction, science etc), as such on libgen does libraries are _not_ searchable with lib-nimic. It's technically possible to do, but it'd result in a lot of requests to libgen which would be akin to spamming them(a single search would yield up to ~26 requests to libgen, whereas with the api it yields 2). Luckily on LibgenPlus the search and api cover all the libraries, so they all work there. Neither API supports searching the same way as their html pages do, so searches still happen through html, then parsing the form for the IDs needed to be able to use the api - it uses the API afterwards.

> Searches are rate limited to 4 searches/30seconds, this is hard-coded to protect libgen _just in case_ this application ends up being used. Readarr sends 2-3 searches for each book simultaneously, so this ends up yielding ~2 readarr book search per 30 seconds. Readarr will flicker warnings about indexers being unavailable due to errors when this happens, however the errors go away as soon as it can use them again (in 30s).


## Contributions

Bugfixes are always welcome.

For features: as stated, this project is for learning purposes, I've only shared it in case it benefits others too. I'm selective as to what I'd accept in terms of features (both in terms of what I feel comfortable merging and what I would like the scope of the project to be). Please make sure to open an issue and discuss features before working on them, so whether it will be merged or not can be clarified before time is spent on it.

To set up a dev environment:
 1. have node 21
 2. clone the project
 3. `npm i`
 4. set up your env vars in line with the configurations above
 5. `npm run dev`
 6. configure a readarr instance to point to the dev setup

To run tests: `npm run test`, or for specific tests: `npx jest test/path/to/test`
When updating queries made to external services, nock.back fixtures have to be refreshed. In tests where these are used, update `nock.back.setMode('lockdown')` to `record` instead of `lockdown`. Make sure to set it back before commiting.
When updating API responses, jest snapshots have to be updated - verify the changes and run just with `npx jest -u test/path/to/test`
Useful commands:
- `npm run lint` - run eslint
- `npm run prettier` - check formatting with prettier
- `npm run format` - have prettier & eslint fix whatever they can automatically