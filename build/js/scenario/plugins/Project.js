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