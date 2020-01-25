

var nacl = require("./nacl.min");
var axe_crypto_shim = require("../../gunjs/sea/shim")

var sha256 = async function(s) {
    var hash = await axe_crypto_shim.subtle.digest({ name: 'SHA-256' }, new axe_crypto_shim.TextEncoder().encode("test"));
    hash = buf2hex(hash);
    hash = Array.from(hash.match(/.{2}/g).map(hexStrToDec));
    return hash;
};

function buf2hex(buffer) { // buffer is an ArrayBuffer
    return Array.prototype.map.call(new Uint8Array(buffer), x => ('00' + x.toString(16)).slice(-2)).join('');
}


var appId = window.location.origin;
var encrypted_data;

function _setStatus(newStatus) {
    window._status = newStatus;
    console.info("Changed window._status to ", newStatus);
}

// The idea is to encode CTAPHID_VENDOR commands
// in the keyhandle, that is sent via WebAuthn or U2F
// as signature request to the authenticator.
//
// The authenticator reacts to signature requests with
// the four "magic" bytes set with a special signature,
// which can then be decoded

function encode_ctaphid_request_as_keyhandle(cmd, opt1, opt2, opt3, data) {
    console.log('REQUEST CMD', cmd);
    console.log('REQUEST OPT1', opt1);
    console.log('REQUEST OPT2', opt2);
    console.log('REQUEST OPT3', opt3);
    console.log('REQUEST DATA', data);
    var addr = 0;

    // should we check that `data` is either null or an Uint8Array?
    data = data || new Uint8Array();

    const offset = 10;

    if (offset + data.length > 255) {
        throw new Error("Max size exceeded");
    }

    // `is_extension_request` expects at least 16 bytes of data
    const data_pad = data.length < 16 ? 16 - data.length : 0;
    var array = new Uint8Array(offset + data.length + data_pad);

    array[0] = cmd & 0xff;

    array[1] = opt1 & 0xff;
    array[2] = opt2 & 0xff;
    array[3] = opt3 & 0xff;
    array[4] = 0x8C; // 140
    array[5] = 0x27; //  39
    array[6] = 0x90; // 144
    array[7] = 0xf6; // 246

    array[8] = 0;
    array[9] = data.length & 0xff;

    array.set(data, offset);

    console.log('FORMATTED REQUEST:', array);
    return array;
}

function decode_ctaphid_response_from_signature(response) {
    // https://fidoalliance.org/specs/fido-v2.0-rd-20170927/fido-client-to-authenticator-protocol-v2.0-rd-20170927.html#using-the-ctap2-authenticatorgetassertion-command-with-ctap1-u2f-authenticators<Paste>
    //
    // compared to `parse_device_response`, the data is encoded a little differently here
    //
    // attestation.response.authenticatorData
    //
    // first 32 bytes: SHA-256 hash of the rp.id
    // 1 byte: zeroth bit = user presence set in U2F response (always 1)
    // last 4 bytes: signature counter (32 bit big-endian)
    //
    // attestation.response.signature
    // signature data (bytes 5-end of U2F response

    console.log('UNFORMATTED RESPONSE:', response);

    var signature_count = (
        new DataView(
            response.authenticatorData.slice(33, 37)
        )
    ).getUint32(0, false); // get count as 32 bit BE integer

    var signature = new Uint8Array(response.signature);
    var data = null;
    var error_code = signature[0];

    if (error_code == 0) {
        data = signature.slice(1, signature.length);
        if (signature.length < 73 && bytes2string(data.slice(0, 9)) == 'UNLOCKEDv') {
            // Reset shared secret and start over
            _setStatus($SLOTID);
        }
        else if (signature.length < 73 && bytes2string(data.slice(0, 6)) == 'Error ') {
            // Something went wrong, read the ascii response and display to user
            var msgtext = data.slice(0, getstringlen(data));
            const btmsg = `${bytes2string(msgtext)}. Refresh this page and try again.`;
            //button.textContent = btmsg;
            //button.classList.remove('working');
            //button.classList.add('error');
            _setStatus('finished');
            throw new Error(bytes2string(msgtext));
        }
        else if (window._status === 'waiting_ping' || window._status === 'done_challenge') {
            // got data
            encrypted_data = data;
            _setStatus('finished');
        }
    }
    else if (error_code == ctap_error_codes['CTAP2_ERR_NO_OPERATION_PENDING']) {
        // No data received, data has already been retreived or wiped due to 5 second timeout

        //button.textContent = 'no data received';
        _setStatus('finished');
        throw new Error('no data received');

    }
    else if (error_code == ctap_error_codes['CTAP2_ERR_USER_ACTION_PENDING']) {
        // Waiting for user to press button or enter challenge
        console.log('CTAP2_ERR_USER_ACTION_PENDING');
    }
    else if (error_code == ctap_error_codes['CTAP2_ERR_OPERATION_PENDING']) {
        // Waiting for user to press button or enter challenge
        console.log('CTAP2_ERR_OPERATION_PENDING');
    }





    return {
        count: signature_count,
        status: ctap_error_codes[error_code],
        data: data,
        signature: signature,
    };
}

