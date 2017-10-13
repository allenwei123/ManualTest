define('scenario/webview', ["jquery", "Element", "windows", "q", "EventEmitter", "scenario/keycode"], function ($, Element, windows, Q, EventEmitter, keyCode) {
    'use strict';

    const WEBVIEW_ID = 'wv';
    const webview = new EventEmitter();

    var webviewElement;

    var webviewStatus; // Based on webview load events
    var webviewInitialized; // Indicate if webview initialized with helper scripts
    var currentURL;

    var readyDeferred = null;

    webview.create = function (options) {
        options = options || {};

        if (webviewElement) {
            webviewElement.off(".manualtest");
            webviewElement.remove();
        }

        webviewElement = $(document.createElement('webview'));
        webviewElement.attr("partition", 'p' + (new Date()).getTime().toString().substring(8, 13));
        webviewElement.attr("id", WEBVIEW_ID);
        webviewElement.css({width: options.width, height: options.height});

        if (options.userAgent) {
            webviewElement.get(0).setUserAgentOverride(options.userAgent);
        }

        webviewElement.on('contentload.manualtest', function (e) {
            console.log("contentload");
            // Load inject.js and prepare page only when a new document is loaded
            initializePage();
        });

        webviewElement.on('loadstop.manualtest', function (e) {
            console.log("loadstop");
            webviewStatus = 'stop';
            checkReady();
        });
        webviewElement.on('loadstart.manualtest', function (e) {
            let evt = e.originalEvent;
            console.log("loadstart: isTopLevel: " + evt.isTopLevel);
            if (evt.isTopLevel) {
                webviewStatus = 'start';
                webviewInitialized = false; // set to true by ping response from webview content
                checkReady();

                // Fire InitializeStart to let scenario controller to mask the page to prevent user interaction.
                // Page is unmasked once the page is initialized, by receiving ping from the embedded page.
                // This assumes every loadstart will be followed by a contentload event, which initialize the page
                // when fired.
                webview.emitEvent("initializeStart");
            }
        });
        webviewElement.on('loadcommit.manualtest', function (e) {
            let src = webviewElement.get(0).src, evt = e.originalEvent;
            console.log("loadcommit: isTopLevel: " + evt.isTopLevel + " urlChanged: " + (src !== currentURL));
            if (src !== currentURL) {
                console.log("URL changed from " + currentURL + " to " + src);
                currentURL = src;
                webview.emitEvent("urlChanged", [currentURL]);
            }
        });

        webviewElement.on('loadabort.manualtest', function (e) {
            let evt = e.originalEvent, msg;
            console.log("loadabort: isTopLevel: %s, reason: %s ", evt.isTopLevel, evt.reason);
            if (evt.isTopLevel) {
                webviewStatus = 'abort';
                switch (evt.reason) {
                    case 'ERR_CONNECTION_REFUSED':
                        msg = "Connection refused";
                        break;
                    case 'networkError':
                        msg = "Network error";
                        break;
                    case 'sslError':
                        msg = "SSL error";
                        break;
                    case 'safeBrowsingError':
                        msg = "Safe browsing error";
                        break;
                    case 'ERR_NAME_NOT_RESOLVED':
                        msg = "Web address can not be resolved";
                        break;
                    case 'ERR_ADDRESS_UNREACHABLE':
                        msg = "Web address can not be reached";
                        break;
                    default:
                        console.log("loadabort with unknown reason: %s. Ignoring.", evt.reason);
                        msg = null;
                }
                if (msg) {
                    console.error("webview halt: " + msg);
                    webview.emitEvent('halt', [msg]);
                }
                checkReady();
            }
        });

        webviewElement.get(0).request.onHeadersReceived.addListener(
            function (details) {
                if (details.statusLine && details.statusLine.indexOf("500 Internal Server Error") > -1) {
                    console.error("webview halt: " + "Page received: Internal Server Error");
                    webview.emitEvent('halt', ["Page received: Internal Server Error"]);
                }
            },
            {
                urls: ["<all_urls>"],
                types: ["main_frame", "xmlhttprequest"]
            },
            []
        );

        webviewElement.on('exit.manualtest', function (e) {
            let evt = e.originalEvent, msg;
            switch (evt.reason) {
                case "normal":
                case "abnormal":
                    msg = "Page exited";
                    break;
                case "crash":
                    msg = "Page crashed";
                    break;
                case "kill":
                    msg = "Page killed";
                    break;
            }
            console.error("webview halt: " + msg);
            webview.emitEvent('halt', [msg]);
        });

        webviewElement.on('consolemessage.manualtest', function (e) {
            console.log('webview: ' + e.originalEvent.message);
        });

        checkReady();
    };

    webview.appendTo = function (container) {
        container.append(webviewElement);
    };

    webview.navigate = function (url) {
        webview.clearAllData(function () {
            console.log("webview navigate to: " + url);
            webviewInitialized = false;
            webviewStatus = undefined;
            currentURL = url;
            webviewElement.attr('src', url);
            checkReady();
        });
    };

    webview.clearAllData = function (cb) {
        console.log("clear all data");
        webviewElement.get(0).clearData(
            {'since': 0},
            {
                'appcache': true,
                'cookies': true,
                'fileSystems': true,
                'indexedDB': true,
                'localStorage': true,
                'webSQL': true
            },
            cb());
    };

    // Return a promise that work can use then-able
    // to wait until the webview is ready to run
    webview.ready = function () {
        return readyDeferred.promise;
    };

    const checkReady = function () {
        if ((webviewStatus === 'stop' || webviewStatus === 'abort') && webviewInitialized) {
            // if webview is initialized, and the page has stopped loading
            // and the ready promise is not resolved yet, resolve it
            // so work waiting for webview to be ready can proceed
            if (readyDeferred.promise.isPending()) {
                readyDeferred.resolve();
            }
        } else {
            // if webview is new, or it was currently in ready state,
            // change to not ready state and use new deferred
            // Note: must only use new deferred when the last deferred is resolved,
            // this relies on checkReady is called when called when load stop/abort
            if (!readyDeferred || !readyDeferred.promise.isPending()) {
                readyDeferred = Q.defer();
            }
        }
    };

    webview.getCurrentUrl = function () {
        return currentURL;
    };

    webview.performEvents = function (events) {
        return new Promise(function (fulfill, reject) {
            messageHandler.postMessage({
                type: "performEvents",
                value: JSON.stringify(events)
            }, function (results) {
                fulfill(results);
            });
        });
    };

    webview.performReady = function (getActionsPromise) {
        const RESOURCE_UNLOADED = "resourceUnloaded";

        return webview.ready().then(function () {
            var initStarted = new Promise(function (fulfill, reject) {
                webview.addOnceListener("initializeStart", function () {
                    fulfill(RESOURCE_UNLOADED);
                });
            });

            var actionsPerformed = getActionsPromise();

            // Race between webview page unload its resource and therefore can't reply,
            // and receiving a reply from the performed event
            return Promise.race([initStarted, actionsPerformed]).then(function (value) {
                if (value === RESOURCE_UNLOADED) {
                    // Didn't receive a result before webview unload its resource, try again
                    console.log("Didn't receive a result before webview unload its resource, try again");
                    return webview.performReady(getActionsPromise);
                } else {
                    return value;
                }
            });
        });
    };

    /*
    cb - callback with element when selection is captured and received from webview
       - callback with null if selection is stopped.
    cb is always called.
  */
    webview.startCaptureSelection = function (cb) {
        messageHandler.registerListener('hoverResult', function (result) {
            webview.emitEvent("hover", [result.bounds]);
        });
        messageHandler.registerListener('selectResult', function (result) {
            cb(Element.createWithJson(result));
        });
        messageHandler.postMessage({
            type: 'selectStart'
        });
        messageHandler.postMessage({
            type: 'reportHoverStart'
        });
    };

    /* stopping selection. Caused by user cancelling.
  */
    webview.stopCaptureSelection = function () {
        messageHandler.postMessage({
            type: 'selectStop'
        });
        messageHandler.postMessage({
            type: 'reportHoverStop'
        });
        messageHandler.unregisterListener('selectResult');
        messageHandler.unregisterListener('hoverResult');
    };

    webview.reload = function () {
        console.log("Reloading webview");
        webviewElement.get(0).reload();
    };

    webview.canGoBack = function () {
        return webviewElement.get(0).canGoBack();
    };

    webview.back = function (cb) {
        console.log("Go back on webview");
        webviewElement.get(0).back(cb);
    };

    webview.canGoForward = function () {
        return webviewElement.get(0).canGoForward();
    };

    webview.forward = function (cb) {
        console.log("Go forward on webview");
        webviewElement.get(0).forward(cb);
    };

    webview.hover = function (element, cb) {
        messageHandler.postMessage({
            type: 'performHover',
            element: element
        }, function (result) {
            cb(result);
        });
    };

    webview.getElementCoordinates = function (element, cb) {
        messageHandler.postMessage({
            type: 'getElementCoordinates',
            element: element
        }, function (rect) {
            cb(rect);
        });
    };

    webview.scrollToElement = function (element, cb) {
        messageHandler.postMessage({
            type: "scrollToElement",
            element: element
        }, function (success) {
            cb(success);
        });
    };

    webview.searchText = function (element, text, insensitive, not, cb) {
        messageHandler.postMessage({
            type: 'searchText',
            element: element,
            text: text,
            insensitive: insensitive,
            not: not
        }, cb);
    };

    webview.insertString = function (element, string) {
        var value = [];
        for (var i = 0; i < string.length; i++) {
            value.push({
                charCode: string.charCodeAt(i),
                keycode: keyCode.charCodeToKeyCode(string.charCodeAt(i)),
                char: string[i]
            });
        }
        return new Promise(function (fulfill, reject) {
            messageHandler.postMessage({
                type: "insertString",
                element: element,
                value: value
            }, function (result) {
                fulfill(result);
            });
        });
    };

    var messageHandler = {
        callbacks: {},

        // Send a message to webview with an optional callback
        // callback is invoked when the message is replied
        // webview (page.js) must send the messageId back during reply
        postMessage: function (message, cb) {
            var messageId = new Date().getTime();
            if (cb) {
                message.messageId = messageId;
            }
            webviewElement.get(0).contentWindow.postMessage(message, "*");
            if (cb) {
                messageHandler.callbacks[messageId] = cb;
            }
        },
        // Handler message received from webview.
        // if message has an messageId, then invoke the callback it was originated with
        // if message match for a registered listener, invoke the callback
        // callback is invoked with the 'result' property of the message (JSON parsed)
        receiveMessage: function (msg) {
            var result = msg.result ? JSON.parse(msg.result) : null;
            if (msg.messageId && msg.messageId in messageHandler.callbacks) {
                messageHandler.callbacks[msg.messageId](result);
                delete messageHandler.callbacks[msg.messageId];
            }
            if (msg.type && msg.type in messageHandler.callbacks) {
                messageHandler.callbacks[msg.type](result);
            }
        },
        // Register a listener for certain type of message
        registerListener: function (type, cb) {
            this.unregisterListener(type);
            this.callbacks[type] = cb;
        },
        unregisterListener: function (type) {
            delete this.callbacks[type];
        }
    };

    var messageListener = function (e) {
        messageHandler.receiveMessage(e.data);
    };
    window.removeEventListener('message', messageListener);
    window.addEventListener('message', messageListener);

    messageHandler.registerListener('eventData', function (result) {
        var eventData = EventData.createWithJson(result);
        console.log("got eventData from page: %O", eventData);
        webview.emitEvent("eventData", [eventData]);
    });

    messageHandler.registerListener('wheel', function (result) {
//    console.log("wheel scroll by: %i, %i", (result.deltaX || 0) * -1, (result.deltaY || 0) * -1);
        if (result.deltaY) {
            window.scrollBy(0, (result.deltaY || 0) * -1);
        } else if (result.deltaX) {
            $(".scenario-col-main").scrollLeft($(".scenario-col-main").scrollLeft() + (result.deltaX * -1));
        }
    });

    var initializePage = function () {
        console.log("Initializing webview");

        // Execute inject.js for loading the needed js into the embedded page *main *world*
        // Must wait for injectionLoaded from the executed script, because only it knows when
        // the injected scripts is loaded.
        webviewElement.get(0).executeScript({file: requirejs.s.contexts._.config.baseUrl + "core/inject.js"}, function () {
            console.log("send pingInject");
            messageHandler.postMessage({type: "pingInject"});

            // Wait for executing script
            messageHandler.registerListener('injectionLoaded', function (result) {
                // ping webview after injectioned loaded to let it know of the embeder window
                console.log('Injection loaded. ping webview');

                messageHandler.postMessage({
                    type: 'ping'
                }, function () {
                    console.log('got ping from webview. Webview initialized.');
                    webviewInitialized = true;
                    webview.emitEvent("initializeStop");
                    checkReady();
                });
            });
        });
    };

    chrome.app.window.current().onBoundsChanged.addListener(function () {
        if (webviewElement) {
            webviewElement.css("height", windows.calculateWebviewHeight());
        }
    });

    return webview;
});

