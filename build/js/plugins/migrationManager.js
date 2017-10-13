
define('migrationManager', ["jquery", "storage"], function ($, storage) {
    'use strict';

    const SETTING_STORAGE_RESOURCE_VERSION = "storageResourceVersion";
    const CURRENT_RESOURCE_VERSION = 0.34;

    const migrationManager = {};

    var migrations = [];
    var migrated = false;

    var readyPromise;

    migrationManager.migrate = function (storage) {
        // sort the migrations by versions
        migrations.sort(function (m1, m2) {
            return m1 < m2;
        });

        readyPromise = storage.getSetting(SETTING_STORAGE_RESOURCE_VERSION).then(function (v) {
            if (!v) {
                v = 0.12; // First time resource version is added.
            } else {
                v = parseFloat(v);
            }

            return _migrate(0, v, storage).then(function (newVersion) {
                if (newVersion === CURRENT_RESOURCE_VERSION) {
                    storage.saveSetting(SETTING_STORAGE_RESOURCE_VERSION, CURRENT_RESOURCE_VERSION).then(function () {
                        return Promise.resolve(CURRENT_RESOURCE_VERSION);
                    });
                } else {
                    throw new Error("Migrated to a version " + newVersion + " different than current version " +
                        CURRENT_RESOURCE_VERSION);
                }
            });
        }).catch(function (err) {
            console.error("Error migrating: %O", err);
            return Promise.reject(err);
        });

        return readyPromise;
    };

    var _migrate = function (index, currentVersion, storage) {

        if (index >= migrations.length) {
            console.log("All migrations completed");
            return Promise.resolve(currentVersion);
        } else if (currentVersion > migrations[index].version) {
            return _migrate(index + 1, currentVersion, storage);
        } else {
            return migrations[index].migrate(storage).then(function (newVersion) {
                console.log("Migrated to " + newVersion);
                return _migrate(index + 1, newVersion, storage);
            });
        }

    };

    migrationManager.registerMigration = function (version, migrationFn) {
        migrations.push({version: version, migrate: migrationFn});
        console.log("Registering migration: %s; %O", version, migrations);
    };

    migrationManager.ready = function () {
        return readyPromise;
    };

    return migrationManager;
});
