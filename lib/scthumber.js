if (!module.parent) { console.log("this is a module and should not be run directly."); process.exit(1); }

var presets,
  allowedExtensions;

const
  fs           = require('fs-extra'),
  http         = require('http'),
  moment       = require('moment'),
  mozjpeg      = require('mozjpeg-stream'),
  server_stats = require('./scthumber-stats'),
  sharp        = require('sharp');

exports = module.exports = function (opts) {
  var thumber = {
    stats: server_stats(),
    log: function(...messages) {
      timestamp = moment().format('YYYY-MM-DD HH:mm:ss');
      console.log(`[${'%s'.grey}] ${'%s'.white}`, timestamp, messages.join(' '));
    },
    errorAbort: function(res, message, failStat, statusCode) {
      thumber.stats.increment(failStat);
      res.writeHead(statusCode || 400);
      res.end(message || 'invalid arguments');
    },
    invalidArgsAbort: function(res, message) {
      return thumber.errorAbort(res, message || 'invalid arguments', 'arg_error');
    },
    fetchURL: function (url) {
      return new Promise((resolve, reject) => {
        http.get(url, (response) => {
          if (response.statusCode < 200 || response.statusCode > 299) {
            reject(`Error retrieving image: UPSTREAM ${response.statusCode}`);
          }
          var data = [];
          response.on('data', (chunk) => data.push(chunk));
          response.on('end', () => resolve(Buffer.concat(data)));
        });
      });
    },
    thumbnail: function(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { return thumber.invalidArgsAbort(res); }

      // Is this a request to a thumbnail image?
      regexp = new RegExp('^\/thumb\/([A-Za-z0-9_@]+)\/([%\.\-A-Za-z0-9_@=\+]+\.(?:' + allowedExtensions.join('|') + '))(\\?[0-9]+)?$', 'i');
      var thumbRequestParts = req.originalUrl.match(regexp);
      if (!thumbRequestParts) {
        return thumber.invalidArgsAbort(res);
      }

      var imagePreset = thumbRequestParts[1];
      if (!presets[imagePreset]) {
        // invalid preset?
        return thumber.invalidArgsAbort(res);
      }

      var upstreamURL = "http://" + thumbRequestParts[2];
      if (thumbRequestParts[3] != undefined)
        upstreamURL += thumbRequestParts[3];

      var request_start = Date.now();
      thumber.log(`Thumbnailing ${req.originalUrl}...`);
      thumber.fetchURL(upstreamURL)
        .catch((err) => {
          thumber.log(`ERR: ${req.originalUrl} [${err}]`.red);
          return thumber.errorAbort(res, `Error retrieving image: ${err}`, 'upstream_error', 502);
        })
        .then((data) => {
          thumber.resizeImage(data, presets[imagePreset])
            .catch((err) => {
              thumber.log(`ERR: ${req.originalUrl} [${err}]`.red);
              return thumber.errorAbort(res, `Error resizing image: ${err}`, 'thumb_error', 500);
            })
            .then((image) => {
              thumber.imageOptim(image)
                .pipe(res)
                .on('finish', () => {
                  var elapsed = Date.now() - request_start;
                  thumber.log(`OK: ${req.originalUrl} (src: ${Math.round(data.length/1024)}KB) [${elapsed}ms]`.green);
                  thumber.stats.increment('ok');
                  thumber.stats.addElapsedTime(elapsed);
                });
            });
        });
    },
    optimize: function(req, res) {
      if (req.method !== 'GET' && req.method !== 'HEAD') { return thumber.invalidArgsAbort(res); }

      regexp = new RegExp('^\/optim\/([%\.\-A-Za-z0-9_@=\+]+\.(?:' + allowedExtensions.join('|') + '))(\\?[0-9]+)?$', 'i');
      var thumbRequestParts = req.originalUrl.match(regexp);
      if (!thumbRequestParts) {
        return thumber.invalidArgsAbort(res);
      }

      var upstreamURL = "http://" + thumbRequestParts[1];
      if (thumbRequestParts[2] != undefined)
        upstreamURL += thumbRequestParts[2];

      var request_start = Date.now();
      thumber.log(`Optimizing ${req.originalUrl}...`);
      thumber.fetchURL(upstreamURL)
        .catch((err) => {
          thumber.log(`ERR: ${req.originalUrl} [${err}]`.red);
          return thumber.errorAbort(res, `Error retrieving image: ${err}`, 'upstream_error', 502);
        })
        .then((data) => {
          thumber.imageOptim(data)
            .pipe(res)
            .on('finish', () => {
              var elapsed = Date.now() - request_start;
              thumber.log(`OK: ${req.originalUrl} (src: ${Math.round(data.length/1024)}KB) [${elapsed}ms]`.green);
              thumber.stats.increment('ok');
              thumber.stats.addElapsedTime(elapsed);
            });
        });
    },
    get_stats: function(req, res) {
      thumber.stats.get_stats(req, res);
    },
    resizeImage: function(inputBuffer, preset) {
      return new Promise((resolve, reject) => {
        var Canvas    = require('canvas'),
            SmartCrop = require('smartcrop');

        if (!preset.width) {
          reject('preset width not set');
        }

        if (!preset.quality) {
          preset.quality = 94;
        }

        if (!preset.height) {
          preset.height = preset.width;
        }

        var pixelScale = preset.pixelScale || 1;
        var canvasOptions = {
          'canvasFactory': function(w, h) { return new Canvas(w, h); },
          'width': preset.width * 2,
          'height': preset.height * 2,
        };

        var img = new Canvas.Image();
        img.src = inputBuffer;

        SmartCrop.crop(img, canvasOptions)
          .then((result) => {
            var rect = result.topCrop;
            sharp(inputBuffer)
              .extract({
                'left': rect.x,
                'top': rect.y,
                'width': rect.width,
                'height': rect.height
              })
              .resize(preset.width * pixelScale, preset.height * pixelScale)
              .sharpen()
              .jpeg({'quality': 100})
              .toBuffer()
              .then((output) => {
                resolve(output);
              });
          });

      });
    },
    imageOptim: function(inputBuffer) {
      return sharp(inputBuffer)
        .jpeg({'quality': 100})
        .pipe(
          mozjpeg({'quality': 94, 'args': '-baseline'})
        );
    },

    /**
     * Merge user-provided options with the sensible defaults.
     * @param options
     */
    parseOptions: function(options) {
      presets  = options.presets || thumber.defaultPresets;

      allowedExtensions = options.allowedExtensions || ['gif', 'png', 'jpg', 'jpeg'];
      for (var i=0; i < allowedExtensions.length; i++) {
        // be forgiving to user errors!
        if (allowedExtensions[i][0] === '.') {
          allowedExtensions[i] = allowedExtensions[i].substring(1);
        }
      }
    },

    defaultPresets: {
      small: {
        width: 120,
        quality: 50,
      },
      medium: {
        width: 300,
        quality: 70,
      },
      large: {
        width: 900,
        quality: 90,
      }
    }
  };

  opts = opts || {};
  thumber.parseOptions(opts);

  return thumber;
};
