

define('scenario/keycode', ["underscore"], function (_) {
    'use strict';

    const keyCodeStr = {
        8: "Backspace",
        9: "Tab",
        13: "Enter",
        16: "Shift",
        17: "Ctrl",
        18: "Alt",
        19: "Pause/break",
        20: "Caps lock",
        27: "Esc",
        32: "Space",
        33: "Page up",
        34: "Page down",
        35: "End",
        36: "Home",
        37: "Left",
        38: "Up",
        39: "Right",
        40: "Down",
        45: "Insert",
        46: "Delete",
        // 48-57: Number [0-9]
        // 65-90: A-Z
        91: "Left Win/Cmd",
        92: "Right Win/Cmd",
        93: "Menu",
        95: "Sleep",
        // 96-105: Num Pad [0-9]
        106: "*",
        107: "+",
        109: "-",
        110: ".",
        111: "/",
        // 112-135: [F1-F24]
        144: "Num lock",
        145: "Scroll lock",
        160: "^",
        161: "!",
        162: '"',
        163: "#",
        164: "$",
        165: "%",
        166: "&",
        167: "_",
        168: "(",
        169: ")",
        170: "*",
        171: "+",
        172: "|",
        // 173: "-", Mozilla
        174: "{",
        175: "}",
        176: "~",
        181: "Audio mute",
        182: "Audio down",
        183: "Audio up",
        186: ";",
        187: "=",
        188: ",",
        189: "-",
        190: ".",
        191: "/",
        192: "`",
        219: "[",
        220: "\\",
        221: "]",
        222: "'",
        225: "AltGraph"
    };

    const keyCode = {};

    keyCode.keyCodeToString = function (keyCode) {
        var str;

        if (keyCode >= 48 && keyCode <= 57) {
            str = (keyCode - 48).toString();
        } else if (keyCode >= 65 && keyCode <= 90) {
            str = String.fromCharCode(keyCode);
        } else if (keyCode >= 112 && keyCode <= 135) {
            str = "F" + (keyCode - 111).toString();
        } else {
            str = keyCodeStr[keyCode];
        }
        return str;
    };

    keyCode.charCodeToString = function (charCode) {
        switch (charCode) {
            case 13:
                return "Enter";
            case 32:
                return "Space";
            default:
                return String.fromCharCode(charCode);
        }
    };

    keyCode.isModifierKey = function (keycode) {
        return _.contains([16, 17, 18, 91, 93], keycode);
    };


    const charCodeToKeyCodes = {
        8: [8], // backspace
        9: [9], // tab
        13: [13], // enter
        27: [27], // esc
        32: [32], // space
        48: [48, 96], // 0
        49: [49, 97], // 1
        50: [50, 98], // 2
        51: [51, 99], // 3
        52: [52, 100], // 4
        53: [53, 101], // 5
        54: [54, 102], // 6
        55: [55, 103], // 7
        56: [56, 104], // 8
        57: [57, 105], // 9
        33: [49], // !
        64: [50], // @
        35: [51], // #
        36: [52], // $
        37: [53], // %
        94: [54], // ^
        38: [55], // &
        42: [56, 106], // *
        40: [56], // (
        41: [48], // )
        59: [186], // ;
        58: [186], // :
        61: [187], // =
        43: [107, 187], // +
        44: [188], // ,
        60: [188], // <
        45: [109, 189], // -
        95: [189], // _
        46: [190], // .
        62: [190], // >
        47: [111, 191], // /
        63: [191], // ?
        96: [192], // `
        126: [192], //~
        91: [219], // [
        123: [219], // {
        92: [220], // \
        124: [220], // |
        93: [221], // ]
        125: [221], // }
        39: [222], // '
        34: [222], // "
    };

    keyCode.matchCharCodeToKeyCode = function (charcode, keycode) {
        if (charcode >= 65 && charcode <= 90) {
            return keycode === charcode;
        } else if (charcode >= 97 && charcode <= 122) {
            return keycode === charcode - 32;
        } else if (charCodeToKeyCodes[charcode]) {
            return _.contains(charCodeToKeyCodes[charcode], keycode);
        } else {
            console.error("Unknown charcode: " + charcode);
            return false;
        }
    };

    keyCode.charCodeToKeyCode = function (charcode) {
        if (charcode >= 65 && charcode <= 90) {
            return charcode;
        } else if (charcode >= 97 && charcode <= 122) {
            return charcode - 32;
        } else if (charCodeToKeyCodes[charcode]) {
            return charCodeToKeyCodes[charcode][0];
        } else {
            console.error("Unknown charcode: " + charcode);
            return false;
        }
    };

    return keyCode;
});