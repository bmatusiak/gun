require.config({
    baseUrl: '/',
    paths: {
        
    }
});

define("/gunjs/gun",function(require, exports, module) {
    module.exports = require("/gunjs/src/index.js");
})