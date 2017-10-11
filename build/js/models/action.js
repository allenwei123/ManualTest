"use strict";

const Displayable = {
  displayAction: function(action) {
    return "<span class='step-display-action'>" + action + "</span>";
  },
  displayTarget: function(target) {
    return "<span class='step-display-target js-step-display-target'>" + target + "</span>";
  },
  displayData: function(data) {
    return "<span class='step-display-data'>" + data + "</span>";
  }
};

window.Action = {
  createWithJson: function(json) {
    switch(json.__objectType) {
      case "EventData":
        return EventData.createWithJson(json);
      case "BrowserAction":
        return BrowserAction.createWithJson(json);
      case "VerifyTextAction":
        return VerifyTextAction.createWithJson(json);
      case "VerifyUrlAction":
        return VerifyUrlAction.createWithJson(json);
      case "WaitTimeAction":
        return WaitTimeAction.createWithJson(json);
      case "DataInsertAction":
        return DataInsertAction.createWithJson(json);
      default:
        throw new Error("Unknown action type: " + json.__objectType);
    }
  },
  to_json: function(action) {
    var obj = {};
    for (var p in action) {
      if (action.hasOwnProperty(p)) {
        if (p === "element") {
          if (action[p]) {
            obj[p] = action.element.as_json();
          } else {
            obj[p] = action[p];
          }
        } else {
          obj[p] = action[p];
        }
      }
    }
    return obj;
  },
  is: function(action) {
    return this.__objectType === action.actionType;
  }
};

const ActionResult = {
  create: function(pass, error) {
    return this.createWithJson({pass: pass, error: error});
  },
  createWithJson: function(json) {
    var obj = Object.create(ActionResult);
    obj.pass = json.pass;
    obj.error = json.error;
    return obj;
  }
};

const EventData = Object.create(Action, {
  actionType: {
    value: "EventData"
  },
  createWithEvent: {
    value: function(event) {
      return this.createWithJson({
        type: event.type,
        element: Element.createWithDOMElement(event.target),
        options: {
          altKey: event.altKey,
          charCode: event.charCode,
          code: event.code,
          data: event.data,
          ctrlKey: event.ctrlKey,
          key: event.key,
          keyCode: event.keyCode,
          keyIdentifier: event.keyIdentifier,
          keyLocation: event.keyLocation,
          metaKey: event.metaKey,
          repeat: event.repeat,
          shiftKey: event.shiftKey,
          which: event.which,
          button: event.button
        }
      });
    }
  },
  createWithJson: {
    value: function(json) {
      var obj = Object.create(EventData);
      obj.__objectType = EventData.actionType;
      obj.type = json.type;
      obj.element = Element.createWithJson(json.element);
      obj.options = json.options;
      return obj;
    }
  },
  prepareElement: {
      value: function(domElement) {
      if (this.type === "input") {
        // Set element value or select menu selections before input events
        return this.element.setValueOnDOMElement(domElement);
      }
      return null;
    }
  },
  generateDispatchEvent: {
    value: function() {
      var options, dEvent;
      if (this.type === "mousedown" ||
          this.type === "mouseup" ||
          this.type === "click") {
        options = JSON.parse(JSON.stringify(this.options)); // clone the options
        options.view = window;
        options.bubbles = true;
        options.cancelable = true;
        dEvent = new MouseEvent(this.type, options);
      } else if (this.type === "keydown" ||
                this.type === "keyup" ||
                this.type === "keypress") {
        dEvent = createKeyboardEvent(this);
      } else if (this.type === "textInput") {
        dEvent = document.createEvent("TextEvent");
        // initTextEvent (eventName, bubbles, cancelable, view, data, inputMethod, locale);
        dEvent.initTextEvent("textInput", true, true, window, this.options.data, null, null);
      } else {
        options = JSON.parse(JSON.stringify(this.options));
        options.view = window;
        options.bubbles = true;
        options.cancelable = true;
        dEvent = new Event(this.type, options);
      }
      return dEvent;
    }
  },
  perform: {
    value: function(webview, events) {
      return webview.performReady(function() {
        return webview.performEvents(events);
      }).then(function(results) {
        return new Promise(function(fulfill, reject) {
          if (events.every(function(e) {
            return e.type !== "click" && e.type !== "submit";
          })) {
            fulfill(results);
          } else {
            // For click and submit event, delay the result to match real world usage to
            // avoid the next action is performed too soon
            setTimeout(fulfill.bind(null, results), 1000);
          }
          // if (_.find(events, function(e) { return e.type === "click" || e.type === "sumbit"; })) {
          //   // For click and submit event, delay the result to match real world usage to
          //   // avoid the next action is performed too soon
          //   setTimeout(fulfill.bind(null, results), 1000);
          // } else {
          //   fulfill(results);
          // }
        });
      });
    }
  },
  isComposable: {
    get: function() {
      return true;
    }
  }
});


