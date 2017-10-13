
define('migrations/migration_0-12', ["migrationManager", "storage", "Action"], function (migrationManager, storage, Action) {
    'use strict';

    var migrateStepToActions = function (step) {
        var actions = [];
        if (step.type === "ClickStep") {
            actions.push(EventData.createWithJson({
                type: 'click',
                element: step.element,
                options: {
                    button: 0
                }
            }));
        } else if (step.type === "MouseStep") {
            if (step.mouseDown) {
                actions.push(EventData.createWithJson({
                    type: "mousedown",
                    element: step.element,
                    options: step.options
                }));
            }
            if (step.mouseUp) {
                actions.push(EventData.createWithJson({
                    type: "mouseup",
                    element: step.element,
                    options: step.options
                }));
            }
            if (step.click) {
                actions.push(EventData.createWithJson({
                    type: "click",
                    element: step.element,
                    options: step.options
                }));
            }
        } else if (step.type === "InputOnTextStep") {
            step.events.forEach(function (e) {
                var eventData = EventData.createWithJson({
                    type: e.type,
                    element: step.element,
                    options: e.options
                });

                eventData.element.value = e.currentValue;

                if (e.selectionStart) {
                    eventData.element.selectionStart = e.selectionStart;
                    eventData.element.selectionEnd = e.selectionEnd;
                }

                actions.push(eventData);
            });
        } else if (step.type === "KeyStep") {
            var keyEventType, keyOptions;
            if (step.keyDown) {
                keyEventType = "keydown";
                keyOptions = step.keyDown;
            } else if (step.keyUp) {
                keyEventType = "keyup";
                keyOptions = step.keyUp;
            } else if (step.keyPress) {
                keyEventType = "keypress";
                keyOptions = step.keyPress;
            } else {
                throw "unknown key event type for step: " + step.key;
            }
            actions.push(EventData.createWithJson({
                type: keyEventType,
                element: step.element,
                options: keyOptions
            }));
        } else if (step.type === "ChangeOnSelectStep") {
            var eventData, titles, i, selections;

            selections = [];
            if (step.values) {
                step.values.forEach(function (v) {
                    selections.push({
                        value: v.value,
                        text: v.text
                    });
                });
            } else {
                if (!step.title || !step.value) {
                    debugger;
                }
                titles = step.title ? step.title.slice(7).split(", ") : step.value;
                for (i = 0; i < step.value.length; i++) {
                    selections.push({
                        value: step.value[i],
                        text: titles[i]
                    });
                }
            }


            if (step.inputEvent) {
                eventData = EventData.createWithJson({
                    type: "input",
                    element: step.element,
                    options: {}
                });
                eventData.element.selections = selections.slice(0);
                actions.push(eventData);
            }

            if (step.changeEvent) {
                eventData = EventData.createWithJson({
                    type: "change",
                    element: step.element,
                    options: {}
                });
                eventData.element.selections = selections.slice(0);
                actions.push(eventData);
            }
        } else if (step.type === "InputStep") {
            actions.push(EventData.createWithJson({
                type: "input",
                element: step.element,
                options: {}
            }));
        } else if (step.type === "VerifyTextStep") {
            actions.push(VerifyTextAction.create(step.element, step.text, step.caseInsensitive, step.notExist));
        } else if (step.type === "WaitTimeStep") {
            actions.push(WaitTimeAction.create(step.waitTimeSeconds));
        } else if (step.type === "VerifyUrlStep") {
            actions.push(VerifyUrlAction.create(step.path, step.regex));
        } else if (step.type === "BrowserStep") {
            var task;
            if (step.properties.back) {
                task = "back";
            } else if (step.properties.forward) {
                task = "forward";
            } else if (step.properties.reload) {
                task = "reload";
            } else {
                throw "unknown BrowserStep properties: " + step.properties;
            }
            actions.push(BrowserAction.create(task));
        } else {
            throw "Migration 0.12: unknown step type: " + step.type;
        }

        return actions;
    };

    migrationManager.registerMigration(0.12, function (storage) {
        console.log("Migration 0.12: begin");

        var scenariosPromise = storage.iterateAllScenarios().then(function (scenarios) {
            return Promise.all(scenarios.map(function (scenario) {
                if (scenario.steps && scenario.steps.length > 0 && !scenario.actions) {
                    console.log("Migration 0.12: Migrating scenario: %O", scenario);

                    scenario.actions = [];
                    scenario.steps.forEach(function (step) {
                        scenario.actions = scenario.actions.concat(migrateStepToActions(step));
                    });

                    return storage.updateScenario(scenario);
                } else {
                    return Promise.resolve();
                }
            }));
        });

        var resultsPromise = storage.iterateAllScenarioResults().then(function (results) {
            return Promise.all(results.map(function (result) {
                if (result.stepResults && result.stepResults.length > 0 && !result.actionResults) {
                    console.log("Migration 0.12: Migrating Scenario Result %O", result);
                    result.actions = [];
                    result.actionResults = [];
                    result.steps.forEach(function (step, stepIndex) {
                        result.actions = result.actions.concat(migrateStepToActions(step));
                        for (var i = 0; i < result.actions.length; i++) {
                            result.actionResults.push(result.actionResults[stepIndex]);
                        }
                    });

                    return storage.updateScenarioResult(result);
                } else {
                    return Promise.resolve();
                }
            }));
        });

        return Promise.all([scenariosPromise, resultsPromise]).then(function () {
            return 0.13;
        });
    });

    return migrationManager;
});
