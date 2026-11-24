import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const bridgePath = fileURLToPath(new URL("../mt5/bridge.py", import.meta.url));

function requestWithProcess({ pythonExecutable, scriptPath, context, timeoutMs = 20000 }) {
  return (operation, payload = {}) => new Promise((resolve, reject) => {
    const child = spawn(pythonExecutable, [scriptPath], {
      windowsHide: true,
      env: {
        PATH: process.env.PATH || "",
        SYSTEMROOT: process.env.SYSTEMROOT || "",
        WINDIR: process.env.WINDIR || "",
        USERPROFILE: process.env.USERPROFILE || "",
        APPDATA: process.env.APPDATA || "",
        LOCALAPPDATA: process.env.LOCALAPPDATA || "",
        TEMP: process.env.TEMP || "",
        TMP: process.env.TMP || "",
      },
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(new Error("MT5 bridge request timed out"));
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", () => finish(new Error("Could not start the configured Python executable")));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(new Error(`MT5 bridge exited with code ${code}: ${stderr.trim() || "no diagnostic output"}`));
        return;
      }
      try {
        const response = JSON.parse(stdout.trim());
        if (!response.ok) finish(new Error(response.error || "MT5 bridge rejected the request"));
        else finish(null, response.result);
      } catch {
        finish(new Error("MT5 bridge returned invalid JSON"));
      }
    });
    child.stdin.end(JSON.stringify({ operation, payload, context }));
  });
}

function makeAbortableDelay(milliseconds, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(done, milliseconds);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

export function createMt5Adapter(config, {
  pythonExecutable = config.mt5.pythonExecutable || "python",
  scriptPath = bridgePath,
  request = requestWithProcess({
    pythonExecutable,
    scriptPath,
    context: {
      expectedDemoServer: config.mt5.expectedDemoServer,
      allowedAccountId: config.execution.allowedAccountId,
      symbols: config.mt5.symbols,
      maxSignalAgeSeconds: config.mt5.maxSignalAgeSeconds,
      limitExpiryBars: config.mt5.limitExpiryBars,
      deviationPoints: config.mt5.deviationPoints,
    },
  }),
} = {}) {
  const context = {
    expectedDemoServer: config.mt5.expectedDemoServer,
    allowedAccountId: config.execution.allowedAccountId,
    symbols: config.mt5.symbols,
    maxSignalAgeSeconds: config.mt5.maxSignalAgeSeconds,
    limitExpiryBars: config.mt5.limitExpiryBars,
    deviationPoints: config.mt5.deviationPoints,
  };
  const serializedRequest = (() => {
    let queue = Promise.resolve();
    return (operation, payload) => {
      const current = queue.then(() => request(operation, payload, context));
      queue = current.catch(() => {});
      return current;
    };
  })();

  const adapter = {
    demoOnly: true,
    supportsAtomicBracketOrders: true,

    async verifyDemoAccount() {
      const result = await serializedRequest("verify_demo");
      if (result.verified !== true || result.tradeMode !== "demo" || result.server !== config.mt5.expectedDemoServer) {
        throw new Error("MT5 demo account verification did not match the configured server");
      }
      return result;
    },

    getAccountSnapshot() {
      return serializedRequest("account_snapshot");
    },

    sizePosition(input) {
      return serializedRequest("size_position", input);
    },

    submitBracketOrder(order) {
      if (!Object.hasOwn(config.mt5.symbols, order.symbol)) throw new Error("Symbol is not enabled for this MT5 adapter");
      return serializedRequest("submit_bracket_order", order);
    },

    cancelPendingEntryOrders() {
      return serializedRequest("cancel_pending_entry_orders");
    },

    getSymbolInfo(symbol) {
      if (!Object.hasOwn(config.mt5.symbols, symbol)) throw new Error("Symbol is not enabled for this MT5 adapter");
      return serializedRequest("symbol_info", { symbol });
    },

    listSymbolCandidates() {
      return serializedRequest("symbol_candidates");
    },

    getTerminalPaths() {
      return serializedRequest("terminal_paths");
    },

    async *candleSource(symbol, { signal } = {}) {
      if (!Object.hasOwn(config.mt5.symbols, symbol)) throw new Error("Symbol is not enabled for this MT5 adapter");
      const history = await serializedRequest("candles", { symbol, count: config.mt5.historyBars });
      if (!Array.isArray(history) || history.length < config.mt5.historyBars) throw new Error(`MT5 returned insufficient history for ${symbol}`);
      let lastTimestamp = -Infinity;
      for (const candle of history) {
        if (!candle.closed || candle.timestamp <= lastTimestamp) throw new Error("MT5 history contained an invalid or unclosed candle");
        lastTimestamp = candle.timestamp;
        yield { ...candle, warmup: true };
      }
      while (!signal?.aborted) {
        await makeAbortableDelay(config.mt5.pollIntervalMs, signal);
        if (signal?.aborted) break;
        const latest = await serializedRequest("candles", { symbol, count: 3 });
        for (const candle of latest) {
          if (candle.timestamp <= lastTimestamp) continue;
          if (!candle.closed) throw new Error("MT5 attempted to emit an unclosed candle");
          lastTimestamp = candle.timestamp;
          yield { ...candle, warmup: false };
        }
      }
    },
  };
  return adapter;
}
