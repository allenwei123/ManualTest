/*
  This script is executed by webview.executeScript and run in the embedded webpage
  *isolated world*, seperated from the webpage's js *main* world.

  Two function of this script:
  1) Load the needed js in the webpage main world, by creating a <script> node and
      set src to 1) localhost, which the app has a http server listen on and serve the
      files, if url is http; or 2) manualtest.io, which serve the scripts on /app, if https
  2) Act as a communication bridge between the app and the embedded's main world. 
      Messages from app are passed to the webpage and vice verse. It talks with the
      app using postMessage on window object. It talks with the main world js using 
      CustomEvent and set the message on the event's detail.

      All sync/ack features should be implemented by both ends of the bridge, this only
      act as a relay.

*/

var logging = false;

var MESSAGE_TYPE_FROM_INJECT = "fromInject";
var MESSAGE_TYPE_TO_INJECT = "toInject";

var httpScripts = ["http://127.0.0.1:6030/js/models/Element.js",

                   "http://127.0.0.1:6030/js/models/action.js",
                   "http://127.0.0.1:6030/js/core/page.js"];
const manifest = chrome.runtime.getManifest();

var httpsScripts = ["https://manualtest.io/app/" + manifest.version + "/Element.js",

                    "https://manualtest.io/app/" + manifest.version + "/action.js",
                    "https://manualtest.io/app/" + manifest.version + "/page.js"];


var appWindow = null; // Used to post messages to app
var appOrigin = null; // Used to identify message from app

var log = function() {
  if (logging) {
    var args = Array.prototype.slice.call(arguments);
    args[0] = "inject.js: " + args[0];
    console.log.apply(console, args);
  }
};

// Send message to app
var sendToApp = function(msg) {
  log("from inject to app: %s %O", msg.type, msg);

  // appPort.postMessage(msg);
  if (appWindow) {
    appWindow.postMessage(msg, "*");
  } else {
    log("waiting for pingInject to reply to app");
    setTimeout(sendToApp.bind(this, msg), 500);
  }
};
// Message from the app are passed to the webpage
var appMessageHandler = function(message) {
  log("from app to page: %O", message);
  var myEvent = new CustomEvent(MESSAGE_TYPE_FROM_INJECT, { detail: message });
  document.dispatchEvent(myEvent);
};
window.addEventListener("message", function(e) {
  if (e.data.type === "pingInject") {
    log("received pingInject");
    appWindow = e.source;
    appOrigin = e.origin;
  } else {
    log("received message: %O", e);
    if (e.origin === appOrigin) {
      appMessageHandler(e.data);
    }
  }
});


// Message from the webpage are passed to the app
var pageMessageHandler = function(e) {
  log("from page to inject: %s %O", e.detail.type, e.detail);
  sendToApp(e.detail);
};
document.addEventListener(MESSAGE_TYPE_TO_INJECT, pageMessageHandler);


var loadScripts;
if (window.location.href.slice(0, 7).toLowerCase() === "http://") {
  loadScripts = httpScripts;
} else if (window.location.href.slice(0, 8).toLowerCase() === "https://") {
  loadScripts = httpsScripts;
} else {
  loadScripts = [];
}

var loadedCount = 0;
var loadHandler = function() {
  loadedCount += 1;

  if (loadedCount >= loadScripts.length + 1 /* all scripts loaded and document is loaded */) {
    sendToApp({type: "injectionLoaded"});
  }
};

if (document.readyState === "complete") {
  log("document already complete");
  loadHandler();
} else {
  document.onload = function() {
    log('document loaded');
    loadHandler();
  };
}

var injectScripts = function() {
  var i;

  var fn = function(scriptName) {
      log(scriptName + " loaded");
      loadHandler();
    };

  for (i = 0; i < loadScripts.length; i++) {
    var s = document.createElement('script');
    s.src = loadScripts[i];
    s.onload = fn.bind(null, loadScripts[i]);
    // Ideally append to head, but it is not always there.
    (document.head||document.body).appendChild(s);
  }

};

injectScripts();
