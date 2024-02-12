#!/bin/sh
set -e

PUID=${PUID:-99}
PGID=${PGID:-100}

addgroup -S abc -g ${PGID}
adduser -S -H -s /bin/sh -G abc -u ${PUID} abc
exec su abc -c "$*"