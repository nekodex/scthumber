var express = require('express'),
    cluster = require('cluster'),
    colors = require('colors'),
    util = require('util');

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

const numCPUs = require('os').cpus().length;
const port = 4001;

if (cluster.isMaster) {
  console.log(`${'[m]'.red} ${'scthumbd %s'.yellow}`, process.env.npm_package_version);
  console.log(`${'[m]'.red} Listening on port ${'%s'.green}...`, port);
  console.log(`${'[m]'.red} Starting ${'%s'.green} workers...`, numCPUs);

  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.log(`${'[m]'.red} worker ${worker.id} died, restarting`);
    cluster.fork();
  });
} else {
  var app = express();

  app.get('/', function(req, res) {
    res.send(util.format("scthumbd %s\n", process.env.npm_package_version));
  })
  app.get('/thumb/*', thumber.thumbnail);
  app.get('/optim/*', thumber.optimize);
  app.get('/stats', thumber.get_stats);

  var server = app.listen(port);

  console.log(`${'[w]'.magenta} Worker ${'%s'.green} started...`, cluster.worker.id);
}