define('scenario/steps_list', ["jquery", "underscore", "Element", "Action", "scenario/keycode", "EventEmitter"], function ($, _, Element, Action, keyCode, EventEmitter) {
    "use strict";

    const stepsList = new EventEmitter();

    var steps = [];

    var performingStepIndex;

    var isKeyEvent = function (e) {
        return _.contains(["keydown", "keypress", "keyup"], e.type);
    };

    var isMouseEvent = function (e) {
        return _.contains(["mousedown", "mouseup", "click"], e.type);
    };

    var lastKeyEvent = function (step) {
        for (var i = step.events.length - 1; i >= 0; i--) {
            if (isKeyEvent(step.events[i])) {
                return step.events[i];
            }
        }
        return null;
    };

    stepsList.performingAction = function (action) {
        stepsList.forEach(function (step, stepIndex) {
            if (step.hasAction(action)) {
                performingStepIndex = stepIndex;
                stepsList.emitEvent("stepPlaying", [stepIndex]);
            }
        });
    };

    stepsList.errorOnPerformingStep = function (error) {
        stepsList.emitEvent("stepError", [{
            stepIndex: performingStepIndex,
            errorMessage: error
        }]);
    };

    stepsList.stepPerformCompleted = function () {
        stepsList.emitEvent("stepCompleted");
    };

    stepsList.reset = function (actions) {
        steps = [];

        var currentMouseStep = null;
        var currentInputStep = null;
        // var keySteps = [];
        var currentKeyStep = null;
        var currentSubmitStep = null;
        var currentTabStep = null;
        actions.forEach(function (action, actionIndex) {
            if (action.isComposable) {
                if (isKeyEvent(action) && action.options.keyCode === 9 /* TabStep */) {
                    currentMouseStep = null;
                    currentKeyStep = null;
                    if (action.type === "keydown") {
                        currentTabStep = TabStep.create();
                        currentTabStep.addAction(action);
                        steps.push(currentTabStep);
                    } else {
                        if (action.type === "keyup") {
                            if (currentTabStep) {
                                currentTabStep.addAction(action);
                            } else {
                                console.log("Orphan tab event: %O", action);
                            }
                        } else {
                            console.error("Unknown event type for TabStep: " + action.type);
                        }
                    }
                } else if (isKeyEvent(action) /* KeyStep */) {
                    currentMouseStep = null;
                    if (currentKeyStep && currentKeyStep.element().equals(action.element)) {
                        // Add event to current Key Step
                        currentKeyStep.addAction(action);
                    } else {
                        currentKeyStep = KeyStep.create();
                        currentKeyStep.addAction(action);
                        steps.push(currentKeyStep);
                    }
                } else if (isMouseEvent(action) /* MouseStep */) {
                    if (action.type === "click" &&
                        action.element.tagName === "input" &&
                        action.element.type === "submit" &&
                        currentKeyStep &&
                        _.contains([13, 32], lastKeyEvent(currentKeyStep).options.keyCode) &&
                        lastKeyEvent(currentKeyStep).element.formElement.equals(action.element.formElement)) {
                        /*
          Special condition where the click event is generated by pressing a enter
          or space key on some input elements, eg. checkbox, submittable elements
          Include it in the KeyStep of the space/enter key
        */
                        if (currentKeyStep) {
                            currentKeyStep.addAction(action);
                        } else {
                            console.error("Orphan click event: %O", action);
                        }
                    } else {
                        currentKeyStep = null;
                        if (currentMouseStep && currentMouseStep.element().equals(action.element) &&
                            action.type !== "mousedown") {
                            currentMouseStep.addAction(action);
                        } else {
                            currentMouseStep = MouseStep.create();
                            currentMouseStep.addAction(action);
                            steps.push(currentMouseStep);
                        }
                    }
                } else if (_.contains(['input', 'change', 'submit', 'textInput'], action.type)) {
                    var added = false;
                    for (var i = steps.length - 1; i >= 0 && !added; i--) {
                        if (MouseStep.isPrototypeOf(steps[i]) || KeyStep.isPrototypeOf(steps[i])) {
                            added = true;
                            steps[i].addAction(action);
                        }
                    }
                    if (!added) {
                        console.log("Orphan %s event: %O", action.type, action);
                    }
                }
            } else {
                steps.push(SingleActionStep.create(action));
            }
        });

        let addedEvents = steps.reduce(function (sum, s) {
            return s.events.length + sum;
        }, 0);
        if (addedEvents !== actions.length) {
            console.error("Not all events " + actions.length + " added to steps " + addedEvents);
        }

        stepsList.emitEvent("change");
    };

    stepsList.removeStep = function (step) {
        stepsList.emitEvent("removeStep", [function (actions) {
            return actions.filter(function (a) {
                return !step.hasAction(a);
            });
        }]);
    };

    stepsList.forEach = function (fn) {
        steps.forEach(fn);
    };

    const Step = {
        addAction: function (evt) {
            this.events = this.events || [];
            this.events.push(evt);
        },
        hasAction: function (evt) {
            return (this.events || []).indexOf(evt) > -1;
        },
        create: function () {
            return Object.create(this);
        },
        element: function () {
            return (this.events || [])[0].element;
        },
        editElement: function (fn) {
            (this.events || []).forEach(function (action) {
                if (action.element) {
                    fn(action.element);
                }
            });
        },
        editable: function () {
            return true;
        }
    };

    const MouseStep = Object.create(Step, {
        type: {
            get: function () {
                return "MouseStep";
            }
        },
        display: {
            value: function () {
                var a = "";
                if (_.find(this.events, function (e) {
                        return e.type === "click";
                    })) {
                    a = "Click";
                } else if (_.find(this.events, function (e) {
                        return e.type === "mousedown";
                    })) {
                    if (_.find(this.events, function (e) {
                            return e.type === "mouseup";
                        })) {
                        a = "Mouse down and up";
                    } else {
                        a = "Mouse down";
                    }
                } else {
                    a = "Mouse up";
                }
                return Displayable.displayAction(a) + " on " +
                    Displayable.displayTarget(this.element().toString());
            }
        },
        editElement: {
            value: function (fn) {
                (this.events || []).forEach(function (action, actionIndex) {
                    if (action.element && action.type !== "submit") {
                        fn(action.element);
                    } else if (action.type === "submit") {
                        var ele = this.events[actionIndex - 1].element.getDOMElement();
                        if (ele && ele.form) {
                            action.element = Element.createWithDOMElement(ele.form);
                        }
                    }
                });
            }
        }
    });

    const KeyStep = Object.create(Step, {
        type: {
            get: function () {
                return "KeyStep";
            }
        },
        display: {
            value: function () {
                var keys = [];
                var filtered = this.events.filter(function (e) {
                    return e.type === "keydown" || e.type === "keypress";
                });
                var lastKeyDown = null, lastKeyPress = null;
                for (var i = 0; i < filtered.length; i++) {
                    if (filtered[i].type === "keydown") {
                        if (lastKeyDown) {
                            keys.push(lastKeyDown);
                        }
                        lastKeyDown = filtered[i];
                    } else {
                        if (lastKeyDown) {
                            if (keyCode.matchCharCodeToKeyCode(filtered[i].options.charCode, lastKeyDown.options.keyCode)) {
                                lastKeyDown = null;
                                keys.push(filtered[i]);
                            } else {
                                keys.push(lastKeyDown);
                                console.error("Orphan keypress: %O, lastKeyDown: %O", filtered[i], lastKeyDown);
                                lastKeyDown = null;
                            }
                        } else {
                            console.error("Orphan keypress: %O", filtered[i]);
                        }
                    }
                }
                if (lastKeyDown) {
                    keys.push(lastKeyDown);
                }
                var keysStr = keys.map(function (k) {
                    if (k.type === "keydown") {
                        if (keyCode.isModifierKey(k.options.keyCode)) {
                            return keyCode.keyCodeToString(k.options.keyCode);
                        } else {
                            var str = keyCode.keyCodeToString(k.options.keyCode);
                            if (k.options.ctrlKey) {
                                str = "Ctrl-" + str;
                            }
                            if (k.options.metaKey) {
                                str = "Cmd-" + str;
                            }
                            if (k.options.altKey) {
                                str = "Alt-" + str;
                            }
                            if (k.options.shiftKey) {
                                str = "Shift-" + str;
                            }
                            return str;
                        }
                    } else {
                        return keyCode.charCodeToString(k.options.charCode);
                    }
                });

                return Displayable.displayAction("Type") +
                    " [" +
                    keysStr.map(function (k) {
                        return "<span>" + k + "</span>";
                    }).join(', ') +
                    "]" +
                    " on " +
                    Displayable.displayTarget(this.element().toString());
            }
        },
        editElement: {
            value: function (fn) {
                (this.events || []).forEach(function (action, actionIndex) {
                    if (action.element && action.type !== "submit") {
                        fn(action.element);
                    } else if (action.type === "submit") {
                        var ele = this.events[actionIndex - 1].element.getDOMElement();
                        if (ele && ele.form) {
                            action.element = Element.createWithDOMElement(ele.form);
                        }
                    }
                });
            }
        }
    });

    const TabStep = Object.create(Step, {
        type: {
            get: function () {
                return "TabStep";
            }
        },
        display: {
            value: function () {
                var ku;
                if (ku = _.find(this.events, function (e) {
                        return e.type === "keyup";
                    })) {
                    return Displayable.displayAction("Use [Tab]") + " to focus on " +
                        Displayable.displayTarget(ku.element.toString());
                } else {
                    return Displayable.displayAction("Use [Tab]") + " on " +
                        Displayable.displayTarget(this.events[0].element.toString());
                }
            }
        },
        element: {
            value: function () {
                var ku;
                if (ku = _.find(this.events, function (e) {
                        return e.type === "keyup";
                    })) {
                    return ku.element;
                } else {
                    return this.events[0].element;
                }
            }
        },
        addAction: {
            value: function (eventData) {
                if (eventData.type !== "keyup" && eventData.type !== "keydown") {
                    throw new Error("Unknown event type for TabStep: " + eventData.type);
                }
                if (eventData.options.keyCode !== 9) {
                    throw new Error("TabStep only accept keyCode 9");
                }
                this.events = this.events || [];
                this.events.push(eventData);
            }
        },
        editElement: {
            value: function (fn) {
                if (ku = _.find(this.events, function (e) {
                        return e.type === "keyup";
                    })) {
                    fn(ku.element);
                } else {
                    fn(this.events[0].element);
                }
            }
        }
    });


    const SingleActionStep = Object.create(Step, {
        type: {
            get: function () {
                return "SingleActionStep";
            }
        },
        create: {
            value: function (action) {
                var step = Object.create(SingleActionStep);
                step.events = [action];
                return step;
            }
        },
        display: {
            value: function () {
                return this.events[0].display();
            }
        },
        action: {
            get: function () {
                return this.events[0];
            },
            set: function (a) {
                this.events[0] = a;
            }
        },
        editable: {
            value: function () {
                return !this.action.is(BrowserAction);
                // return this.action.__objectType === "WaitTimeAction" ||
                //   this.action.__objectType === "VerifyUrlAction" ||
                //   this.action.__objectType === "VerifyTextAction" ||
                //   this.action.__objectType === "DataInsertAction";
            }
        }
    });

    return stepsList;
});