async function ctaphid_via_webauthn(cmd, opt1, opt2, opt3, data, timeout) {
    // if a token does not support CTAP2, WebAuthn re-encodes as CTAP1/U2F:
    // https://fidoalliance.org/specs/fido-v2.0-rd-20170927/fido-client-to-authenticator-protocol-v2.0-rd-20170927.html#interoperating-with-ctap1-u2f-authenticators
    //
    // the bootloader only supports CTAP1, so the idea is to drop
    // u2f-api.js and the Firefox about:config fiddling
    //
    // problem: the popup to press button flashes up briefly :(
    //

    var keyhandle = encode_ctaphid_request_as_keyhandle(cmd, opt1, opt2, opt3, data);
    var challenge = window.crypto.getRandomValues(new Uint8Array(32));
    var request_options = {
        challenge: challenge,
        allowCredentials: [{
            id: keyhandle,
            type: 'public-key',
        }],
        timeout: timeout,
        // rpId: 'apps.crp.to',
        userVerification: 'discouraged',
        //userPresence: 'false',
        //mediation: 'silent',
        // extensions: {
        //  appid: 'https://apps.crp.to',
        // },
    };


    return window.navigator.credentials.get({
        publicKey: request_options
    }).then(assertion => {
        console.log("GOT ASSERTION", assertion);
        console.log("RESPONSE", assertion.response);
        let response = decode_ctaphid_response_from_signature(assertion.response);
        console.log("RESPONSE:", response);
        if (response.status == 'CTAP2_ERR_USER_ACTION_PENDING') return response.status;
        if (response.status == 'CTAP2_ERR_OPERATION_PENDING') {
            _setStatus('done_challenge');
            return response.status;
        }
        return response.data;
    }).catch(error => {
        console.log("ERROR CALLING:", cmd, opt1, opt2, opt3, data);
        console.log("THE ERROR:", error);
        console.log("NAME:", error.name);
        console.log("MESSAGE:", error.message);
        if (error.name == 'NS_ERROR_ABORT' || error.name == 'AbortError' || error.name == 'InvalidStateError') {
            _setStatus('done_challenge');
            return 1;
        }
        else if (error.name == 'NotAllowedError' && os == 'Windows') { // Win 10 1903 issue
            return 1;
        }
        return Promise.resolve(); // error;
    });

}