const BrowserAction = Object.create(Action, {
  actionType: {
    value: "BrowserAction"
  },
  create: {
    value: function(task, options) {
      options = options || {};
      if (["forward", "back", "reload", "hover"].indexOf(task) < 0) {
        throw "unknown task for BrowserAction: " + task;
      }
      return this.createWithJson({task: task, element: options.element});
    }
  },
  createWithJson: {
    value: function(json) {
      if (json.task === "hover") {
        if (!json.element) {
          throw "Hover action must provide an element";
        }
      }

      var obj = Object.create(BrowserAction);
      obj.__objectType = BrowserAction.actionType;
      obj.task = json.task;
      obj.element = Element.createWithJson(json.element);
      return obj;
    }
  },
  display: {
    value: function() {
      switch(this.task) {
        case "back":
          return Displayable.displayAction("Go back") + " in browsing history";
        case "forward":
          return Displayable.displayAction("Go forward") + " in browsing history";
        case "reload":
          return Displayable.displayAction("Reload") + " current page";
        case "hover":
          return Displayable.displayAction("Hover") + " on " + Displayable.displayTarget(this.element.toString());
      }
    }
  },
  perform: {
    value: function(webview) {
      var task = this.task;
      return webview.ready().then(function() {
        return new Promise(function(fulfill, reject) {
          var pending = true;
          var returnResult = function() {
            if (pending) {
              fulfill(ActionResult.create(true));
              pending = false;
            }
          };

          if (task === 'back') {
            if (webview.canGoBack()) {
              webview.addOnceListener("initializeStart", returnResult);
              webview.addOnceListener("urlChanged", returnResult);
              webview.back();
            } else {
              fulfill(ActionResult.create(false, "Can not go back in browser history"));
            }
          } else if (task === 'forward') {
            if (webview.canGoForward()) {
              webview.addOnceListener("initializeStart", returnResult);
              webview.addOnceListener("urlChanged", returnResult);
              webview.forward();
            } else {
              fulfill(ActionResult.create(false, "Can not go forward in browser history"));
            }
          } else if (task === 'reload') {
            webview.addOnceListener("initializeStart", returnResult);
            webview.reload();
          } else if (task === "hover") {
            webview.hover(this.element, function(result) {
              fulfill(result);
            });
          }
        }.bind(this));
      }.bind(this));
    }
  }
});


const VerifyUrlAction = Object.create(Action, {
  actionType: {
    value: "VerifyUrlAction"
  },
  create: {
    value: function(path, regex) {
      return this.createWithJson({ path: path, regex: regex });
    }
  },
  createWithJson: {
    value: function(json) {
      var obj = Object.create(VerifyUrlAction);
      obj.path = json.path;
      obj.regex = json.regex;
      obj.__objectType = VerifyUrlAction.actionType;
      return obj;
    }
  },
  display: {
    value: function() {
      var action, target, data;
      action = "Verify URL path";
      data = '"' + this.path + '"';

      return Displayable.displayAction(action) + " matches " +
              Displayable.displayData(data) +
              (this.regex ? " as regular expression" : "");
    }
  },
  perform: {
    value: function(webview) {
      return webview.performReady(function() {
        return new Promise(function(fulfill, reject) {
          // remove first character "/" using slice(1)
          var currentPath = (new URI(webview.getCurrentUrl())).resource().slice(1),
              match = this.path,
              useRegex = this.regex;

          var failedMsg = "Current path '" + currentPath + "' does not match '" + this.path + "'";
          if (useRegex) {
            failedMsg += " as a regular expression";
          }

          if (VerifyUrlAction.verify(currentPath, match, useRegex)) {
            fulfill(ActionResult.create(true));
          } else {
            // wait for a little, sometimes it takes a little time before url change kick in for navigation
            setTimeout(function() {
              currentPath = (new URI(webview.getCurrentUrl())).resource().slice(1);
              fulfill(ActionResult.create(VerifyUrlAction.verify(currentPath, match, useRegex), failedMsg));
            }, 1000);
          }
        }.bind(this));
      }.bind(this));
    }
  },
  verify: {
    value: function(currentPath, match, regex) {
      if (regex) {
        return new RegExp("^"+match+"$", "i").test(currentPath);
      } else {
        return currentPath.toUpperCase() === match.toUpperCase();
      }
    }
  }
});

