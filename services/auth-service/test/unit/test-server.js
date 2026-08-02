const http = require("http");
const { createServer, handleShutdown, startServer } = require("../../src/server");

function makeRequest(server, path, method) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const options = { hostname: "127.0.0.1", port, path, method: method || "GET" };
    const req = http.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => { body += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, headers: res.headers, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

describe("Auth Service Server", function () {

  describe("createServer", function () {
    it("returns an http.Server instance", function () {
      const server = createServer();
      server.should.be.instanceOf(http.Server);
    });

    it("routes requests through the default handler", async function () {
      const server = createServer();
      await new Promise((resolve) => server.listen(0, resolve));
      try {
        const res = await makeRequest(server, "/health");
        res.statusCode.should.equal(200);
        JSON.parse(res.body).should.deep.equal({ status: "ok" });
      } finally {
        server.close();
      }
    });

    it("uses a custom handler when provided", async function () {
      const customHandler = (req, res) => {
        res.writeHead(201, { "Content-Type": "text/plain" });
        res.end("custom");
      };
      const server = createServer(customHandler);
      await new Promise((resolve) => server.listen(0, resolve));
      try {
        const res = await makeRequest(server, "/whatever");
        res.statusCode.should.equal(201);
        res.body.should.equal("custom");
      } finally {
        server.close();
      }
    });
  });

  describe("startServer", function () {
    it("listens on the requested port", async function () {
      const server = startServer({ port: 0 });
      await new Promise((resolve) => server.on("listening", resolve));
      try {
        server.listening.should.equal(true);
        server.address().port.should.be.a("number");
      } finally {
        server.close();
      }
    });

    it("exposes a running server that answers requests", async function () {
      const server = startServer({ port: 0 });
      await new Promise((resolve) => server.on("listening", resolve));
      try {
        const res = await makeRequest(server, "/ready");
        res.statusCode.should.equal(200);
        JSON.parse(res.body).should.deep.equal({ ready: true });
      } finally {
        server.close();
      }
    });

    it("accepts a pre-created server", async function () {
      const base = createServer();
      const server = startServer({ port: 0, server: base });
      await new Promise((resolve) => server.on("listening", resolve));
      try {
        server.should.equal(base);
        server.listening.should.equal(true);
      } finally {
        server.close();
      }
    });
  });

  describe("handleShutdown", function () {
    it("closes the server when the signal handler runs", function (done) {
      const server = createServer();
      server.listen(0, () => {
        const onSignal = handleShutdown(server, { exitOnClose: false });
        server.on("close", done);
        onSignal();
      });
    });

    it("calls process.exit with code 0 after close when exitOnClose is true", function (done) {
      let exitCode = null;
      const originalExit = process.exit;
      process.exit = (code) => { exitCode = code; };

      const server = createServer();
      server.listen(0, () => {
        const onSignal = handleShutdown(server);
        server.on("close", () => {
          setImmediate(() => {
            process.exit = originalExit;
            try {
              exitCode.should.equal(0);
              done();
            } catch (err) {
              done(err);
            }
          });
        });
        onSignal();
      });
    });
  });
});
