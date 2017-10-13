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