define('scenario/scenario_controller', ["jquery", "scenario/webview", "scenario/steps_list", "Element", "Action", "windows", "Scenario", "ScenarioResult", "bootstrap-notify", "q", "EventEmitter"], function ($, webview, stepsList, Element, Action, windows, Scenario, ScenarioResult, _bootstrap_notify, Q, EventEmitter) {
    "use strict";

    const webviewCoverBgRun = "rbga(0,0,0,0);";
    const webviewCoverBgEdit = "rbga(100,100,100,0.5)";

    const CHECK_RESULT_INTERVAL = 50;

    const WAIT_BEFORE_RUN_STEPS_SECONDS = 0;
    const WAIT_BEFORE_COMPLETE_ACTIONS = 100;

    const scenarioController = new EventEmitter();

    var device;
    var syncEngine;

    var webviewContainer;
    var webviewSelector;
    var webviewSelectorCancel;
    var pageStatus;

    var project;
    var baseScenario;
    var scenario;
    var saveCallback;

    var scenarioResult;
    var savingResult;
    var startUrl;

    var mode; // enum: edit, run
    var scenarioReady;

    var changedSinceLastSaved;

    var errorDeferred;

    /*
Return a promise that will be rejected once the page reach error state
*/
    var getError = function () {
        return errorDeferred.promise;
    };

    var setError = function (err) {
        console.log("Error on scenario: " + err);
        errorDeferred.reject(err);
    };

    var resetError = function () {
        errorDeferred = Q.defer();
    };
    resetError();

    var webviewCover = {
        get element() {
            this._element = this._element || $("#webview-cover");
            return this._element;
        },
        get canvas() {
            if (!this._canvas) {
                this._canvas = $("#webview-cover-canvas");
                this._canvas.get(0).width = this.element.width();
                this._canvas.get(0).height = this.element.height();
            }
            return this._canvas;
        },
        mask: function () {
            this.element.css("background-color", "rgba(100, 100, 100, 0.5)");
            return this;
        },
        unmask: function () {
            this.element.css("background-color", "");
            return this;
        },
        block: function (msg) {
            this.element.css("pointer-events", "auto");

            this.element.off(".webview");
            this.element.on("click.webview dblclick.webview mousedown.webview mouseup.webview keydown.webview keypress.webview keyup.webview", function (e) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                console.log("cover stopped click/key");
                if (e.type === "mousedown" || e.type === "keypress") {
                    scenarioController.showMessage(msg);
                }
            });

            return this;
        },
        unblock: function () {
            this.element.css("pointer-events", "");
            this.element.off(".webview");
            return this;
        },
        highlightRect: function (rect) {
            var ctx = this.canvas.get(0).getContext("2d");
            ctx.strokeStyle = "#FF0000";
            ctx.lineWidth = 5;
            ctx.strokeRect(rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top);
        },
        clearHighlight: function () {
            var ctx = this.canvas.get(0).getContext("2d");
            ctx.clearRect(0, 0, this.canvas.get(0).width, this.canvas.get(0).height);
        }
    };

    var actionsManager = function () {
        var my = {};

        /*
  Skip performing certain events because the previous event already triggered
  these event by Chrome:
  Note:

  1) Fire textInput event programmtically would change the value of text input
  and cause Chrome to fire an input event
  Solution: Skip input event following a input event

  2a) if form has submittable element
    real enter key
      - fire click event on submit element
      - always fire submit event on form
    fire enter key programmtically
      - does not fire any click or submit event
    real mouse click (on submittable element)
      - fire submit event
    fire click event programmtically
      - fire submit event
  Solution:
    Skip submit event if it is following a click event for the same form

  2b) if form does not have submittable element
    real enter key
      - fire submit event only if its the only text input element
      - does not fire submit event on non-text input element
    fire enter key programmtically
      - does not fire submit event
  Solution:
    No need to skip any events, Chrome does not fire anything, so eplay all event

  3) Enter space key on checkbox/radio
      - fire change event, then click events
      - fire space key programmtically does not fire change/click events
      - fire click event programmtically change input value and fire change event
    Solution: Ideally, we should skip the change event, and let the click event
              change the value and fire the change event, but since the change event
              often doesn't change any values, and to skip it we need to look ahead,
              so we just ignore it for now, so it will fire twice (one by programmatically
              before the click event, one by Chrome after the click)
*/

        var shouldSkip = function (currentAction, previousAction) {
            if (currentAction.type === "input" &&
                previousAction.type === "textInput" &&
                currentAction.element.equals(previousAction.element)) {
                return true;
            } else if (currentAction.type === "submit" &&
                previousAction.type === "click" &&
                previousAction.element.type === "submit" &&
                previousAction.element.formElement &&
                currentAction.element.equals(previousAction.element.formElement)) {
                return true;
            }

            return false;
        };

        var shouldBundle = function (originalAction, action) {
            if ((action.type === "mouseup" || action.type === "click") && action.element.equals(originalAction.element)) {
                return true;
            } else if (action.type === 'keyup') {
                return true;
            } else {
                return false;
            }
        };

        var _performActions = function (actions, results, index, currentActionCallback, completeCallback) {
            var actionsCount = 0, performingActions = [], resultsWithSkippedActions = [], actionsPromise;
            console.log("_performActions: actions:%O, results:%O, index:%i", actions, results, index);
            if (index >= actions.length) {
                setTimeout(function () {
                    webview.ready().then(function () {
                        completeCallback(null, results);
                    });
                }, WAIT_BEFORE_COMPLETE_ACTIONS);
                return;
            }

            currentActionCallback(index);

            if (actions[index].isComposable) {
                if (index !== 0 && shouldSkip(actions[index], actions[index - 1])) {
                    resultsWithSkippedActions[actionsCount] = ActionResult.create(true);
                } else {
                    performingActions.push(actions[index]);
                }
                for (actionsCount = 1; actionsCount < actions.length - index; actionsCount++) {
                    if (shouldSkip(actions[index + actionsCount], actions[index + actionsCount - 1])) {
                        resultsWithSkippedActions[actionsCount] = ActionResult.create(true);
                    } else if (shouldBundle(actions[index], actions[index + actionsCount])) {
                        performingActions.push(actions[index + actionsCount]);
                    } else {
                        break;
                    }
                }
                actionsPromise = EventData.perform(webview, performingActions);
            } else {
                actionsCount = 1;
                performingActions.push(actions[index]);
                actionsPromise = actions[index].perform(webview,
                    {dataResolve: dataResolver.resolve});
            }

            console.log("_performActions: performing: %O with promise %O", performingActions, actionsPromise);

            Promise.race([getError(), actionsPromise]).then(function (value) {
                console.log("Actions completed: %O", value);
                if (Array.isArray(value)) {
                    var i = 0;
                    value.forEach(function (r) {
                        while (resultsWithSkippedActions[i]) {
                            i++;
                        }
                        resultsWithSkippedActions[i] = r;
                    });
                } else {
                    resultsWithSkippedActions.push(value);
                }
                if (!resultsWithSkippedActions.every(function (r) {
                        return r;
                    })) {
                    console.error("resultsWithSkippedActions has undefined result: %O", resultsWithSkippedActions);
                }
                if (resultsWithSkippedActions.length !== actionsCount) {
                    console.error("resultsWithSkippedActions has different number of results then actions advanced");
                }

                var resultError;
                resultsWithSkippedActions.forEach(function (r) {
                    results.push(r);
                    if (!r.pass) {
                        resultError = r.error;
                    }
                });

                if (!resultError) {
                    webview.ready().then(function () {
                        _performActions(actions, results, index + actionsCount, currentActionCallback, completeCallback);
                    });
                } else {
                    completeCallback(resultError);
                }
                return;
            }, function (err) {
                console.log("Error occurred during performing action");
                completeCallback(err);
                return;
            });
        };

        my.performActions = function (scenario, result, callback) {
            var currentActionCallback = function (index) {
                stepsList.performingAction(scenario.actions[index]);
                saveResult();
            };

            _performActions(scenario.actions, result.actionResults, 0, currentActionCallback, function (runError) {
                if (runError) {
                    stepsList.errorOnPerformingStep(runError);
                } else {
                    stepsList.stepPerformCompleted();
                }

                callback(runError);
            });
        };

        return my;
    }();

    var stepsListComponent = (function () {
        var my = new EventEmitter();
        var listElement = $('#steps-list');

        my.redraw = function () {
            listElement.empty();
            stepsList.forEach(function (step, currentIndex) {
                listElement.append(createStepElement(currentIndex, step));
            });
        };

        var createStepElement = function (index, step) {
            var stepControls;

            var stepDiv = $("<div />", {'class': "step"});
            if (mode === "edit") {
                stepDiv.addClass("has-controls");

                var removeButton = $("<i />", {"class": "fa fa-border fa-minus-square", "title": "Remove Step"});
                removeButton.click(function () {
                    stepsList.removeStep(step);
                });
                if (step.editable()) {
                    var editButton = $("<i />", {"class": "fa fa-border fa-cog", "title": "Edit Step"});
                    editButton.click(function () {
                        scenarioController.emitEvent("editStep", [step]);
                    });
                    stepControls = $("<div />", {'class': "step-controls"}).append(
                        editButton, removeButton);
                } else {
                    stepControls = $("<div />", {'class': "step-controls"}).append(
                        removeButton);
                }

                stepDiv.append(stepControls);
            }

            stepDiv.append(
                $("<div />", {'class': "step-icon"}),
                $("<div />", {'class': "step-index"}).text(index + 1 + "."),
                $("<div />", {'class': "step-description"}).html(step.display())
            );
            stepDiv.mouseenter(function (event) {
                my.emitEvent("hoverInStep", [step]);
            });

            stepDiv.mouseleave(function (event) {
                my.emitEvent("hoverOutStep", [step]);
            });

            stepDiv.on("click", ".js-step-display-target", function (e) {
                e.preventDefault();
                my.emitEvent("clickElement", [step.element()]);
            });

            return stepDiv;
        };

        var getNthStepElement = function (nth) {
            var n = nth + 1;
            return listElement.find(".step:nth-child(" + n + ")");
        };

        var setStepState = function (nth, state) {
            var classes;

            listElement.find(".step-icon").removeClass("run fail");

            if (state) {
                switch (state) {
                    case 'run':
                        classes = "run";
                        break;
                    case 'fail':
                        classes = "fail";
                        break;
                }
                getNthStepElement(nth).find(".step-icon").addClass(classes);
            }
            else {
                listElement.find(".step-icon").removeClass("run fail");
            }
        };

        var setStepMessage = function (nth, message) {
            var stepMessage = $("<div />", {'class': "step-message"}).html(message);
            getNthStepElement(nth).after(stepMessage);
        };

        stepsList.addListener("change", function () {
            my.redraw();
        });

        stepsList.addListener("stepPlaying", function (stepIndex) {
            setStepState(stepIndex, "run");
        });

        stepsList.addListener("stepError", function (stepError) {
            setStepState(stepError.stepIndex, "fail");
            setStepMessage(stepError.stepIndex, stepError.errorMessage);
        });

        stepsList.addListener("stepCompleted", function () {
            setStepState(null, null);
        });

        return my;
    })();

    stepsListComponent.addListener("hoverInStep", function (step) {
        if (step.element()) {
            highlightElement(step.element());
        }
    });

    stepsListComponent.addListener("hoverOutStep", function (step) {
        clearHighlight();
    });

    stepsListComponent.addListener("clickElement", function (element) {
        if (element) {
            clearHighlight();
            webview.scrollToElement(element, function (success) {
                if (success) {
                    highlightElement(element);
                } else {
                    console.log("Unable to scroll to element");
                    scenarioController.showMessage("Element not found on page");
                }
            });
        }
    });

    stepsList.addListener("removeStep", function (fn) {
        scenario.actions = fn(scenario.actions);
        clearHighlight();
        stepsList.reset(scenario.actions);
    });


    const dataResolver = (function () {
        const my = {};
        var projectResolved = {};
        var scenarioResolved = {};

        function dataEquals(data1, data2) {
            return data1.name === data2.name &&
                data1.value === data2.value &&
                data1.regex === data2.regex;
        }

        my.resolve = function (origin, name) {
            let resolved, dataSet;
            if (origin === "project") {
                resolved = projectResolved;
                dataSet = project.dataSet;
            } else {
                resolved = scenarioResolved;
                dataSet = scenario.dataSet;
            }

            try {
                return _resolve(dataSet, resolved, name, []);
            } catch (err) {
                if (typeof err === "string") {
                    throw err + ". Data \"" + name + "\" can not be resolved.";
                } else {
                    console.error("Error during data resolution: %O", err);
                    throw "Data resolution error";
                }
            }
        };

        function _resolve(dataSet, resolved, dataName, used) {
            let data = dataSet.getData(dataName);
            if (!data) {
                throw "Data \"" + dataName + "\" is missing";
            }

            // if resolved, and data has not been changed since resolved
            if (resolved[dataName] && dataEquals(resolved[dataName].data, data)) {
                return resolved[dataName].resolution;
            }

            // Check circular reference after checking if it is resolved, because
            // data might be referenced multiple times without cicular reference. If
            // if it is resolved it doesn't reach this point. It is only a cicular
            // reference only if it is used but not resolved.
            if (used.indexOf(dataName) >= 0) {
                throw "Data \"" + dataName + "\" is used in circular reference";
            }
            // Add to used before start resolving, because immediate children might
            // reference this data and cause a circulr reference.
            used.push(dataName);

            let originalString = data.value;
            if (!data.regex) {
                // If not regex, resolve as is
                resolved[dataName] = {
                    data: data,
                    resolution: originalString
                };
            } else {

                let matches = [];
                let regex = /(?:[^\\]|^)(?:\\\\)*(\$\{(\w+)\})/g;
                let m;
                // First get all matches, must use exec and change lastIndex, otherwise
                // can not capture overlapping matches (matching at least 1 char before ${)
                while (m = regex.exec(originalString)) {
                    matches.push(m);
                    regex.lastIndex = m.index + 1;
                }

                let result = "";
                let lastIndex = 0;
                // Resolve each match while building the result string
                // resolved valu may have different length than the ${data} length
                matches.forEach(function (match) {
                    let subName = match[2];
                    let subResolve = _resolve(dataSet, resolved, subName, used);

                    let subStartIndex = match[0].indexOf("${"); // get where ${ in the match
                    let startIndex = match.index + subStartIndex; // get where ${ in the whole string
                    let subEndIndex = match[0].lastIndexOf("}"); // get where } in the match
                    let endIndex = match.index + subEndIndex + 1; // get where } in the whole string, plus one to include it

                    // build up to where ${ start
                    result = result + originalString.substring(lastIndex, startIndex);
                    // add the resolved value, escape as plain string
                    result = result + (data.regex ? subResolve.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&") : subResolve);
                    // save where last ended
                    lastIndex = endIndex;
                });

                if (lastIndex < originalString.length) {
                    // add the rest of string after the last resolved data
                    result = result + originalString.substring(lastIndex, originalString.length);
                }

                resolved[dataName] = {
                    data: data,
                    resolution: new RandExp(result).gen()
                };
            }
            return resolved[dataName].resolution;
        }

        my.empty = function () {
            projectResolved = {};
            scenarioResolved = {};
        };

        return my;
    })();

    webview.addListener("eventData", function (action) {
        if (mode === 'edit') {
            handleNewAction(action);
        }
    });

    webview.addListener("initializeStop", function () {
        console.log("initializeStop");
        hidePageLoading();

        if (scenarioReady) {
            webviewCover.unblock().unmask();
        }
    });

    webview.addListener("initializeStart", function () {
        console.log("initializeStart");
        if (!getError().isRejected()) { // sometimes loadstart is fired (and therefore initializestart) after error
            showPageLoading();
            webviewCover.block("Please wait while your page is loading.").mask();
        }
    });

    webview.addListener("halt", function (msg) {
        setError(msg);
    });

    webview.addListener("urlChanged", function (url) {
        $("#scenario-url").text(url);
    });

    var initialize = function (se, de, url, base) {
        syncEngine = se;
        device = de;

        baseScenario = base;
        scenario = baseScenario.clone();
        startUrl = url;
        webviewContainer = $("#webview-container");
        pageStatus = $("#page-status");
        webviewCover.block("Please wait while your page is loading.").mask();
        syncEngine.getProjectByScenario(baseScenario).then(function (p) {
            if (p) {
                project = p;
            }
            if (project) {
                syncEngine.on("projectUpdated", function (p) {
                    project = p;
                });
            }
        });
    };

    scenarioController.initializeForEdit = function (se, de, url, base, saveCb) {
        initialize(se, de, url, base);
        saveCallback = saveCb;

        scenarioResult = ScenarioResult.createWithJson();

        mode = 'edit';
        savingResult = false;

        changedSinceLastSaved = false;

        webviewSelector = $(".webview-selector");
        webviewSelectorCancel = $(".webview-selector-cancel");
    };

    scenarioController.initializeForRun = function (se, de, url, base, baseRes, saving) {
        initialize(se, de, url, base);
        scenarioResult = baseRes;
        savingResult = saving;
        mode = 'run';
    };

    scenarioController.revertToLastSaved = function () {
        scenario = baseScenario.clone();
        changedSinceLastSaved = false;
    };

    scenarioController.clearAllSteps = function () {
        scenario.actions = [];
        changedSinceLastSaved = true;
    };

    scenarioController.stepUpdated = function () {
        changedSinceLastSaved = true;
        stepsList.reset(scenario.actions);
    };

    scenarioController.updateAction = function (action, fn) {
        let foundIndex = scenario.actions.indexOf(action);
        if (foundIndex >= 0) {
            scenario.actions[foundIndex] = fn(action);
            changedSinceLastSaved = true;
            stepsList.reset(scenario.actions);
        } else {
            console.error("Requested to update non-existed action: %O", action);
        }
    };

    /*
cb(err) - callback when reset is completed
        - err - error if any
*/
    scenarioController.reset = function (cb) {
        resetError();
        dataResolver.empty();

        scenarioResult.reset();
        saveResult();

        stepsList.reset(scenario.actions);
        scenarioReady = false;

        initializeWebView();

        Promise.race([getError(), webview.ready()]).then(function () {
            console.log("------------------ Webview is ready. Begin running steps. ------------------");
            scenarioController.rerun(function (err) {
                console.log("------------------ Run steps completed. ------------------");
                webviewCover.unmask().unblock();
                hidePageLoading();
                scenarioReady = true;
                cb(err);
            });
        }, function (err) {
            console.log("Page reached error state before running steps: %O", err);

            scenarioResult.actions = [];
            scenarioResult.actionResults = [];
            scenarioResult.fail();
            saveResult();

            webviewCover.unmask().unblock();
            hidePageLoading();
            scenarioReady = true;
            cb(err);
        });
    };

    scenarioController.rerun = function (cb) {
        scenarioResult.startTime = new Date();

        setTimeout(function () {
            scenarioResult.actions = scenario.actions;
            actionsManager.performActions(scenario, scenarioResult, function (error) {
                if (error) {
                    scenarioResult.fail();
                } else {
                    scenarioResult.pass();
                }
                saveResult();

                cb(error);
            });
        }, WAIT_BEFORE_RUN_STEPS_SECONDS * 1000);
    };

    scenarioController.createRunScenario = function () {
        return scenario.clone();
    };

    scenarioController.addBackStep = function () {
        scenarioController.addAction(BrowserAction.create("back"));
        webview.back();
    };

    scenarioController.addForwardStep = function () {
        scenarioController.addAction(BrowserAction.create("forward"));
        webview.forward();
    };

    scenarioController.addReloadStep = function () {
        scenarioController.addAction(BrowserAction.create("reload"));
        webview.reload();
    };

    scenarioController.captureSelection = function (cb) {
        webviewSelector.show();
        webviewContainer.addClass("webview-selector-container");

        var left = webviewContainer.offset().left + (webviewContainer.outerWidth() - $(".webview-selector-info").outerWidth()) / 2;
        $(".webview-selector-info").offset({left: left});

        var highlightHoveringElement = function (bounds) {
            webviewCover.clearHighlight();
            webviewCover.highlightRect(bounds);
        };
        webview.addListener("hover", highlightHoveringElement);

        webview.startCaptureSelection(function (element) {
            console.log("selected element " + (Boolean(element) ? element.toString() : 'none'));
            webviewSelector.hide();
            webviewContainer.removeClass("webview-selector-container");
            cb(element);

            // Capture one selection at a time
            webview.stopCaptureSelection();
            webview.off("hover", highlightHoveringElement);
            webviewCover.clearHighlight();
        });

        webviewSelectorCancel.one('click', function (e) {
            webview.stopCaptureSelection();
            webview.off("hover", highlightHoveringElement);
            webviewCover.clearHighlight();

            webviewSelector.hide();
            webviewContainer.removeClass("webview-selector-container");
            cb(null);
        });
    };

    scenarioController.saveScenario = function () {
        return saveCallback(scenario).then(function (s) {
                baseScenario = s;
                changedSinceLastSaved = false;
                scenarioController.showMessage("Scenario saved");
            }
        ).catch(function (err) {
            console.error("Error saving scenario: %O", err);
            scenarioController.showMessage("Saving scenario failed");
            return Promise.reject(err);
        });

    };

    scenarioController.hasUnsavedChanges = function () {
        return changedSinceLastSaved;
    };

    scenarioController.getCurrentUrl = function () {
        return webview.getCurrentUrl();
    };

    scenarioController.getDataSets = function () {
        if (project) {
            return {
                project: project.dataSet,
                scenario: scenario.dataSet
            };
        } else {
            return {
                scenario: scenario.dataSet
            };
        }
    };

    scenarioController.updateScenarioDataSet = function (dataSet) {
        scenario.dataSet = dataSet;
        changedSinceLastSaved = true;
    };

    scenarioController.insertString = function (element, string) {
        return webview.insertString(element, string);
    };

    var highlightElement = function (element) {
        console.log("highlight " + element.toString());
        webview.getElementCoordinates(element, function (rect) {
            if (rect) {
                webviewCover.highlightRect(rect);
            }
        });
    };

    var clearHighlight = function () {
        console.log("clear highlight");
        webviewCover.clearHighlight();
    };

    var handleNewAction = function (action) {
        if (mode === "edit" && scenarioReady) {
            console.log("got new action: %O", action);
            scenarioController.addAction(action);
        }
    };

    var initializeWebView = function () {
        webview.create({
            width: device.getWidth(scenario.deviceSize),
            height: windows.calculateWebviewHeight(),
            userAgent: device.getUserAgent(scenario.deviceSize)
        });
        webview.appendTo(webviewContainer);

        $("#scenario-url").text(startUrl);
        webview.navigate(startUrl);
    };

    var saveResult = function () {
        if (savingResult) {
            console.log("Saving Result: %O", scenarioResult);
            scenarioResult.save(syncEngine);
        }
    };

    scenarioController.showMessage = function (msg) {
        $.notify({
            icon: "fa fa-warning",
            message: ' ' + msg
        }, {
            type: "growl",
            allow_dismiss: false,
            placement: {
                from: "top",
                align: "right"
            },
            mouse_over: "pause",
            animate: {
                enter: 'animated fadeInDown',
                exit: 'animated fadeOutUp'
            },
            template: '<div data-notify="container" class="alert alert-{0}" role="alert">' +
            '<button type="button" aria-hidden="true" class="close" data-notify="dismiss">×</button>' +
            '<span data-notify="icon"></span> ' +
            '<span data-notify="title">{1}</span> ' +
            '<span data-notify="message">{2}</span>' +
            '<div class="progress" data-notify="progressbar">' +
            '<div class="progress-bar progress-bar-{0}" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100" style="width: 0%;"></div>' +
            '</div>' +
            '<a href="{3}" target="{4}" data-notify="url"></a>' +
            '</div>'
        });
    };

    var showPageLoading = function () {
        pageStatus.show();
    };

    var hidePageLoading = function () {
        pageStatus.hide();
    };

    scenarioController.addAction = function (action, options) {
        options = options || {};

        scenario.actions.push(action);
        changedSinceLastSaved = true;

        if (options.perform) {
            action.perform(webview,
                {dataResolve: dataResolver.resolve});
        }
        stepsList.reset(scenario.actions);
    };

    return scenarioController;
});

