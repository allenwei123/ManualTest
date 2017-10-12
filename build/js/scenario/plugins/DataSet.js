define('DataSet', [], function () {
    "use strict";

    const DataSet = {
        createWithJson: function (json) {
            var obj = Object.create(DataSet);

            json = json || {};

            Object.keys(json).forEach(function (name) {
                obj[name] = {
                    value: json[name].value,
                    regex: json[name].regex
                };
            });

            return obj;
        },
        /*
      return null if data is valid; otherwise return a reason in string why the
      data is not valid.
    */
        isDataValid: function (d) {
            if (!d) {
                return "Data is requried";
            } else if (!d.name) {
                return "Data name is required";
            } else if (!/^\w+$/.test(d.name)) {
                return "Data name must consist of alphanumeric or underscores";
            }

            return null;
        },
        addData: function (d) {
            var err = DataSet.isDataValid(d);
            if (err) {
                return Promise.reject(err);
            }

            this[d.name] = {
                value: d.value,
                regex: d.regex
            };

            return Promise.resolve(d);
        },
        getData: function (name) {
            if (this[name]) {
                return {
                    name: name,
                    value: this[name].value,
                    regex: this[name].regex
                };
            } else {
                return null;
            }
        },
        removeData: function (name) {
            if (!name) {
                return Promise.reject("Data name is required");
            }

            if (this[name]) {
                delete this[name];
                return true;
            } else {
                return false;
            }
        },
        forEach: function (fn) {
            return Object.keys(this).forEach(function (name) {
                fn(this.getData(name));
            }.bind(this));
        },
        empty: function () {
            Object.keys(this).forEach(function (name) {
                delete this[name];
            });
        },
        get count() {
            return Object.keys(this).length;
        }
    };

    return DataSet;
});
