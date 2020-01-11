var path = require("path");
var GUNDIR = path.resolve(__dirname + "/../../");


var selfsigned = process.env.SSL ? require('selfsigned') : false; //require('selfsigned');
var port = process.env.PORT || 8765;
var https = require('https');
var http = require('http');
var express = require('express');
var Gun = require(GUNDIR+'/gun');
require(GUNDIR+'/axe');

var app = express();
app.use(express.static(__dirname + "/public"));
app.use("/gun/examples",express.static(GUNDIR + "/examples"));

var commonify = require("./commonify.js");
app.use('/gunjs/', commonify(GUNDIR));

//app.use(Gun.serve);//<-- server normmaly

var server;

if (selfsigned) {
    var attrs = null; //[{ name: 'commonName', value: '127.0.0.1' }];
    var pems = selfsigned.generate(attrs, { days: 365 });
    // we will pass our 'app' to 'https' server

    server = https.createServer({
            key: pems.private,
            cert: pems.cert
        }, app)
        .listen(port);
}
else {
    server = http.createServer(app)
        .listen(port);
}

var gun = Gun({ file: 'data', web: server });

console.log('Server started on port ' + port + ' with /gun');
