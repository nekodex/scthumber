if (!module.parent) { console.log("this is a module and should not be run directly."); process.exit(1); }

var ttl,
    tmpCacheTTL,
    tmpDir,
    presets,
    regexp       = '';

var mkdirp       = require('mkdirp'),
    moment       = require('moment'),
    http         = require('http'),
    path         = require('path'),
    fs           = require('fs'),
    send         = require('send'),
    crypto       = require('crypto'),
    lockFile     = require('lockfile'),
    mozjpeg      = require('mozjpeg-stream'),
    sharp        = require('sharp'),
    server_stats = require('./scthumber-stats');

exports = module.exports = function (opts) {
  opts = opts || {};
  parseOptions(opts);

  var thumber = {
    stats: server_stats(),
    thumbs: function(req, res) {
      if ('GET' !== req.method && 'HEAD' !== req.method) { return; }

      // Is this a request to a thumbnail image?
      var thumbRequestParts = req.originalUrl.match(regexp);
      if (!thumbRequestParts) {
        thumber.stats.increment('arg_error');
        res.writeHead(400);
        res.end('invalid arguments');
        return;
      }

      var imagePreset = thumbRequestParts[1];

      if (!presets[imagePreset]) { // invalid preset requested
        thumber.stats.increment('arg_error');
        res.writeHead(400);
        res.end('invalid arguments');
        return;
      }

      var upstreamURL = "http://" + thumbRequestParts[2];

      // Pre-declare variables that will be initialized in the decoder closure
      var filepath, fileStream, modifiedFilePath, preset;

      //-- Start creating and serving a thumbnail
      var targetDir = tmpDir + '/' + imagePreset;

      mkdirp(targetDir, function (err) {
        if (err) {
          thumber.stats.increment('thumb_error');
          res.writeHead(500);
          res.end('tmpDir not writable!');
          console.log(err);
          return;
        }
        processFile();
      });

      function processFile() {
        var ext = path.extname(upstreamURL);
        var urlHash = hash(upstreamURL);

        preset = presets[imagePreset];
        filepath = targetDir + '/' + urlHash + ext;
        modifiedFilePath = targetDir + '/' + urlHash + "-" + imagePreset + ext;

        // see if we can serve the file from file cache, if ttl has not yet expired
        if (tmpCacheTTL > 0) {
          try {
            var stats = fs.statSync(filepath);
            var fileUnix = moment(stats.mtime).unix();
            var nowUnix = moment().unix();
            var diffUnix = nowUnix - fileUnix;
            if (diffUnix < tmpCacheTTL) { // file is fresh, no need to download/resize etc.
              var maxAge = ttl || 0;
              send(req, modifiedFilePath, {maxAge: maxAge}).pipe(res);
              return;
            }
          } catch (err) {
            // do nothing, thumbnail will be regenerated
          }
        }

        var request_start = Date.now();
        fileStream = fs.createWriteStream(filepath);
        http.get(upstreamURL, function (response) {
          if (response.statusCode != 200) {
            thumber.stats.increment('upstream_error');
            res.writeHead(500);
            res.end('error retrieving image');
            console.log("GET:", req.originalUrl, "[ERROR "+response.statusCode+"]");
            return;
          }
          response.pipe(fileStream);
          response.on('end', function () {
            var modificationOptions = {
              filepath: filepath,
              dstPath: modifiedFilePath,
              preset: preset,
              smartCrop: opts.smartCrop || false
            };

            var postModificationFunction = function (err) {
              if (err) {
                thumber.stats.increment('thumb_error');
                res.writeHead(500);
                res.end('error processing image');
                console.log(err);
              }

              var elapsed = Date.now() - request_start;
              console.log("GET:", req.originalUrl, "[", elapsed, "ms ]");
              thumber.stats.increment('ok');
              thumber.stats.addElapsedTime(elapsed);
              var maxTTLAge = ttl || 0;
              send(req, modifiedFilePath, {maxAge: maxTTLAge})
                .on("error", function(err) {
                  thumber.stats.increment('thumb_error');
                  console.log("error sending image (?)");
                  console.error(err);
                })
                .on("end", function () {
                  if (tmpCacheTTL == 0) {
                    try {
                      fs.unlink(filepath);
                      fs.unlink(modifiedFilePath);
                    } catch (err) {
                      // disregard and continue
                    }
                  }
                }).pipe(res);
            };

            modifyImage(modificationOptions, postModificationFunction);
          });
        })
      }
    },
    get_stats: function(req, res) {
      thumber.stats.get_stats(req, res);
    }
  }
  return thumber;
};

