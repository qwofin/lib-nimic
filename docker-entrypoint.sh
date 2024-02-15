#!/bin/sh
set -e

PUID=${PUID:-99}
PGID=${PGID:-100}
groupmod -g ${PGID} abc > /dev/null
usermod -u ${PUID} abc > /dev/null
exec su abc -c "$*"