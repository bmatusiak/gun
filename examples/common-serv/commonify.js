var path = require("path");
const fs = require('fs')

function wrapCommon(contents){
    var output = "";
    output += "define(function(require, exports, module) {\n"; 
    output += contents;
    output += "\n});";
    return output;
}

function lookupReadPath(path,callback){
    fs.exists(path, function(exists) {
        if (!exists)
            callback(true);
        else {
            fs.readFile(path, 'utf8', function(err, contents) {
                if(!err)
                    callback(null,contents);
                else 
                    callback(true);
            });
        }
    });
}

module.exports = function(commonDir) {
    return function(req, res, next) {
        var path = commonDir + req.url;
        function done(data){
            if(data){
                res.send(wrapCommon(data));
            }else next();
        }
        lookupReadPath(path, function(err, content){//lookup base path
            if(err){
                lookupReadPath(path+".js", function(err, content){//look here just for fun
                    if(err){
                        done();
                    }else{
                        done(content);
                    }
                });
            }else{
                done(content);
            }
        });

    };

};