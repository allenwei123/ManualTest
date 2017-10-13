
/*
  Poor man implemantation of the http server, for serving js files to webview embedded pages.

  It will be updated when doing local api in the future.
*/

define('httpServer', ["TcpServer"], function (TcpServer) {
    const METHODS = ["GET", "POST", "PUT", "DELETE"];
    const LOGGING = false;

    var tcpServer;
    var handlers;

    function HttpServer(addr, port) {
        tcpServer = new TcpServer(addr, port);

        tcpServer.listen(onAcceptTcpConnectionCallback);

        handlers = {};
        METHODS.forEach(function (m, index, array) {
            handlers[m] = {};
        });
    }

    function onAcceptTcpConnectionCallback(tcpConnection, socketInfo) {
        var info = "[" + socketInfo.peerAddress + ":" + socketInfo.peerPort + "] Connection accepted!";
        log(info);
        log(socketInfo);
        tcpConnection.addDataReceivedListener(function (data) {

            var lines = data.split(/[\r?\n]/);

            // parse data into request
            var tokens = lines.shift().split(' ', 3);
            var method = tokens[0].toUpperCase();
            var path = tokens[1];
            var httpVersion = tokens[2];

            var headers;

            var line;
            while (!!(line = lines.shift().trim())) {
                tokens = line.split(/:\s/);
                headers[tokens[0]] = tokens[1];
            }
            var body = lines.join();

            var request = new HttpRequest(method, path, headers, body);
            var response = new HttpResponse(httpVersion, tcpConnection);

            // invoke callback
            if (handlers[method] && handlers[method][path]) {
                var fn = handlers[method][path];
                try {
                    fn(request, response);
                }
                catch (err) {
                    response.send(500, "Error");
                    console.error(err);
                }
            } else {
                log("No handler registered for " + method + " " + path);
                response.send(404, "");
            }
        });
    }

    METHODS.forEach(function (method, index, array) {
        (HttpServer.prototype)[method.toLowerCase()] = function (path, fn) {
            handlers[method][path] = fn;
        };
    });


    function HttpRequest(method, path, headers, body) {
        this.method = method;
        this.path = path;
        this.headers = headers;
        this.body = body;
    }

    function HttpResponse(http, conn) {
        this.httpVersion = http;
        this.tcpConnection = conn;
    }

    HttpResponse.statusName = {
        200: "OK",
        404: "NOT FOUND",
        500: "INTERNAL SERVER ERROR"
    };
    HttpResponse.prototype.send = function (status, msg) {
        // response header
        var reply = this.httpVersion + " " + status + " " + HttpResponse.statusName[status] + "\r\n";
        reply += "Content-Type: text/javascript\r\n";
        reply += "cache-control:no-cache\r\n";
        reply += "\r\n";

        // response body
        if (msg) {
            reply += msg;
            reply += "\r\n\r\n";
        }

        this.tcpConnection.sendMessage(reply, function () {
            this.tcpConnection.close();
        }.bind(this));
    };

    function log() {
        if (LOGGING) {
            console.log.apply(console, arguments);
        }
    }


    return HttpServer;
});