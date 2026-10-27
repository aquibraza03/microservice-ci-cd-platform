const { EventEmitter } = require("events");
const { handleShutdown, startServer } = require("../../src/server");

function stubProcessExit() {
  let exitCode = null;
  const originalExit = process.exit;
  process.exit = (code) => { exitCode = code; };
  return {
    restore() { process.exit = originalExit; },
    getCode() { return exitCode; }
  };
}

function stubConsoleError() {
  let lines = [];
  const originalError = console.error;
  console.error = (msg) => { lines.push(String(msg)); };
  return {
    restore() { console.error = originalError; },
    getLines() { return lines; }
  };
}

describe("Auth Service Server - Edge Cases", function () {

  describe("startServer error handling", function () {

    it("logs a structured JSON error and exits 1 when the server emits error", function () {
      const exitStub = stubProcessExit();
      const errorStub = stubConsoleError();

      const fakeServer = new EventEmitter();
      fakeServer.listen = () => {};

      const server = startServer({ port: 0, server: fakeServer });

      fakeServer.emit("error", new Error("EADDRINUSE: address already in use"));

      try {
        exitStub.getCode().should.equal(1);
        errorStub.getLines().length.should.equal(1);
        const payload = JSON.parse(errorStub.getLines()[0]);
        payload.level.should.equal("error");
        payload.message.should.equal("Server error");
        payload.error.should.equal("EADDRINUSE: address already in use");
        server.should.equal(fakeServer);
      } finally {
        exitStub.restore();
        errorStub.restore();
      }
    });

    it("falls back to the default PORT constant when no port is provided", function () {
      const exitStub = stubProcessExit();
      const errorStub = stubConsoleError();

      const fakeServer = new EventEmitter();
      let listenArgs = null;
      fakeServer.listen = (port, cb) => { listenArgs = { port, cb }; };

      startServer({ server: fakeServer });

      try {
        listenArgs.port.should.equal(3000);
        listenArgs.cb.should.be.a("function");
      } finally {
        exitStub.restore();
        errorStub.restore();
      }
    });
  });

  describe("handleShutdown force-exit timeout", function () {

    function makeHangingServer() {
      // close() never completes: simulates in-flight connections that prevent
      // graceful shutdown from finishing within the timeout window.
      return {
        close() {}
      };
    }

    it("forces exit with code 1 when graceful shutdown exceeds the timeout", async function () {
      const exitStub = stubProcessExit();
      const loggerLines = [];
      const logger = {
        log: (msg) => { loggerLines.push(msg); },
        error: (msg) => { loggerLines.push(msg); }
      };

      try {
        const onSignal = handleShutdown(makeHangingServer(), {
          exitOnClose: false,
          timeoutMs: 50,
          logger
        });
        onSignal("SIGTERM");

        await new Promise((resolve) => setTimeout(resolve, 150));

        exitStub.getCode().should.equal(1);
        loggerLines.should.include("SIGTERM received, shutting down gracefully");
        loggerLines.should.include("Graceful shutdown timed out, forcing exit");
      } finally {
        exitStub.restore();
      }
    });

    it("honours a short timeout for fast-failing environments", async function () {
      const exitStub = stubProcessExit();
      const logger = { log: () => {}, error: () => {} };

      try {
        const onSignal = handleShutdown(makeHangingServer(), {
          exitOnClose: false,
          timeoutMs: 20,
          logger
        });
        onSignal("SIGINT");

        await new Promise((resolve) => setTimeout(resolve, 80));

        exitStub.getCode().should.equal(1);
      } finally {
        exitStub.restore();
      }
    });
  });
});