const ctap_error_codes = {
    0x00: 'CTAP1_SUCCESS',
    0x01: 'CTAP1_ERR_INVALID_COMMAND',
    0x02: 'CTAP1_ERR_INVALID_PARAMETER',
    0x03: 'CTAP1_ERR_INVALID_LENGTH',
    0x04: 'CTAP1_ERR_INVALID_SEQ',
    0x05: 'CTAP1_ERR_TIMEOUT',
    0x06: 'CTAP1_ERR_CHANNEL_BUSY',
    0x0A: 'CTAP1_ERR_LOCK_REQUIRED',
    0x0B: 'CTAP1_ERR_INVALID_CHANNEL',

    0x10: 'CTAP2_ERR_CBOR_PARSING',
    0x11: 'CTAP2_ERR_CBOR_UNEXPECTED_TYPE',
    0x12: 'CTAP2_ERR_INVALID_CBOR',
    0x13: 'CTAP2_ERR_INVALID_CBOR_TYPE',
    0x14: 'CTAP2_ERR_MISSING_PARAMETER',
    0x15: 'CTAP2_ERR_LIMIT_EXCEEDED',
    0x16: 'CTAP2_ERR_UNSUPPORTED_EXTENSION',
    0x17: 'CTAP2_ERR_TOO_MANY_ELEMENTS',
    0x18: 'CTAP2_ERR_EXTENSION_NOT_SUPPORTED',
    0x19: 'CTAP2_ERR_CREDENTIAL_EXCLUDED',
    0x20: 'CTAP2_ERR_CREDENTIAL_NOT_VALID',
    0x21: 'CTAP2_ERR_PROCESSING',
    0x22: 'CTAP2_ERR_INVALID_CREDENTIAL',
    0x23: 'CTAP2_ERR_USER_ACTION_PENDING',
    0x24: 'CTAP2_ERR_OPERATION_PENDING',
    0x25: 'CTAP2_ERR_NO_OPERATIONS',
    0x26: 'CTAP2_ERR_UNSUPPORTED_ALGORITHM',
    0x27: 'CTAP2_ERR_OPERATION_DENIED',
    0x28: 'CTAP2_ERR_KEY_STORE_FULL',
    0x29: 'CTAP2_ERR_NOT_BUSY',
    0x2A: 'CTAP2_ERR_NO_OPERATION_PENDING',
    0x2B: 'CTAP2_ERR_UNSUPPORTED_OPTION',
    0x2C: 'CTAP2_ERR_INVALID_OPTION',
    0x2D: 'CTAP2_ERR_KEEPALIVE_CANCEL',
    0x2E: 'CTAP2_ERR_NO_CREDENTIALS',
    0x2F: 'CTAP2_ERR_USER_ACTION_TIMEOUT',
    0x30: 'CTAP2_ERR_NOT_ALLOWED',
    0x31: 'CTAP2_ERR_PIN_INVALID',
    0x32: 'CTAP2_ERR_PIN_BLOCKED',
    0x33: 'CTAP2_ERR_PIN_AUTH_INVALID',
    0x34: 'CTAP2_ERR_PIN_AUTH_BLOCKED',
    0x35: 'CTAP2_ERR_PIN_NOT_SET',
    0x36: 'CTAP2_ERR_PIN_REQUIRED',
    0x37: 'CTAP2_ERR_PIN_POLICY_VIOLATION',
    0x38: 'CTAP2_ERR_PIN_TOKEN_EXPIRED',
    0x39: 'CTAP2_ERR_REQUEST_TOO_LARGE',
}

function chr(c) {
    return String.fromCharCode(c);
} // Because map passes 3 args

function noop() {}

function bytes2string(bytes) {
    var ret = Array.from(bytes).map(chr).join('');
    return ret;
}

function getstringlen(bytes) {
    for (var i = 1; i <= bytes.length; i++) {
        console.info("getstringlen ", i);
        if ((bytes[i] > 122 || bytes[i] < 97) && bytes[i] != 32) return i;
    }
}

function bytes2b64(bytes) {
    return u2f_b64(bytes2string(bytes));
}

