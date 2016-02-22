if (!module.parent) { console.log("this is a module and should not be run directly."); process.exit(1); }

var util = require('util');

module.exports = function() {
  var server_stats = {
    'ok': 0,
    'thumb_error': 0,
    'upstream_error': 0,
    'arg_error': 0,
    'total_time_ms': 0,
    'avg_time_ms': 0,
  }
  exports = {
    increment: function(stat) {
      server_stats[stat]++;
    },
    addElapsedTime: function(duration) {
      server_stats['total_time_ms'] += duration;
    },
    get_stats: function(req, res) {
      var total_requests = server_stats.ok + server_stats.thumb_error + server_stats.upstream_error + server_stats.arg_error;
      res.write(util.format("version %s\n", process.env.npm_package_version));
      res.write(util.format("received %s\n", total_requests));
      res.write(util.format("ok %s\n", server_stats.ok));
      res.write(util.format("thumb_error %s\n", server_stats.thumb_error));
      res.write(util.format("upstream_error %s\n", server_stats.upstream_error));
      res.write(util.format("arg_error %s\n", server_stats.arg_error));
      res.write(util.format("total_time_ms %s\n", server_stats.total_time_ms));
      res.write(util.format("avg_time_ms %s\n", (server_stats.total_time_ms / total_requests) || 0));
      res.end();
    },
  };
  return exports;
};
