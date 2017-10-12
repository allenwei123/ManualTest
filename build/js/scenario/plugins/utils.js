

define('utils', [], function () {
    'use strict';

    const utils = {};

    utils.waitForCondition = function (conditionCb, successCb, waitInterval) {
        if (conditionCb()) {
            successCb();
        } else {
            setTimeout(function () {
                utils.waitForCondition(conditionCb, successCb, waitInterval);
            }, waitInterval);
        }
    };

    const RANDOM_CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    utils.randomString = function (n) {
        let arr = [];
        while (n--) {
            arr.push(RANDOM_CHARSET.charAt(Math.floor(Math.random() * RANDOM_CHARSET.length)));
        }
        return arr.join('');
    };

    /*
    check a str is a valid regular expression
    return the regex if valid
    return false otherwise
  */
    utils.isValidRegex = function (str, flags) {
        try {
            return new RegExp(str, flags);
        } catch (e) {
            return false;
        }
    };

    utils.uriEquals = function (uri1, uri2) {
        return uri1.toUpperCase() === uri2.toUpperCase();
    };

    utils.semaphore = function (init, cb) {
        var s = {};
        var current = init;

        var check = function () {
            if (current === 0) {
                cb();
            }
        };

        s.up = function () {
            current = current + 1;
        };
        s.down = function () {
            current = current - 1;
            check();
        };

        check();
        return s;
    };

    return utils;
});