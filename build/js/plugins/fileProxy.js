
define('fileProxy', [], function () {
    var httpServer;

    function FileProxy(server) {
        httpServer = server;
    }

    FileProxy.prototype.serve = function (uriPath, filePath) {
        httpServer.get(uriPath, function (request, response) {
            fetchAppFile(filePath, function (content) {
                response.send(200, content);
            });
        });
    };


    function fetchAppFile(path, callback) {
        var xhr = new XMLHttpRequest();
        xhr.open('GET', chrome.runtime.getURL(path), true);

        xhr.onreadystatechange = function (e) {
            if (this.readyState == 4 && this.status == 200) {
                callback(this.responseText);
            }
        };

        xhr.send();
    }

    return FileProxy;
});