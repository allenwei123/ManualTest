requirejs.config({
    baseUrl: 'build/js',
    paths: {
        jquery: 'plugins/jquery.min',
        EventEmitter: 'plugins/EventEmitter',
        underscore: 'plugins/Underscore',
        mixpanel: 'plugins/Mixpanel',
        "migrations/migration_0-12": 'plugins/migration_0-12',
        "migrations/migration_0-22": 'plugins/migration_0-22',
        "migrations/migration_0-34": 'plugins/migration_0-34',
        migrationManager: 'plugins/migrationManager',
        db: 'plugins/db',
        TcpServer: 'plugins/TcpServer',
        httpServer: 'plugins/httpServer',
        fileProxy: 'plugins/fileProxy',
        DataSet: 'scenario/plugins/DataSet',
        utils: 'scenario/plugins/utils',
        windows: 'scenario/plugins/windows',
        Project: 'scenario/plugins/Project',
        Element: 'plugins/Element',
        const: 'scenario/plugins/const',
        Action: 'scenario/plugins/Action',
        Scenario: 'scenario/plugins/Scenario',
        ScenarioResult: 'scenario/plugins/ScenarioResult'
    }
});

define('User', [], function () {
    'use strict';
    const User = {
        createWithJson: function (json) {
            var obj = Object.create(User);
            for (var p in json) {
                if (json.hasOwnProperty(p)) {
                    obj[p] = json[p];
                }
            }
            return obj;
        },
        byOmniauth: function () {
            return this.provider;
        }
    };

    return User;
});

define('account', ["jquery", "utils", "User", "windows", "EventEmitter"], function ($, utils, User, windows, EventEmitter) {
    'use strict';
    const SETTING_SIGNED_IN_USER = "signedInUser";
    const SETTING_TEMPORARY_ID = "temporaryId";
    const MINIMUM_PASSWORD_LENGTH = 8;

    const account = new EventEmitter();

    const paths = {
        signIn: "/users/sign_in.json",
        signUp: "/users.json",
        signOut: "/users/sign_out",
        editUser: "/users.json",
        githubOauthAuthorize: "/users/auth/github",
        githubOauthRedirect: "/users/auth/github/callback",
        googleOauthAuthorize: "/users/auth/google_oauth2",
        googleOauthRedirect: "/users/auth/google_oauth2/callback"
    };

    var storage;

    var _signedInUser = null;
    account.signedInUser = function () {
        return _signedInUser;
    };
    var setSignedInUser = function (user) {
        if (user) {
            _signedInUser = User.createWithJson(user);
        } else {
            _signedInUser = null;
        }
        storage.saveSetting(SETTING_SIGNED_IN_USER, _signedInUser);

        if (user) {
            account.emitEvent("userSignedIn", [_signedInUser]);
        } else {
            account.emitEvent("userSignedOut");
        }
    };

    account.addListener("userSignedOut", function () {
        createDistinctId().then(function (value) {
            account.distinct_id = value;
        });
    });

    /*
    startURL - the url to start the oauth process
    redirectURL - the url expected the oauth provider redirect to
    callback - invoke when the process completes. Call with the user object if sucessful
                null otherwise.
  */
    var launchOauthWebview = function (startURL, redirectURL) {
        var receivedData = false;
        return windows.closeOauthWindow().then(function () {
            return new Promise(function (fulfill, reject) {
                windows.openOauthWindow(function (createdWindow) {
                    createdWindow.contentWindow.startURL = startURL;
                    createdWindow.contentWindow.redirectURL = redirectURL;
                    createdWindow.contentWindow.callback = function (data, error) {
                        receivedData = true;
                        if (!error) {
                            fulfill(data);
                        } else {
                            reject(error);
                        }
                    };

                    // If user close the oauth window to cancel it
                    createdWindow.onClosed.addListener(function () {
                        if (!receivedData) {
                            // if window closed after data received, callback is already invoked with user object.
                            // callback(null, null);
                            fulfill(null);
                        }
                    });
                });
            });
        });
    };

    // If a distinct id is already created, return it
    // Otherwise create one, store it and return it
    var createDistinctId = function () {
        return storage.getSetting(SETTING_TEMPORARY_ID).then(function (value) {
            if (value) {
                return Promise.resolve(value);
            } else {
                var tempId = utils.randomString(16);
                return storage.saveSetting(SETTING_TEMPORARY_ID, tempId).then(function () {
                    return Promise.resolve(tempId);
                });
            }
        });
    };

    account.init = function (remote, s) {
        remoteHost = remote;
        storage = s;
        return storage.ready().then(
            function () {
                return storage.getSetting(SETTING_SIGNED_IN_USER).then(function (value) {
                    setSignedInUser(value);
                    if (account.signedInUser()) {
                        account.distinct_id = account.signedInUser().id;
                        return Promise.resolve();
                    } else {
                        return createDistinctId().then(function (value) {
                            account.distinct_id = value;
                            account.addListener("userSignedIn", function () {
                                mixpanel.alias(account.distinct_id, account.signedInUser().id);
                                account.distinct_id = account.signedInUser().id;
                            });
                        });
                    }
                });
            });
    };

    account.authenticate = function (data) {
        if (account.signedInUser()) {
            data.auth_token = account.signedInUser().auth_token;
            data.auth_id = account.signedInUser().id;
            return data;
        } else {
            throw new Error("User not signed in");
        }
    };

    /*
    callback - Invoke with null if successful, otherwise with error message.
  */
    account.signIn = function (login, password) {
        if (account.signedInUser()) {
            return Promise.reject("You are already signed in.");
        }
        var data = {
            "user": {
                "login": login,
                "password": password
            },
        };
        return Promise.resolve($.ajax(remoteHost + paths.signIn,
            {
                dataType: "json",
                method: "POST",
                data: data
            })
        ).then(function (user) {
            setSignedInUser(user);
            mixpanel.track("App sign in", {
                type: "email"
            });
            console.log("Signed in user: ", user.username);
            windows.closeOauthWindow();
            // return fetchCSRF();
            return user;
        }, function (err) {
            if (err.status === "timeout") {
                return Promise.reject("Connection timeout");
            } else {
                return Promise.reject(JSON.parse(err.responseText).error);
            }
        });
    };

    /*
    callback - Invoke with null if successful, otherwise with error message.
  */
    account.signUp = function (username, email, password, passwordConfirmation) {
        if (account.signedInUser()) {
            return Promise.reject("You are already signed in.");
        }
        var data = {
            "user": {
                "username": username,
                "email": email,
                "password": password,
                "password_confirmation": passwordConfirmation
            }
        };
        return Promise.resolve($.ajax(remoteHost + paths.signUp, {
            dataType: "json",
            method: "POST",
            data: data
        })).then(function (user) {
            setSignedInUser(user);
            mixpanel.track("App sign Up");
            console.log("Signed up user: ", user);
            windows.closeOauthWindow();
            return user;
        }).catch(function (err) {
            console.error("Error signup user: %O", err);
            if (err.status === "timeout") {
                return Promise.reject("Connection timeout");
            } else {
                var rawErrors = JSON.parse(err.responseText).errors;

                return Promise.reject(Object.keys(rawErrors).map(function (p) {
                    return rawErrors[p].map(function (value) {
                        return p.charAt(0).toUpperCase() + p.slice(1) + " " + value + ".";
                    });
                }));
            }
        });
    };

    account.signOut = function () {
        var data = {
            _method: "DELETE"
        };
        data = account.authenticate(data);
        return Promise.resolve($.ajax(remoteHost + paths.signOut, {
            method: "POST",
            data: data
        })).then(function () {
            setSignedInUser(null);
            mixpanel.track("App sign out");
            console.log("Signed out user");
        }).catch(function (err) {
            console.error("Sign out error: %s %O", err.status, err);
        });
    };

    account.editUser = function (username, email, password, passwordConfirmation, currentPassword) {
        if (!account.signedInUser()) {
            return Promise.reject("You are not signed in.");
        }
        var data = {
            "user": {
                "username": username,
                "email": email,
                "current_password": currentPassword,
                "password": password,
                "password_confirmation": passwordConfirmation,
                "id": account.signedInUser().id,
            },
            "_method": "PUT"
        };
        data = account.authentication(data);
        // Temp fix to get CSRF token, otherwise somehow the token authentication failed
        // for newly sign in user
        return Promise.resolve($.ajax(remoteHost + paths.editUser, {
            method: "POST",
            data: data,
            dataType: "json"
        })).then(function () {
            // fetchCSRF();
            var u = account.signedInUser();
            u.username = username;
            u.email = email;
            setSignedInUser(u);
            mixpanel.track("App update user");
            console.log("Updated user: %O", u);
            return u;
        }, function (err) {
            if (err.status === "timeout") {
                return Promise.reject("Connection timeout");
            } else {
                var rawErrors = JSON.parse(err.responseText).errors;

                return Promise.reject(Object.keys(rawErrors).map(function (p) {
                    return rawErrors[p].map(function (value) {
                        return p.charAt(0).toUpperCase() + p.slice(1) + " " + value + ".";
                    });
                }));
            }
        });
    };

    /*
    callback - Invoke with null if successful, otherwise with error message.
  */
    account.signInWithGithub = function () {
        return launchOauthWebview(
            remoteHost + paths.githubOauthAuthorize,
            remoteHost + paths.githubOauthRedirect).then(
            function (data) {
                if (data) {
                    if (account.signedInUser()) {
                        return Promise.reject("SignIn with Github after a user signed in");
                    }
                    setSignedInUser(data);
                    mixpanel.track("App sign in", {
                        type: "github"
                    });
                }
                return data;
            }
        );
    };

    /*
    callback - Invoke with null if successful, otherwise with error message.
  */
    account.signInWithGoogle = function () {
        return launchOauthWebview(
            remoteHost + paths.googleOauthAuthorize,
            remoteHost + paths.googleOauthRedirect).then(
            function (data) {
                if (data) {
                    if (account.signedInUser()) {
                        return Promise.reject("SignIn with Google after a user signed in.");
                    }
                    setSignedInUser(data);
                    mixpanel.track("App sign in", {
                        type: "google"
                    });
                }
                return data;
            }
        );
    };

    return account;

});

