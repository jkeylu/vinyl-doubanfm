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
    highWaterMark: 0
  };

  Stream.Readable.call(this, options);
}

ReadStream.prototype._read = function(n) {
  var self = this;
  this.doubanFM.next(function(err, song) {
    var file = new File({
      path: song.url
    });
    defaults(file, song);
    self.push(file);
  });
};

util.inherits(SimpleFileTransform, Stream.Transform);
function SimpleFileTransform() {
  var options = {
    objectMode: true,
    highWaterMark: 0
  }

  Stream.Transform.call(this, options);
}

SimpleFileTransform.prototype._transform = function(file, encoding, callback) {
  var pipe = file.pipe;
  file.pipe = function(stream, opt) {
    http.get(file.path, function(res) {
      file.contents = res;
      pipe.call(file, stream, opt);
    });
    return stream;
  };
  callback(null, file);
};

var DOUBAMFM_API_DOMAIN = 'http://www.douban.com';
var DEFAULT_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/43.0.2357.65 Safari/537.36';
function generateRequestOptions(api, obj) {
  obj = extend({ app_name: 'radio_desktop_win', version: 100 }, obj);
  var query = qs.stringify(obj)
    , url = util.format('%s/j/app/radio/%s?%s', DOUBAMFM_API_DOMAIN, api, query)
    , options = urlParse(url);
  options.headers = {
    'User-Agent': DEFAULT_USER_AGENT
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
  this.songs = [];
  this.currentSid = null;
}

DoubanFM.prototype.next = function(callback) {
  var self = this;
  if (this.songs.length > 0) {
    var song = this.songs.pop();
    callback(null, song);
    if (this.songs.length == 0) {
      this.playing(this.currentSid, function(err, songs) {
        self.songs = songs;
      });
    }
    return;
  }

  this.new(function(err, songs) {
    if (err) {
      self.next(callback);
      return;
    }
    self.songs = songs;
    self.next(callback);
  });
};

DoubanFM.prototype.login = function(email, password, callback) {
  var options = urlParse(DOUBAMFM_API_DOMAIN + '/j/app/login');
  options.headers = {
    'User-Agent': DEFAULT_USER_AGENT
  };
  var data = {
    app_name: 'radio_desktop_win',
    version: 100,
    email: email,
    password: password
  };
  postData(options, data, callback);
};

DoubanFM.prototype.getChannels = function(callback) {
  var options = generateRequestOptions('channels');
  getJson(options, function(err, res, jsonData) {
    if (err) {
      return callback(err);
    }
    callback(null, jsonData.channels);
  });
};

function requestSongs(doubanFM, obj, callback) {
  obj.channel = doubanFM.channelId;
  if (doubanFM.user) {
    obj.user_id = doubanFM.user.user_id;
    obj.expire = doubanFM.user.expire;
    obj.token = doubanFM.user.token;
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
}


DoubanFM.prototype.bye = function(sid, callback) {
  var obj = {
    type: 'b',
    sid: sid
  };
  requestSongs(this, obj, callback);
};

DoubanFM.prototype.end = function(sid, callback) {
  var obj = {
    type: 'e',
    sid: sid
  };
};

DoubanFM.prototype.new = function(callback) {
  var obj = {
    type: 'n'
  };
  requestSongs(this, obj, callback);
};

DoubanFM.prototype.playing = function(sid, callback) {
  var obj = {
    type: 'p',
    sid: sid
  };
  requestSongs(this, obj, callback);
};


DoubanFM.prototype.skip = function(sid, callback) {
  var obj = {
    type: 's',
    sid: sid
  };
  requestSongs(this, obj, callback);
};

DoubanFM.prototype.rate = function(sid, callback) {
  var obj = {
    type: 'r',
    sid: sid
  };
  requestSongs(this, obj, callback);
};

DoubanFM.prototype.unrate = function(sid, callback) {
  var obj = {
    type: 'u',
    sid: sid
  };
  requestSongs(this, obj, callback);
};

DoubanFM.prototype.createReadStream = function() {
  return new ReadStream(this);
};

DoubanFM.ReadStream = ReadStream;
DoubanFM.SimpleFileTransform = SimpleFileTransform;

module.exports = DoubanFM;
