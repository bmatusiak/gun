/*

 pub/priv is for signing/verifying and epub/epriv is for encryption/decrypting
 
 alice = using SEA
 bob = using onlykey
 
*/

var bob_use_SEA = true;//test without onlykey


/* global $ SEA */
var ctaphid = require("./ctaphid");
var constants = require("./constants");


var actions = {};

function buildActions() {
    for (var i in actions) {
        var action = i;
        $("#action").append("<option>" + action + "</option>");
    }
}

$(document).ready(function() {

    $("#doRun").click(function() {
        var selected = $("#action").children("option:selected").val();

        if (typeof actions[selected] == "function")
            actions[selected]();
        else
            console.log("no method set for ", selected);
    });
});


actions.version = async function() {
    await ctaphid.ctaphid_via_webauthn(
            // option a) timeout --> leads to ugly persistent popup in chrome (firefox is better)
            constants.CMD.version, null, null, 1000
            // option b) no timeout --> user needs to click cancel
            // CMD.solo_version,
        ).then(response => {
            console.log("check_version RESPONSE", response);
            if (typeof response !== "undefined") {
                let version_parts = response.slice(0, 3);
                let version = response[0] + '.' + response[1] + '.' + response[2];
                console.log("version", version, version_parts);
            }
            else {
                let version_parts = new Uint8Array([0, 0, 0]);
                let version = "unknown";
                console.log("version", version, version_parts);
            }
        })
        .catch(error => {
            console.log(error);
        });
};

actions.rng = async function() {

    await ctaphid.ctaphid_via_webauthn(
            constants.CMD.rng, null, null, 0
        ).then(response => {
            console.log("rng RESPONSE", response);

        })
        .catch(error => {
            console.log(error);
        });
};


actions.testSEA = async function() {
    
    //create pair
    var pair = await SEA.pair();
    
    //encrypt some data with that pair
    var enc = await SEA.encrypt('hello self', pair);
    
    //sign encrypted data
    var data = await SEA.sign(enc, pair);
    
    console.log(data);
    
    //verify encrypted data
    var msg = await SEA.verify(data, pair.pub);
    
    //verify encrypted data
    var dec = await SEA.decrypt(msg, pair);
    
    
    var proof = await SEA.work(dec, pair);
    var check = await SEA.work('hello self', pair);
    console.log(dec);
    console.log(proof === check);
    
    
    // now let's share private data with someone:
    var charlie = await SEA.pair();
    var david = await SEA.pair();
    enc = await SEA.encrypt('shared data', await SEA.secret(david.epub, charlie));
    dec = await SEA.decrypt(enc, await SEA.secret(charlie.epub, david));
    
    console.log(dec, enc);
    // `.secret` is Elliptic-curve Diffie–Hellman
};

actions.testONLYKEY = async function() {
    
    
};


buildActions();