define('storage', ["jquery", "db"], function ($, db) {

    'use strict';

    const storage = {};

    storage.ready = function () {
        return readyPromise;
    };

    var readyPromise = db.open({
        server: 'manualtest',
        version: 4,
        schema: {
            projects: {
                key: {keyPath: 'key', autoIncrement: true},
                indexes: {
                    name: {key: 'name'},
                    url: {key: 'url'},
                    id: {id: 'id'}
                }
            },
            scenarios: {
                key: {keyPath: 'key', autoIncrement: true},
                indexes: {
                    name: {key: 'name'},
                    projectKey: {key: 'projectKey'},
                    id: {key: 'id'}
                }
            },
            results: {
                key: {keyPath: 'key', autoIncrement: true},
                indexes: {
                    scenarioKey: {key: 'scenarioKey'},
                    mostRecent: {key: ['scenarioKey', "startTime"]}
                }
            },
            settings: {
                key: {keyPath: 'name'}
            }
        }
    }).then(function (s) {
        let server = s;

        storage.addScenario = function (newScenario) {
            return (newScenario.projectKey ?
                storage.getProjectByKey(newScenario.projectKey) :
                Promise.resolve(true))
                .then(function (p) {
                    if (p) {
                        return server.scenarios.add(newScenario).then(function (res) {
                            return res[0];
                        });
                    } else {
                        return Promise.reject("Project does not exist");
                    }
                });
        };
        storage.updateScenario = function (scenario) {
            return server.scenarios.update(scenario)
                .then(function (res) {
                    return res[0];
                });
        };
        storage.removeScenario = function (removingScenarioKey) {
            return server.remove('scenarios', removingScenarioKey).then(function (res) {
                return storage.iterateScenarioResults(removingScenarioKey).then(function (results) {
                    return Promise.all(results.map(function (result) {
                        return storage.removeScenarioResult(result);
                    }));
                });
            }).then(function () {
                return removingScenarioKey;
            });
        };
        storage.getScenarioByKey = function (key) {
            return server.get('scenarios', key);
        };
        storage.getScenarioById = function (id) {
            if (id === null || id === undefined) {
                return Promise.reject("Scenario id is not specified");
            }
            return server.query('scenarios', 'id')
                .only(id)
                .execute()
                .then(function (res) {
                    return res[0];
                });
        };
        storage.getScenariosByProject = function (project) {
            return server.query('scenarios', 'projectKey')
                .only(project ? project.key : 0)
                .execute();
        };
        storage.iterateAllScenarios = function () {
            return server.query('scenarios').all().execute();
        };
        storage.saveSetting = function (name, value) {
            return server.settings.update({
                name: name,
                value: value
            }).then(function (res) {
                return res[0];
            });
        };
        storage.getSetting = function (name) {
            return server.get('settings', name).then(function (result) {
                if (result) {
                    return result.value;
                } else {
                    return result;
                }
            });
        };
        storage.removeSetting = function (name) {
            return server.remove('settings', name);
        };
        storage.addScenarioResult = function (scenarioResult) {
            return storage.getScenarioByKey(scenarioResult.scenarioKey).then(function (scenario) {
                if (scenario) {
                    return server.results.add(scenarioResult).then(function (res) {
                        return res[0];
                    });
                } else {
                    return Promise.reject("Scenario does not exist");
                }
            });
        };
        storage.updateScenarioResult = function (scenarioResult) {
            return storage.getScenarioByKey(scenarioResult.scenarioKey).then(function (scenario) {
                if (scenario) {
                    return server.results.update(scenarioResult).then(function (res) {
                        return res[0];
                    });
                } else {
                    return Promise.reject("Scenario does not exist");
                }
            });
        };
        storage.getLastResult = function (scenarioKey) {
            return server.query('results', 'mostRecent')
                .bound([scenarioKey, new Date(0)], [scenarioKey, new Date()])
                .desc()
                .limit(1)
                .execute()
                .then(function (res) {
                    return res[0];
                });
        };
        storage.removeScenarioResult = function (scenarioResult) {
            return server.remove('results', scenarioResult.key);
        };
        storage.iterateScenarioResults = function (scenarioKey) {
            return server.query('results', 'scenarioKey')
                .only(scenarioKey)
                .execute();
        };
        storage.iterateAllScenarioResults = function () {
            return server.query('results').all().execute();
        };
        storage.addProject = function (newProject) {
            return server.projects.add(newProject).then(function (res) {
                return res[0];
            });
        };
        storage.updateProject = function (project) {
            if (!project || !project.key) {
                throw new Error("Only persisted project can be updated");
            }
            return server.projects.update(project).then(function (res) {
                return res[0];
            });
        };
        storage.removeProject = function (removingProject) {
            if (!removingProject || !removingProject.key) {
                throw new Error("Only persisted project can be removed");
            }
            return server.remove('projects', removingProject.key).then(function (res) {
                return storage.getScenariosByProject(removingProject).then(function (scenarios) {
                    return Promise.all(scenarios.map(function (scenario) {
                        return storage.removeScenario(scenario.key);
                    }));
                });
            }).then(function () {
                return removingProject;
            });
        };
        storage.getProjectByKey = function (key) {
            return server.get('projects', key);
        };
        storage.getProjectById = function (id) {
            if (id === null || id === undefined) {
                return Promise.reject("Project id is not specified");
            }
            return server.query("projects", "id")
                .only(id)
                .execute()
                .then(function (res) {
                    return res[0];
                });
        };
        storage.iterateAllProjects = function () {
            return server.query('projects').all().execute();
        };

        return storage;
    });

    return storage;
});

