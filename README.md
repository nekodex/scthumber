# scthumber

Image thumbnailing daemon utilizing [Smartcrop.js](https://github.com/jwagner/smartcrop.js/) for content-aware cropping with [vips](http://www.vips.ecs.soton.ac.uk/) for resizing+processing and [mozjpeg](https://github.com/mozilla/mozjpeg) for optimization

Originally forked from [connect-thumbs](https://github.com/inadarei/connect-thumbs) but has since gone in a different direction.

### Installing Dependencies

smartcrop-thumber is dependent on:
smartcrop-js
vips
mozjpeg

On a Debian/Ubuntu system:
```
apt-get install build-essential pkg-config libcairo2-dev libjpeg-dev libpng-dev libvips-dev libgif-dev nasm
npm install # or yarn
```

## Configuration
See `var thumber` in `scthumbd.js` for now...

## Running
```
npm run scthumbd
```