requirejs(["jquery", "bootstrap", "scenario/scenario_controller", "ScenarioResult", "Element", "windows", "utils", "bootstro", "q", "DataSet"], function ($, _b, scenarioController, ScenarioResult, Element, windows, utils, bootstro, Q, DataSet) {
    'use strict';

    const bootstroOptions = {
        nextButton: '<button class="btn btn-primary btn-mini bootstro-next-btn">Next <i class="fa fa-angle-double-right"></i></button>',
        prevButton: '<button class="btn btn-primary btn-mini bootstro-prev-btn"><i class="fa fa-angle-double-left"></i> Prev</button>',
        finishButtonText: "Skip Tutorial"
    };

    var device;

    $(function () {
        chrome.runtime.getBackgroundPage(function (bg) {
            device = bg.device;
            $(".js-scenario-device-size").append(device.getLabel(baseScenario.deviceSize));

            scenarioController.initializeForEdit(bg.syncEngine, device, startUrl, baseScenario, bg.syncEngine.addScenario);

            scenarioController.reset(function (err) {
                if (err) {
                    scenarioController.showMessage("Error setting up your webpage.");
                } else {
                    scenarioController.showMessage("Your webpage is ready.");
                }
            });

            if (!window.shownTutorial) {
                bootstro.start(".bootstro", bootstroOptions);
            }

            $(".js-link-doc").click(function (e) {
                // $(window).on("click", ".js-link-doc", function(e) {
                e.preventDefault();
                var url = bg.remoteHost + "/documentation/" + $(this).data("doc-section");
                var sub = $(this).data("doc-subsection");
                if (sub) {
                    url = url + "#" + sub;
                }
                window.open(url);
            });
        });

        $("#scenario-name").text(baseScenario.name);

        $(".modal-hints").on("click", function (e) {
            e.preventDefault();
            $($(this).data("target")).toggle();
        });

        const resetComponent = (function () {
            const resetButton = $("#reset-btn");
            const resetModal = $("#reset-modal");
            const resetForm = $("#reset-form");
            const optionLastSaved = $("#reset-options-last-saved");
            const optionClear = $("#reset-options-clear");
            const optionRerun = $("#reset-options-rerun");

            resetForm.submit(function (e) {
                e.preventDefault();

                resetModal.modal('hide');
                if (optionClear.is(":checked")) {
                    scenarioController.clearAllSteps();
                } else if (optionLastSaved.is(":checked")) {
                    scenarioController.revertToLastSaved();
                }

                console.log("-------------- Reset is requested ---------------");
                scenarioController.reset(function (err) {
                    if (err) {
                        scenarioController.showMessage("Error setting up your webpage.");
                    } else {
                        scenarioController.showMessage("Your webpage is ready.");
                    }
                });
            });

            resetModal.on("show.bs.modal", function (e) {
                optionRerun.prop("checked", true);
            });
        })();

        var runButton = document.querySelector('#test-run-btn');
        runButton.addEventListener("click", function () {
            var testrunScenario = scenarioController.createRunScenario();
            delete testrunScenario.key;
            windows.openScenarioWindowForRun(device, testrunScenario,
                {
                    hidden: false
                },
                function (createdWindow) {
                    createdWindow.contentWindow.baseScenario = testrunScenario;
                    createdWindow.contentWindow.baseScenarioResult = ScenarioResult.createWithJson();
                    createdWindow.contentWindow.startUrl = startUrl;
                    createdWindow.contentWindow.savingResult = false;
                    createdWindow.contentWindow.hideForWindowClose = false;
                });
        });

        var saveButton = document.querySelector('#save-btn');
        saveButton.addEventListener("click", function () {
            scenarioController.saveScenario();
        });

        const VerifyTextComponent = (function () {
            const verifyTextButton = $("#verify-text-btn");
            const verifyTextForm = $("#verify-text-form");
            const verifyTextInput = $("#verify-text-input");
            const caseSensitiveCheckbox = $("#verify-text-case-insensitive");
            const notExistCheckbox = $("#verify-text-not-exist");
            const elementsSelectionTitle = $("#verify-text-elements-selection-title");
            const elementAnywhereRadio = $("#verify-text-element-anywhere");
            const elementSelectRadio = $("#verify-text-element-select");
            const selectedElementDiv = $("#verify-text-selected-element");
            const elementSelectAnother = $("#verify-text-element-select-another");
            const verifyTextModal = $("#verify-text-modal");
            const verifyTextError = $("#verify-text-error");

            const my = {};
            let editVerifyTextDeferred;
            let selectedElement = null;

            my.editVerifyText = function (action) {
                verifyTextInput.val(action.text);
                caseSensitiveCheckbox.prop("checked", action.insensitive);
                notExistCheckbox.prop("checked", action.not);
                setElementsSelectionTitle();
                setSelectedElement(action.element);
                verifyTextError.html('');

                editVerifyTextDeferred = Q.defer();
                editVerifyTextDeferred.promise.finally(function () {
                    verifyTextModal.modal("hide");
                });
                verifyTextModal.modal("show");
                return editVerifyTextDeferred.promise;
            };

            verifyTextButton.click(function () {
                my.editVerifyText(VerifyTextAction.create(null, "", false, false))
                    .then(function (action) {
                        scenarioController.addAction(action);
                    });
            });

            function getSelectedElement() {
                return selectedElement;
            }

            function setSelectedElement(element) {
                if (element) {
                    selectedElement = element;
                    elementSelectRadio.prop("checked", true);
                    selectedElementDiv.html(selectedElement.toString());
                    elementSelectAnother.show();
                } else {
                    // User didn't choose any element
                    if (getSelectedElement() === null) {
                        // There weren't any element selected before
                        // set it back to default
                        elementAnywhereRadio.prop("checked", true);
                        selectedElementDiv.text("<none>");
                    }
                }
            }

            elementSelectRadio.change(function (e) {
                e.preventDefault();

                if ($(this).is(":checked") && !getSelectedElement()) {
                    // if choosing to select a element for the first time
                    scenarioController.captureSelection(function (element) {
                        setSelectedElement(element);
                    });
                }
            });

            elementSelectAnother.click(function (e) {
                e.preventDefault();

                scenarioController.captureSelection(function (element) {
                    setSelectedElement(element);
                });
            });

            verifyTextForm.submit(function (e) {
                e.stopPropagation();
                e.preventDefault();

                let searchString;

                if ((searchString = verifyTextInput.val()) !== '') {
                    let element = null; // null mean anywhere
                    if (elementSelectRadio.is(":checked")) {
                        element = getSelectedElement();
                    }
                    editVerifyTextDeferred.resolve(
                        VerifyTextAction.create(element,
                            searchString,
                            caseSensitiveCheckbox.is(":checked"),
                            notExistCheckbox.is(":checked")));
                } else {
                    verifyTextError.text("Text for verification required.");
                }
            });

            notExistCheckbox.change(function (e) {
                e.preventDefault();
                setElementsSelectionTitle();
            });

            var setElementsSelectionTitle = function () {
                if (notExistCheckbox.is(":checked")) {
                    elementsSelectionTitle.text("The text should not appear:");
                } else {
                    elementsSelectionTitle.text("The text should appear:");
                }
            };

            function reset() {
                verifyTextInput.val('');
                caseSensitiveCheckbox.prop("checked", false);
                notExistCheckbox.prop("checked", false);
                setElementsSelectionTitle();
                elementAnywhereRadio.prop("checked", true);
                selectedElementDiv.text("<none>");
                selectedElement = null;
                elementSelectAnother.hide();
                verifyTextError.html('');
            }

            verifyTextModal.on("show.bs.modal", function () {
                verifyTextInput.focus();
                elementSelectAnother.hide();
                verifyTextError.html('');
            });

            verifyTextModal.on("hidden.bs.modal", reset);

            return my;
        })();

        const waitTimeComponent = (function () {
            const waitTimeButton = $("#wait-time-btn");
            const waitTimeForm = $("#wait-time-form");
            const waitTimeSelect = $("#wait-time-select");
            const waitTimeModal = $("#wait-time-modal");
            const my = {};

            let editStepDeferred = null;

            my.editWaitTime = function (waitTimeAction) {
                waitTimeSelect.val(waitTimeAction.seconds);
                editStepDeferred = Q.defer();
                editStepDeferred.promise.finally(function () {
                    waitTimeModal.modal("hide");
                });
                waitTimeModal.modal("show");
                return editStepDeferred.promise;
            };

            waitTimeButton.click(function () {
                my.editWaitTime(WaitTimeAction.create())
                    .then(function (action) {
                        scenarioController.addAction(action);
                    });
            });

            waitTimeForm.submit(function (e) {
                e.stopPropagation();
                e.preventDefault();
                editStepDeferred.resolve(WaitTimeAction.create(parseInt(waitTimeSelect.val(), 10)));
            });

            function reset() {
                waitTimeSelect.children().first().prop("selected", true);
            }

            waitTimeModal.on("hidden.bs.modal", reset);

            return my;
        })();

        const closeComponent = (function () {
            let closeBtn = $(".js-close");
            let closeForm = $("#close-form");
            let closeModal = $("#close-modal");
            let closeWithoutSaveBtn = $("#close-not-save-btn");

            closeForm.submit(function () {
                scenarioController.saveScenario().then(function () {
                    chrome.app.window.current().close();
                });
            });
            closeWithoutSaveBtn.click(function () {
                chrome.app.window.current().close();
            });
            closeBtn.on("click", function (e) {
                if (scenarioController.hasUnsavedChanges()) {
                    closeModal.modal("show");
                } else {
                    chrome.app.window.current().close();
                }
            });
        })();

        const verifyUrlComponent = (function () {
            const my = {};

            const modal = $("#verify-url-modal");
            const verifyUrlButton = $("#verify-url-btn");
            const verifyUrlForm = modal.find("#verify-url-form");
            const currentUrl = modal.find("#verify-url-current-url");
            const verifyHost = modal.find("#verify-url-host");
            const verifyPath = modal.find("#verify-url-path");
            const mismatchWarning = modal.find("#verify-url-mismatch-current-url");
            const invalidRegex = modal.find("#verify-url-invalid-regex");
            const useRegexCheckBox = modal.find("#verify-url-use-regex");
            const submitBtn = modal.find("#verify-url-submit-btn");

            let editVerifyUrlDeferred;

            my.editVerifyUrl = function (verifyUrlAction) {
                let uri = new URI(scenarioController.getCurrentUrl());
                currentUrl.val(uri.toString());
                verifyHost.text(uri.scheme() + "://" + uri.authority() + "/");

                verifyPath.val(verifyUrlAction.path);
                useRegexCheckBox.prop("checked", !!verifyUrlAction.regex);
                mismatchWarning.hide();
                invalidRegex.hide();

                editVerifyUrlDeferred = Q.defer();
                editVerifyUrlDeferred.promise.finally(function () {
                    modal.modal("hide");
                });
                modal.modal("show");
                return editVerifyUrlDeferred.promise;
            };

            verifyUrlButton.click(function () {
                let uri = new URI(scenarioController.getCurrentUrl());
                my.editVerifyUrl(VerifyUrlAction.create(uri.resource().slice(1), false))
                    .then(function (verifyUrlAction) {
                        scenarioController.addAction(verifyUrlAction);
                    });
            });

            modal.on("shown.bs.modal", function () {
                verifyPath.focus();
            });

            verifyUrlForm.submit(function (e) {
                e.stopPropagation();
                e.preventDefault();

                if (checkPath()) {
                    editVerifyUrlDeferred.resolve(VerifyUrlAction.create(verifyPath.val(),
                        useRegexCheckBox.is(":checked")));
                }
            });

            let checkPath = function () {
                if (verifyPath.val() === "") {
                    mismatchWarning.hide();
                } else {
                    var currentResource = new URI(scenarioController.getCurrentUrl()).resource();
                    if (currentResource.toString().startsWith("/")) {
                        currentResource = currentResource.slice(1);
                    }

                    var match = false;
                    if (useRegexCheckBox.is(":checked")) {
                        var regex = utils.isValidRegex("^" + verifyPath.val() + "$", "i");

                        if (regex) {
                            invalidRegex.hide();
                            match = regex.test(currentResource);
                        } else {
                            mismatchWarning.hide();
                            invalidRegex.show();
                            submitBtn.prop("disabled", true);
                            return false;
                        }
                    } else {
                        match = (currentResource.toUpperCase() === verifyPath.val().toUpperCase());
                    }

                    if (match) {
                        mismatchWarning.hide();
                    } else {
                        mismatchWarning.show();
                    }
                }

                submitBtn.prop("disabled", false);
                return true;
            };

            verifyPath.on("input", checkPath);
            useRegexCheckBox.change(checkPath);

            return my;
        }());

        const browserComponent = (function () {

            let backBtn = $("#browser-back-btn");
            let forwardBtn = $("#browser-forward-btn");
            let reloadBtn = $("#browser-reload-btn");
            let hoverBtn = $("#browser-hover-btn");

            backBtn.click(function () {
                scenarioController.addBackStep();
            });

            forwardBtn.click(function () {
                scenarioController.addForwardStep();
            });

            reloadBtn.click(function () {
                scenarioController.addReloadStep();
            });

            hoverBtn.click(function () {
                scenarioController.captureSelection(function (element) {
                    if (element) {
                        scenarioController.addAction(BrowserAction.create("hover", {element: element}));
                    }
                });
            });
        }());

        const editStepComponent = (function () {
            let my = {};
            let modal = $("#edit-step-modal");
            let form = $("#edit-step-form");
            let locateElementRadio = $("input[name=edit-step-radio-group-locate-element]:radio");
            let locateElementRadioElementId = $("#edit-step-radio-element-id");
            let locateElementTextElementId = $("#edit-step-text-element-id");

            let locateElementRadioCssSelector = $("#edit-step-radio-css-selector");
            let locateElementTextCssSelector = $("#edit-step-text-css-selector");

            let locateElementRadioXPath = $("#edit-step-radio-xpath");
            let locateElementTextXPath = $("#edit-step-text-xpath");

            let editStepError = $("#edit-step-error");

            let editingStep = null;

            var enableLocatorMethod = function (locatorMethod) {
                switch (locatorMethod) {
                    case "id":
                        locateElementRadioElementId.prop("checked", true);
                        locateElementRadioCssSelector.prop("checked", false);
                        locateElementRadioXPath.prop("checked", false);
                        locateElementTextElementId.prop("disabled", false);
                        locateElementTextCssSelector.prop("disabled", true);
                        locateElementTextXPath.prop("disabled", true);
                        break;
                    case "css":
                        locateElementRadioElementId.prop("checked", false);
                        locateElementRadioCssSelector.prop("checked", true);
                        locateElementRadioXPath.prop("checked", false);
                        locateElementTextElementId.prop("disabled", true);
                        locateElementTextCssSelector.prop("disabled", false);
                        locateElementTextXPath.prop("disabled", true);
                        break;
                    case "xpath":
                        locateElementRadioElementId.prop("checked", false);
                        locateElementRadioCssSelector.prop("checked", false);
                        locateElementRadioXPath.prop("checked", true);
                        locateElementTextElementId.prop("disabled", true);
                        locateElementTextCssSelector.prop("disabled", true);
                        locateElementTextXPath.prop("disabled", false);
                        break;
                    default:
                        console.log("Unknown locatorMethod" + locatorMethod);
                }
            };

            my.editStep = function (step) {
                let element = step.element();

                if (element) {
                    locateElementTextElementId.val(element.id ? element.id : "");
                    locateElementTextCssSelector.val(element.cssSelector ? element.cssSelector : "");
                    locateElementTextXPath.val(element.xpath ? element.xpath : "");

                    if (element.locatorMethod) {
                        enableLocatorMethod(element.locatorMethod);
                    } else {
                        // No locatorMethod, which mean user has not set it yet.
                        // Use id if exist, otherwise use css selector.
                        if (element.id) {
                            enableLocatorMethod("id");
                        } else {
                            enableLocatorMethod("css");
                        }
                    }
                } else {
                    // Step has no element. Should not be in here for now.
                    locateElementRadioElementId.prop("disabled", true);
                    locateElementRadioCssSelector.prop("disabled", true);
                    locateElementRadioXPath.prop("disabled", true);
                }

                editingStep = step;

                editStepError.text("");
                modal.modal("show");
            };

            locateElementRadio.change(function () {
                if (locateElementRadioElementId.is(":checked")) {
                    enableLocatorMethod("id");
                } else if (locateElementRadioCssSelector.is(":checked")) {
                    enableLocatorMethod("css");
                } else if (locateElementRadioXPath.is(":checked")) {
                    enableLocatorMethod("xpath");
                }
            });

            form.submit(function (e) {
                e.preventDefault();

                if (locateElementRadioElementId.is(":checked")) {
                    if (locateElementTextElementId.val() === "") {
                        editStepError.text("Element Id is required");
                        return;
                    }
                } else if (locateElementRadioCssSelector.is(":checked")) {
                    if (locateElementTextCssSelector.val() === "") {
                        editStepError.text("CSS Selector is required");
                        return;
                    }
                } else if (locateElementRadioXPath.is(":checked")) {
                    if (locateElementTextXPath.val() === "") {
                        editStepError.text("XPath is required");
                        return;
                    }
                }

                if (locateElementRadioElementId.is(":checked")) {
                    editingStep.editElement(function (element) {
                        element.locatorMethod = "id";
                        element.id = locateElementTextElementId.val();
                    });
                } else if (locateElementRadioCssSelector.is(":checked")) {
                    editingStep.editElement(function (element) {
                        element.locatorMethod = "css";
                        element.cssSelector = locateElementTextCssSelector.val();
                    });
                } else if (locateElementRadioXPath.is(":checked")) {
                    editingStep.editElement(function (element) {
                        element.locatorMethod = "xpath";
                        element.xpath = locateElementTextXPath.val();
                    });
                }
                scenarioController.stepUpdated();
                modal.modal("hide");
            });

            return my;
        })();

        const dataInsertComponent = (function () {
            const dataInsertButton = $("#data-insert-btn");
            const dataInsertModal = $("#data-insert-modal");
            const dataInsertForm = $("#data-insert-form");
            const dataInsertError = $("#data-insert-error");
            const dataInsertDataSelectMenu = $("#data-insert-data-select");
            const dataSelectProjectData = dataInsertDataSelectMenu.find("#project-data-option-group");
            const dataSelectScenarioData = dataInsertDataSelectMenu.find("#scenario-data-option-group");

            const elementSelectBtn = $("#data-insert-element-select");
            const selectedElementName = $("#data-insert-selected-element-name");

            const dataInsertManageData = $("#data-insert-manage-data");

            var selectedElement = null;
            var dataInsertDeferred;

            const my = {};

            dataInsertButton.click(function (e) {
                e.preventDefault();
                dataInsertComponent.insertData(DataInsertAction.create(null, null))
                    .then(function (action) {
                        scenarioController.addAction(action, {perform: true});
                    });
            });

            my.insertData = function (action) {
                let dataSets = scenarioController.getDataSets();

                dataSelectProjectData.empty();
                dataSelectScenarioData.empty();
                if (dataSets.project) {
                    if (dataSets.project.count > 0) {
                        dataSets.project.forEach(function (data) {
                            dataSelectProjectData.append($("<option />", {value: data.name}).text(data.name));
                        });
                    } else {
                        dataSelectProjectData.append($("<option />", {disabled: "disabled"}).text("<none>"));
                    }
                }
                if (dataSets.scenario.count > 0) {
                    dataSets.scenario.forEach(function (data) {
                        dataSelectScenarioData.append($("<option />", {value: data.name}).text(data.name));
                    });
                } else {
                    dataSelectScenarioData.append($("<option />", {disabled: "disabled"}).text("<none>"));
                }

                if (action.dataName) {
                    let option;
                    if (action.dataOrigin === "project") {
                        option = dataSelectProjectData.children("option[value='" + action.dataName + "']");
                    } else {
                        option = dataSelectScenarioData.children("option[value='" + action.dataName + "']");
                    }
                    if (option[0]) {
                        option.attr("selected", "selected");
                    } else {
                        console.error("Editing DataInsertAction data does not exist anymore. Ignoring.");
                    }
                }
                setSelectedElement(action.element);

                dataInsertDeferred = Q.defer();
                dataInsertModal.modal("show");
                return dataInsertDeferred.promise;
            };

            dataInsertForm.submit(function (e) {
                e.preventDefault();
                e.stopPropagation();

                let selectedDataOption = dataInsertDataSelectMenu.find(":selected");

                let origin;
                if ($.contains(dataSelectProjectData[0], selectedDataOption[0])) {
                    origin = "project";
                } else if ($.contains(dataSelectScenarioData[0], selectedDataOption[0])) {
                    origin = "scenario";
                } else {
                    dataInsertError.text("Please select data to insert");
                    return;
                }

                if (!selectedElement) {
                    dataInsertError.text("Please select an element");
                    return;
                }

                dataInsertDeferred.resolve(
                    DataInsertAction.create(selectedElement, origin, selectedDataOption.val()));

                dataInsertModal.modal("hide");
            });

            elementSelectBtn.click(function (e) {
                e.preventDefault();

                scenarioController.captureSelection(function (element) {
                    if (element) {
                        setSelectedElement(element);
                    }
                });
            });

            dataInsertModal.on("hidden.bs.modal", function (e) {
                dataInsertError.text('');
                selectedElementName.text("<none>");
                selectedElement = null;
                dataInsertDataSelectMenu[0].selectedIndex = 0;
            });

            function setSelectedElement(element) {
                selectedElement = element;
                selectedElementName.html(element ? element.toString() : "&lt;none&gt;");
            }

            dataInsertManageData.click(function (e) {
                e.preventDefault();

                dataInsertModal.modal("hide");
                dataManageComponent.show();
            });

            return my;
        })();

        const dataManageComponent = (function () {
            const dataManageModal = $("#data-manage-modal");
            const dataManageTBody = $("#data-manage-table > tbody");
            const dataManageError = $("#data-manage-error");
            const dataManageForm = $("#data-manage-form");
            const dataManageHelp = $("#data-manage-help");

            const dataManageAddForm = $("#data-manage-add-form");
            const dataManageAddName = $("#data-manage-add-name");
            const dataManageAddValue = $("#data-manage-add-value");
            const dataManageAddRegex = $("#data-manage-add-regex");

            const my = {};

            dataManageAddForm.submit(function (e) {
                e.preventDefault();

                if (dataManageAddName.val() === "") {
                    dataManageError.text("Data name is required to add new data");
                    return;
                }
                dataManageError.text("");

                let newRow = createRow(
                    dataManageAddName.val(),
                    dataManageAddValue.val(),
                    dataManageAddRegex.is(":checked"));
                dataManageTBody.append(newRow);
                dataManageAddName.val('');
                dataManageAddValue.val('');
                dataManageAddRegex.prop("checked", false);
            });

            dataManageModal.on("show.bs.modal", function (e) {
                dataManageError.text("");

                let dataSets = scenarioController.getDataSets();
                dataManageTBody.empty();
                dataSets.scenario.forEach(function (data) {
                    dataManageTBody.append(createRow(data.name, data.value, data.regex));
                });
                dataManageAddName.val('');
                dataManageAddValue.val('');
                dataManageAddRegex.val('');
            });

            dataManageForm.submit(function (e) {
                e.preventDefault();

                clearDataRowError();

                let dataArray =
                    dataManageTBody.children('tr.data-manage-added-data').map(function (index, tr) {
                        return {
                            name: $(tr).find(".data-manage-data-name input").val(),
                            value: $(tr).find(".data-manage-data-value input").val(),
                            regex: $(tr).find(".data-manage-data-regex input").is(":checked")
                        };
                    }).toArray();

                if (dataArray.find(function (d, index) {
                        if (!d.name) {
                            showDataRowError(index, "Data name is required");
                            return true;
                        }
                        let err = DataSet.isDataValid(d);
                        if (err) {
                            showDataRowError(index, err);
                            return true;
                        }
                        return false;
                    })) {
                    return;
                }

                for (let i = 0; i < dataArray.length - 1; i++) {
                    for (let j = i + 1; j < dataArray.length; j++) {
                        if (dataArray[i].name === dataArray[j].name) {
                            showDataRowError(i, "Data name can not be used more than once");
                            showDataRowError(j, "Data name can not be used more than once");
                            return;
                        }
                    }
                }

                let dataSet = DataSet.createWithJson({});
                Promise.all(dataArray.map(function (d, index) {
                    return dataSet.addData(d).catch(function (err) {
                        dataManageTBody.find("tr:nth-child(" + (index + 1) + ")").addClass('danger');
                        dataManageError.text(err);
                        return Promise.reject(err);
                    });
                })).then(function () {
                    scenarioController.updateScenarioDataSet(dataSet);
                    dataManageModal.modal("hide");
                });
            });

            dataManageTBody.on("click", ".js-remove-data", function (e) {
                e.preventDefault();
                $(e.target).closest('tr', dataManageTBody).remove();
            });

            function createRow(name, value, regex) {
                let row = $("<tr />", {"class": "data-manage-added-data"}).append(
                    $("<td />", {"class": "data-manage-data-name"}).append(
                        $("<input />", {"value": name, "class": "form-control"})),
                    $("<td />", {"class": "data-manage-data-value"}).append($("<input />", {
                        "value": value,
                        "class": "form-control"
                    })),
                    $("<td />", {"class": "data-manage-data-regex"}).append(
                        $("<input />", {type: "checkbox"}).prop("checked", regex)),
                    $("<td />", {"title": "Remove", "class": "js-remove-data"}).append(
                        $("<button />", {"class": "btn btn-danger btn-sm"}).text("Remove"))
                );
                return row;
            }

            function clearDataRowError() {
                dataManageTBody.children('tr').removeClass("danger");
                dataManageError.text('');
            }

            function showDataRowError(rowIndex, error) {
                dataManageTBody.find("tr:nth-child(" + (rowIndex + 1) + ")").addClass("danger");
                dataManageError.text(error);
            }

            my.show = function () {
                dataManageModal.modal("show");
            };

            return my;
        })();

        scenarioController.addListener("editStep", function (step) {
            if (step.type === "MouseStep" || step.type === "KeyStep" || step.type === "TabStep") {
                editStepComponent.editStep(step);
            } else if (step.type === "SingleActionStep") {
                if (step.action.is(WaitTimeAction)) {
                    waitTimeComponent.editWaitTime(step.action).then(function (waitTimeAction) {
                        scenarioController.updateAction(step.action, function () {
                            return waitTimeAction;
                        });
                    });
                } else if (step.action.is(VerifyUrlAction)) {
                    verifyUrlComponent.editVerifyUrl(step.action).then(function (verifyUrlAction) {
                        scenarioController.updateAction(step.action, function () {
                            return verifyUrlAction;
                        });
                    });
                } else if (step.action.is(VerifyTextAction)) {
                    VerifyTextComponent.editVerifyText(step.action).then(function (action) {
                        scenarioController.updateAction(step.action, function () {
                            return action;
                        });
                    });
                } else if (step.action.is(DataInsertAction)) {
                    dataInsertComponent.insertData(step.action).then(function (action) {
                        scenarioController.updateAction(step.action, function () {
                            return action;
                        });
                    });
                } else {
                    console.error("Unknown SingleActionStep action for edit: %O", step);
                }
            } else {
                console.error("Unknown step type for edit: %O", step);
            }
        });

        $(".js-home").on("click", function (e) {
            windows.openHomeWindow();
        });

        $(".js-tutorial-start").on("click", function (e) {
            bootstro.start(".bootstro", bootstroOptions);
        });

    });
});

define("scenario/new_scenario", function () {});