define('core/sync_engine', ["jquery", "underscore", "account", "EventEmitter", "Project", "Scenario", "ScenarioResult"], function ($, _, account, EventEmitter, Project, Scenario, ScenarioResult) {
    "use strict";

    const SYNC_INTERVAL = 60000 * 15; // Sync every 15 minutes
    const INITIAL_SYNC_DELAY = 3 * 1000; // 5 seconds
    const syncEngine = new EventEmitter({});

    var currentSync = null;

    var editingScenarioKeys = {};
    syncEngine.startEditScenario = function (scenario) {
        if (!scenario.key) {
            throw new Error("Can not start editing scenario without key");
        }
        if (editingScenarioKeys[scenario.key]) {
            editingScenarioKeys[scenario.key]++;
        } else {
            editingScenarioKeys[scenario.key] = 1;
        }
    };
    syncEngine.endEditScenario = function (scenario) {
        if (!scenario.key) {
            throw new Error("Can not end editing scenario without key");
        }
        if (!editingScenarioKeys.hasOwnProperty(scenario.key)) {
            throw new Error("End editing scenario not being edited");
        }
        editingScenarioKeys[scenario.key]--;
        if (editingScenarioKeys[scenario.key] <= 0) {
            delete editingScenarioKeys[scenario.key];
        }
    };
    syncEngine.isEditingScenario = function (scenario) {
        return !!editingScenarioKeys[scenario.key];
    };

    syncEngine.sync = function () {
        if (!account.signedInUser()) {
            // return Promise.reject("Sync can not start because no user signed in");
            return Promise.reject("Sync 没有开始,因为用户没有登录");
        }
        if (!currentSync) {
            syncEngine.emitEvent("syncStart");
            console.log("sync start");
            currentSync = syncEngine.syncProjects().then(function () {
                return syncEngine.syncScenarios();
            }).then(function (v) {
                syncEngine.emitEvent("syncStop");
                currentSync = null;
                return v;
            }, function (err) {
                syncEngine.emitEvent("syncStop");
                console.log("sync stop");
                currentSync = null;
                return Promise.reject(err);
            });
        }
        return currentSync;
    };

    // Initialization
    syncEngine.init = function () {
        setTimeout(syncLoop, INITIAL_SYNC_DELAY);

        account.addListener("userSignedIn", function () {
            syncEngine.sync();
        });
    };

    syncEngine.addProject = function (project, overrides) {
        overrides = overrides || {};

        overrides['local_updated_at'] = overrides['local_updated_at'] || new Date();

        var create = !project.key;

        return _addProject(project, overrides).then(
            function (p) {
                if (!p.removed) {
                    syncEngine.emitEvent(create ? "projectCreated" : "projectUpdated", [project]);
                }
                return p;
            });
    };
    syncEngine.removeProject = function (removingProject) {
        return syncEngine.getScenariosByProject(removingProject).then(function (scenarios) {

            return Promise.all(scenarios.map(function (scenario) {
                return syncEngine.removeScenario(scenario);
            })).then(function () {
                if (removingProject.id) {
                    // Project uploaded to cloud. Shallow remove first.
                    return _addProject(removingProject, {
                        removed: true,
                        local_updated_at: new Date()
                    }).then(function (p) {
                        syncEngine.emitEvent("projectRemoved", [removingProject]);
                        return p;
                    });
                } else {
                    return storage.removeProject(removingProject).then(function (p) {
                        syncEngine.emitEvent("projectRemoved", [removingProject]);
                        return p;
                    });
                }
            }).then(function (removedProject) {
                return removedProject;
            });
        });
    };
    syncEngine.getProjectByKey = function (key) {
        return storage.getProjectByKey(key).then(
            function (p) {
                if (!p || p.removed) {
                    return null;
                } else {
                    return Project.createWithJson(p);
                }
            });
    };
    syncEngine.getProjectById = function (id) {
        return storage.getProjectById(id).then(function (p) {
            if (!p || p.removed) {
                return null;
            } else {
                return Project.createWithJson(p);
            }
        });
    };
    syncEngine.getProjectByScenario = function (scenario) {
        if (scenario.projectKey) {
            return syncEngine.getProjectByKey(scenario.projectKey);
        } else {
            return Promise.resolve(null);
        }
    };
    syncEngine.iterateAllProjects = function () {
        return storage.iterateAllProjects().then(
            function (projects) {
                return projects.filter(function (p) {
                    return !p.removed;
                }).map(function (p) {
                    return Project.createWithJson(p);
                });
            });
    };

    syncEngine.addScenario = function (scenario, overrides) {
        overrides = overrides || {};
        overrides['local_updated_at'] = overrides['local_updated_at'] || new Date();

        var create = !scenario.key;
        return _addScenario(scenario, overrides).then(function (s) {
            if (!s.removed) {
                syncEngine.emitEvent(create ? "scenarioCreated" : "scenarioUpdated", [scenario]);
            }
            return s;
        });
    };
    syncEngine.removeScenario = function (removingScenario) {
        //Always shallow remove at first, then let true remove during sync
        return _addScenario(removingScenario, {
            local_updated_at: new Date(),
            removed: true
        }).then(function (s) {
            syncEngine.emitEvent("scenarioRemoved", [removingScenario]);
            return s;
        });
    };
    syncEngine.unremoveScenario = function (scenario) {
        return _addScenario(scenario, {
            local_updated_at: new Date(),
            removed: false
        }).then(function (s) {
            syncEngine.emitEvent("scenarioUpdated", [scenario]);
            return s;
        });
    };
    syncEngine.getScenarioByKey = function (key) {
        return storage.getScenarioByKey(key).then(function (s) {
            if (!s || s.removed) {
                return null;
            } else {
                return Scenario.createWithJson(s);
            }
        });
    };
    syncEngine.getScenarioById = function (id) {
        return storage.getScenarioById(id).then(function (s) {
            if (!s || s.removed) {
                return null;
            } else {
                return Scenario.createWithJson(s);
            }
        });
    };
    syncEngine.getScenariosByProject = function (project) {
        return storage.getScenariosByProject(project).then(
            function (scenarios) {
                return scenarios.filter(function (s) {
                    return !s.removed;
                }).map(function (s) {
                    return Scenario.createWithJson(s);
                });
            }
        );
    };
    syncEngine.iterateAllScenarios = function () {
        return storage.iterateAllScenarios().then(
            function (scenarios) {
                return scenarios.filter(function (s) {
                    return !s.removed;
                }).map(function (s) {
                    return Scenario.createWithJson(s);
                });
            });
    };

    syncEngine.addScenarioResult = function (result) {
        var create = !result.key;

        return storage[create ? 'addScenarioResult' : 'updateScenarioResult'](result).then(function (result) {
            syncEngine.emitEvent(create ? "scenarioResultCreated" : "scenarioResultUpdated", [result]);
            return result;
        });
    };
    syncEngine.getLastResult = function (scenarioKey) {
        return storage.getLastResult(scenarioKey).then(function (result) {
            return ScenarioResult.createWithJson(result);
        });
    };
    syncEngine.removeScenarioResult = function (result) {
        return storage.removeScenarioResult(result).then(function (result) {
            syncEngine.emitEvent("scenarioResultRemoved", [result]);
            return result;
        });
    };
    syncEngine.iterateScenarioResults = function (scenarioKey) {
        return storage.iterateScenarioResults(scenarioKey).then(function (results) {
            return results.map(ScenarioResult.createWithJson);
        });
    };
    syncEngine.iterateAllScenarioResults = function () {
        return storage.iterateAllScenarioResults().then(function (results) {
            return results.map(ScenarioResult.createWithJson);
        });
    };

    var syncLoop = function () {
        syncEngine.sync().then(function () {
            setTimeout(syncLoop, SYNC_INTERVAL);
        }, function (err) {
            console.error("Sync error: %O ", err);
            setTimeout(syncLoop, SYNC_INTERVAL);
        });
    };

    var _addProject = function (project, overrides) {
        var saved = {};
        for (var property in overrides) {
            saved[property] = project[property];
            project[property] = overrides[property];
        }
        return storage[project.key ? "updateProject" : "addProject"](project).then(
            function (p) {
                return p;
            },
            function (err) {
                for (var property in saved) {
                    project[property] = saved[property];
                }
                return Promise.reject(err);
            });
    };

    var _addScenario = function (scenario, overrides) {
        var saved = {};
        for (var p in overrides) {
            saved[p] = scenario[p];
            scenario[p] = overrides[p];
        }
        if (!scenario.projectKey) {
            scenario.projectKey = 0;
        }

        return (scenario.projectKey ?
            syncEngine.getProjectByKey(scenario.projectKey) :
            Promise.resolve(true)).then(function (project) {
            if (project) {
                return storage[scenario.key ? "updateScenario" : "addScenario"](scenario);
            } else {
                return Promise.reject("Project doesn't exist");
            }
        }).catch(function (err) {
            for (var p in saved) {
                scenario[p] = saved[p];
            }
            return Promise.reject(err);
        });
    };

    return syncEngine;
});

