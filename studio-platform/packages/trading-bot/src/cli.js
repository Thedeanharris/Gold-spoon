#!/usr/bin/env node
import { resolve } from "node:path";
import { createConfig, loadConfig } from "./config.js";
import { loadCandlesCsv } from "./csv.js";
import { createJsonLogger } from "./logger.js";
import { createMt5Adapter } from "./mt5-adapter.js";
import { installMt5Expert } from "./install-ea.js";
import { assertLiveSafeguards, runLive } from "./live.js";
import { runBacktest, runPaper } from "./paper.js";

const args = process.argv.slice(2);
const valueAfter = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const mode = valueAfter("--mode", "paper");
const input = valueAfter("--candles", "");
const configPath = valueAfter("--config", "");

try {
  if (!["paper", "backtest", "verify-mt5", "symbols-mt5", "install-ea", "live"].includes(mode)) throw new Error("Supported modes: paper, backtest, verify-mt5, symbols-mt5, install-ea, live.");
  if (mode === "verify-mt5" || mode === "symbols-mt5" || mode === "install-ea" || mode === "live") {
    if (!configPath) throw new Error("MT5 modes require --config path/to/config.local.json.");
    const config = await loadConfig(resolve(configPath));
    const adapter = createMt5Adapter(config);
    if (mode === "install-ea") {
      const result = await installMt5Expert(adapter);
      console.log(JSON.stringify({ event: "mt5_ea_installed", ...result }, null, 2));
    } else if (mode === "symbols-mt5") {
      const candidates = await adapter.listSymbolCandidates();
      console.log(JSON.stringify({ event: "mt5_symbols_discovered", candidates }, null, 2));
    } else if (mode === "verify-mt5") {
      const account = await adapter.verifyDemoAccount();
      const symbols = await Promise.all(Object.keys(config.mt5.symbols).map((symbol) => adapter.getSymbolInfo(symbol)));
      console.log(JSON.stringify({ event: "mt5_demo_verified", server: account.server, symbols }, null, 2));
    } else {
      if (config.execution.mode !== "live") throw new Error("Set execution.mode=live in the local config to enable demo order execution.");
      assertLiveSafeguards(config, process.env, adapter);
      await adapter.verifyDemoAccount();
      const controller = new AbortController();
      const abort = () => controller.abort();
      process.once("SIGINT", abort);
      process.once("SIGTERM", abort);
      const logger = createJsonLogger();
      logger("demo_order_loop_starting", {
        server: config.mt5.expectedDemoServer,
        symbols: Object.keys(config.mt5.symbols),
        timeframe: config.mt5.timeframe,
      });
      const runs = Object.keys(config.mt5.symbols).map((symbol) => runLive({
        candleSource: adapter.candleSource(symbol, { signal: controller.signal }),
        adapter,
        config,
        signal: controller.signal,
        logger,
      }));
      try {
        await Promise.all(runs);
      } finally {
        controller.abort();
        await Promise.allSettled(runs);
        await adapter.cancelPendingEntryOrders();
        process.removeListener("SIGINT", abort);
        process.removeListener("SIGTERM", abort);
      }
    }
    process.exitCode = 0;
  } else {
    if (!input) throw new Error("Pass --candles PATH to a closed-candle OHLCV CSV file.");
    const config = configPath ? await loadConfig(resolve(configPath)) : createConfig({ execution: { mode } });
    if (config.execution.mode !== mode) throw new Error(`Configuration mode ${config.execution.mode} does not match CLI mode ${mode}.`);
    const candles = await loadCandlesCsv(resolve(input));
    const logger = createJsonLogger();
    const result = mode === "backtest"
      ? runBacktest(candles, config, { logger })
      : runPaper(candles, config, { logger });
    console.log(JSON.stringify({ event: "run_complete", ...result }, null, 2));
  }
} catch (error) {
  console.error(JSON.stringify({ event: "fatal_error", message: error.message }));
  process.exitCode = 1;
}
