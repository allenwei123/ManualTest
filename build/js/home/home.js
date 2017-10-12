const Displayable = {
    displayAction: function (action) {
        return "<span class='step-display-action'>" + action + "</span>";
    },
    displayTarget: function (target) {
        return "<span class='step-display-target js-step-display-target'>" + target + "</span>";
    },
    displayData: function (data) {
        return "<span class='step-display-data'>" + data + "</span>";
    }
};

window.Action = {
    createWithJson: function (json) {
        switch (json.__objectType) {
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
    to_json: function (action) {
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
    is: function (action) {
        return this.__objectType === action.actionType;
    }
};

const ActionResult = {
    create: function (pass, error) {
        return this.createWithJson({pass: pass, error: error});
    },
    createWithJson: function (json) {
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
        value: function (event) {
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
        value: function (json) {
            var obj = Object.create(EventData);
            obj.__objectType = EventData.actionType;
            obj.type = json.type;
            obj.element = Element.createWithJson(json.element);
            obj.options = json.options;
            return obj;
        }
    },
    prepareElement: {
        value: function (domElement) {
            if (this.type === "input") {
                // Set element value or select menu selections before input events
                return this.element.setValueOnDOMElement(domElement);
            }
            return null;
        }
    },
    generateDispatchEvent: {
        value: function () {
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
        value: function (webview, events) {
            return webview.performReady(function () {
                return webview.performEvents(events);
            }).then(function (results) {
                return new Promise(function (fulfill, reject) {
                    if (events.every(function (e) {
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
        get: function () {
            return true;
        }
    }
});


const BrowserAction = Object.create(Action, {
    actionType: {
        value: "BrowserAction"
    },
    create: {
        value: function (task, options) {
            options = options || {};
            if (["forward", "back", "reload", "hover"].indexOf(task) < 0) {
                throw "unknown task for BrowserAction: " + task;
            }
            return this.createWithJson({task: task, element: options.element});
        }
    },
    createWithJson: {
        value: function (json) {
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
        value: function () {
            switch (this.task) {
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
        value: function (webview) {
            var task = this.task;
            return webview.ready().then(function () {
                return new Promise(function (fulfill, reject) {
                    var pending = true;
                    var returnResult = function () {
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
                        webview.hover(this.element, function (result) {
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
        value: function (path, regex) {
            return this.createWithJson({path: path, regex: regex});
        }
    },
    createWithJson: {
        value: function (json) {
            var obj = Object.create(VerifyUrlAction);
            obj.path = json.path;
            obj.regex = json.regex;
            obj.__objectType = VerifyUrlAction.actionType;
            return obj;
        }
    },
    display: {
        value: function () {
            var action, target, data;
            action = "Verify URL path";
            data = '"' + this.path + '"';

            return Displayable.displayAction(action) + " matches " +
                Displayable.displayData(data) +
                (this.regex ? " as regular expression" : "");
        }
    },
    perform: {
        value: function (webview) {
            return webview.performReady(function () {
                return new Promise(function (fulfill, reject) {
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
                        setTimeout(function () {
                            currentPath = (new URI(webview.getCurrentUrl())).resource().slice(1);
                            fulfill(ActionResult.create(VerifyUrlAction.verify(currentPath, match, useRegex), failedMsg));
                        }, 1000);
                    }
                }.bind(this));
            }.bind(this));
        }
    },
    verify: {
        value: function (currentPath, match, regex) {
            if (regex) {
                return new RegExp("^" + match + "$", "i").test(currentPath);
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
        value: function (seconds) {
            return this.createWithJson({seconds: seconds || this.DEFAULT_WAIT_TIME});
        }
    },
    createWithJson: {
        value: function (json) {
            var obj = Object.create(WaitTimeAction);
            obj.__objectType = WaitTimeAction.actionType;
            obj.seconds = json.seconds;
            return obj;
        }
    },
    display: {
        value: function () {
            return Displayable.displayAction("Wait") + " for" + Displayable.displayData(" " + this.seconds + " seconds");
        }
    },
    perform: {
        value: function (webview) {
            return webview.ready().then(function () {
                return new Promise(function (fulfill, reject) {
                    setTimeout(function () {
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
        value: function (element, text, insensitive, not) {
            return this.createWithJson({
                element: element,
                text: text,
                insensitive: insensitive,
                not: not
            });
        }
    },
    createWithJson: {
        value: function (json) {
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
        value: function () {
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
        value: function (webview) {
            return webview.performReady(function () {
                var mgs;
                return new Promise(function (fulfill, reject) {
                    webview.searchText(this.element, this.text, this.insensitive, this.not, function (result) {
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
        value: function (element, dataOrigin, dataName) {
            return this.createWithJson({
                element: element,
                dataName: dataName,
                dataOrigin: dataOrigin
            });
        }
    },
    createWithJson: {
        value: function (json) {
            let obj = Object.create(DataInsertAction);
            obj.__objectType = DataInsertAction.actionType;
            obj.element = (json.element ? Element.createWithJson(json.element) : null);
            obj.dataName = json.dataName;
            obj.dataOrigin = json.dataOrigin;
            return obj;
        }
    },
    display: {
        value: function () {
            return Displayable.displayAction(this.dataOrigin === "project" ?
                "Insert project data" : "Insert scenario data") +
                " \"" + Displayable.displayData(this.dataName) + "\" to " +
                (this.element ?
                    Displayable.displayTarget(this.element.toString()) :
                    "current element in focus");
        }
    },
    perform: {
        value: function (webview, resources) {
            if (!resources.dataResolve) {
                throw new Error("DataInsertAction must perform with dataResolve");
            }
            try {
                var str = resources.dataResolve(this.dataOrigin, this.dataName);
            } catch (err) {
                if (typeof err === "string") {
                    console.error("%s data %s resolve error: %s", this.dataOrigin, this.dataName, err);
                    return Promise.resolve(ActionResult.create(false, err));
                } else {
                    throw err;
                }
            }

            return new Promise(function (fulfill, reject) {
                webview.insertString(this.element, str).then(function (result) {
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

define('Scenario', ["Action", "DataSet"], function (Action, DataSet) {
    'use strict';

    const Scenario = {
        createWithJson: function (json) {
            if (!json.dataSet) {
                json.dataSet = {};
            }
            var obj = Object.create(Scenario);

            obj.actions = [];
            for (var p in json) {
                if (json.hasOwnProperty(p)) {
                    if (p === "actions") {
                        obj.actions = json.actions.map(Action.createWithJson);
                    } else if (p === "dataSet") {
                        obj.dataSet = DataSet.createWithJson(json.dataSet);
                    } else {
                        obj[p] = json[p];
                    }
                }
            }
            return obj;
        },
        clone: function (properties) {
            var c = Scenario.createWithJson(this);
            for (var p in properties) {
                if (p in c) {
                    c[p] = properties[p];
                }
            }
            return c;
        },
        getFullUrl: function (syncEngine) {
            if (!this.projectKey || URI(this.url).is('absolute')) {
                return Promise.resolve(this.url);
            } else {
                return syncEngine.getProjectByScenario(this).then(function (project) {
                    if (project) {
                        var uri = URI(project.url.toString() + (this.url ? '/' + this.url.toString() : "")).normalize();
                        return uri.toString();
                    } else {
                        return this.url;
                    }
                }.bind(this));
            }
        },
    };

    return Scenario;
});

define('home/scenarios_table', ["jquery", "EventEmitter"], function ($, EventEmitter) {
    'use strict';

    const scenarioTable = new EventEmitter();
    const scenarioSelectOverall = $("#js-td-sceanrio-select-overall");
    const SCENARIO_DATA_NAME = "scenario";
    const COL_COUNT = 7; // number of columns per row

    var syncEngine;
    var device;
    var table, tbody;

    scenarioTable.initialize = function (id, env) {
        syncEngine = env.syncEngine;
        device = env.device;

        table = $("#" + id);
        tbody = table.find("tbody");
        insertLoadingRow();

        table.on("click", "tr.js-td-scenario", function (e) {
            e.stopPropagation();
            if (!$(e.target).hasClass("td-help")) {
                scenarioTable.emitEvent("scenarioClicked", [getScenarioFromRow(e.target)]);
            }
        });

        table.on("click", ".js-td-scenario-select", function (e) {
            var checkbox = $(e.target);
            if ($(e.target).is("td")) {
                checkbox = $(e.target).find("input:checkbox");
                checkbox.prop("checked", !checkbox.is(":checked"));
            }

            scenarioTable.emitEvent("scenariosSelectionChanged");
            e.stopPropagation();
        });

        scenarioTable.addListener("scenariosSelectionChanged", function () {
            setScenarioSelectOverall();
        });

        scenarioSelectOverall.change(function (e) {
            if (scenarioSelectOverall.is(":checked")) {
                $(".js-td-scenario-select").find("input").prop("checked", true);
                scenarioTable.emitEvent("scenariosSelectionChanged");
            } else {
                $(".js-td-scenario-select").find("input").prop("checked", false);
                scenarioTable.emitEvent("scenariosSelectionChanged");
            }
        });

        table.on("click", ".js-remove-scenario", function (e) {
            e.stopPropagation();
            scenarioTable.emitEvent("scenarioRequestRemoval", [getScenarioFromRow(e.target)]);
        });

        table.on("click", ".js-edit-scenario", function (e) {
            e.stopPropagation();
            scenarioTable.emitEvent("scenarioEdit", [getScenarioFromRow(e.target)]);
        });

        setScenarioSelectOverall();
    };

    scenarioTable.updateOrAddScenarioRow = function (scenario) {
        removeHelpRow();

        var row = getRowByScenarioKey(scenario.key);
        if (row) {
            return populateScenarioToRow(row, scenario);
        } else {
            row = populateScenarioToRow(scenarioRowTemplate(), scenario);

            let inserted = false;
            tbody.children("tr").each(function (index) {
                let currentScenario = getScenarioFromRow(this);
                if (currentScenario) {
                    // Sort by Key
                    if (scenario.key < currentScenario.key) {
                        $(row).insertBefore(this);
                        inserted = true;
                        return false; // terminate loop
                    }
                }
            });
            if (!inserted) {
                tbody.append(row);
            }

            setScenarioSelectOverall();
            return row;
        }
    };

    scenarioTable.removeScenarioRow = function (scenario) {
        var row = getRowByScenarioKey(scenario.key);
        if (row) {
            $(row).hide(300, function () {
                row.remove();
                if (tbody.children("tr").length === 0) {
                    insertNoScenariosRow();
                }
                scenarioTable.emitEvent("scenariosSelectionChanged");
            });
        }
    };

    scenarioTable.selectedScenarios = function () {
        return tbody.find("input:checkbox:checked").map(function (index, element) {
            return getScenarioFromRow(element);
        }).toArray();
    };

    scenarioTable.updateResult = function (result) {
        var row = getRowByScenarioKey(result.scenarioKey);
        if (row) {
            populateScenarioResultToRow(row, result);
        }
    };

    scenarioTable.startLoading = function () {
        tbody.empty();
        insertLoadingRow();
    };

    scenarioTable.endLoading = function () {
        if (tbody.find($("td:not(.td-help)")).parent().length === 0) {
            removeHelpRow();
            insertNoScenariosRow();
        }
        setScenarioSelectOverall();
    };

    var setScenarioToRow = function (tr, scenario) {
        $(tr).data(SCENARIO_DATA_NAME, scenario);
    };

    var getScenarioFromRow = function (element) {
        return $(element).closest("tr", table).data(SCENARIO_DATA_NAME);
    };

    var getRowByScenarioKey = function (scenarioKey) {
        var found = null, scenario;
        tbody.children("tr").each(function (index) {
            scenario = getScenarioFromRow(this);
            if (scenario && scenario.key === scenarioKey) {
                found = this;
                return false; // terminate loop
            }
        });
        return found;
    };

    var scenarioRowTemplate = function () {
        var row = $("<tr />", {"class": "js-td-scenario"}).append(
            $("<td />", {'class': "td-scenario-select js-td-scenario-select"}).append(
                $("<input />", {type: 'checkbox'})),
            $("<td />").append(
                $("<div />", {'class': "td-scenario-name js-td-scenario-name"})),
            $("<td />", {'class': "td-scenario-url js-td-scenario-url"}),
            $("<td />", {'class': "td-scenario-device-size js-td-scenario-device-size"}).append(),
            $("<td />", {'class': "td-scenario-result js-td-scenario-result"}),
            $("<td />", {'class': "td-icon-button js-edit-scenario", 'title': "Edit"}).append(
                $("<a />").append(
                    $("<i />", {'class': "fa fa-pencil-square-o"}))),
            $("<td />", {'class': "td-icon-button js-remove-scenario", 'title': "Remove"}).append(
                $("<a />").append(
                    $("<i />", {'class': "fa fa-trash"})))
        );
        return row;
    };

    var populateScenarioToRow = function (tr, scenario) {
        setScenarioToRow(tr, scenario);
        $(tr).find(".js-td-scenario-name").text(scenario.name);
        $(tr).find(".js-td-scenario-url").text(scenario.url);
        $(tr).find(".js-td-scenario-device-size").empty().append(
            device.getLabel(scenario.deviceSize));
        // $("<span />", { 'class': "label-device-size" }).text(scenario.deviceSize));
        syncEngine.getLastResult(scenario.key).then(function (result) {
            populateScenarioResultToRow(tr, result);
        });

        return tr;
    };

    var populateScenarioResultToRow = function (tr, result) {
        var label;
        if (result && result.isCompleted) {
            if (result.isPass) {
                label = $("<span />", {'class': "label-result-pass"}).text(result.statusDisplay);
            } else {
                label = $("<span />", {'class': "label-result-fail"}).text(result.statusDisplay);
            }
            $(tr).find(".js-td-scenario-result").empty().append(label);
        }
    };

    var insertNoScenariosRow = function () {
        tbody.append(
            $("<tr />").append(
                $("<td />", {
                    'class': "td-help",
                    'colspan': COL_COUNT
                }).text("Please start with creating a scenario.")));
    };
    var removeHelpRow = function () {
        tbody.find(".td-help").closest("td", tbody).remove();
    };

    var insertLoadingRow = function () {
        tbody.append(
            $("<tr />").append(
                $("<td />", {
                    'class': "td-help",
                    'colspan': COL_COUNT
                }).html("<i class='fa fa-spinner fa-spin'></i> <em>Loading Scenarios</em>")));
    };

    var setScenarioSelectOverall = function () {
        var count = tbody.find("input:checkbox:checked").length;
        if (count === 0) {
            scenarioSelectOverall.prop("indeterminate", false);
            scenarioSelectOverall.prop("checked", false);
        } else if (count === $(".js-td-scenario").length) {
            scenarioSelectOverall.prop("indeterminate", false);
            scenarioSelectOverall.prop("checked", true);
        } else {
            scenarioSelectOverall.prop("indeterminate", true);
        }
    };

    return scenarioTable;
});

define('home/data_table', ["jquery", "EventEmitter"], function ($, EventEmitter) {
    'use strict';

    const DATA_DATA_NAME = "data";
    const COL_COUNT = 5;

    const DataTable = new EventEmitter();

    DataTable.create = function (tableId, canEdit) {
        var obj = Object.create(DataTable);
        obj.initialize(tableId, canEdit);
        return obj;
    };

    DataTable.initialize = function (tableId, canEdit) {
        this.table = $("#" + tableId);
        this.tbody = this.table.find("tbody");
        this.canEdit = canEdit;

        this.tbody.on("click", ".js-edit-data", function (e) {
            e.stopPropagation();
            e.preventDefault();

            this.emitEvent("dataEdit", [getDataFromRow(e.target)]);
        }.bind(this));

        this.tbody.on("click", ".js-remove-data", function (e) {
            e.stopPropagation();
            e.preventDefault();

            this.emitEvent("dataRemove", [getDataFromRow(e.target)]);
        }.bind(this));
    };

    DataTable.refresh = function (dataSet) {
        this.tbody.empty();
        if (dataSet.count > 0) {
            dataSet.forEach(function (data) {
                this.tbody.append(createDataRow(data, this.canEdit));
            }.bind(this));
        } else {
            addEmptyRow.call(this);
        }
    };

    var createDataRow = function (data, useEdit) {
        let row = $("<tr />").append(
            $("<td />", {'class': "td-name"}).text(data.name),
            $("<td />", {'class': "td-value"}).text(data.value),
            $("<td />", {'class': "td-regex"})
                .append($("<i />", {"class": data.regex ? "fa fa-check-square-o" : "fa fa-square-o"})));

        if (useEdit) {
            row.append(
                $("<td />", {'class': "td-icon-button js-edit-data", 'title': "Edit"}).append(
                    $("<a />").append(
                        $("<i />", {'class': "fa fa-pencil-square-o"}))),
                $("<td />", {'class': "td-icon-button js-remove-data", 'title': "Remove"}).append(
                    $("<a />").append(
                        $("<i />", {'class': "fa fa-trash"})))
            );
        }

        setDataToRow(row, data);
        return row;
    };

    var setDataToRow = function (tr, data) {
        tr.data(DATA_DATA_NAME, data);
    };

    var getDataFromRow = function (element) {
        return $(element).closest("tr").data(DATA_DATA_NAME);
    };

    var addEmptyRow = function () {
        this.tbody.append($("<tr />").append(
            $("<td />", {'class': "td-help", 'colspan': COL_COUNT}).text("No data avaiable")
        ));
    };

    return DataTable;
});


define('home/project_page', ["jquery", "Scenario", "DataSet", "./scenarios_table", "./data_table"],
    function ($, Scenario, DataSet, ScenariosTable, DataTable) {
        'use strict';

        const SCENARIOS_TABLE_ID = "scenarios-table";
        const PROJECT_DATA_TABLE_ID = "project-data-table";

        const projectPage = {};
        const projectTitleName = $("#title-project-name");
        const projectTitleUrl = $("#title-project-url");
        const newScenarioBtn = $("#new-scenario-btn");
        const runScenarioBtn = $("#run-scenario-btn");

        const projectScenariosTab = $("#tab-project-scenarios");
        const projectDataTab = $("#tab-project-data-set");
        // const projectSettingsTab = $("#tab-project-settings");

        const addProjectDataButton = $("#add-project-data-btn");

        const projectDataTable = DataTable.create(PROJECT_DATA_TABLE_ID, true);

        var storage;
        var syncEngine;
        var mixpanel;
        var device;
        var sandbox;

        projectPage.initialize = function (s, env) {
            sandbox = s;
            storage = env.storage;
            syncEngine = env.syncEngine;
            mixpanel = env.mixpanel;
            device = env.device;

            ScenariosTable.initialize(SCENARIOS_TABLE_ID, {
                syncEngine: syncEngine,
                device: device
            });

            syncEngine.addListener("scenarioCreated", function (scenario) {
                if (isScenarioFromCurrentProject(scenario)) {
                    ScenariosTable.updateOrAddScenarioRow(scenario);
                }
            });
            syncEngine.addListener("scenarioUpdated", function (scenario) {
                if (isScenarioFromCurrentProject(scenario)) {
                    ScenariosTable.updateOrAddScenarioRow(scenario);
                }
            });
            syncEngine.addListener("scenarioRemoved", function (removedScenario) {
                if (isScenarioFromCurrentProject(removedScenario)) {
                    ScenariosTable.removeScenarioRow(removedScenario);
                    setRunScenarioBtnState();
                }
            });

            syncEngine.addListener("scenarioResultCreated", function (createdScenarioResult) {
                syncEngine.getScenarioByKey(createdScenarioResult.scenarioKey).then(function (scenario) {
                    if (scenario && isScenarioFromCurrentProject(scenario)) {
                        ScenariosTable.updateResult(createdScenarioResult);
                    }
                });
            });
            syncEngine.addListener("scenarioResultUpdated", function (updatedScenarioResult) {
                syncEngine.getScenarioByKey(updatedScenarioResult.scenarioKey).then(
                    function (scenario) {
                        if (scenario && isScenarioFromCurrentProject(scenario)) {
                            ScenariosTable.updateResult(updatedScenarioResult);
                        }
                    });
            });

            ScenariosTable.addListener("scenariosSelectionChanged", function () {
                setRunScenarioBtnState();
            });
            ScenariosTable.addListener("scenarioClicked", function (scenario) {
                sandbox.showScenarioPage(scenario);
            });
            ScenariosTable.addListener("scenarioRequestRemoval", function (scenario) {
                sandbox.removeScenario(scenario);
            });
            ScenariosTable.addListener("scenarioEdit", function (scenario) {
                sandbox.editScenario(scenario, {mode: "edit"});
            });

            addProjectDataButton.click(function (e) {
                e.preventDefault();
                let project = currentProject();

                sandbox.editData({}).then(function (data) {
                    project.dataSet.addData(data).then(function () {
                        syncEngine.addProject(project);
                    }, function (err) {
                        console.error("Error adding data %O to Project %O: %O", data, project, err);
                    });
                });
            });

            projectDataTable.addListener("dataEdit", function (data) {
                let project = currentProject();
                sandbox.editData(data).then(function (data) {
                    project.dataSet.addData(data).then(function () {
                        syncEngine.addProject(project);
                    }, function (err) {
                        console.error("Error editing data $O to Project: %O: %O", data, project, err);
                    });
                });
            });

            projectDataTable.addListener("dataRemove", function (data) {
                if (currentProject().dataSet.removeData(data.name)) {
                    syncEngine.addProject(currentProject());
                }
            });

            newScenarioBtn.click(function (e) {
                sandbox.editScenario(Scenario.createWithJson({
                    name: '',
                    url: '',
                    projectKey: currentProject() ? currentProject().key : null,
                    dataSet: {},
                    deviceSize: device.defaultDeviceSize()
                }, {
                    mode: "create"
                }));
            });

            runScenarioBtn.click(function (e) {
                sandbox.runScenarios(ScenariosTable.selectedScenarios());
            });

            setRunScenarioBtnState();
        };

        projectPage.refresh = function () {
            ScenariosTable.startLoading();
            syncEngine.getScenariosByProject(currentProject()).then(function (scenarios) {
                scenarios.forEach(function (s) {
                    ScenariosTable.updateOrAddScenarioRow(s);
                });
            }).then(function () {
                ScenariosTable.endLoading();
                setRunScenarioBtnState();
            });

            if (currentProject()) {
                projectTitleName.text(currentProject().name);
                projectTitleUrl.text("(" + currentProject().url + ")");
                projectDataTable.refresh(currentProject().dataSet);
                projectDataTab.removeClass('disabled');
                projectDataTab.show();
                projectDataTab.children("a").attr("data-toggle", "tab");
                // projectSettingsTab.removeClass('disabled');
                // projectSettingsTab.children('a').attr("data-toggle", "tab");
            } else {
                projectTitleName.text("no project");
                projectTitleUrl.text('');
                projectScenariosTab.children("a").tab("show");
                projectDataTab.addClass('disabled');
                projectDataTab.hide();
                projectDataTab.children("a").removeAttr("data-toggle");
                // projectSettingsTab.addClass('disabled');
                // projectSettingsTab.children("a").removeAttr('data-toggle');
            }
        };

        var currentProject = function () {
            return sandbox.currentProject;
        };

        var isScenarioFromCurrentProject = function (scenario) {
            return ((!currentProject() && !scenario.projectKey) ||
                (currentProject() && currentProject().key === scenario.projectKey));
        };

        var setRunScenarioBtnState = function () {
            let selected = ScenariosTable.selectedScenarios().length;
            if (selected === 0) {
                runScenarioBtn.text("Run");
                runScenarioBtn.attr("disabled", "disabled");
            } else {
                runScenarioBtn.removeAttr("disabled");
                runScenarioBtn.text("Run (" + selected + ")");
            }
        };

        return projectPage;
    });


define('home/scenario_page', ["jquery", "moment", "./data_table"], function ($, moment, DataTable) {
    'use strict';

    const SCENARIO_DATA_TABLE_ID = "scenario-data-table";

    const scenarioPage = {};
    const scenarioNameTitle = $("#js-scenario-page-scenario-name");
    const scenarioDetailUrl = $("#js-scenario-page-scenario-url");
    const scenarioDetailDeviceSize = $("#js-scenario-page-scenario-device-size");
    const scenarioDetailDeviceWidth = $("#js-scenario-page-scenario-device-width");
    const resultsTable = $("#js-results-table");
    const editScenarioBtn = $(".js-scenario-page-edit-scenario");
    const runScenarioBtn = $(".js-scenario-page-run-scenario");
    const cloneScenarioBtn = $(".js-scenario-page-clone-scenario");
    const removeScenarioBtn = $(".js-scenario-page-remove-scenario");
    const COL_COUNT = 5;

    const scenarioDataTable = DataTable.create(SCENARIO_DATA_TABLE_ID, false);

    var sandbox;
    var syncEngine;
    var device;
    var currentScenario;
    var hasResult;

    scenarioPage.initialize = function (s, env) {
        sandbox = s;
        syncEngine = env.syncEngine;
        device = env.device;

        scenarioDataTable.addListener("dataEdit", function (data) {
            let scenario = currentScenario;
            sandbox.editData(data).then(function (data) {
                scenario.dataSet.addData(data).then(function (data) {
                    syncEngine.addScenario(scenario);
                });
            });
        });

        scenarioDataTable.addListener("dataRemove", function (data) {
            if (currentScenario.dataSet.removeData(data.name)) {
                syncEngine.addScenario(currentScenario);
            }
        });

        syncEngine.addListener("scenarioUpdated", function (scenario) {
            if (currentScenario && scenario.key === currentScenario.key) {
                scenarioPage.render(scenario);
            }
        });

        syncEngine.addListener("scenarioRemoved", function (scenario) {
            if (currentScenario && scenario.key === currentScenario.key) {
                currentScenario = null;
                sandbox.showProject();
            }
        });

        syncEngine.addListener("scenarioResultCreated", function (result) {
            if (currentScenario && result.scenarioKey === currentScenario.key) {
                resultsTable.find("tbody .js-td-result-empty").remove();
                updateOrAddResultRow(result);
            }
        });

        syncEngine.addListener("scenarioResultUpdated", function (result) {
            if (currentScenario && result.scenarioKey === currentScenario.key) {
                updateOrAddResultRow(result);
            }
        });

        editScenarioBtn.click(function (e) {
            e.preventDefault();
            sandbox.editScenario(currentScenario);
        });

        runScenarioBtn.click(function (e) {
            e.preventDefault();
            sandbox.runScenarios([currentScenario]);
        });

        cloneScenarioBtn.click(function (e) {
            e.preventDefault();
            var clone = currentScenario.clone();
            delete clone.key;
            delete clone.id;
            delete clone.created_at;
            delete clone.local_updated_at;
            delete clone.updated_at;

            clone.name = clone.name + " (Clone)";

            sandbox.editScenario(clone, {
                mode: "clone"
            });
        });

        removeScenarioBtn.click(function (e) {
            e.preventDefault();
            sandbox.removeScenario(currentScenario);
            sandbox.showProject();
        });
    };

    scenarioPage.suspend = function () {
        currentScenario = null;
    };

    scenarioPage.render = function (scenario) {
        currentScenario = scenario;
        resultsTable.find("tbody").empty();
        syncEngine.iterateScenarioResults(scenario.key).then(function (results) {
            if (results.length > 0) {
                results.forEach(function (result) {
                    updateOrAddResultRow(result);
                });
            } else {
                resultsTable.find("tbody").append(
                    $("<tr />", {"class": "js-td-result-empty"}).append(
                        $("<td />", {'class': 'td-help', 'colspan': COL_COUNT}).text("No results avaiable.")));

            }
        });

        scenarioNameTitle.text(scenario.name);
        scenario.getFullUrl(syncEngine).then(function (url) {
            scenarioDetailUrl.text(url);
        });
        scenarioDetailDeviceSize.empty().append(device.getLabel(scenario.deviceSize));
        scenarioDetailDeviceWidth.text("(" + device.getWidth(scenario.deviceSize) + "px)");
        scenarioDataTable.refresh(scenario.dataSet);
    };

    var setResultToRow = function (tr, result) {
        $(tr).data("result", result);
    };
    var getResultFromRow = function (element) {
        var tr = $(element).closest("tr", resultsTable);
        if (tr) {
            return tr.data("result");
        } else {
            throw new Error("Scenario result must be retrived from with or within row");
        }
    };
    var updateOrAddResultRow = function (result) {
        var row = getRowByResultKey(result.key), inserted, tbody;
        if (row) {
            populateResultRow(row, result);
        } else {
            row = populateResultRow(rowTemplate(), result);
            tbody = resultsTable.find("tbody");

            if (!result.startTime) {
                tbody.prepend(row);
            } else {
                inserted = false;
                tbody.children("tr").each(function (index) {
                    var thisRowResult = getResultFromRow(this);
                    if (thisRowResult.startTime && thisRowResult.startTime <= result.startTime) {
                        $(this).before(row);
                        inserted = true;
                        return false;
                    }
                });
                if (!inserted) {
                    tbody.append(row);
                }
            }
        }
    };
    var getRowByResultKey = function (resultKey) {
        var found = null;
        resultsTable.find("tbody").children("tr").each(function (index) {
            if (getResultFromRow(this).key === resultKey) {
                found = this;
            }
        });
        return found;
    };
    var rowTemplate = function () {
        var row = $("<tr />").append(
            $("<td />", {'class': 'js-result-start-time td-result-start-time'}),
            $("<td />", {'class': 'js-result-pass td-result-pass'}),
            $("<td />", {'class': 'js-result-device-size td-result-device-size'}),
            // $("<td />", { 'class': 'js-result-device-width td-result-device-width' }),
            $("<td />", {'class': 'js-result-url td-result-url'}),
            $("<td />").append(
                $("<div />", {'class': 'js-result-note td-result-note'}))
        );
        return row;
    };
    var populateResultRow = function (tr, result) {
        var passLabel;

        setResultToRow(tr, result);
        $(tr).find(".js-result-start-time").text(moment(result.startTime).format("hh:mma MM/DD"));
        if (result.isCompleted) {
            if (result.isPass) {
                passLabel = $("<span />").addClass("label-result-pass").text(result.statusDisplay);
            } else {
                passLabel = $("<span />").addClass("label-result-fail").text(result.statusDisplay);
            }
        }
        $(tr).find(".js-result-pass").empty().append(passLabel);
        $(tr).find(".js-result-device-size").empty().append(
            device.getLabel(result.deviceSize));
        // $(tr).find(".js-result-device-width").append(
        //   $("<span />", { "class": "label-device-width" }).text(result.deviceWidth));
        $(tr).find(".js-result-url").text(result.url);
        $(tr).find(".js-result-note").text(result.note);
        return tr;
    };

    return scenarioPage;
});

define('home/header', ["jquery"], function ($) {
    'use strict';

    const header = {};

    const headerSigninNav = $("#header-nav-signin");
    const headerUserNav = $("#header-nav-user");
    const headerSignoutNav = $("#header-nav-signout");
    const headerUsername = $("#header-username");

    var account;

    const setHeaderUser = function () {
        if (account.signedInUser()) {
            headerUsername.text(account.signedInUser().username);
            headerSigninNav.css("display", "none");
            headerUserNav.css("display", "");
        } else {
            headerUsername.text('');
            headerUserNav.css("display", "none");
            headerSigninNav.css("display", "");
        }
    };

    headerSignoutNav.click(function (e) {
        account.signOut();
    });


    header.initialize = function (env) {
        account = env.account;

        setHeaderUser();

        account.addListener("userSignedIn", function (user) {
            setHeaderUser();
        });
        account.addListener("userSignedOut", function () {
            setHeaderUser();
        });
    };

    return header;
});

define('Project', ["DataSet"], function (DataSet) {
    'use strict';

    const Project = {
        createWithJson: function (json) {
            if (typeof json.name === "undefined") {
                json.name = "";
            }
            if (typeof json.url === "undefined") {
                json.url = "";
            }
            if (typeof json.dataSet === "undefined") {
                json.dataSet = {};
            }
            var obj = Object.create(Project);
            for (var p in json) {
                if (json.hasOwnProperty(p)) {
                    if (p === "dataSet") {
                        obj.dataSet = DataSet.createWithJson(json.dataSet);
                    } else {
                        obj[p] = json[p];
                    }
                }
            }
            return obj;
        }
    };
    return Project;
});

define('home/sidebar', ["jquery", "Project", "EventEmitter"], function ($, Project, EventEmitter) {
    'us strict';

    const PROJECT_DATA_NAME = "project";

    const sidebar = new EventEmitter();
    const projectsList = $("ul.sidebar-projects-nav");
    const addProjectBtn = $("#add-project-btn");
    const sidebarToggleBtn = $(".js-sidebar-toggle");

    var sandbox;
    var syncEngine;

    sidebar.initialize = function (s, env) {
        sandbox = s;
        syncEngine = env.syncEngine;

        addProjectBtn.click(function (e) {
            e.preventDefault();
            e.stopPropagation();

            editProjectComponent.editProject(Project.createWithJson({name: ""}));
        });

        sidebarToggleBtn.click(function () {
            $("#window").toggleClass("sidebar-toggled");
            var icon = $(this).children("i");
            if (icon.hasClass("fa-caret-right")) {
                icon.removeClass("fa-caret-right");
                icon.addClass("fa-caret-left");
            } else {
                icon.removeClass("fa-caret-left");
                icon.addClass("fa-caret-right");
            }
        });
    };

    var renderProjects = function () {
        var li, listOfLi = [];
        syncEngine.iterateAllProjects().then(
            function (projects) {
                projectsList.empty();

                projectsList.append(
                    projects.map(function (p) {
                        li = $("<li />")
                            .data(PROJECT_DATA_NAME, p)
                            .append($("<div />", {'class': "clearfix"})
                                .append($("<button />", {
                                        'class': "sidebar-project-edit-btn btn btn-xs btn-success pull-right",
                                        'title': "Edit"
                                    })
                                        .append($("<i />", {'class': "fa fa-pencil"}))
                                        .click(function (e) {
                                            editProjectComponent.editProject(p);

                                            e.preventDefault();
                                            e.stopPropagation();
                                        })
                                )
                                .append($("<div />", {'class': "sidebar-project-name"}).text(p.name))
                            )
                            .append($("<div />", {'class': 'sidebar-project-url'})
                                .text(p.url))
                            .click(function () {
                                projectSelected($(this).data(PROJECT_DATA_NAME));
                            });
                        return li;
                    }));
            }
        ).then(function () {
            projectsList.append($("<li />")
                .append($("<div />", {'class': 'clearfix'})
                    .text("<no project>")
                )
                .click(function () {
                    projectSelected(null);
                }));
            setProjectActive(currentProject());
        });
    };

    var currentProject = function () {
        return sandbox.currentProject;
    };

    var projectSelected = function (project) {
        sidebar.emitEvent("projectSelected", [project]);
    };

    sidebar.refresh = function () {
        renderProjects();
    };

    var setProjectActive = function (project) {
        projectsList.children("li").removeClass("active");
        projectsList.children("li").filter(function (index, element) {
            if (project) {
                var p = $(element).data(PROJECT_DATA_NAME);
                return p && p.key === project.key;
            } else {
                return !$(element).data(PROJECT_DATA_NAME);
            }
        }).addClass("active");
    };

    var editProjectComponent = (function () {
        var my = {};

        var editingProject;

        var modal = $("#edit-project-modal");
        var modalProjectName = modal.find("#edit-project-name");
        var modalProjectUrl = modal.find("#edit-project-url");
        var editProjectForm = modal.find("#edit-project-form");
        var editProjectError = modal.find("#edit-project-error");

        var deleteProjectBtn = modal.find("#delete-project-btn");
        var deleteProjectConfirmation = modal.find("#delete-project-confirmation");
        var deleteProjectConfirmBtn = modal.find("#delete-project-confirm-btn");
        var deleteProjectCancelBtn = modal.find("#delete-project-cancel-btn");

        editProjectForm.submit(function (e) {
            e.preventDefault();

            if (modalProjectName.val() === '') {
                editProjectError.text("Please provide a project name");
            } else if (modalProjectUrl.val() === '') {
                editProjectError.text("Please provide a base URL");
            } else {
                editingProject.name = modalProjectName.val();
                editingProject.url = modalProjectUrl.val();
                syncEngine.addProject(editingProject).then(
                    function (p) {
                        modal.modal("hide");
                    }).catch(function (err) {
                    editProjectError.text("Error saving project");
                    console.error("Error saving project: " + err);
                });

            }
        });

        deleteProjectBtn.click(function (e) {
            e.preventDefault();
            e.stopPropagation();

            deleteProjectConfirmation.show(400);
        });
        deleteProjectConfirmBtn.click(function (e) {
            e.preventDefault();
            e.stopPropagation();

            if (editingProject.key) { // Project was created
                syncEngine.removeProject(editingProject).then(
                    function (p) {
                        modal.modal('hide');
                    },
                    function (err) {
                        console.error("Delete project error: %s" + err);
                        if (err.stack) console.error(err.stack);
                        throw err;
                    }
                );
            }
        });
        deleteProjectCancelBtn.click(function (e) {
            e.preventDefault();
            e.stopPropagation();

            deleteProjectConfirmation.hide(400);
        });

        modal.on("hidden.bs.modal", function () {
            resetModal();
        });
        modal.on("show.bs.modal", function () {
            if (editingProject.key) {
                deleteProjectBtn.show();
            } else {
                deleteProjectBtn.hide();
            }
        });
        modal.on("shown.bs.modal", function () {
            modalProjectName.focus();
        });

        my.editProject = function (project) {
            editingProject = project;
            modalProjectName.val(project.name);
            modalProjectUrl.val(project.url);
            modal.modal("show");
        };

        var resetModal = function () {
            modalProjectName.val('');
            modalProjectUrl.val('');
            editProjectError.text('');
            deleteProjectConfirmation.hide();
        };

        return my;
    }());

    return sidebar;
});

define('ScenarioResult', ["Action", "EventEmitter"], function (Action, EventEmitter) {
    'use strict';

    const ScenarioResult = {
        createWithJson: function (json) {
            json = json || {};
            var obj = Object.create(ScenarioResult, {
                eventEmitter: {
                    value: new EventEmitter(),
                    enumerable: false,
                    writable: false
                },
                isCompleted: {
                    enumerable: false,
                    get: function () {
                        return this.status === "pass" || this.status === "fail" || this.status === "abort";
                    }
                },
                isPass: {
                    enumerable: false,
                    get: function () {
                        return this.status === "pass";
                    }
                },
                pass: {
                    enumerable: false,
                    writable: false,
                    value: function () {
                        this.status = "pass";
                    }
                },
                fail: {
                    enumerable: false,
                    writable: false,
                    value: function () {
                        this.status = "fail";
                    }
                },
                abort: {
                    enumerable: false,
                    writable: false,
                    value: function () {
                        if (!this.isCompleted) {
                            this.status = "abort";
                        }
                    }
                },
                progress: {
                    enumerable: false,
                    get: function () {
                        if (this.isCompleted) {
                            return 1;
                        } else if (this.actions.length === 0) {
                            return 0;
                        } else {
                            return this.actionResults.length / this.actions.length;
                        }
                    }
                },
                reset: {
                    enumerable: false,
                    writable: false,
                    value: function () {
                        this.actions = [];
                        this.actionResults = [];
                        delete this.status;
                        delete this.startTime;
                    }
                },
                statusDisplay: {
                    enumerable: false,
                    get: function () {
                        return this.status.charAt(0).toUpperCase() + this.status.slice(1);
                    }
                }
            });

            obj.actions = [];
            for (var p in json) {
                if (json.hasOwnProperty(p)) {
                    if (p === "actions") {
                        obj.actions = json.actions ? json.actions.map(Action.createWithJson) : [];
                    } else if (p === "actionResults") {
                        obj.actionResults = json.actionResults ? json.actionResults.map(ActionResult.createWithJson) : [];
                    } else {
                        obj[p] = json[p];
                    }
                }
            }
            return obj;
        },
        clone: function (properties) {
            var c = ScenarioResult.createWithJson(this);
            for (var p in properties) {
                if (p in c) {
                    c[p] = properties[p];
                }
            }
            return c;
        },
        addListener: function (type, fn) {
            this.eventEmitter.addListener(type, fn.bind(this));
        },
        save: function (syncEngine) {
            return syncEngine.addScenarioResult(this).then(function (obj) {
                this.eventEmitter.emitEvent("save");
                return obj;
            }.bind(this));
        }
    };

    return ScenarioResult;
});

define('home/sandbox', ["jquery", "./header", "./sidebar", "q", "DataSet", "windows", "ScenarioResult", "bootstrap-notify"], function ($, header, sidebar, Q, DataSet, windows, ScenarioResult, _bootstrap_notify) {
    'use strict';

    const PROJECT_PAGE_INDEX = 0, SCENARIO_PAGE_INDEX = 1;
    const SETTING_LAST_PROJECT_SHOWN = "lastProjectShown";
    const SETTING_LAST_SIGNIN_PROMPT = "lastSignInPrompt";

    const SIGNIN_PROMPT_INTERVAL = 60000 * 60 * 12; // 12 hours

    const pagesCarousel = $('#js-pages-carousel');
    const backLink = $("#js-back-link-project-page");
    const initializationCover = $("#initialization-cover");

    const sandbox = {};

    var projectPage;
    var scenarioPage;
    var storage, syncEngine, mixpanel, account, device, remoteHost;

    var _currentProject;
    Object.defineProperty(sandbox, "currentProject", {
        get: function () {
            return _currentProject;
        }
    });

    sandbox.init = function (pp, sp, env) {
        projectPage = pp;
        scenarioPage = sp;
        storage = env.storage;
        syncEngine = env.syncEngine;
        mixpanel = env.mixpanel;
        remoteHost = env.remoteHost;
        account = env.account;
        device = env.device;

        sidebar.initialize(sandbox, {
            syncEngine: syncEngine
        });
        projectPage.initialize(sandbox, {
            storage: storage,
            syncEngine: syncEngine,
            mixpanel: mixpanel,
            device: device
        });
        scenarioPage.initialize(sandbox, {
            syncEngine: syncEngine,
            device: device
        });
        header.initialize({
            account: account
        });
        editScenarioComponent.initialize({
            syncEngine: syncEngine,
            storage: storage,
            device: device,
            windows: windows
        });
        runScenarioComponent.initialize({
            syncEngine: syncEngine,
            windows: windows,
            device: device
        });

        backLink.hide();

        storage.getSetting(SETTING_LAST_PROJECT_SHOWN).then(
            function (projectKey) {
                if (projectKey) {
                    return syncEngine.getProjectByKey(projectKey).then(
                        function (p) {
                            _currentProject = p;
                        });
                } else {
                    _currentProject = null;
                }
            },
            function (err) {
                console.error("Error getSetting on SETTING_LAST_PROJECT_SHOWN %i: %s", SETTING_LAST_PROJECT_SHOWN, err);
                _currentProject = null;
                storage.saveSetting(SETTING_LAST_PROJECT_SHOWN, null);
            }
        ).then(function () {
            projectPage.refresh();
            sidebar.refresh();
            initializationCover.hide();
        });

        syncEngine.addListener("scenarioCreated", function (createdScenario) {
            mixpanel.track("Scenario create", {
                stepsCount: createdScenario.actions.length,
                deviceSize: createdScenario.deviceSize
            });
        });

        syncEngine.addListener("scenarioUpdated", function (updatedScenario) {
            mixpanel.track("Scenario update", {
                stepsCount: updatedScenario.actions.length,
                deviceSize: updatedScenario.deviceSize
            });
        });

        syncEngine.addListener("scenarioRemoved", function (removedScenario) {
            mixpanel.track("Scenario remove");
        });

        syncEngine.addListener("projectCreated", function (createdProject) {
            projectPage.refresh();
            sidebar.refresh();

            mixpanel.track("Project create");
        });
        syncEngine.addListener("projectUpdated", function (updatedProject) {
            if (sandbox.currentProject && sandbox.currentProject.key === updatedProject.key) {
                _currentProject = updatedProject;
                projectPage.refresh();
            }
            sidebar.refresh();

            mixpanel.track("Project update");
        });
        syncEngine.addListener("projectRemoved", function (removedProject) {
            if (sandbox.currentProject && removedProject.key === sandbox.currentProject.key) {
                _currentProject = null;
                projectPage.refresh();
            }
            sidebar.refresh();

            mixpanel.track("Project remove");
        });

        sidebar.addListener("projectSelected", function (selectedProject) {
            if ((!!selectedProject !== !!sandbox.currentProject) ||
                (sandbox.currentProject &&
                    selectedProject.key !== sandbox.currentProject.key)) {
                _currentProject = selectedProject;
                projectPage.refresh();
                sidebar.refresh();
                sandbox.showProject();
                storage.saveSetting(SETTING_LAST_PROJECT_SHOWN, (selectedProject ? selectedProject.key : null));
            }
        });

        syncEngine.addListener("scenarioCreated scenarioUpdated projectCreated projectUpdated", function () {
            if (!account.signedInUser()) {
                storage.getSetting(SETTING_LAST_SIGNIN_PROMPT).then(function (value) {
                    if (value === null || value === undefined || (Date.now() > value + SIGNIN_PROMPT_INTERVAL)) {
                        $("#prompt-signin-modal").modal("show");
                        storage.saveSetting(SETTING_LAST_SIGNIN_PROMPT, Date.now());
                    }
                });
            }
        });
    };

    backLink.click(function () {
        sandbox.showProject();
    });

    sandbox.showProject = function () {
        pagesCarousel.carousel(PROJECT_PAGE_INDEX);
        scenarioPage.suspend();
    };

    sandbox.showScenarioPage = function (scenario) {
        scenarioPage.render(scenario);
        pagesCarousel.carousel(SCENARIO_PAGE_INDEX);
    };

    pagesCarousel.on("slid.bs.carousel", function (e) {
        if ($(e.relatedTarget).index(pagesCarousel.find('.item')) === PROJECT_PAGE_INDEX) {
            backLink.hide();
        } else {
            backLink.show();
        }
    });

    sandbox.editScenario = function (scenario, options) {
        return editScenarioComponent.editScenario(scenario, options);
    };

    sandbox.editData = function (data) {
        return editDataComponent.editData(data);
    };

    sandbox.runScenarios = function (scenarios) {
        return runScenarioComponent.runScenarios(scenarios);
    };

    sandbox.showMessage = function (msg, settings) {
        let defaultSettings = {
            type: "growl",
            allow_dismiss: false,
            delay: 2000,
            placement: {
                from: "top",
                align: "right"
            },
            offset: {
                x: 20,
                y: 70 // header height (50) + space
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
        };

        for (var p in settings) {
            defaultSettings[p] = settings[p];
        }

        return $.notify({
            message: msg
        }, defaultSettings);
    };

    // Shadow remove scenario and show message, if user cancel (undo), then unremove
    // Return promise that resolve to a boolean of whether the scenario is removed
    sandbox.removeScenario = function (scenario) {
        let uid = Date.now();
        let klass = "js-home-scenario-remove-" + uid;

        let cancelled = false;

        let notifyMessage;
        let removeScenarioDeferred = Q.defer();

        syncEngine.startEditScenario(scenario);
        syncEngine.removeScenario(scenario);

        // Listen to when user click undo on the scenario remove
        // using unquie class name per notify message
        $("body").one("click", "." + klass, function (e) {
            e.preventDefault();

            console.log("Undo scenario remove: %O", scenario);
            syncEngine.unremoveScenario(scenario).catch(function (err) {
                console.error("unremove scenario %O failed: %s", scenario, err);
            });
            cancelled = true;
            removeScenarioDeferred.resolve(false);
            notifyMessage.close();
        });

        // Add unique class name to undo button to listen on
        notifyMessage = sandbox.showMessage("Scenario <strong>" + scenario.name + "</strong> removed.<button href='#' class='btn-growl btn-sm " + klass + "'>Undo</button>", {
            onClosed: function () {
                if (!cancelled) {
                    // Remove the listener if not used
                    $("body").off("click", "." + klass);
                    removeScenarioDeferred.resolve(true);
                }
            }
        });

        let p = removeScenarioDeferred.promise;
        p.finally(function () {
            syncEngine.endEditScenario(scenario);
        });
        return p;
    };

    const feedbackComponent = (function () {
        var feedbackBtn = $(".js-feedback"),
            feedbackModal = $("#feedback-modal"),
            feedbackForm = $("#feedback-form"),
            feedbackName = $("#feedback-name"),
            feedbackEmail = $("#feedback-email"),
            feedbackMessage = $("#feedback-message"),
            feedbackError = $("#feedback-error"),
            feedbackModalCover = $("#modal-cover-feedback");

        feedbackBtn.click(function () {
            // if user is signed in, and never input on name/email,
            // then use the current sign in user
            if (account.signedInUser()) {
                if (feedbackName.val() === "") {
                    feedbackName.val(account.signedInUser().username);
                }
                if (feedbackEmail.val() === "") {
                    feedbackEmail.val(account.signedInUser().email);
                }
            }
            feedbackModal.modal("show");
        });

        feedbackForm.submit(function (e) {
            e.preventDefault();

            if (feedbackEmail.val().length === 0) {
                feedbackError.text("Email is required");
            } else if (feedbackMessage.val().length === 0) {
                feedbackError.text("Please leave a message");
            } else {
                feedbackModalCover.text("Sending...");
                feedbackModalCover.show();
                $.ajax(remoteHost + "/feedbacks", {
                    method: "POST",
                    complete: function () {
                    },
                    success: function (data, textStatus, jqXHR) {
                        feedbackModalCover.html("Thank you.<br>We will get back to you shortly.");
                        feedbackModalCover.show();
                        feedbackName.val('');
                        feedbackEmail.val('');
                        feedbackMessage.val('');
                        feedbackError.text('');
                        setTimeout(function () {
                            feedbackModalCover.hide();
                            feedbackModal.modal("hide");
                        }, 2000);
                    },
                    data: {
                        'email': feedbackEmail.val(),
                        'name': feedbackName.val(),
                        'message': feedbackMessage.val()
                    },
                    accepts: 'application/json',
                    error: function (jqXHR, textStatus, errorThrown) {
                        feedbackModalCover.hide();
                        console.error("Error sending feedback: " + textStatus);
                        feedbackError.text("Network Error. Please try again later.");
                    }
                });
            }
        });

    }());

    var signInComponent = (function () {
        var signinModal = $("#signin-modal"),
            signinForm = $("#signin-form"),
            signinLogin = $("#signin-modal-login"),
            signinPassword = $("#signin-modal-password"),
            signinError = $("#signin-modal-error"),
            signinAlert = $("#signin-modal-alert"),
            signinForgotPassword = $("#signin-modal-forgot-password"),
            signinWithGithubBtn = signinModal.find(".js-signin-with-github"),
            signinWithGoogleBtn = signinModal.find(".js-signin-with-google");


        signinForm.submit(function (e) {
            e.preventDefault();

            if (signinLogin.val() === "") {
                showAlert("Username/Email required.");
            } else if (signinPassword.val() === "") {
                showAlert("Password required.");
            } else {
                account.signIn(signinLogin.val(), signinPassword.val()).then(
                    function (user) {
                        signinModal.modal('hide');
                    },
                    function (err) {
                        showAlert(err);
                    });
            }
        });

        signinWithGithubBtn.click(function (e) {
            account.signInWithGithub().then(
                function (user) {
                    if (user) {
                        signinModal.modal('hide');
                    } else {
                        hideAlert();
                    }
                },
                function (err) {
                    showAlert(err);
                });
        });

        signinWithGoogleBtn.click(function (e) {
            account.signInWithGoogle().then(
                function (user) {
                    if (user) {
                        signinModal.modal('hide');
                    } else {
                        hideAlert();
                    }
                },
                function (err) {
                    showAlert(err);
                });

        });

        var resetSignInModal = function () {
            hideAlert();
            signinLogin.val('');
            signinPassword.val('');
        };

        var showAlert = function (error) {
            signinAlert.slideDown(400, function () {
                if (Array.isArray(error)) {
                    signinError.html(error.join("<br>"));
                } else {
                    signinError.html(error);
                }
            });
        };

        var hideAlert = function () {
            signinAlert.slideUp(400, function () {
                signinError.text('');
            });
        };

        signinModal.on("show.bs.modal", function (e) {
            resetSignInModal();
        });
        signinAlert.find(".close").click(function (e) {
            hideAlert();
        });

        signinForgotPassword.attr("href", remoteHost + "/users/password/new");

    }());

    const signUpComponent = (function () {
        var signupModal = $("#signup-modal"),
            signupForm = $("#signup-form"),
            signupUsername = $("#signup-modal-username"),
            signupEmail = $("#signup-modal-email"),
            signupPassword = $("#signup-modal-password"),
            signupPasswordConfirmation = $("#signup-modal-password-confirmation"),
            signupError = $("#signup-modal-error"),
            signupAlert = $("#signup-modal-alert"),
            signinWithGithubBtn = signupModal.find(".js-signin-with-github"),
            signinWithGoogleBtn = signupModal.find(".js-signin-with-google");

        signupForm.submit(function (e) {
            e.preventDefault();

            if (signupUsername.val() === "") {
                showAlert("Username required.");
            } else if (signupEmail.val() === "") {
                showAlert("Email required.");
            } else if (signupPassword.val() === "") {
                showAlert("Password required.");
            } else if (signupPasswordConfirmation.val() === "") {
                showAlert("Password Confirmation required.");
            } else if (signupPassword.val() !== signupPasswordConfirmation.val()) {
                showAlert("Password Confirmation does not match password.");
            } else {
                account.signUp(signupUsername.val(),
                    signupEmail.val(),
                    signupPassword.val(),
                    signupPasswordConfirmation.val()).then(
                    function (user) {
                        signupModal.modal('hide');
                    },
                    function (err) {
                        showAlert(err);
                    }
                );
            }
        });

        signinWithGithubBtn.click(function (e) {
            account.signInWithGithub().then(function (user) {
                if (user) {
                    signupModal.modal('hide');
                } else {
                    hideAlert();
                }
            }, function (err) {
                showAlert(err);
            });
        });

        signinWithGoogleBtn.click(function (e) {
            account.signInWithGoogle().then(function (user) {
                if (user) {
                    signupModal.modal('hide');
                } else {
                    hideAlert();
                }
            }, function (err) {
                showAlert(err);
            });
        });

        var resetSignupModal = function () {
            hideAlert();
            signupUsername.val('');
            signupEmail.val('');
            signupPassword.val('');
            signupPasswordConfirmation.val('');
        };

        var showAlert = function (error) {
            signupAlert.slideDown(400, function () {
                if (Array.isArray(error)) {
                    signupError.html(error.join("<br>"));
                } else {
                    signupError.html(error);
                }
            });
        };

        var hideAlert = function () {
            signupAlert.slideUp(400, function () {
                signupError.text('');
            });
        };

        signupModal.on("show.bs.modal", function (e) {
            resetSignupModal();
        });
        signupAlert.find(".close").click(function (e) {
            hideAlert();
        });

    }());

    const editProfileComponent = (function () {
        var editProfileModal = $("#edit-profile-modal"),
            editProfileForm = $("#edit-profile-form"),
            editProfileUsername = $("#edit-profile-modal-username"),
            editProfileEmail = $("#edit-profile-modal-email"),
            editProfileUpdatePasswordsInputs = $("#edit-profile-update-passwords"),
            editProfilePassword = $("#edit-profile-modal-password"),
            editProfilePasswordConfirmation = $("#edit-profile-modal-password-confirmation"),
            editProfileCurrentPassword = $("#edit-profile-modal-current-password"),
            editProfileError = $("#edit-profile-modal-error"),
            editProfileAlert = $("#edit-profile-modal-alert");

        editProfileModal.submit(function (e) {
            e.preventDefault();
            if (editProfileUsername.val() === "") {
                showAlert("Username required.");
            } else if (editProfileEmail.val() === "") {
                showAlert("Email required.");
            } else if (editProfilePassword.val() !== "" && editProfilePasswordConfirmation.val() === "") {
                showAlert("Password confirmation required.");
            } else if (editProfilePassword.val() !== editProfilePasswordConfirmation.val()) {
                showAlert("Password confirmation does not match password.");
            } else if (editProfileCurrentPassword.val() === "") {
                showAlert("Current password required.");
            } else {
                account.editUser(editProfileUsername.val(),
                    editProfileEmail.val(),
                    editProfilePassword.val(),
                    editProfilePasswordConfirmation.val(),
                    editProfileCurrentPassword.val()).then(
                    function (user) {
                        editProfileModal.modal('hide');
                    },
                    function (err) {
                        showAlert(err);
                    });
            }
        });

        var showAlert = function (error) {
            editProfileAlert.slideDown(400, function () {
                if (Array.isArray(error)) {
                    editProfileError.html(error.join("<br>"));
                } else {
                    editProfileError.html(error);
                }
            });
        };

        var hideAlert = function () {
            editProfileAlert.slideUp(400, function () {
                editProfileError.text('');
            });
        };

        var resetEditProfileModal = function () {
            hideAlert();
            editProfileUsername.val(account.signedInUser().username);
            editProfileEmail.val(account.signedInUser().email);
            editProfilePassword.val('');
            editProfilePasswordConfirmation.val('');
            editProfileCurrentPassword.val('');
        };

        editProfileModal.on("show.bs.modal", function (e) {
            if (!account.signedInUser()) {
                e.preventDefault();
                return;
            }

            resetEditProfileModal();
            if (account.signedInUser().byOmniauth()) {
                editProfileUpdatePasswordsInputs.hide();
            } else {
                editProfileUpdatePasswordsInputs.show();
            }
        });
        editProfileAlert.find(".close").click(function (e) {
            hideAlert();
        });
    }());

    const editDataComponent = (function () {
        const editDataModal = $("#edit-data-modal");
        const editDataForm = $("#edit-data-modal-form");
        const editDataName = $("#edit-data-modal-name");
        const editDataValue = $("#edit-data-modal-value");
        const editDataRegex = $("#edit-data-modal-regex");
        const editDataError = $("#edit-data-modal-error");
        const editDataRegexHelpLink = $("#edit-data-modal-regex-help");
        const editDataRegexHelp = $(".js-edit-data-modal-regex-hints");

        const my = {};

        var editDataDeferred;

        editDataForm.submit(function (e) {
            e.preventDefault();

            let data = {
                name: editDataName.val(),
                value: editDataValue.val(),
                regex: editDataRegex.is(":checked")
            };
            let err = DataSet.isDataValid(data);
            if (err) {
                editDataError.text(err);
                return;
            }

            editDataDeferred.resolve(data);
            editDataModal.modal("hide");
        });

        my.editData = function (data) {
            editDataName.val(data.name);
            if (data.name) {
                editDataName.prop("disabled", true);
            }
            editDataValue.val(data.value);
            editDataRegex.prop("checked", data.regex);

            editDataDeferred = Q.defer();
            editDataModal.modal("show");

            return editDataDeferred.promise;
        };

        editDataModal.on("shown.bs.modal", function () {
            editDataName.focus();
        });
        editDataModal.on("hidden.bs.modal", function () {
            editDataError.text('');
            editDataName.prop("disabled", false);
        });

        editDataRegexHelpLink.click(function (e) {
            e.preventDefault();
            editDataRegexHelp.toggle();
        });

        return my;
    })();

    const editScenarioComponent = (function () {
        const SETTING_NEW_SCENARIO_TUTORIAL_SHOWN = "newScenarioTutorialShown";

        const my = {};
        const editScenarioModal = $("#new-scenario-modal");
        const editScenarioModalTitle = $("#new-scenario-modal-title");
        const editScenarioName = $("#new-scenario-name");
        const editScenarioProjectUrl = $("#new-scenario-project-url");
        const editScenarioUrl = $("#new-scenario-url");
        const editScenarioForm = $("#new-scenario-form");
        const editScenarioError = $("#new-scenario-error");
        const editScenarioDeviceSizeXSOption = $("#new-scenario-device-size-options-xs");
        const editScenarioDeviceSizeSMOption = $("#new-scenario-device-size-options-sm");
        const editScenarioDeviceSizeMDOption = $("#new-scenario-device-size-options-md");
        const editScenarioDeviceSizeLGOption = $("#new-scenario-device-size-options-lg");
        var shownTutorial;
        var currentScenario;

        var syncEngine, storage, windows, device;

        my.initialize = function (env) {
            syncEngine = env.syncEngine;
            storage = env.storage;
            windows = env.windows;
            device = env.device;

            storage.getSetting(SETTING_NEW_SCENARIO_TUTORIAL_SHOWN).then(function (value) {
                shownTutorial = !!value;
            });

            editScenarioDeviceSizeXSOption.after(
                $("<div />").append(
                    $("<div />", {"class": "label-device-size-options-name"}).append(
                        device.getLabel(device.DEVICE_SIZE_EXTRA_SMALL)),
                    $("<span />").text(" " + device.getFullName(device.DEVICE_SIZE_EXTRA_SMALL) + " (" + device.getWidth(device.DEVICE_SIZE_EXTRA_SMALL) + "px)")));
            editScenarioDeviceSizeSMOption.after(
                $("<div />").append(
                    $("<div />", {"class": "label-device-size-options-name"}).append(
                        device.getLabel(device.DEVICE_SIZE_SMALL)),
                    $("<span />").text(" " + device.getFullName(device.DEVICE_SIZE_SMALL) + " (" + device.getWidth(device.DEVICE_SIZE_SMALL) + "px)")));
            editScenarioDeviceSizeMDOption.after(
                $("<div />").append(
                    $("<div />", {"class": "label-device-size-options-name"}).append(
                        device.getLabel(device.DEVICE_SIZE_MEDIUM)),
                    $("<span />").text(" " + device.getFullName(device.DEVICE_SIZE_MEDIUM) + " (" + device.getWidth(device.DEVICE_SIZE_MEDIUM) + "px)")));
            editScenarioDeviceSizeLGOption.after(
                $("<div />").append(
                    $("<div />", {"class": "label-device-size-options-name"}).append(
                        device.getLabel(device.DEVICE_SIZE_LARGE)),
                    $("<span />").text(" " + device.getFullName(device.DEVICE_SIZE_LARGE) + " (" + device.getWidth(device.DEVICE_SIZE_LARGE) + "px)")));
        };

        var getDeviceSizeOption = function () {
            return $("input[name=new-scenario-device-size-options]:checked", "#new-scenario-form").val();
        };

        editScenarioModal.on("shown.bs.modal", function (e) {
            editScenarioName.focus();
        });
        editScenarioModal.on("hide.bs.modal", function (e) {
            currentScenario = null;
        });

        editScenarioForm.submit(function (e) {
            let scenarioName = editScenarioName.val(),
                scenarioURL = editScenarioUrl.val(),
                baseScenario;

            e.preventDefault();
            e.stopPropagation();

            if (scenarioName === '') {
                editScenarioError.text("Scenario name is required.");
            } else if (!currentScenario.projectKey && (scenarioURL === '' || scenarioURL === 'http://' || scenarioURL === 'https://')) {
                editScenarioError.text("URL is required.");
            } else {
                baseScenario = currentScenario;
                baseScenario.name = scenarioName;
                baseScenario.url = scenarioURL;
                baseScenario.deviceSize = getDeviceSizeOption();

                let startEdit = false;
                if (baseScenario.key) {
                    startEdit = true;
                    syncEngine.startEditScenario(baseScenario);
                }

                let currentShownTutorial = shownTutorial;
                // If tutorial was never shown before, show it now and save its shown,
                // so it won't show by default from now on.
                if (!shownTutorial) {
                    shownTutorial = true;
                    storage.saveSetting(SETTING_NEW_SCENARIO_TUTORIAL_SHOWN, true);
                }

                baseScenario.getFullUrl(syncEngine).then(function (url) {
                    windows.openScenarioWindowForEdit(device, baseScenario, function (createdWindow) {
                        createdWindow.contentWindow.baseScenario = baseScenario;
                        createdWindow.contentWindow.shownTutorial = currentShownTutorial;
                        createdWindow.contentWindow.startUrl = url;

                        if (startEdit) {
                            createdWindow.onClosed.addListener(function () {
                                syncEngine.endEditScenario(baseScenario);
                            });
                        }
                    });
                    editScenarioModal.modal('hide');
                });
            }
        });

        my.editScenario = function (scenario, options) {
            options = options || {};

            currentScenario = scenario.clone();
            editScenarioName.val(scenario.name);
            syncEngine.getProjectByScenario(scenario).then(function (p) {
                if (p) {
                    editScenarioProjectUrl.text(p.url);
                    editScenarioProjectUrl.show();
                    editScenarioUrl.val(scenario.url);
                } else {
                    editScenarioProjectUrl.hide();
                    editScenarioUrl.val(scenario.url || "http://");
                }
            }).catch(function (err) {
                console.error("Error getting project of scenario %O: %s", scenario, err);
                editScenarioProjectUrl.hide();
                editScenarioUrl.val(scenario.url || "http://");
            });
            editScenarioError.text('');
            if (options.mode === "edit" || !options.mode) {
                editScenarioModalTitle.text("Edit Scenario");
            } else if (options.mode === "create") {
                editScenarioModalTitle.text("New Scenario");
            } else if (options.mode === "clone") {
                editScenarioModalTitle.text("Clone Scenario");
            }

            editScenarioModal.find("input[value=" + scenario.deviceSize + "]").prop("checked", true);
            editScenarioModal.modal("show");
        };

        return my;
    })();

    const runScenarioComponent = (function () {
        const my = {};

        const deviceSizesTableScenarioDataName = "scenario";

        const runScenarioForm = $("#run-scenario-form");
        const runScenarioModal = $("#run-scenario-modal");
        const runScenarioDomainRadio = $("input[name=run-scenario-radio-group-url]:radio");

        const runScenarioRadioDefaultUrl = $("#run-scenario-radio-url-default");
        const runScenarioRadioCustomHost = $("#run-scenario-radio-host-custom");
        const runScenarioRadioCustomUrl = $("#run-scenario-radio-url-custom");
        const runScenarioTextCustomHost = $("#run-scenario-text-host-custom");
        const runScenarioTextCustomUrl = $("#run-scenario-text-url-custom");
        const runScenarioDeviceSizesTable = $("table.js-run-scenario-modal-device-sizes");
        const runScenarioDeviceSizesTableBody = runScenarioDeviceSizesTable.find("tbody");
        const runScenarioDeviceSizesTableHead = runScenarioDeviceSizesTable.find("thead");
        const runScenarioDeviceSizesTableHeadXS = runScenarioDeviceSizesTableHead.find(".js-run-scenario-modal-device-sizes-head-xs");
        const runScenarioDeviceSizesTableHeadSM = runScenarioDeviceSizesTableHead.find(".js-run-scenario-modal-device-sizes-head-sm");
        const runScenarioDeviceSizesTableHeadMD = runScenarioDeviceSizesTableHead.find(".js-run-scenario-modal-device-sizes-head-md");
        const runScenarioDeviceSizesTableHeadLG = runScenarioDeviceSizesTableHead.find(".js-run-scenario-modal-device-sizes-head-lg");

        const runScenarioNote = $("#run-scenario-note");
        const runScenarioError = $("#run-scenario-error");

        var syncEngine, windows, device;

        var runningScenarios = [];

        runScenarioModal.on("hiden.bs.modal", function () {
            runningScenarios = [];
        });

        runScenarioModal.on("show.bs.modal", function () {
            my.resetModal();
        });

        my.initialize = function (env) {
            syncEngine = env.syncEngine;
            windows = env.windows;
            device = env.device;

            runScenarioDeviceSizesTableHeadXS.append(device.getLabel(device.DEVICE_SIZE_EXTRA_SMALL));
            runScenarioDeviceSizesTableHeadSM.append(device.getLabel(device.DEVICE_SIZE_SMALL));
            runScenarioDeviceSizesTableHeadMD.append(device.getLabel(device.DEVICE_SIZE_MEDIUM));
            runScenarioDeviceSizesTableHeadLG.append(device.getLabel(device.DEVICE_SIZE_LARGE));

            runScenarioDomainRadio.change(function () {
                if (runScenarioRadioDefaultUrl.is(":checked")) {
                    runScenarioTextCustomHost.prop('disabled', true);
                    runScenarioTextCustomUrl.prop('disabled', true);
                } else if (runScenarioRadioCustomHost.is(":checked")) {
                    runScenarioTextCustomHost.prop('disabled', false);
                    runScenarioTextCustomUrl.prop('disabled', true);
                    runScenarioTextCustomHost.focus();
                } else {
                    runScenarioTextCustomHost.prop('disabled', true);
                    runScenarioTextCustomUrl.prop('disabled', false);
                    runScenarioTextCustomUrl.focus();
                }
            });
            runScenarioForm.submit(function (e) {
                e.preventDefault();
                e.stopPropagation();

                if (runScenarioRadioCustomHost.is(":checked")) {
                    if (!URI(runScenarioTextCustomHost.val()).is("absolute")) {
                        runScenarioError.text("Valid host is required");
                        return;
                    }
                } else if (runScenarioRadioCustomUrl.is(":checked")) {
                    if (!URI(runScenarioTextCustomUrl.val()).is("absolute")) {
                        runScenarioError.text("Valid url is required");
                        return;
                    }
                }

                let scenariosWithDeviceSizes = retrieveScenariosFromDeviceSizesTable();
                if (scenariosWithDeviceSizes.length === 0) {
                    runScenarioError.text("At least one scenario must be selected");
                    return;
                }

                // Each scenario/device size to one promise
                // Each promise return an array of object of {result, scenario, window}
                var promises = [];
                scenariosWithDeviceSizes.forEach(function (scenarioWidthDeviceSizes) {
                    let scenario = scenarioWidthDeviceSizes.scenario;

                    var pUrl;
                    if (runScenarioRadioDefaultUrl.is(":checked")) {
                        pUrl = scenario.getFullUrl(syncEngine);
                    } else if (runScenarioRadioCustomHost.is(":checked")) {
                        pUrl = scenario.getFullUrl(syncEngine).then(function (url) {
                            var customHostURI = new URI(runScenarioTextCustomHost.val());
                            var newURI = new URI(url);
                            newURI.scheme(customHostURI.scheme());
                            newURI.authority(customHostURI.authority());
                            newURI.normalize();
                            return newURI.toString();
                        });
                    } else if (runScenarioRadioCustomUrl.is(":checked")) {
                        pUrl = Promise.resolve(runScenarioTextCustomUrl.val());
                    }

                    var deferred = Q.defer();
                    promises.push(deferred.promise);

                    pUrl.then(function (url) {
                        var resultsPromises = [];

                        scenarioWidthDeviceSizes.deviceSizes.forEach(function (deviceSize) {
                            var baseScenarioResult = ScenarioResult.createWithJson({
                                note: runScenarioNote.val(),
                                url: url,
                                scenarioKey: scenario.key,
                                deviceSize: deviceSize,
                                deviceWidth: device.getWidth(deviceSize)
                            });

                            console.log("Run scenario %s, url %s, size %s", scenario.name, url, deviceSize);

                            let runScenario = scenario.clone();
                            runScenario.deviceSize = deviceSize;

                            resultsPromises.push(new Promise(function (fulfill, reject) {
                                windows.openScenarioWindowForRun(device, runScenario,
                                    {
                                        hidden: true
                                    },
                                    function (createdWindow) {
                                        createdWindow.contentWindow.baseScenario = runScenario;
                                        createdWindow.contentWindow.baseScenarioResult = baseScenarioResult;
                                        createdWindow.contentWindow.startUrl = baseScenarioResult.url;
                                        createdWindow.contentWindow.savingResult = true;
                                        createdWindow.contentWindow.hideForWindowClose = true;

                                        fulfill({
                                            result: baseScenarioResult,
                                            window: createdWindow,
                                            scenario: scenario
                                        });

                                        createdWindow.onClosed.addListener(function () {
                                            if (!baseScenarioResult.isCompleted) {
                                                baseScenarioResult.abort();
                                                baseScenarioResult.save(syncEngine);
                                            }
                                        });
                                    });
                            }));
                        });

                        deferred.resolve(Promise.all(resultsPromises));


                        mixpanel.track("TestRun start", {
                            testsCount: scenariosWithDeviceSizes.length
                        });

                        runScenarioModal.modal('hide');
                    });
                });

                Promise.all(promises).then(function (arr) {
                    // arr = array of [{ result, window, scenario }]
                    var flatten = [].concat.apply([], arr);
                    windows.openSummaryWindow(function (createdWindow) {
                        createdWindow.contentWindow.resultsWithWindows = flatten;

                        createdWindow.onClosed.addListener(function () {
                            flatten.forEach(function (f) {
                                f.window.close();
                            });
                        });
                    });
                });
            });
        };

        my.resetModal = function () {
            runScenarioError.text('');
            runScenarioRadioDefaultUrl.prop("checked", true);
            runScenarioNote.val('');
            runScenarioTextCustomHost.val('http://');
            runScenarioTextCustomHost.prop('disabled', true);
            runScenarioTextCustomUrl.val('http://');
            runScenarioTextCustomUrl.prop('disabled', true);
            runScenarioDeviceSizesTableBody.empty();
        };

        my.runScenarios = function (scenarios) {
            if (scenarios.length > 0) {
                runningScenarios = scenarios;
                runScenarioModal.modal("show");
                populateDeviceSizesTable();
            }
        };

        var populateDeviceSizesTable = function () {
            runningScenarios.forEach(function (s) {
                runScenarioDeviceSizesTableBody.append(
                    $("<tr />").append(
                        $("<td />", {class: "run-scenario-scenario-name"}).text(s.name),
                        $("<td />").append(
                            $("<input />", {type: "checkbox", value: "xs"}).prop("checked", s.deviceSize === "xs")
                        ),
                        $("<td />").append(
                            $("<input />", {type: "checkbox", value: "sm"}).prop("checked", s.deviceSize === "sm")
                        ),
                        $("<td />").append(
                            $("<input />", {type: "checkbox", value: "md"}).prop("checked", s.deviceSize === "md")
                        ),
                        $("<td />").append(
                            $("<input />", {type: "checkbox", value: "lg"}).prop("checked", s.deviceSize === "lg")
                        )
                    ).data(deviceSizesTableScenarioDataName, s)
                );
            });
        };

        var retrieveScenariosFromDeviceSizesTable = function () {
            return runScenarioDeviceSizesTableBody.find("tr").map(function (index, tr) {
                let scenario = $(tr).data(deviceSizesTableScenarioDataName);

                let sizes = $(tr).find("input:checkbox:checked").map(function (i, cbox) {
                    return this.value;
                }).get();
                if (sizes.length > 0) {
                    return {
                        scenario: scenario,
                        deviceSizes: sizes
                    };
                } else {
                    return null; // not returning the scenario
                }
            }).get();
        };

        return my;
    })();


    return sandbox;
});

requirejs(["jquery", "bootstrap", "home/project_page", "home/scenario_page", "home/sandbox"], function ($, _b, projectPage, scenarioPage, sandbox) {
    $(function () {
        $('[data-toggle="tooltip"]').tooltip();

        chrome.runtime.getBackgroundPage(function (bg) {
            bg.appInitialization.then(function () {
                sandbox.init(projectPage, scenarioPage, {
                    storage: bg.storage,
                    syncEngine: bg.syncEngine,
                    mixpanel: bg.mixpanel,
                    remoteHost: bg.remoteHost,
                    account: bg.account,
                    device: bg.device
                });
            });
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
    });
});

define("home/home", function () {});