define('apiError', [], function () {
    const ApiError = {
        create: function (jqXHR) {
            var obj = Object.create(ApiError);
            obj.type = ApiErrorTypes[jqXHR.status];
            obj[obj.type] = true;

            if (jqXHR.responseText) {
                var parsed = JSON.parse(jqXHR.responseText);
                if (parsed.errors) {
                    obj.messages = parsed.errors; // Array of error messages
                } else {
                    obj.messages = Object.keys(parsed).map(function (k) {
                        return parsed[k];
                    });
                }
            }

            return obj;
        },
        createWithMessage: function (type, message) {
            var obj = Object.create(ApiError);
            obj.type = type;
            obj[type] = true;
            obj.messages = [message];
            return obj;
        },
        toString: function () {
            var msg = "";
            if (this.badRequest) {
                msg = "Bad Request";
            } else if (this.notAuthorized) {
                msg = "Not Authorized";
            } else if (this.notFound) {
                msg = "Not Found";
            } else if (this.conflict) {
                msg = "Conflict";
            }
            msg = msg + " " + this.messages.join("; ");
            return msg;
        }
    };

    const ApiErrorTypes = {
        400: "badRequest",
        401: "notAuthorized",
        404: "notFound",
        409: "conflict"
    };

    return ApiError;
});

