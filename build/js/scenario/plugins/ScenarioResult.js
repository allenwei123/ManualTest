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
