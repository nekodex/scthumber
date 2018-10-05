#!/bin/sh

set -u
set -e

command -v yarn || npm install -g yarn
yarn

# perform deployment
outdir="/deploy/scthumber-$(date "+%Y%m%dT%H%M%S")"
mkdir -p "$outdir"
cp -pr ./ "$outdir"

ln -snf "$outdir" "/deploy/scthumber-current"