define('api', ["jquery", "Project", "Scenario", "apiError", "Action"], function ($, Project, Scenario, ApiError, Action) {

    const api = {};
    const API_PATH = "api";
    const API_VERSION = "v1";

    var paths = {
        projects: "projects",
        scenarios: "scenarios"
    };

    var generateURI = function () {
        var uri = remoteHost + "/" + API_PATH + "/" + API_VERSION;
        for (var i = 0; i < arguments.length; i++) {
            uri += "/" + arguments[i];
        }
        return uri;
    };

    var request = function (method, uri, data, mapper) {
        let authenticatedData = account.authenticate(data);
        return Promise.resolve(
            $.ajax(uri, {
                method: method,
                dataType: "json",
                data: authenticatedData,
                converters: {
                    'text json': function (json) {
                        // Manually parse the reponsed text so timestamps can be converted to Date objects
                        return JSON.parse(json, function (property, value) {
                            if (property === "") {
                                return value;
                            }
                            if (property === "updated_at" || property === "created_at") {
                                return new Date(value);
                            } else {
                                return value;
                            }
                        });
                    }
                }
            })
        ).then(function (responsedData) {
            if (mapper && responsedData) {
                if (Array.isArray(responsedData)) {
                    return responsedData.map(function (value) {
                        return mapper(value);
                    });
                } else {
                    return mapper(responsedData);
                }
            } else {
                return responsedData;
            }
        }, function (err) {
            if (err.status === "timeout") {
                return Promise.reject(ApiError.createWithMessage("Network Error", "Connection timed out"));
            } else {
                console.log("api error: %O", err);
                return Promise.reject(ApiError.create(err));
            }
        });
    };

    api.indexProjects = function () {
        if (account.signedInUser()) {
            return request("GET",
                generateURI(paths.projects),
                {},
                Project.createWithJson);
        } else {
            return Promise.reject("User not signed in");
        }
    };

    api.createProject = function (project) {
        if (account.signedInUser()) {
            var data = {
                name: project.name,
                url: project.url,
                dataSet: JSON.stringify(project.dataSet),
                user_id: account.signedInUser().id
            };
            return request("POST",
                generateURI(paths.projects),
                data,
                Project.createWithJson);
        } else {
            return Promise.reject("User not signed in");
        }
    };

    api.updateProject = function (project) {
        if (account.signedInUser()) {
            if (!project.id) {
                return Promise.reject("Project not created in cloud yet");
            }
            var data = {
                name: project.name,
                url: project.url,
                dataSet: JSON.stringify(project.dataSet),
                _method: "PUT",
                updated_at: convertTime(project.updated_at)
            };
            return request("POST",
                generateURI(paths.projects, project.id),
                data,
                Project.createWithJson);
        } else {
            return Promise.reject("User not signed in");
        }
    };

    api.destroyProject = function (project) {
        if (account.signedInUser()) {
            if (!project.id) {
                return Promise.reject("Project not created in cloud yet");
            }
            return request("POST",
                generateURI(paths.projects, project.id),
                {_method: "DELETE"}
            );
        } else {
            return Promise.reject("User not signed in");
        }
    };

    api.indexScenarios = function (projectId) {
        var data = {};
        if (projectId) {
            data['project_id'] = projectId;
        }
        if (account.signedInUser()) {
            return request("GET",
                generateURI(paths.scenarios),
                data,
                Scenario.createWithJson);
        } else {
            return Promise.reject("User not signed in");
        }
    };

    var addProjectId = function (data, projectKey) {
        return new Promise(function (fulfill, reject) {
            if (projectKey === 0 || projectKey === null || projectKey === undefined) {
                data['project_id'] = null;
                fulfill(data);
            } else {
                syncEngine.getProjectByKey(projectKey).then(function (p) {
                    if (p) {
                        if (p.id) {
                            data['project_id'] = p.id;
                            fulfill(data);
                        } else {
                            reject("Project (key:%i) not created in cloud yet", projectKey);
                        }
                    } else {
                        reject("Project (key:%i) not found", projectKey);
                    }
                });
            }
        });
    };

    api.createScenario = function (scenario) {
        if (account.signedInUser()) {
            var data = {
                name: scenario.name,
                url: scenario.url,
                actions: JSON.stringify(scenario.actions.map(Action.to_json)),
                user_id: account.signedInUser().id,
                deviceSize: scenario.deviceSize,
                dataSet: JSON.stringify(scenario.dataSet)
            };

            return addProjectId(data, scenario.projectKey).then(function (data) {
                return request("POST",
                    generateURI(paths.scenarios),
                    data,
                    Scenario.createWithJson);
            });
        } else {
            return Promise.reject("User not signed in");
        }
    };

    api.updateScenario = function (scenario) {
        if (account.signedInUser()) {
            if (!scenario.id) {
                return Promise.reject("Scenario not created in cloud yet");
            }
            var data = {
                name: scenario.name,
                url: scenario.url,
                actions: JSON.stringify(scenario.actions.map(Action.to_json)),
                deviceSize: scenario.deviceSize,
                dataSet: JSON.stringify(scenario.dataSet),
                _method: "PUT",
                updated_at: convertTime(scenario.updated_at)
            };
            return request("PUT",
                generateURI(paths.scenarios, scenario.id),
                data,
                Scenario.createWithJson);
        } else {
            return Promise.reject("User not signed in");
        }
    };

    api.destroyScenario = function (scenario) {
        if (account.signedInUser()) {
            if (!scenario.id) {
                return Promise.reject("Scenario not created in cloud yet");
            }

            return request("POST",
                generateURI(paths.scenarios, scenario.id),
                {_method: "DELETE"}
            );
        } else {
            return Promise.reject("User not signed in");
        }
    };

    function convertTime(time) {
        return time.getTime() / 1000;
    }

    return api;
});

