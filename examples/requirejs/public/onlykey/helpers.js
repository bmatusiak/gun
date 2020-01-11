
module.exports = {};

module.exports.get_url_json = async function get_url_json(file_url, metadataName) {
    let response = await fetch(file_url);
    let data = await response.blob();
    let metadata = {
      type: 'application/json'
    };
    let file = new File([data], metadataName, metadata);
    return file;
}

module.exports.TEST = function TEST(bool, test){
    if (bool) {
        if (test ) console.log("PASS: " + test);
    }
    else {
        console.log("FAIL: " + test);
        throw new Error("FAIL: " + test);
    }
}


function chr(c) {
    return String.fromCharCode(c);
} // Because map passes 3 args
module.exports.bytes2string = function bytes2string(bytes) {
    var ret = Array.from(bytes).map(chr).join('');
    return ret;
}
    
module.exports.hex2array = function hex2array(string)
{
    if (string.slice(0,2) == '0x')
    {
        string = string.slice(2,string.length);
    }
    if (string.length & 1)
    {
        throw new Error('Odd length hex string');
    }
    let arr = new Uint8Array(string.length/2);
    var i;
    for (i = 0; i < string.length; i+=2)
    {
        arr[i/2] = parseInt(string.slice(i,i+2),16);
    }
    return arr;
}

module.exports.array2hex = function array2hex(buffer) {
  return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}

module.exports.websafe64 = function websafe64(base64) {
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

module.exports.array2websafe = function array2websafe(array) {
    var result = "";
    for(var i = 0; i < array.length; ++i){
        result+= (String.fromCharCode(array[i]));
    }
    return module.exports.websafe64(window.btoa(result));
}

module.exports.normal64 = function normal64(base64) {
    return base64.replace(/\-/g, '+').replace(/_/g, '/') + '=='.substring(0, (3*base64.length)%4);
}

module.exports.websafe2array = function websafe2array(base64) {
    var binary_string = window.atob(module.exports.normal64(base64));
    var len = binary_string.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++)        {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes;
}

module.exports.error2string = function error2string(err)
{
    return lookup_table[err]
}

module.exports.websafe2string = function websafe2string(string) {
    return window.atob(module.exports.normal64(string));
}

module.exports.wrap_promise = function wrap_promise(func) {
    var self = this;
    return function() {
        var args = arguments;
        return new Promise(function(resolve, reject) {
           var i;
           var oldfunc = null;
           for (i = 0; i < args.length; i++) {
               if (typeof args[i] == 'function') {
                   oldfunc = args[i];
                   args[i] = function() {
                       oldfunc.apply(self, arguments);
                       resolve.apply(self, arguments);
                   };
                   break;
               }
           }
           if (oldfunc === null) {
               args = Array.prototype.slice.call(args);
               args.push(function() {
                   resolve.apply(self, arguments);
               })
               func.apply(self, args);
           }
        });
    }
}