function u2f_b64(s) {
    return window.btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function mkchallenge(challenge) {
    var s = [];
    for (i = 0; i < 32; i++) s[i] = String.fromCharCode(challenge[i]);
    return u2f_b64(s.join());
}

//-------------------------------------------------------------
function get_pin(byte) {
    if (byte < 6) return 1;
    else {
        return (byte % 5) + 1;
    }
}

function hexStrToDec(hexStr) {
    return ~~(new Number('0x' + hexStr).toString(10));
}

var IntToByteArray = function(int) {
    var byteArray = [0, 0, 0, 0];
    for (var index = 0; index < 4; index++) {
        var byte = int & 0xff;
        byteArray[(3 - index)] = byte;
        int = (int - byte) / 256;
    }
    return byteArray;
};

let wait = ms => new Promise(resolve => setTimeout(resolve, ms));

function string2bytes(s) {
    var len = s.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = s.charCodeAt(i);
    return bytes;
}

//-------------------------------------------------------------

/**
 * Decrypt ciphertext via OnlyKey
 * @param {Array} ct
 */
var auth_decrypt = function(ct, cb) { //OnlyKey decrypt request to keyHandle
    if (typeof(sharedsec) === "undefined") {
        button.textContent = "Insert OnlyKey and reload page";
        return;
    }
    cb = cb || noop;
    if (ct.length == 396) {
        window.poll_delay = 5; //5 Second delay for RSA 3072
    }
    else if (ct.length == 524) {
        window.poll_delay = 7; //7 Second delay for RSA 4096
    }
    if (OKversion == 'Original') {
        window.poll_delay = window.poll_delay * 4;
    }
    var padded_ct = ct.slice(12, ct.length);
    var keyid = ct.slice(1, 8);
    var pin_hash = sha256(padded_ct);
    console.info("Padded CT Packet bytes", Array.from(padded_ct));
    console.info("Key ID bytes", Array.from(keyid));
    pin = [get_pin(pin_hash[0]), get_pin(pin_hash[15]), get_pin(pin_hash[31])];
    msg("Generated PIN" + pin);
    return u2fSignBuffer(typeof padded_ct === 'string' ? padded_ct.match(/.{2}/g) : padded_ct, cb);
};

/**
 * Sign message via OnlyKey
 * @param {Array} ct
 */
var auth_sign = function(ct, cb) { //OnlyKey sign request to keyHandle
    if (typeof(sharedsec) === "undefined") {
        button.textContent = "Insert OnlyKey and reload page";
        return;
    }
    var pin_hash = sha256(ct);
    cb = cb || noop;
    console.info("Signature Packet bytes ", Array.from(ct));
    pin = [get_pin(pin_hash[0]), get_pin(pin_hash[15]), get_pin(pin_hash[31])];
    console.info("Generated PIN", pin);
    return u2fSignBuffer(typeof ct === 'string' ? ct.match(/.{2}/g) : ct, cb);
};


/**
 * Perform AES_256_GCM decryption using NACL shared secret
 * @param {Array} encrypted
 * @return {Array}
 */
function aesgcm_decrypt(encrypted) {
    return new Promise(resolve => {
        forge.options.usePureJavaScript = true;
        var key = sha256(sharedsec); //AES256 key sha256 hash of shared secret
        console.log("Key", key);
        var iv = IntToByteArray(counter);
        while (iv.length < 12) iv.push(0);
        iv = Uint8Array.from(iv);
        console.log("IV", iv);
        var decipher = forge.cipher.createDecipher('AES-GCM', key);
        decipher.start({
            iv: iv,
            tagLength: 0, // optional, defaults to 128 bits
        });
        console.log("Encrypted", encrypted);
        var buffer = forge.util.createBuffer(Uint8Array.from(encrypted));
        console.log("Encrypted length", buffer.length());
        console.log(buffer);
        decipher.update(buffer);
        decipher.finish();
        var plaintext = decipher.output.toHex();
        console.log("Plaintext", plaintext);
        //console.log("Decrypted AES-GCM Hex", forge.util.bytesToHex(decrypted).match(/.{2}/g).map(hexStrToDec));
        //encrypted = forge.util.bytesToHex(decrypted).match(/.{2}/g).map(hexStrToDec);
        resolve(plaintext.match(/.{2}/g).map(hexStrToDec));
    });
}

/**
 * Perform AES_256_GCM encryption using NACL shared secret
 * @param {Array} plaintext
 * @return {Array}
 */
function aesgcm_encrypt(plaintext) {
    return new Promise(resolve => {
        forge.options.usePureJavaScript = true;
        var key = sha256(sharedsec); //AES256 key sha256 hash of shared secret
        console.log("Key", key);
        var iv = IntToByteArray(counter);
        while (iv.length < 12) iv.push(0);
        iv = Uint8Array.from(iv);
        console.log("IV", iv);
        //Counter used as IV, unique for each message
        var cipher = forge.cipher.createCipher('AES-GCM', key);
        cipher.start({
            iv: iv, // should be a 12-byte binary-encoded string or byte buffer
            tagLength: 0
        });
        console.log("Plaintext", plaintext);
        cipher.update(forge.util.createBuffer(Uint8Array.from(plaintext)));
        cipher.finish();
        var ciphertext = cipher.output;
        ciphertext = ciphertext.toHex(),
            resolve(ciphertext.match(/.{2}/g).map(hexStrToDec))
    });
}
async function u2fSignBuffer(cipherText, mainCallback) {
    // this function should recursively call itself until all bytes are sent in chunks
    var message = []; //Add header and message type
    var maxPacketSize = 228; //57 (OK packet size) * 4, + 4 byte 0xFF header, has to be less than 255 - header
    var finalPacket = cipherText.length - maxPacketSize <= 0;
    packetnum++;
    if (cipherText.length < maxPacketSize) {
        var ctChunk = cipherText;
    }
    else {
        var ctChunk = cipherText.slice(0, maxPacketSize);
    }

    Array.prototype.push.apply(message, ctChunk);

    var cb = finalPacket ? doPinTimer.bind(null, 10) : u2fSignBuffer.bind(null, cipherText.slice(maxPacketSize), mainCallback);

    //while (message.length < 228) message.push(0);
    console.info("Handlekey bytes ", message);
    var encryptedmsg = await aesgcm_encrypt(message);
    console.info("Encrypted Handlekey bytes ", encryptedmsg);

    await ctaphid_via_webauthn(type = $SLOTID == 'Encrypt and Sign' ? OKSIGN : OKDECRYPT, slotId(), finalPacket, packetnum, encryptedmsg, 6000).then(async response => {
        if (finalPacket) packetnum = 0;
        //decrypt data
        if (response != 1) {
            var decryptedparsedData = await aesgcm_decrypt(response);
            console.log("DECODED RESPONSE:", response);
            console.log("DECRYPTED RESPONSE:", decryptedparsedData);
        }
        console.log("Returning just the decoded response:");
        var result = response;
        msg((result ? "Successfully sent" : "Error sending") + " to OnlyKey");
        if (result) {
            if (finalPacket) {
                console.info("Final packet ");
                _setStatus('pending_challenge');
                cb().then(skey => {
                    console.info("skey ", skey);
                    mainCallback(skey);
                }).catch(err => console.info(err));
            }
            else {
                cb();
            }
        }
    });
}

function getOS() {
    var userAgent = window.navigator.userAgent,
        platform = window.navigator.platform,
        macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'],
        windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'],
        iosPlatforms = ['iPhone', 'iPad', 'iPod'],
        os = null;

    if (macosPlatforms.indexOf(platform) !== -1) {
        os = 'Mac OS';
    }
    else if (iosPlatforms.indexOf(platform) !== -1) {
        os = 'iOS';
    }
    else if (windowsPlatforms.indexOf(platform) !== -1) {
        os = 'Windows';
    }
    else if (/Android/.test(userAgent)) {
        os = 'Android';
    }
    else if (!os && /Linux/.test(platform)) {
        os = 'Linux';
    }

    return os;
}



function msg(i) { console.log(i) }
var headermsg = msg;

var OKversion;
var browser = "Chrome";
var os = getOS();

var appKey;
var okPub;
var sharedsec;
var OKSETTIME = 228;
var OKPING = 243;
const OKSIGN = 237;
const OKDECRYPT = 240;


var packetnum = 0;

//var type;


async function msg_polling(params = {}, cb) {
    var delay = params.delay || 0;
    var type = params.type || 1; // default type to 1
    if (OKversion == 'Original') {
        delay = delay * 4;
    }

    setTimeout(async function() {
        console.info("Requesting response from OnlyKey");
        var cmd;
        if (type == 1) { //OKSETTIME
            cmd = OKSETTIME;
            var message = [255, 255, 255, 255, OKSETTIME]; //Add header and message type
            var currentEpochTime = Math.round(new Date().getTime() / 1000.0).toString(16);
            msg("Setting current time on OnlyKey to " + new Date());
            var timePart = currentEpochTime.match(/.{2}/g).map(hexStrToDec);
            Array.prototype.push.apply(message, timePart);
            appKey = nacl.box.keyPair();
            console.info(appKey);
            console.info(appKey.publicKey);
            console.info(appKey.secretKey);
            console.info("Application ECDH Public Key: ", appKey.publicKey);
            Array.prototype.push.apply(message, appKey.publicKey);
            var env = [browser.charCodeAt(0), os.charCodeAt(0)];
            Array.prototype.push.apply(message, env);
            msg(browser + " Browser running on " + os + " Operating System");
            var encryptedkeyHandle = Uint8Array.from(message); // Not encrypted as this is the initial key exchange
        }
        /*
         else if (type == 2) { //OKGETPUB
             var message = [255, 255, 255, 255, OKGETPUBKEY]; //Add header and message type
             msg("Checking to see if this key is assigned to an OnlyKey Slot " + window.custom_keyid);
             var empty = new Array(50).fill(0);
             Array.prototype.push.apply(message, window.custom_keyid);
             Array.prototype.push.apply(message, empty);
             while (message.length < 64) message.push(0);
             var encryptedkeyHandle = await aesgcm_encrypt(message);
             //var b64keyhandle = bytes2b64(encryptedkeyHandle);
         } */
        else { //Ping and get Response From OKSIGN or OKDECRYPT
            if (window._status == 'finished') return encrypted_data;
            console.info("Sending Ping Request to OnlyKey");
            var message = [];
            var ciphertext = new Uint8Array(64).fill(0);
            Array.prototype.push.apply(message, ciphertext);
            var encryptedkeyHandle = await aesgcm_encrypt(message);
            //var encryptedkeyHandle = Uint8Array.from(message);
            _setStatus('waiting_ping');
            cmd = OKPING;
        }

        await ctaphid_via_webauthn(cmd, null, null, null, encryptedkeyHandle, 6000).then(async(response) => {
            console.log("DECODED RESPONSE:", response);
            var data = await Promise;
            if (window._status === 'finished') {
                console.info("Finished");
            }
            else if (window._status === 'waiting_ping') {
                console.info("Ping Successful");
                _setStatus('pending_challenge');
                data = 1;
            }
            else if (type == 1) {
                okPub = response.slice(21, 53);
                console.info("OnlyKey Public Key: ", okPub);
                sharedsec = nacl.box.before(Uint8Array.from(okPub), appKey.secretKey);
                console.info("NACL shared secret: ", sharedsec);
                OKversion = response[19] == 99 ? 'Color' : 'Original';
                var FWversion = bytes2string(response.slice(8, 20));
                msg("OnlyKey " + OKversion + " " + FWversion + " secure encrypted connection established using NACL shared secret and AES256 GCM encryption\n");
                //id('header_messages').innerHTML = "<br>";
                headermsg("OnlyKey " + FWversion + " Secure Connection Established\n");
                sha256(sharedsec).then((key) => {
                    var key = key;
                    console.info("AES Key", key);
                }); //AES256 key sha256 hash of shared secret
                return;
            }
            /*else if (type == 2) {
                     var pubkey = response.slice(0, 1); //slot number containing matching key
                     msg("Public Key found in slot" + pubkey);
                     var entropy = response.slice(2, response.length);
                     msg("HW generated entropy" + entropy);
                     //Todo finish implementing this
                 return pubkey;
               }*/
            else if (type == 3 && window._status == 'finished') {
                data = response;
            }
            else if (type == 4 && window._status == 'finished') {
                var oksignature = response.slice(0, response.length); //4+32+2+32
                data = oksignature;
            }
            if (typeof cb === 'function') cb(null, data);
        });
    }, (delay * 1000));
}

var $SLOTID = 'Encrypt and Sign'


function id(s) { return document.getElementById(s); }
function slotId() {
    return id('slotid') ? id('slotid').value : type = $SLOTID == 'Encrypt and Sign' ? 2 : 1;
}


var doPinTimer = async function(seconds) {
    return new Promise(async function updateTimer(resolve, reject, secondsRemaining) {
        secondsRemaining = typeof secondsRemaining === 'number' ? secondsRemaining : seconds || 10;

        if (window._status === 'done_challenge' || window._status === 'waiting_ping') {
            _setStatus('done_challenge');
            const btmsg = `Waiting for OnlyKey to process message.`;
            //button.textContent = btmsg;
            console.info("Delay ", window.poll_delay);
            await ping(window.poll_delay - 2); //Delay
        }
        else if (window._status === 'pending_challenge') {
            if (secondsRemaining <= 2) {
                _setStatus('done_challenge');
            }
            if (secondsRemaining >= 2) {
                const btmsg = `You have ${secondsRemaining} seconds to enter challenge code ${pin} on OnlyKey.`;
                //button.textContent = btmsg;
                console.info("enter challenge code", pin);
            }
            //await ping(0); //Too many popups with FIDO2
        }

        if (window._status === 'finished') {
            console.info("Parsed Encrypted Data: ", encrypted_data);
            var decrypted_data = await aesgcm_decrypt(encrypted_data);

            console.info("Parsed Decrypted Data: ", decrypted_data);
            return resolve(decrypted_data);
        }

        setTimeout(updateTimer.bind(null, resolve, reject, secondsRemaining -= 4), 4000);
    });
};
/**
 * Ping OnlyKey for resoponse after delay
 * @param {number} delay
 */
async function ping(delay) {
    console.info("window.poll_type", window.poll_type);
    return await msg_polling({ type: window.poll_type, delay: delay });
}

module.exports = {
    test: function() {
        msg_polling({ type: 1, delay: 0 }); //Set time on OnlyKey, get firmware version, get ecc public

    }
}