define('core/sync_engine_projects', ["underscore", "api", "./sync_engine", "Project"], function (_, api, syncEngine, Project) {

    syncEngine.syncProjects = function () {
        console.log("sync projects");

        return pullProjects().then(function (downloadedProjects) {
            return pushProjects(downloadedProjects);
        });
    };

    var mergeUpProject = function (downloadedProjects, project) {
        if (!project.id) {
            // Locally created project, not created in cloud yet
            if (!project.removed) {
                // create project in cloud
                return api.createProject(project).then(function (p) {
                    return syncEngine.addProject(project, {
                        id: p.id,
                        updated_at: p.updated_at,
                        created_at: p.created_at
                    });
                });
            } else {
                // created and removed locally before made to the cloud
                return syncEngine.removeProject(project); //.then(semaphore.down);
            }
        } else if (!_.find(downloadedProjects, function (p) {
                return p.id === project.id;
            })) {
            // project doesn't exist in cloud anymore, removed from local storages
            // place this condition before check if project is shallow-removed, so
            // it can save an api request when project is removed from both cloud and client

            // if local project is not shallow removed, trigger the remove event at the end
            var triggerProjectRemoved = !project.removed;
            return storage.removeProject(project).then(function (p) {
                if (triggerProjectRemoved) syncEngine.emitEvent("projectRemoved", [p]);
                return p;
            });
        } else if (project.removed) {
            return api.destroyProject(project).then(function () {
                return syncEngine.removeProject(project);
            }, function (err) {
                if (err.notFound) {
                    // project already gone from cloud
                    return syncEngine.removeProject(project);
                }
                return Promise.reject(err);
            });
        } else if (!project.updated_at || project.updated_at < project.local_updated_at) {
            // cloud version is behind
            return api.updateProject(project).then(function (p) {
                return syncEngine.addProject(project, {
                    local_updated_at: p.updated_at,
                    updated_at: p.updated_at
                });
            });
        } else {
            return Promise.resolve();
        }
    };

    var pushProjects = function (downloadedProjects) {
        console.log("pushProjects");

        return storage.iterateAllProjects().then(
            function (projects) {
                return Promise.all(
                    projects.map(function (project) {
                        project = Project.createWithJson(project);
                        return mergeUpProject(downloadedProjects, project)
                            .catch(function (err) {
                                console.error("Error push project %O: %s", project, err);
                                // Ignore error so other projects can be pushed up
                                return;
                            });
                    }));
            });
    };

    var mergeDownProject = function (downloadedProject) {
        return storage.getProjectById(downloadedProject.id).then(
            function (localProject) {
                if (localProject) {
                    localProject = Project.createWithJson(localProject);
                    if (downloadedProject.updated_at > localProject.updated_at) {
                        if (localProject.local_updated_at > localProject.updated_at) {
                            // project updated both in cloud and locally
                            // For project, ignore conflict and overwrite local project

                            return syncEngine.addProject(localProject, {
                                name: downloadedProject.name,
                                url: downloadedProject.url,
                                dataSet: downloadedProject.dataSet,
                                updated_at: downloadedProject.updated_at,
                                local_updated_at: downloadedProject.updated_at,
                                removed: undefined // in case local project is shallow removed while it is updated in cloud
                            });

                        } else {
                            // update local project
                            return syncEngine.addProject(localProject, {
                                name: downloadedProject.name,
                                url: downloadedProject.url,
                                dataSet: downloadedProject.dataSet,
                                updated_at: downloadedProject.updated_at,
                                local_updated_at: downloadedProject.updated_at
                            });
                        }
                    } else if (downloadedProject.updated_at < localProject.updated_at) {
                        return Promise.reject("Local project (key:%i, id:%i) updated_at (%s) is > cloud version (%s)",
                            localProject.key, localProject.id, localProject.updated_at.toString(),
                            downloadedProject.updated_at.toString());
                    } else {
                        // cloud and local version matches
                        return Promise.resolve();
                    }
                } else {
                    // new project from cloud
                    return syncEngine.addProject(downloadedProject, {
                        local_updated_at: downloadedProject.updated_at
                    });
                }
            });
    };

    var pullProjects = function () {
        console.log("pullProjects");

        return api.indexProjects().then(function (projects) {
            return Promise.all(projects.map(function (downloadedProject) {
                return mergeDownProject(downloadedProject).then(null, function (err) {
                    console.error("Error merging downloaded project %O from cloud: %s", downloadedProject, err);
                    // Let the error go, so other projects can sync
                    return;
                });
            })).then(function () {
                console.log("pullProjects completed");
                return projects;
            });
        });
    };

    return syncEngine;
});

define('core/sync_engine_scenarios', ["underscore", "api", "./sync_engine", "Scenario"], function (_, api, syncEngine, Scenario) {

    syncEngine.syncScenarios = function () {
        console.log("sync scenarios");

        return syncEngine.iterateAllProjects().then(
            function (projects) {
                var projectsPromises = projects.filter(function (p) {
                    return p.id; // only upload scenarios whose project is sync with the cloud
                }).map(function (project) {
                    return pullScenariosForProject(project.id).then(function (downloadedScenarios) {
                        return pushScenariosForProject(project, downloadedScenarios);
                    }).catch(function (err) {
                        console.error("Error sync'ing scenarios for project %O: %O", project, err);
                    });
                });
                projectsPromises.push(pullScenariosForProject(null).then(function (downloadedScenarios) {
                    return pushScenariosForProject(null, downloadedScenarios);
                }));
                return Promise.all(projectsPromises);
            }
        );
    };

    var getConflictDateString = function (date) {
        return date.getMonth() + "/" + date.getDate() + "/" + date.getFullYear() + " " +
            date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds();
    };

    var getProjectKeyById = function (projectId) {
        if (!projectId) {
            return Promise.resolve(0);
        } else {
            return syncEngine.getProjectById(projectId).then(function (project) {
                if (project) {
                    return project.key;
                } else {
                    return null;
                }
            });
        }
    };

    var pullScenariosForProject = function (projectId) {
        return api.indexScenarios(projectId).then(function (downloadedScenarios) {
            return mergeDownloadedScenarios(downloadedScenarios).then(function () {
                return downloadedScenarios;
            });
        });
    };

    var mergeDownloadedScenarios = function (downloadedScenarios) {
        return Promise.all(downloadedScenarios.map(function (downloadedScenario) {
            return mergeDownloadedScenario(downloadedScenario);
        }));
    };

    var mergeDownloadedScenario = function (downloadedScenario) {
        return storage.getScenarioById(downloadedScenario.id).then(
            function (scenario) {
                if (scenario) {
                    scenario = Scenario.createWithJson(scenario);
                    if (syncEngine.isEditingScenario(scenario)) {
                        return Promise.resolve(); // Skip sync'ing editing scenarios
                    } else if (downloadedScenario.updated_at > scenario.updated_at) {
                        // scenario updated in cloud
                        if (scenario.local_updated_at > scenario.updated_at) {
                            if (!scenario.removed) {
                                // scenario is also updated locally
                                // move the local scenario to a new instance and add conflict to its name
                                // save the downloaded sceanrio to replace the original local scenario
                                var key = scenario.key;
                                delete scenario.key;
                                delete scenario.id;

                                return syncEngine.addScenario(scenario, {
                                    name: scenario.name + " (Conflict " + getConflictDateString(scenario.updated_at) + ")",
                                }).then(
                                    function (s) {
                                        return syncEngine.addScenario(downloadedScenario, {
                                            key: key,
                                            local_updated_at: downloadedScenario.updated_at,
                                            projectKey: scenario.projectKey
                                        });
                                    },
                                    function (err) {
                                        console.error("Error creating conflict scenario: " + err);
                                        scenario.key = key;
                                        scenario.id = downloadedScenario.id;
                                        return Promise.reject(err);
                                    }
                                );
                            } else {
                                // local scenario is shallow removed
                                // undo shallow remove and update local scenario with cloud version
                                return syncEngine.addScenario(scenario, {
                                    removed: false,
                                    name: downloadedScenario.name,
                                    url: downloadedScenario.url,
                                    actions: downloadedScenario.actions,
                                    deviceSize: downloadedScenario.deviceSize,
                                    dataSet: downloadedScenario.dataSet,
                                    updated_at: downloadedScenario.updated_at,
                                    local_updated_at: downloadedScenario.updated_at
                                });
                            }
                        } else {
                            // scenario was not locally updated. Update in local storage with cloud changes
                            return syncEngine.addScenario(scenario, {
                                name: downloadedScenario.name,
                                url: downloadedScenario.url,
                                actions: downloadedScenario.actions,
                                deviceSize: downloadedScenario.deviceSize,
                                dataSet: downloadedScenario.dataSet,
                                updated_at: downloadedScenario.updated_at,
                                local_updated_at: downloadedScenario.updated_at
                            });
                        }
                    } else if (downloadedScenario.updated_at < scenario.updated_at) {
                        return Promise.reject("Local scenario (key:%i, id:%i) updated_at (%s) is > cloud version (%s)",
                            scenario.key, scenario.id, scenario.updated_at.toString(),
                            downloadedScenario.updated_at.toString());
                    } else {
                        // scenario is not updated anywhere
                        return Promise.resolve();
                    }
                } else {
                    // new scenario from cloud, add it to local storage

                    return getProjectKeyById(downloadedScenario.project_id).then(
                        function (projectKey) {
                            if (projectKey === null) {
                                console.log("Scenario project(id:%i) not downloaded yet" + downloadedScenario.id);
                                return p;
                            }

                            delete downloadedScenario.project_id;
                            return syncEngine.addScenario(downloadedScenario, {
                                local_updated_at: downloadedScenario.updated_at,
                                projectKey: projectKey
                            });
                        });
                }

            });
    };

    var pushScenariosForProject = function (project, downloadedScenarios) {
        return storage.getScenariosByProject(project).then(
            function (scenarios) {
                return Promise.all(scenarios.map(function (localScenario) {
                    return mergeUpScenario(downloadedScenarios, Scenario.createWithJson(localScenario));
                }));
            }
        );
    };

    var mergeUpScenario = function (downloadedScenarios, localScenario) {
        if (syncEngine.isEditingScenario(localScenario)) {
            return Promise.resolve(true);
        }
        if (localScenario.id) {
            if (!_.find(downloadedScenarios, function (s) {
                    return s.id === localScenario.id;
                })) {
                // local scenario not in the download scenarios of the project, it is removed
                // from the cloud, remove from storage.
                // Place this condition before checking scenario is shallow removed, so it can
                // save an api request if the scenario is removed on both cloud and client
                var triggerScenarioRemoved = !localScenario.removed;
                return storage.removeScenario(localScenario.key).then(
                    function (s) {
                        if (triggerScenarioRemoved) syncEngine.emitEvent("scenarioRemoved", [localScenario]);
                        return s;
                    }
                );

            } else if (localScenario.removed) {
                // local scenario shallow removed, remove from the cloud
                return api.destroyScenario(localScenario).then(
                    function (s) {
                        return storage.removeScenario(localScenario.key);
                    },
                    function (err) {
                        if (err.notFound) {
                            // scenario already gone from the cloud
                            return storage.removeScenario(localScenario.key);
                        }
                    });
            } else if (localScenario.local_updated_at > localScenario.updated_at) {
                // local scenario updated, update in the cloud
                return api.updateScenario(localScenario).then(function (scenario) {
                    return syncEngine.addScenario(localScenario, {
                        updated_at: scenario.updated_at,
                        local_updated_at: scenario.updated_at
                    });
                });
            } else {
                // No changes
                return Promise.resolve();
            }
        } else {
            // new local scenario
            if (!localScenario.removed) {
                // create scenario in the cloud
                return api.createScenario(localScenario).then(function (scenario) {
                    return syncEngine.addScenario(localScenario, {
                        id: scenario.id,
                        updated_at: scenario.updated_at,
                        created_at: scenario.created_at,
                        local_updated_at: scenario.updated_at
                    });
                });
            } else {
                // locally create scenario already removed before upload to the cloud
                return storage.removeScenario(localScenario.key);
            }
        }
    };

    return syncEngine;
});