/**
 * Return cryptographic hash (defaulting to: "sha1") of a string.
 *
 * @param {String} str
 * @param {String} algo - Algorithm used for hashing, defaults to sha1
 * @param {String} encoding - defaults to hex
 * @return {String}
 */
function hash(str, algo, encoding) {
  return crypto
    .createHash(algo || 'sha1')
    .update(str)
    .digest(encoding || 'hex');
}

/**
 * Merge user-provided options with the sensible defaults.
 * @param options
 */
function parseOptions(options) {

  ttl = options.ttl == undefined ? (3600 * 24) : options.ttl; // cache for 1 day by default.
  tmpCacheTTL = options.tmpCacheTTL == undefined ? 5 : options.tmpCacheTTL; // small by default
  presets  = options.presets || defaultPresets();
  tmpDir   = options.tmpDir || '/tmp/nodethumbnails';

  var rootPath = options.rootPath || '/thumbs';
  if (rootPath[0] === '/') { rootPath = rootPath.substring(1); } // be forgiving to user errors!

  var allowedExtensions = options.allowedExtensions || ['gif', 'png', 'jpg', 'jpeg'];
  for (var i=0; i < allowedExtensions.length; i++) {
    // be forgiving to user errors!
    if (allowedExtensions[i][0] === '.') {
      allowedExtensions[i] = allowedExtensions[i].substring(1);
    }
  }
  var szExtensions = allowedExtensions.join('|');

  // Example: http://example.com/thumbs/<present>/backend.server/image.jpg
  regexp = new RegExp('^\/' + rootPath.replace(/\//ig, '\\/') +
    '\/([A-Za-z0-9_@]+)\/([%\.\-A-Za-z0-9_@=\+]+\.(?:' + szExtensions + ')$)', 'i');
}

function defaultPresets() {
  return {
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
  };
}

function modifyImage(options, callback) {
  var srcPath = options.filepath;
  var dstPath = options.dstPath;
  var preset = options.preset;

  var lockFileOptions = {};

  sharp(srcPath).metadata(function (err, metadata) {
    if (err) { callback(err); return; }

    var origWidth  = metadata.width;
    var origHeight = metadata.height;

    if (!preset.quality) {
      preset.quality = 95;
    }

    var Canvas    = require('canvas'),
        SmartCrop = require('smartcrop');

    var img = new Canvas.Image();
    var canvasOptions = {}; canvasOptions.canvasFactory = function(w, h) { return new Canvas(w, h); };

    try {
      img.src = fs.readFileSync(srcPath);

      canvasOptions.width = preset.width;
      canvasOptions.height = preset.height || null;
      canvasOptions.dstPath = dstPath;

      SmartCrop.crop(img, canvasOptions, function(result) {
        var rect = result.topCrop;

        lockFile.lock(srcPath + ".lock", lockFileOptions, function(err) {
          if (err) { return callback(err); }
          // var rect = {x: 0, y: 0, width: preset.width, height: preset.height};
          sharp(srcPath)
              .extract({left: rect.x, top: rect.y, width: rect.width, height: rect.height})
              .resize(preset.width, preset.height)
              .sharpen()
              .quality(100)
              .jpeg()
              .toFile(dstPath + "-preoptim.jpg", function(err) {
                  if (err) { return callback(err); }
                  outStream = fs.createWriteStream(dstPath);
                  outStream.on('finish', callback);
                  fs.createReadStream(dstPath + "-preoptim.jpg")
                    .pipe(mozjpeg({quality: 90}))
                    .pipe(outStream);
              });

          lockFile.unlock(srcPath + ".lock", function (err) {
            if (err) { console.log(err); }
          });
        });
      });

    } catch (err) {
      callback(err);
    }

  });
}

/**
 * Detect targetHeight for a proportional resizing, when only width is indicated.
 *
 * @param targetWidth
 * @param origWidth
 * @param origHeight
 */
function detectedHeight(targetWidth, origWidth, origHeight) {
  return origHeight * targetWidth / origWidth;
}
