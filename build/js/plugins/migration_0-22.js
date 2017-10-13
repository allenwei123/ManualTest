define('migrations/migration_0-22', ["migrationManager", "storage"], function (migrationManager, storage) {
    'use strict';

    migrationManager.registerMigration(0.21, function (storage) {
        console.log("Migration 0.22: begin");

        var scenariosPromise = storage.iterateAllScenarios().then(function (scenarios) {
            return Promise.all(scenarios.map(function (scenario) {
                if (!scenario.deviceSize) {
                    console.log("Migration 0.22: Migrating scenario: %O", scenario);
                    scenario.deviceSize = device.DEFAULT_DEVICE_SIZE;

                    return storage.updateScenario(scenario);
                } else {
                    console.log("Migration 0.22: Scenario %O has deviceSize. Skip migration.", scenario);
                    return Promise.resolve();
                }
            }));
        });

        var resultsPromise = storage.iterateAllScenarioResults().then(function (results) {
            return Promise.all(results.map(function (result) {
                if (!result.deviceSize || typeof result.startTime === 'number') {
                    console.log("Migration 0.22: Migrating Scenario Result %O", result);

                    result.deviceSize = device.DEFAULT_DEVICE_SIZE;
                    result.deviceWidth = 1024;
                    result.startTime = new Date(result.startTime);

                    return storage.updateScenarioResult(result);
                } else {
                    return Promise.resolve();
                }
            }));
        });

        return Promise.all([scenariosPromise, resultsPromise]).then(function () {
            return 0.22;
        });
    });

    return migrationManager;
});
