var express = require('express');
var util = require('util');
var app = express();

var scThumber = require('./lib/scthumber');
var thumber = scThumber({
  tmpCacheTTL: 0, // disable caching
  presets: {
    // Beatmap page cover
    // 1800*500 (@2x)
    'cover': {
      width: 900,
      height: 250,
    },
    'cover@2x': {
      width: 900,
      height: 250,
      pixelScale: 2
    },
    // Beatmap card thumbnail
    // 800*200 (@2x)
    'card': {
      width: 400,
      height: 100
    },
    'card@2x': {
      width: 400,
      height: 100,
      pixelScale: 2
    },
    // Beatmap list thumbnail
    // 160*100 (@2x)
    'list': {
      width: 80,
      height: 50
    },
    'list@2x': {
      width: 80,
      height: 50,
      pixelScale: 2
    },
  }
});

app.get('/', function(req, res) {
  res.send(util.format("scthumbd %s\n", process.env.npm_package_version));
})
app.get('/thumb/*', thumber.thumbnail);
app.get('/optim/*', thumber.optimize);
app.get('/stats', thumber.get_stats);

var server = app.listen(4001, function () {
  var port = server.address().port;
  console.log('scthumbd %s\nListening on port %s', process.env.npm_package_version, port);
});