define('device', ["jquery"], function ($) {

    'use strict';

    const device = {};
    const SETTING_DEVICE = "deviceSetting";

    device.DEVICE_SIZE_EXTRA_SMALL = 'xs';
    device.DEVICE_SIZE_SMALL = 'sm';
    device.DEVICE_SIZE_MEDIUM = 'md';
    device.DEVICE_SIZE_LARGE = 'lg';

    device.DEFAULT_DEVICE_SIZE = device.DEVICE_SIZE_MEDIUM;

    const DEFAULT_DEVICE_SETTING = {
        [device.DEVICE_SIZE_EXTRA_SMALL]: {
            fullName: "Extra Small",
            width: 320,
            userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 7_0 like Mac OS X; en-us) AppleWebKit/537.51.1 (KHTML, like Gecko) Version/7.0 Mobile/11A465 Safari/9537.53"
        },
        [device.DEVICE_SIZE_SMALL]: {
            fullName: "Small",
            width: 768,
            userAgent: "Mozilla/5.0 (iPad; CPU OS 7_0 like Mac OS X) AppleWebKit/537.51.1 (KHTML, like Gecko) Version/7.0 Mobile/11A465 Safari/9537.53"
        },
        [device.DEVICE_SIZE_MEDIUM]: {
            fullName: "Medium",
            width: 1024,
            userAgent: null
        },
        [device.DEVICE_SIZE_LARGE]: {
            fullName: "Large",
            width: 1366,
            userAgent: null
        }
    };

    const DEVICE_SIZE_LABEL = $("<span />", {"class": "label-device-size"});

    var deviceSetting;
    device.init = function (storage) {
        return storage.getSetting(SETTING_DEVICE).then(function (s) {
            if (s) {
                deviceSetting = s;
                return;
            } else {
                deviceSetting = DEFAULT_DEVICE_SETTING;
                return storage.saveSetting(SETTING_DEVICE, deviceSetting);
            }
        });
    };

    device.getWidth = function (size) {
        return deviceSetting[size].width;
    };

    device.getUserAgent = function (size) {
        return deviceSetting[size].userAgent;
    };

    device.getFullName = function (size) {
        return deviceSetting[size].fullName;
    };

    device.getLabel = function (size) {
        let label = DEVICE_SIZE_LABEL.clone();
        label.text(size).attr("title", `${device.getFullName(size)} (${device.getWidth(size)}px)`);
        return label;
    };

    device.defaultDeviceSize = function () {
        return device.DEFAULT_DEVICE_SIZE;
    };

    return device;
});

define('env', [], function () {
    const env = {};

    var getPlatformInfo = function () {
        return new Promise(function (fulfill, reject) {
            chrome.runtime.getPlatformInfo(function (platformInfo) {
                env.os = platformInfo.os;
                env.arch = platformInfo.arch;
                fulfill(env);
            });
        });
    };

    var readyPromise = getPlatformInfo().then(function () {
        env.browserVersion = navigator.userAgent.match(/Chrom(e|ium)\/([0-9\.]+)/)[2];
        env.manifest = chrome.runtime.getManifest();
        return env;
    });

    env.ready = function () {
        return readyPromise;
    };

    return env;
});

