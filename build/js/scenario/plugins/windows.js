define('windows', ["jquery"], function ($) {
    "use strict";

    const windows = {};

    const DEFAULT_WIDITH_DELTA = 237; // 15px * 2 margins at both end + 200px sidebar + 5px padding sidebar + borders
    const DEFAULT_HEIGHT_DELTA = 241;

    const MIN_WEBVIEW_HEIGHT = 320;
    const DEFAULT_WEBVIEW_HEIGHT = 768;

    const MIN_WINDOW_WIDTH = 750; // Minimum width to show modals, buttons and tutorial nicely on all platforms
    const MIN_WINDOW_HEIGHT = DEFAULT_HEIGHT_DELTA + MIN_WEBVIEW_HEIGHT;

    const EDIT_SCENARIO_PATH = requirejs.s.contexts._.config.baseUrl + "../html/new_scenario.html";
    const RUN_SCENARIO_PATH = requirejs.s.contexts._.config.baseUrl + "../html/run_scenario.html";
    const HOME_PATH = requirejs.s.contexts._.config.baseUrl + "../html/home.html";
    const OAUTH_PATH = requirejs.s.contexts._.config.baseUrl + "../html/oauth.html";
    const SUMMARY_PATH = requirejs.s.contexts._.config.baseUrl + "../html/summary.html";

    const WINDOW_HOME_ID = "home";
    const WINDOW_HOME_WIDTH = 1024;
    const WINDOW_HOME_MIN_WIDTH = 800;
    const WINDOW_HOME_HEIGHT = 1024;
    const WINDOW_HOME_MIN_HEIGHT = 320;

    const WINDOW_OAUTH_ID = "oauth";
    const WINDOW_OAUTH_WIDTH = 640;
    const WINDOW_OAUTH_HEIGHT = 480;

    var openScenarioWindow = function (path, device, scenario, options, cb) {
        if (options.id) {
            let win = chrome.app.window.get(options.id);
            if (win) {
                win.show();
                return;
            }
        }

        options.resizable = true;
        options.innerBounds = {
            // Not allow user to narrow the width to hide part of webview or less than MIN_WINDOW_WIDTH
            minWidth: Math.max(DEFAULT_WIDITH_DELTA + device.getWidth(scenario.deviceSize), MIN_WINDOW_WIDTH),
            width: DEFAULT_WIDITH_DELTA + device.getWidth(scenario.deviceSize),
            minHeight: MIN_WINDOW_HEIGHT,
            height: Math.min(DEFAULT_HEIGHT_DELTA + DEFAULT_WEBVIEW_HEIGHT, Math.round(screen.height * 0.9))
        };
        options.frame = {
            type: "none"
        };

        chrome.app.window.create(path, options, cb);
    };

    windows.openScenarioWindowForEdit = function (device, scenario, cb) {
        let options = {};
        if (scenario.key) {
            options.id = `${scenario.key}-edit-${scenario.deviceSize}`;
        }
        openScenarioWindow(EDIT_SCENARIO_PATH, device, scenario, options, cb);
    };

    windows.openScenarioWindowForRun = function (device, scenario, options, cb) {
        openScenarioWindow(RUN_SCENARIO_PATH, device, scenario, options, cb);
    };

    windows.calculateWebviewHeight = function () {
        return Math.max($(window).height() - DEFAULT_HEIGHT_DELTA, MIN_WEBVIEW_HEIGHT);
    };

    windows.openHomeWindow = function () {
        let win = chrome.app.window.get(WINDOW_HOME_ID);
        if (win) {
            console.log("Home window existing. Showing");
            win.show();
        } else {
            console.log("Creating Home window");
            chrome.app.window.create(HOME_PATH, {
                id: WINDOW_HOME_ID,
                innerBounds: {
                    width: WINDOW_HOME_WIDTH,
                    height: WINDOW_HOME_HEIGHT,
                    minWidth: WINDOW_HOME_MIN_WIDTH,
                    minHeight: WINDOW_HOME_MIN_HEIGHT
                }
            });
        }
    };

    windows.openSummaryWindow = function (cb) {
        chrome.app.window.create(SUMMARY_PATH, {
            innerBounds: {
                width: 600,
                minWidth: 320,
                height: 480,
                minHeight: 320
            },
            resizable: true,
            frame: {
                type: 'none'
            }
        }, cb);
    };

    windows.openOauthWindow = function (cb) {
        let win = chrome.app.window.get(WINDOW_OAUTH_ID);
        if (win) {
            win.show();
        } else {
            chrome.app.window.create(OAUTH_PATH, {
                id: WINDOW_OAUTH_ID,
                innerBounds: {
                    width: WINDOW_OAUTH_WIDTH,
                    height: WINDOW_OAUTH_HEIGHT
                }
            }, cb);
        }
    };

    windows.closeOauthWindow = function () {
        return new Promise(function (fulfill, reject) {
            let win = chrome.app.window.get(WINDOW_OAUTH_ID);
            if (win) {
                win.onClosed.addListener(fulfill);
            } else {
                fulfill();
            }
        });
    };

    return windows;
});