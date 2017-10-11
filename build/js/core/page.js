const MESSAGE_TYPE_FROM_INJECT = "fromInject";
const MESSAGE_TYPE_TO_INJECT = "toInject";


Array.prototype._mt_contain = function(comparison) {
  for(var i = 0; i < this.length; i++) {
    if (comparison === this[i]) {
      return true;
    }
  }
  return false;
};

if (window['_pageLoaded'] === undefined) {
  console.log('load page');
  window['_pageLoaded'] = true;

  var captureSelection = false;
  var stopRecording = false;

  var createKeyboardEvent = function(keyboardEvent) {
    var oEvent = document.createEvent('KeyboardEvent');

    // Chromium Hack
    Object.defineProperty(oEvent, 'keyCode', {
      get : function() {
          return this.keyCodeVal;
      }
    });
    Object.defineProperty(oEvent, 'which', {
      get : function() {
          return keyboardEvent.options.which;
      }
    });
    Object.defineProperty(oEvent, 'repeat', {
      get: function() {
        return keyboardEvent.options.repeat;
      }
    });

    if (oEvent.initKeyboardEvent) {
      // type, bubbles, cancelable, view, keyIdentifier, keyLocation, ctrl, alt, shift, meta
      oEvent.initKeyboardEvent(keyboardEvent.type, true, true, document.defaultView,
                                keyboardEvent.options.keyIdentifier,
                                keyboardEvent.options.keyLocation,
                                keyboardEvent.options.ctrlKey,
                                keyboardEvent.options.altKey,
                                keyboardEvent.options.shiftKey,
                                keyboardEvent.options.metaKey);
    } else {
      oEvent.initKeyEvent(keyboardEvent.type, true, true, document.defaultView, false, false, false, false, keyboardEvent.options.keyCode, 0);
    }

    oEvent.keyCodeVal = keyboardEvent.options.keyCode;
    oEvent.repeat = keyboardEvent.options.repeat;

    if (oEvent.keyCode !== keyboardEvent.options.keyCode) {
      console.error("keyCode mismatch " + oEvent.keyCode + "(" + oEvent.which + ")");
    }

    return oEvent;
  };

  var events = ["mousedown", "mouseup", "click", "keydown", "keypress", "keyup", "input", "textInput", "change", "submit"];
  var eventHandler = function(e) {
    if (!stopRecording && !e._fromManualTest) {
      if (captureSelection && ["mousedown", "mouseup", "click"]._mt_contain(e.type)) {
        // Currently capturing user selection. Override user's click.
        console.log("Capturing selection. Override event: " + e.type);
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        if (e.type === 'click') {
          // Reply user clicked element
          var element = Element.createWithDOMElement(e.target);
          messageHandler.postMessage('selectResult', JSON.stringify(element));
        }
        return false;
      } else {
        var eventData = EventData.createWithEvent(e);
        messageHandler.postMessage("eventData", JSON.stringify(eventData));
      }
    }
  };
  events.forEach(function(eventType) {
    document.removeEventListener(eventType, eventHandler);
    document.addEventListener(eventType, eventHandler, true);
  });


  var messageHandler = {
    callbacks: {},
    messageQueue: [],
    parent: null,
    postMessage: function(messageType, messageContent) {
        messageHandler._sendMessage(
          {
            type: messageType,
            result: messageContent
          });
    },
    _sendMessage: function(message) {
      var myEvent = new CustomEvent(MESSAGE_TYPE_TO_INJECT,
                                    { detail: message });
      document.dispatchEvent(myEvent);
    },
    // Handler message received from webview.
    // if message match for a registered listener, invoke the callback
    receiveMessage: function(e) {
      if (!e.detail || !e.detail.type) {
        console.log(["unknown message", e]);
        return;
      }

      var message = e.detail;

      var replyCb = function(messageType, messageId, messageContent) {
        messageHandler._sendMessage({
          type: messageType,
          messageId: messageId,
          result: messageContent
        });
      };
      if (message.type in messageHandler.callbacks) {
        messageHandler.callbacks[message.type](message, replyCb.bind(null, message.type, message.messageId));
      } else {
        console.error("Unknown message type %s: %O", message.type, message);
      }
    },
    // Register a listener for certain type of message
    // type - the type of message the listener is waiting on
    // cb - the function to call when the message is received
    // cb in the form of function(messageContent, replyCb)
    //    messageContent is content received
    //    replyCb is used optionally to reply to sender
    registerListener: function(type, cb) {
      this.unregisterListener(type);
      this.callbacks[type] = cb;
    },
    unregisterListener: function(type) {
      delete this.callbacks[type];
    }
  };
  document.removeEventListener(MESSAGE_TYPE_FROM_INJECT, messageHandler.receiveMessage);
  document.addEventListener(MESSAGE_TYPE_FROM_INJECT, messageHandler.receiveMessage);

  messageHandler.registerListener('ping', function(message, replyCb) {
    replyCb(null);
  });

  var standingReturnResults;
  window.onbeforeunload = function(e) {
    if (standingReturnResults) {
      console.log("returning results");
      standingReturnResults();
    }
    e.returnValue = 'done';
    return 'done';
  };

  messageHandler.registerListener("performEvents", function(data, replyCb) {
    var events = JSON.parse(data.value).map(function(a) { return EventData.createWithJson(a); });
    var results = [], dispatchingEvents;

    console.log("Received request to perform events: %O", events);

    Promise.all(events.map(function(eventData) {
      return eventData.element.getDOMElement();
    })).then(function(domElements) {
      var errorMessage;
      for (var i = 0; i < events.length; i++) {
        errorMessage = events[i].prepareElement(domElements[i]);

        if (errorMessage) {
          replyCb(JSON.stringify([ActionResult.create(false, errorMessage)]));
          return;
        }
      }

      dispatchingEvents = events.map(function(e) {
        var evt = e.generateDispatchEvent();
        evt._fromManualTest = true;
        results.push(ActionResult.create(true));
        return evt;
      });

      var resultsReturned = false;
      standingReturnResults = function() {
        resultsReturned = true;
        replyCb(JSON.stringify(results));
        standingReturnResults = null;
      };
      for (i = 0; i < events.length; i++) {
        events[i].element.setSelectionOnDOMElement(domElements[i]);
        console.log("dispatching: %O on %O", dispatchingEvents[i], domElements[i]);
        domElements[i].dispatchEvent(dispatchingEvents[i]);
      }
      if (!resultsReturned) {
        standingReturnResults();
      }
    }).catch(function(err) {
      if (typeof err === "string") {
        console.error("error getting domElements: %O", err);
        replyCb(JSON.stringify([ActionResult.create(false, err)]));
      } else {
        // An unhandled error is throw
        console.error("Unhandled error: %O", err);
        replyCb(JSON.stringify([ActionResult.create(false, "Error performing this action")]));
      }
    });
  });

  var selectionStyleElementId = "manualtest-io-selection-style";

  messageHandler.registerListener('selectStart', function(data) {
    // Start capturing user selection. Stop when selectStop is received.
    console.log("receieved request to start capturing selection");
    captureSelection = true;

    styleElement = document.createElement('style');
    styleElement.type = 'text/css';
    styleElement.id = selectionStyleElementId;
    styleElement.appendChild(document.createTextNode("* { cursor:default!important; }"));
    document.getElementsByTagName('head')[0].appendChild(styleElement);
  });
  messageHandler.registerListener('selectStop', function(data) {
    console.log("receieved request to stop capturing selection");
    captureSelection = false;
    var styleElement = document.getElementById(selectionStyleElementId);
    if (styleElement) {
      styleElement.parentElement.removeChild(styleElement);
    }
  });
  messageHandler.registerListener('getElementCoordinates', function(data, replyCb) {
    console.log("receieved request to get element coordinates");
    var element = Element.createWithJson(data.element);
    element.getDOMElement({ waitDelay: 0 }).then(function(targetElement) {
      var rect = targetElement.getBoundingClientRect();

      replyCb(JSON.stringify({top: rect.top,
                              bottom: rect.bottom,
                              height: rect.height,
                              width: rect.width,
                              left: rect.left,
                              right: rect.right
                            }));
    }).catch(function(err) {
      replyCb(JSON.stringify(null));
    });
  });
  messageHandler.registerListener('scrollToElement', function(data, replyCb) {
    console.log("receieved request to scroll to element");
    var element = Element.createWithJson(data.element);
    element.getDOMElement({ waitDelay: 0 }).then(function(targetElement) {

      targetElement.scrollIntoView();

      replyCb(JSON.stringify(true));
    }).catch(function(err) {
      replyCb(JSON.stringify(null));
    });
  });
  messageHandler.registerListener('searchText', function(data, replyCb) {
    var searchString, allText, nodePromise, nodeList, node, nodeText;

    if (data.element) {
      nodePromise = (Element.createWithJson(data.element)).getDOMElement();
    } else {
      nodePromise = Promise.resolve(document.body);
    }

    nodePromise.then(function(startNode) {
      allText = startNode.innerText;
      searchText = data.text;

      if (data.insensitive) {
        allText = allText.toUpperCase();
        searchText = searchText.toUpperCase();
      }
      allText = allText.replace(/\xa0/g, " ").replace(/\xad/, '');

      if (allText.indexOf(searchText) > -1) {
        // Found text in innerText
        // if action want to find text, accomplished
        // if action don't want to find text, failed
        replyCb(JSON.stringify({pass: !data.not}));
        return;
      }

      // Try find text in input values
      nodeList = Array.prototype.slice.call(startNode.querySelectorAll("input,textarea"));
      if (data.element) {
        if (Element.isTextInputType(startNode)) {
          nodeList.push(startNode);
        }
      }

      for (var i = 0; i < nodeList.length; i++) {
        node = nodeList[i];
        if (!Element.isTextInputType(node)) {
          console.log(`ignoring node ${node.tagName} ${node.type}`);
          continue;
        }
        nodeText = node.value;
        if (data.insensitive) {
          nodeText = nodeText.toUpperCase();
        }
        if (nodeText.indexOf(searchText) > -1) {
          // search text found in the value of node
          // if action want to find text, accomplished
          // if action don't want to find text, failed
          console.log(`found text ${searchText} in ${nodeText} of ${node.tagName}`);
          replyCb(JSON.stringify({pass: !data.not}));
          return;
        }
      }

      // Didn't find text
      replyCb(JSON.stringify({pass: data.not}));
    }).catch(function(err) {
      replyCb(JSON.stringify({pass: false}));
    });
  });

  messageHandler.registerListener('performHover', function(data, replyCb) {
    Element.createWithJson(data.element).getDOMElement().then(function(element) {
      var options = {};
      options.view = window;
      options.bubbles = true;
      options.cancelable = true;
      var dEvent = new MouseEvent("mouseover", options);
      dEvent._fromManualTest = true;
      element.dispatchEvent(dEvent);
      replyCb(JSON.stringify(ActionResult.create(true)));
    }, function(err) {
      if (typeof err === "string") {
        console.error("error getting domElements: %O", err);
        replyCb(JSON.stringify(ActionResult.create(false, err)));
      } else {
        // An unhandled error is throw
        console.error("Unhandled error: %O", err);
        replyCb(JSON.stringify(ActionResult.create(false, "Error performing this action")));
      }
    });
  });

  var mouseOverHandler = function(e) {
    var element = Element.createWithDOMElement(e.target);
    var rect = e.target.getBoundingClientRect();
    messageHandler.postMessage('hoverResult', JSON.stringify({
      element: element,
      bounds: {
        top: rect.top,
        bottom: rect.bottom,
        height: rect.height,
        width: rect.width,
        left: rect.left,
        right: rect.right        
      }
    }));
  };

  messageHandler.registerListener('reportHoverStart', function(data, replyCb) {
    document.addEventListener("mouseover", mouseOverHandler);
  });

  messageHandler.registerListener('reportHoverStop', function(data, replyCb) {
    document.removeEventListener("mouseeover", mouseOverHandler);
  });

  messageHandler.registerListener('insertString', function(data, replyCb) {
    var nodePromise, events = [], i;
    if (data.element) {
      nodePromise = (Element.createWithJson(data.element)).getDOMElement();
    } else {
      nodePromise = Promise.resolve(document.activeElement);
    }

    nodePromise
    .then(function(element) {
      console.log("Insert string %O to %O", data.value, element);
      for (i = 0; i < data.value.length; i++) {
        var keyIdentifier = "\\u" + (data.value[i].charCode + 0x10000).toString(16).slice(1);
        var keydown = createKeyboardEvent({
          type: "keydown",
          options: {
            keyCode: data.value[i].keycode,
            which: data.value[i].keycode,
            keyIdentifier: keyIdentifier,
            repeat: false,
            keyLocation: 0,
            ctrlKey: false,
            altKey: false,
            shiftKey: false,
            metaKey: false
          }
        });
        var keyup = createKeyboardEvent({
          type: "keyup",
          options: {
            keyCode: data.value[i].keycode,
            which: data.value[i].keycode,
            keyIdentifier: keyIdentifier,
            repeat: false,
            keyLocation: 0,
            ctrlKey: false,
            altKey: false,
            shiftKey: false,
            metaKey: false
          }
        });
        var keypress = createKeyboardEvent({
          type: "keypress",
          options: {
            keyCode: data.value[i].charCode,
            which: data.value[i].charCode,
            keyIdentifier: keyIdentifier,
            repeat: false,
            keyLocation: 0,
            ctrlKey: false,
            altKey: false,
            shiftKey: false,
            metaKey: false
          }
        });
        var textInput = document.createEvent("TextEvent");
        textInput.initTextEvent("textInput", true, true, window, data.value[i].char, null, null);
        events.push(keydown, keypress, textInput, keyup);
      }

      var focusedElement = document.activeElement;
      stopRecording = true;
      element.focus();
      events.forEach(function(e) {
        e._fromManualTest = true;
        element.dispatchEvent(e);
      });
      element.blur(); // Must blur to trigger change event
      focusedElement.focus();
      setTimeout(function() {
        // Let change event fired before starting to record again
        stopRecording = false;
      }, 0);

      replyCb(JSON.stringify({pass: true}));
    }, function(err) {
      replyCb(JSON.stringify({pass: false, error: err}));
    });
  });

  document.addEventListener("mousewheel", function(e) {
    var scrollDelta = null;
    // Only notify scroll X and/or Y only if scroll against the respective edge.

    if (document.documentElement.clientHeight + document.body.scrollTop === document.body.scrollHeight &&
          e.wheelDeltaY < 0 /*User scroll down at bottom*/ ||
        document.body.scrollTop === 0 && e.wheelDeltaY > 0 /*User scroll up at top*/) {
      scrollDelta = {
        'deltaY': e.wheelDeltaY,
        'deltaX': 0
      };
    }
    if (document.documentElement.clientWidth + document.body.scrollLeft === document.body.scrollWidth &&
      e.wheelDeltaX < 0 /*User scroll right at right edge*/ ||
      document.body.scrollLeft === 0 && e.wheelDeltaX > 0 /*User scroll left at left edge*/) {


      scrollDelta = scrollDelta || {};
      scrollDelta['deltaX'] = e.wheelDeltaX;
    }

    if (scrollDelta) {
      messageHandler.postMessage('wheel', JSON.stringify(scrollDelta));
    }

  });
}