// If the user launch the app while background is not loaded, because requirejs
// takes too long to load, onLaunched event expired if it is inside requirejs.
// Sometimes background.js is loaded without user launching the app, so background.js
// can not always open home window (without using onLaunched event)
//
// Solution: Capture the onLaunched event before loading requirejs, record if
// the background.js is loaded by a user launching the app, and open the home window
// if it is after background.js loaded
var launched = false; // Indicate if background.js is loaded by a launch of user
var loaded = false; // Indicate if background.js has loaded
var launchHomeWindow = function () {
    // Dummy function to temporary initialize launchHomeWindow
    // Will be overwritten once background.js is loaded
    console.error("Invoking launchHomeWindow before loaded");
};

chrome.app.runtime.onLaunched.addListener(function (launchData) {
    console.clear()
    console.log("onLaunched: 已经加载: %s, 加载数据 %O", loaded, launchData);
    if (loaded) {
        // User launch app while background.js is already loaded, open home window directly
        launchHomeWindow();
    } else {
        // User launch app while background.js not loaded, set launched=true to let background.js to open home window once its loaded
        launched = true;
    }
});

requirejs([
    "account",
    "storage",
    "mixpanel",
    "core/sync_engine",
    "core/sync_engine_projects",
    "core/sync_engine_scenarios",
    "device",
    "windows",
    "env",
    "httpServer",
    "fileProxy",
    "migrationManager",
    "migrations/migration_0-12",
    "migrations/migration_0-22",
    "migrations/migration_0-34"
], function (account, storage, mixpanel, _syncEngine0, _syncEngine1, syncEngine, device, windows, env, HttpServer, FileProxy, _migrationManager0, _migrationManager1, _migrationManager2, migrationManager) {

    const AppId = "gkkbeadnikaimncfemghlddgbceopefd";
    const MixpanelAppId = "e054cca3303ffadfc2385f2f8a5a9b3a";
    const MixpanelAppIdTest = "f1d1266f9d174567696156462b5d5444";

    window.remoteHost = (chrome.runtime.id === AppId ? "https://manualtest.io" : "http://192.168.1.99:3000");

    window.account = account;
    window.storage = storage;
    window.syncEngine = syncEngine;
    window.device = device;
    window.mixpanel = mixpanel;

    window.appInitialization = storage.ready().then(function () {
        return env.ready();
    }).then(function () {
        return device.init(storage);
    }).then(function () {
        return migrationManager.migrate(storage);
    }).then(function () {
        return account.init(remoteHost, storage).then(function () {
            console.log("account ready");
        });
    }).then(function () {
        if (chrome.runtime.id === AppId) {
            mixpanel.init(MixpanelAppId);
        } else {
            mixpanel.init(MixpanelAppIdTest);
            // mixpanel.ignore(true);
        }
        return Promise.resolve();
    }).then(function () {
        return syncEngine.init();
    }).then(function () {
        return syncEngine.iterateAllScenarios().then(function (scenarios) {//APP 应用界面打开
            return Promise.all(
                scenarios.map(function (scenario) {
                    if (!('projectKey' in scenario) ||
                        typeof(scenario.projectKey) === "undefined" ||
                        scenario.projectKey === null) {
                        return adjustScenario(scenario);
                    } else {
                        if (scenario.projectKey !== 0) {
                            return syncEngine.getProjectByKey(scenario.projectKey)
                                .then(function (p) {
                                    if (!p) {
                                        return adjustScenario(scenario);
                                    } else {
                                        return Promise.resolve();
                                    }
                                });
                        } else {
                            return Promise.resolve();
                        }
                    }
                })
            );
        }).catch(function (err) {
            console.error("Adjusting scenarios projectkey resulted in error: %O", err);
        }).then(function () {
            return syncEngine.iterateAllScenarioResults().then(function (results) {
                return Promise.all(results.map(function (result) {
                    if (!result.scenarioKey) {
                        return syncEngine.removeScenarioResult(reuslt);
                    } else {
                        return syncEngine.getScenarioByKey(result.scenarioKey).then(function (s) {
                            if (!s) {
                                return syncEngine.removeScenarioResult(result);
                            } else {
                                return Promise.resolve();
                            }
                        });
                    }
                }));
            }).catch(function (err) {
                console.error("Adjusting scenario results scenarioKey resulted in error: %O", err);
            });
        });
    }).catch(function (err) {
        console.error("App initialization error: %O", err);
        console.error(err.stack);
        return Promise.reject(err);
    });

    // Clear up orphan data
    var adjustScenario = function (s) {
        s.projectKey = 0;
        return syncEngine.addScenario(s).then(
            function (s) {
                console.log("Scenario %s(key:%i) adjusted", s.name, s.key);
            },
            function (err) {
                console.error("Error adjusting scenario projectKey: " + err);
            });
    };

    var httpServer = new HttpServer("127.0.0.1", 6030);
    var fileProxy = new FileProxy(httpServer);

    // These are the js that are ready to serve to webview embedded pages.
    fileProxy.serve("/js/models/Element.js", requirejs.s.contexts._.config.baseUrl + "models/Element.js");
    fileProxy.serve("/js/models/action.js", requirejs.s.contexts._.config.baseUrl + "models/action.js");
    fileProxy.serve("/js/core/page.js", requirejs.s.contexts._.config.baseUrl + "core/page.js");

    chrome.runtime.onSuspend.addListener(function () {
        console.log("App 挂起");
        mixpanel.track("App 挂起");
    });

    chrome.runtime.onInstalled.addListener(function (details) {
        if (details.reason === "install") {
            console.log("This is a first install!");
            appInitialization.then(function () {
                // console.log("os: %s, arch: %s, nacl_arch: %s",
                //   platformInfo.os, platformInfo.arch, platformInfo.nacl_arch);
                mixpanel.track("App install", {
                    os: env.os,
                    arch: env.arch,
                    screenWidth: screen.width,
                    screenHeight: screen.height
                });
            });
        } else if (details.reason === "update") {
            appInitialization.then(function () {
                var thisVersion = env.manifest.version;
                console.log("Updated from " + details.previousVersion + " to " + thisVersion + "!");
                mixpanel.track("App update", {
                    previousVersion: details.previousVersion,
                    currentVersion: thisVersion
                });
            });
        }
    });

    window.appInitialization.then(function () {
        launchHomeWindow = function () {
            windows.openHomeWindow();
            window.appInitialization.then(function () {
                mixpanel.track("App start", {
                    version: +env.manifest.version,
                });
            });
        };

        if (launched) {
            launchHomeWindow();
            launched = false;
        }
        loaded = true;
    });
});


define("background", function () {
});

