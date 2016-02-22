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
      quality: 95,
    },
    'cover@2x': {
      width: 1800,
      height: 500,
      quality: 95,
    },
    // Beatmap card thumbnail
    // 800*200 (@2x)
    'card': {
      width: 400,
      height: 100,
      quality: 95,
    },
    'card@2x': {
      width: 800,
      height: 200,
      quality: 95,
    },
    // Beatmap list thumbnail
    // 160*100 (@2x)
    'list': {
      width: 80,
      height: 50,
      quality: 95,
    },
    'list@2x': {
      width: 160,
      height: 100,
      quality: 95,
    },
  }
});

app.get('/', function(req, res) {
  res.send(util.format("scthumbd %s\n", process.env.npm_package_version));
})
app.get('/thumbs/*', thumber.thumbs);
app.get('/stats', thumber.get_stats);

var server = app.listen(3000, function () {
  var port = server.address().port;
  console.log('scthumbd %s\nListening on port %s', process.env.npm_package_version, port);
});
