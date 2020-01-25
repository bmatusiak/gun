require.config({
    baseUrl: './',
    paths: {
        
    }
});

define("gunjs/gun",function(require, exports, module) {
    //redirect bundle version to src version
    module.exports = require("./src/index.js");
});

define("crypto",function(require, exports, module) {
    //redirect bundle version to src version
    module.exports = require("gunjs/sea/shim").subtle;
});
