
define('migrations/migration_0-34', ["migrationManager", "storage"], function (migrationManager, storage) {
    'use strict';

    migrationManager.registerMigration(0.34, function (storage) {
        console.log("Migration 0.34: begin");

        var resultsPromise = storage.iterateAllScenarioResults().then(function (results) {
            return Promise.all(results.map(function (result) {
                if (!result.hasOwnProperty("status")) {
                    if (result.hasOwnProperty("pass")) {
                        result.status = result.pass ? "pass" : "fail";
                    } else {
                        result.status = "abort";
                    }
                    delete result.pass;
                    return storage.updateScenarioResult(result);
                } else {
                    return Promise.resolve();
                }
            }));
        });

        return resultsPromise.then(function () {
            return 0.34;
        });
    });

    return migrationManager;
});
