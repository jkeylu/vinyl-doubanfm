var Singer = require('vinyl-singer')
  , DoubanFM = require('./');

var doubanFM = new DoubanFM();
var doubanFMReadStream = doubanFM.createReadStream();
var simpleFileTransform = new DoubanFM.SimpleFileTransform();
var singer = new Singer();
doubanFMReadStream.on('error', function(err) { console.log(err); });
simpleFileTransform.on('error', function(err) { console.log(err); });
singer.on('singSong', function(file) { console.log(file); });
singer.on('error', function(err) { console.log(err); });
doubanFMReadStream.pipe(simpleFileTransform).pipe(singer);
