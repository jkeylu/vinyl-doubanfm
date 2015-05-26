var Stream = require('stream')
  , util = require('util')
  , http = require('http')
  , urlParse = require('url').parse
  , qs = require('querystring')
  , File = require('vinyl')
  , debug = require('debug')('vinyl-doubanfm');

function defaults(a, b) {
  if (a && b) {
    var keys = Object.keys(b)
      , len = keys.length
      , key;
    for (var i = 0; i < len; ++i) {
      key = keys[i];
      if (!(key in a)) {
        a[key] = b[key];
      }
    }
  }
}

function extend(a, b) {
  if (a && b) {
    var keys = Object.keys(b)
      , len = keys.length
      , key;
    for (var i = 0; i < len; ++i) {
      key = keys[i];
      a[key] = b[key];
    }
  }
  return a;
}

util.inherits(ReadStream, Stream.Readable);
function ReadStream(doubanFM) {
  if (!(this instanceof ReadStream)) {
    return new ReadStream(doubanFM);
  }

  this.doubanFM = doubanFM;

  var options = {
    objectMode: true,
    highWaterMark: 1
  };

  Stream.Readable.call(this, options);
}

ReadStream.prototype._read = function(n) {
  var self = this;
  var rs = this._readableState;
  console.log('highWaterMark: ', rs.highWaterMark);
  if (rs.length >= rs.highWaterMark) {
    return;
  }
  this.doubanFM.new(function(err, songs) {
    if (err) {
      self.emit('error', err);
      return;
    }
    console.log(songs.length);
    var song, file;
    for (var i = 0; i < songs.length; i++) {
      song = songs[i];
      file = new File({
        path: song.url
      });
      defaults(file, song);
      self.push(file);
    }
    console.log('readable state buffer len: ', self._readableState.buffer.length);
    console.log('readable State length: ', self._readableState.length);
  });
};

util.inherits(SimpleFileTransform, Stream.Transform);
function SimpleFileTransform() {
  var options = {
    objectMode: true,
    highWaterMark: 1
  }

  Stream.Transform.call(this, options);
}

SimpleFileTransform.prototype._transform = function(file, encoding, callback) {
  var self = this;
  console.log('file transform');
  http.get(file.path, function(res) {
    file.contents = res;
    console.log('transform before callback');
    try {
    callback(null, file);
    } catch(e) {
      console.log(e);
    }
    var rs = self._readableState
      , ws = self._writableState;
    //console.log()
  });
};

var DOUBAMFM_API_DOMAIN = 'http://www.douban.com';
function generateRequestOptions(api, obj) {
  obj = extend({ app_name: 'radio_desktop_win', version: 100 }, obj);
  var query = qs.stringify(obj)
    , url = util.format('%s/j/app/radio/%s?%s', DOUBAMFM_API_DOMAIN, api, query)
    , options = urlParse(url);
  options.headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/43.0.2357.65 Safari/537.36'
  };
  return options;
}
function getJson(options, callback) {
  http.get(options, function(res) {
    var body = '';
    res.on('data', function(chunk) {
      body += chunk;
    }).on('end', function() {
      var err = null;
      var json;
      res.body = body;
      try {
        json = JSON.parse(body);
      } catch(e) {
        err = e;
      }
      callback(err, res, json);
    }).on('error', callback);
  }).on('error', callback);
}
function postData(options, data, callback) {
  options = options || {};
  options.method = 'POST';
  var postData;
  if (data && typeof data === 'object') {
    postData = qs.stringify(data);
    options.headers = options.headers || {};
    options.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    options.headers['Content-Length'] = postData.length;
  }
  var req = http.request(options, function(res) {
    var body = '';
    res.on('data', function(chunk) {
      body += chunk;
    }).on('end', function() {
      var err = null;
      var json;
      res.body = body;
      try {
        json = JSON.parse(body);
      } catch(e) {
        err = e;
      }
      callback(err, res, json);
    }).on('error', callback);
  });
  req.on('error', callback);
  req.write(postData);
  req.end();
}

function DoubanFM() {
  this.user = null;
  this.channelId = 0;
}

DoubanFM.prototype.login = function(callback) {
};

DoubanFM.prototype.getChannels = function(callback) {
};

DoubanFM.prototype.bye = function(callback) {
};

DoubanFM.prototype.end = function(callback) {
};

DoubanFM.prototype.new = function(callback) {
  var obj = {
    type: 'n'
  };
  obj.channel = this.channelId;
  if (this.user) {
    obj.user_id = this.user.user_id;
    obj.expire = this.user.expire;
    obj.token = this.user.token;
  }
  var options = generateRequestOptions('people', obj);
  getJson(options, function(err, res, jsonData) {
    if (err) {
      return callback(err);
    }
    if (!jsonData) {
      return callback(new Error(res.statusCode));
    }
    if (jsonData.r != 0) {
      return callback(new Error(jsonData.err));
    }
    callback(null, jsonData.song);
  });
};

DoubanFM.prototype.playing = function(callback) {
  var obj = {
    type: 'p'
  };
  obj.channel = this.channelId;
  var options = generateRequestOptions('people', obj);
  getJson(options, function(err, res, jsonData) {
    if (err) {
      return callback(err);
    }
    if (!jsonData) {
      return callback(new Error(res.statusCode));
    }
    if (jsonData.r != 0) {
      return callback(new Error(jsonData.err));
    }
    callback(null, jsonData.song);
  });
};

DoubanFM.prototype.skip = function(callback) {
};

DoubanFM.prototype.rate = function(callback) {
};

DoubanFM.prototype.unrate = function(callback) {
};

DoubanFM.prototype.createReadStream = function() {
  return new ReadStream(this);
};

DoubanFM.ReadStream = ReadStream;
DoubanFM.SimpleFileTransform = SimpleFileTransform;

module.exports = DoubanFM;