const WaitTimeAction = Object.create(Action, {
  DEFAULT_WAIT_TIME: {
    value: 1,
  },
  actionType: {
    value: "WaitTimeAction"
  },
  create: {
    value: function(seconds) {
      return this.createWithJson({ seconds: seconds || this.DEFAULT_WAIT_TIME });
    }
  },
  createWithJson: {
    value: function(json) {
      var obj = Object.create(WaitTimeAction);
      obj.__objectType = WaitTimeAction.actionType;
      obj.seconds = json.seconds;
      return obj;
    }
  },
  display: {
    value: function() {
      return Displayable.displayAction("Wait") + " for" + Displayable.displayData(" " + this.seconds + " seconds");
    }
  },
  perform: {
    value: function(webview) {
      return webview.ready().then(function() {
        return new Promise(function(fulfill, reject) {
          setTimeout(function() {
            fulfill(ActionResult.create(true));
          }.bind(this), this.seconds * 1000);
        }.bind(this));
      }.bind(this));
    }
  }
});


const VerifyTextAction = Object.create(Action, {
  actionType: {
    value: "VerifyTextAction"
  },
  create: {
    value: function(element, text, insensitive, not) {
      return this.createWithJson({
        element: element,
        text: text,
        insensitive: insensitive,
        not: not
      });
    }
  },
  createWithJson: {
    value: function(json) {
      let obj = Object.create(VerifyTextAction);
      obj.__objectType = VerifyTextAction.actionType;
      obj.element = (json.element ? Element.createWithJson(json.element) : null);
      obj.text = json.text;
      obj.insensitive = json.insensitive;
      obj.not = json.not;
      return obj;
    }
  },
  display: {
    value: function() {
      var action, target, data;
      action = "Verify text";
      data = '"' + this.text + '"';
      target = Boolean(this.element) ? this.element.toString() : "anywhere";

      return Displayable.displayAction(action) + " " + Displayable.displayData(data) +
             (this.not ? " does not" : "") +
             " appears in " +
             Displayable.displayTarget(target) +
             (this.insensitive ? "(case insensitive)" : "");
    }
  },
  perform: {
    value: function(webview) {
      return webview.performReady(function() {
        var mgs;
        return new Promise(function(fulfill, reject) {
          webview.searchText(this.element, this.text, this.insensitive, this.not, function(result) {
            if (result.pass) {
              fulfill(ActionResult.create(true));
            } else {
              let msg = "Text '" + this.text + "' should " +
              (Boolean(this.not) ? "not" : "") +
              " appear in " +
              (Boolean(this.element) ? this.element.toString() : "the page");
              fulfill(ActionResult.create(false, msg));
            }
          }.bind(this));
        }.bind(this));
      }.bind(this));
    }
  }
});

const DataInsertAction = Object.create(Action, {
  actionType: {
    value: "DataInsertAction"
  },
  create: {
    value: function(element, dataOrigin, dataName) {
      return this.createWithJson({
        element: element,
        dataName: dataName,
        dataOrigin: dataOrigin
      });
    }
  },
  createWithJson: {
    value: function(json) {
      let obj = Object.create(DataInsertAction);
      obj.__objectType = DataInsertAction.actionType;
      obj.element = (json.element ? Element.createWithJson(json.element) : null);
      obj.dataName = json.dataName;
      obj.dataOrigin = json.dataOrigin;
      return obj;
    }
  },
  display: {
    value: function() {
      return Displayable.displayAction(this.dataOrigin === "project" ?
        "Insert project data" : "Insert scenario data") +
        " \"" + Displayable.displayData(this.dataName) + "\" to " +
        (this.element ?
          Displayable.displayTarget(this.element.toString()) :
          "current element in focus");
    }
  },
  perform: {
    value: function(webview, resources) {
      if (!resources.dataResolve) {
        throw new Error("DataInsertAction must perform with dataResolve");
      }
      try {
        var str = resources.dataResolve(this.dataOrigin, this.dataName);
      } catch(err) {
        if (typeof err === "string") {
          console.error("%s data %s resolve error: %s", this.dataOrigin, this.dataName, err);
          return Promise.resolve(ActionResult.create(false, err));
        } else {
          throw err;
        }
      }

      return new Promise(function(fulfill, reject) {
        webview.insertString(this.element, str).then(function(result) {
          if (result.pass) {
            fulfill(ActionResult.create(true));
          } else {
            fulfill(ActionResult.create(false, result.error));
          }
        }.bind(this));
      }.bind(this));
    }
  }
});
