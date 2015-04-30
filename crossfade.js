#!/usr/bin/env node

var fs = require('fs');
var _ = require('lodash');
var async = require('async');
var exec = require('child_process').exec;

var imageDir = process.argv[2];

var images = fs.readdirSync(imageDir);
var count = images.length;
var DUR = 4;

var DEBUG = false;

var ffmpeg = function(cmd, callback) {
    if (DEBUG) {
        console.log(cmd);
        callback();
    }
    else {
        exec(cmd, callback);
    }
}

// make tmp directory
var tmpDir = '/tmp/'+Math.random();
fs.mkdir(tmpDir);

function imageToVideo(options, callback) {
    var cmd = 'ffmpeg -loop 1 -r 25 -i '+options.image+' -c:v libx264 -t '+DUR+' '+tmpDir+'/'+options.index+'.mp4';
    console.log('Converting '+options.image+' to a video');
    ffmpeg(cmd, callback);
}

function crossfade(index, callback) {
    var file1 = tmpDir+'/'+index+'.mp4';
    var file2 = tmpDir+'/'+((index+1)%count)+'.mp4';
    var output = tmpDir+'/cross'+index+'.mp4';
    var cmd = 'ffmpeg -i '+file1+' -i '+file2+' -f lavfi -i color=black ' +
            '-filter_complex "[0:v]format=pix_fmts=yuva420p,fade=t=out:st='+(DUR-1)+':d=1:alpha=1,setpts=PTS-STARTPTS[va0];'+
            '[1:v]format=pix_fmts=yuva420p,fade=t=in:st=0:d=1:alpha=1,setpts=PTS-STARTPTS+'+(DUR-1)+'/TB[va1];[2:v]scale=3840x2160,'+
            'trim=duration='+(DUR*2-1)+'[over];[over][va0]overlay[over1];[over1][va1]overlay=format=yuv420[outv]" '+
            '-c:v libx264 -aspect 16:9 -map [outv] '+output;
    console.log('Crossfading between image '+index+' and '+((index+1)%count));
    ffmpeg(cmd, callback);
}

function trim(index, callback) {
    var file = tmpDir+'/cross'+index+'.mp4';
    var output = tmpDir+'/trim'+index+'.mp4';
    var cmd = 'ffmpeg -i '+file+' -vf trim=2:'+(DUR*2-3)+' '+output;
    console.log('Trimming crossfade '+index);
    ffmpeg(cmd, callback);
}

function join(callback) {
    var file = tmpDir+'/list.txt';
    var cmd = 'ffmpeg -f concat -i '+file+' -c copy '+process.argv[3];
    var lines = [];
    for (var i=0; i < count; i++) {
        lines.push('file '+tmpDir+'/trim'+i+'.mp4');
    }
    fs.writeFileSync(file, lines.join('\n') + '\n');
    console.log('Joining segments');
    ffmpeg(cmd, callback);
}

async.series([
    // convert images to videos
    function(cb) {
        var items = _.map(images, function(image, index) {
         return { image: imageDir+'/'+image, index: index};
        });
        async.eachSeries(items, imageToVideo, cb);
    },
    // crossfade videos
    function(cb) {
        async.eachSeries(_.range(0, count), crossfade, cb);
    },
    // trim videos
    function(cb) {
        async.eachSeries(_.range(0, count), trim, cb);
    },
    // concat videos
    function(cb) {
        join(cb);
    }
], function(err) {
    exec('rm -rf '+tmpDir, function() {
        if (err) {
            return console.log('Error:', err);
        }
        console.log('Done.');
    });
});
