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
    /*{   
        pub: "P9Wx0baqpgHmdyKezF-tn5syUnFVKu12e3FA-cxidLU.KNcaxL7cKTrZfLjyuCM5BU7wc9lzzTh5b0f3JajO_20", 
        priv: "j2IYom_Geq-muPdcnr6x_KbQDDqAkfCawApwwKroUDY", 
        epub: "fnVHAK7PB4JqjAX7iMs50sqJcZQSzTBSQtbEJAsrTZg.Qac_MWXZkGoWm0hp52vbSKqMDI86tC191Ih1tLUv_So", 
        epriv: "FC6ZfFoAsntS3U48wiRG4Ro3t0sg3m6K9xoch-ldpOM"
    }*/
    
    //encrypt some data with that pair
    var enc = await SEA.encrypt('hello self', pair);
    /*
    SEA{"ct":"lKcB9zPA6U1zPKIJHOgKHMDEgY5ymCrCI60=","iv":"QkDkV5+NLcM+fQdbsa0p","s":"AVzj0oLIEcrQ"}
    */
    
    //sign encrypted data
    var data = await SEA.sign(enc, pair);
    /*
    SEA{"m":{"ct":"lKcB9zPA6U1zPKIJHOgKHMDEgY5ymCrCI60=","iv":"QkDkV5+NLcM+fQdbsa0p","s":"AVzj0oLIEcrQ"},"s":"pL5Xc+NJ+ZuSLJ46yBOKzuNy/9567hukedL8yq7ZgY44fvdyjXUDPF2QCWQBKSF3rBMNZVxg//2kC9AnOF/PmA=="}
    */
    
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
