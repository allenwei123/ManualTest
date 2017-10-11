
console.log("load element");

//  const TEXTLENGTH = 10;
window['_elementLoaded'] = true;

const DEFAULT_GETDOMELEMENT_WAIT_DELAY = 2000;
const NON_TEXT_INPUT_TYPES = ["HIDDEN", "COLOR", "DATE", "DATETIME-LOCAL", "MONTH", "WEEK", "RANGE", "TIME", "CHECKBOX", "RADIO", "BUTTON", "IMAGE", "HIDDEN", "RESET", "SUBMIT", "FILE"];
const NOT_SELECTION_INPUT_TYPES = ["HIDDEN", "EMAIL", "DATE", "DATETIME-LOCAL", "MONTH", "WEEK", "TIME", "NUMBER", "RANGE", "COLOR", "CHECKBOX", "RADIO", "IMAGE", "RESET", "BUTTON", "SUBMIT", "FILE"];

Element = {
  createWithDOMElement: function(element) {
    var json = {
      id: element.id,
      tagName: element.tagName ? element.tagName.toLowerCase() : null /* document */,
      cssSelector: element.tagName ? Element.getCSSSelector(element) : null,
      name: element.name,
      type: element.type,
      value: element.value,
      checked: element.checked,
      locatorMethod: element.locatorMethod,
      xpath: element.xpath
    };
    if (element.form) {
      json.formElement = Element.createWithDOMElement(element.form);
    }
    if (element.innerText) {
      json.innerText = element.innerText.substring(0, 50);
      if (element.innerText.length > 10) {
        json.innerText += "...";
      }
    }
    
    try {
      json.selectionStart = element.selectionStart;
      json.selectionEnd = element.selectionEnd;
    } catch (error) {
      // Not all elements support selection
      if (error instanceof DOMException) {
        json.selectionStart = null;
        json.selectionEnd = null;
      } else {
        throw error;
      }
    }

    if (json.tagName === "select") {
      json.selections = []; // Use array in case of multiple selection with same values
      for (var i = 0; i < element.length; i++) {
        if (element[i].selected) {
          json.selections.push({value: element[i].value, text: element[i].text});
        }
      }
    }

    return Element.createWithJson(json);
  },
  createWithJson: function(json) {
    var obj = Object.create(Element);
    for (var p in json) {
      if (json.hasOwnProperty(p)) {
        if (p === "formElement") {
          obj[p] = Element.createWithJson(json[p]);
        } else {
          obj[p] = json[p];
        }
      }
    }
    return obj;
  },
  as_json: function() {
    var obj = {};
    for (var p in this) {
      if (this.hasOwnProperty(p)) {
        obj[p] = this[p];
      }
    }
    return obj;
  },
  toString: function() {
    var result;

    switch (this.tagName) {
      case 'a':
        result = 'link';
        if (this.innerText) {
          result += " with text '" + this.innerText +"'";
        }
        break;
      case 'input':
        switch (this.type) {
          case 'checkbox':
            result = "Checkbox";
            break;
          case 'radio':
            result = "Radio button";
            break;
          case 'url':
            result = "URL field";
            break;
          case 'tel':
            result = "Telephone field";
            break;
          case 'search':
          case 'number':
          case 'datetime':
          case 'text':
          case 'email':
          case 'password':
            result = this.type.charAt(0).toUpperCase() + this.type.slice(1) + ' field';
            break;
          case 'date':
          case 'month':
          case 'week':
          case 'time':
          case 'range':
          case 'color':
            result = this.type.charAt(0).toUpperCase() + this.type.slice(1) + ' picker';
            break;
          case 'datetime-local':
            result = 'Datetime picker';
            break;
          case 'submit':
            result = "Submit button";
            break;
          case 'image':
            result = 'Image button';
            break;
          case 'file':
            result = 'File upload button';
            break;
          case 'reset':
            result = 'Reset button';
            break;
          case 'button':
            result = "Button";
            break;
          default:
            result = 'Input field';
        }
        break;
      case 'select':
      case 'option':
        result = 'drop down list';
        break;
      case 'textarea':
        result = 'text area';
        break;
      case 'button':
        result = 'button';
        if (this.innerText) {
          result += " with text '" + this.innerText +"'";
        }
        break;
      case "h1":
      case "h2":
      case "h3":
      case "h4":
      case "h5":
      case "h6":
        result = '&lt;'+this.tagName+'&gt; Text';
        break;
      case "li":
        result = "list item";
        break;
      case "ul":
        result = "list";
        break;
      case "ol":
        result = "ordered list";
        break;
      case "header":
      case "footer":
        result = this.tagName;
        break;
      default:
        result = '&lt;'+this.tagName+'&gt; element';
    }
    return result;
  },
  getCSSSelector: function(currentElement) {
    var currentNodeName = currentElement.tagName.toLowerCase();
    if (currentNodeName !== 'html') {
      var childrenOfType = Array.prototype.slice.call(currentElement.parentNode.children)
        .filter(function(child) {
          return child.tagName === currentElement.tagName;
        });

      var nth = childrenOfType.indexOf(currentElement);

      if (nth > 0) {
        // Someone decided that CSS sibling position starts at 1!
        currentNodeName = currentNodeName + ":nth-of-type(" + (nth + 1).toString() + ")";
      }

      if (currentElement.tagName.toLowerCase() === "input") {
        var typeMap = currentElement.attributes.getNamedItem('type');
        if (typeMap) {
          currentNodeName = currentNodeName + "[type='" + typeMap.value + "']";
        }
      }

      return this.getCSSSelector(currentElement.parentNode) + " > " + currentNodeName;
    } else {
      return 'html';
    }
  },
  equals: function(element) {
    return this.id === element.id && this.cssSelector === element.cssSelector;
  },
  parse: function(value) {

  },
  getDOMElement: function(options) {
    var ele;

    options = options || {};
    if (typeof options.waitDelay !== "number") {
      options.waitDelay = DEFAULT_GETDOMELEMENT_WAIT_DELAY;
    }

    var find = function() {
      if (this.locatorMethod) {
        if (this.locatorMethod === "id") {
          return document.getElementById(this.id);
        } else if (this.locatorMethod === "css") {
          return document.querySelector(this.cssSelector);
        } else if (this.locatorMethod === "xpath") {
          return document.evaluate(this.xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
        } else {
          console.error("Unknown locatorMethod: " + this.locatorMethod);
          return null;
        }
      } else {
        // No locatorMethod means the user has not set it yet
        // Perfer using id if exist, otherwise uses css selector
        if (this.id) {
          return document.getElementById(this.id);
        } else if (this.cssSelector) {
          return document.querySelector(this.cssSelector);
        } else if (this.tagName === null) {
          // legacy, should be fine to remove
          return document;
        }
      }
    }.bind(this);
    ele = find();
    if (ele) {
      return Promise.resolve(ele);
    } else {
      return new Promise(function(fulfill, reject) {
        setTimeout(function() {
          ele = find();
          if (ele) {
            fulfill(ele);
          } else {
            console.error("Not able to find element: %O", this);
            reject("Element " + this.toString() + " Not Found");
          }
        }.bind(this), options.waitDelay);
      }.bind(this));
    }

  },
  displayValue: function() {
    if (this.tagName === "select") {
      return this.selections.map(function(s) {
        return s.value;
      }).join(", ");
    } else if (this.tagName.toUpperCase() === "INPUT") {
      if (this.type === "checkbox" || this.type === "radio") {
        return (this.checked ? "checked" : "unchecked");
      } else if (this.type === "color") {
        return "<span style='white-space: nowrap'><span style='border: 1px solid black; display:inline-block; width: 1rem; height: 1rem; line-height: 1rem; background-color: " + this.value + "'></span> "+this.value+"</span>";
      } else {
        return (this.value === "" || this.value === null || this.value === undefined) ?
                "&lt;empty value&gt;" :
                this.value;
      }
    } else {
        return (this.value === "" || this.value === null || this.value === undefined) ?
                "&lt;empty value&gt;" :
                this.value;
    }
  },
  /*
    set the selection values on the select element
    return null if everything is good
    otherwise return the error message
   */
  setValueOnDOMElement: function(domElement) {
    if (this.tagName !== "input" && this.tagName !== "select" && this.tagName !== "textarea") {
      throw "setValueOnDOMElement should only be called on input elements";
    }
    if (this.tagName === "select") {
      if (domElement.tagName.toUpperCase() !== "SELECT") {
        throw "Invalid parameter: DOM element is not a select element";
      }
      // Get all the selected values
      var selectedValues = this.selections.map(function(selection) {
        return selection.value;
      });

      // for each options, select/deselect it based on if its in the selected values
      for (var i = 0; i < domElement.length; i++) {
        var foundIndex = selectedValues.indexOf(domElement[i].value);

        if (foundIndex >= 0) {
          console.log("Select option: " + domElement[i].value);
          domElement[i].selected = true;
          selectedValues.splice(foundIndex, 1); // tick off selected value
        } else {
          console.log("Deselect option: " + domElement[i].value);
          domElement[i].selected = false;
        }
      }

      if (selectedValues.length > 0) {
        // Some selected values are not in the current options anymore
        return "Options [" + selectedValues.join(', ') + "] not found";
      }

      return null;


    } else {
      console.log("setting element %s value: %s to %s",
        this.toString(),
        domElement.value,
        this.value);
      domElement.value = this.value;
      return null;
    }
  },
  setSelectionOnDOMElement: function(domElement) {
    if (typeof this.selectionStart === "number") {
      if (domElement.tagName.toUpperCase() === "TEXTAREA" ||
            (domElement.tagName.toUpperCase() === "input" &&
              NOT_SELECTION_INPUT_TYPES.indexOf(domElement.type.toUpperCase()) < 0
            )) {
        console.log("setting element %s selection %i to %i", this.toString(),
                      this.selectionStart, this.selectionEnd);
        domElement.selectionStart = this.selectionStart;
        domElement.selectionEnd = this.selectionEnd;
      }
    }
  },
  isTextInputType: function(node) {
    return node.tagName.toUpperCase() === "TEXTAREA" ||
            (node.tagName.toUpperCase() === "INPUT" && node.type &&
            NON_TEXT_INPUT_TYPES.indexOf(node.type.toUpperCase()) < 0);
  }
};

