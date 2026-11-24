import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  LIVE_ACKNOWLEDGEMENT,
  assertLiveSafeguards,
  classifySetup,
  createConfig,
  createMt5Adapter,
  installMt5Expert,
  evaluateRisk,
  parseCandlesCsv,
  runPaper,
  runLive,
  sizePosition,
} from "../src/index.js";

function setupCandles() {
  const candles = Array.from({ length: 60 }, (_, index) => {
    const close = 100 + index * 0.05;
    return {
      timestamp: Date.UTC(2026, 0, 5, 12, index),
      open: close - 0.02,
      high: close + 0.08,
      low: close - 0.08,
      close,
      volume: 100,
      closed: true,
    };
  });
  const pullback = candles.at(-2);
  const prior = candles.slice(-22, -2);
  const support = Math.min(...prior.map((candle) => candle.low));
  Object.assign(pullback, {
    open: pullback.close + 0.2,
    close: pullback.close - 0.1,
    high: pullback.close + 0.22,
    low: support + 0.03,
  });
  const confirmation = candles.at(-1);
  Object.assign(confirmation, {
    open: pullback.close,
    close: pullback.close + 0.2,
    high: pullback.close + 0.22,
    low: pullback.close - 0.02,
    volume: 200,
  });
  return candles;
}

test("classifies only a complete, trend-aligned pullback and confirmation", () => {
  const config = createConfig();
  const candles = setupCandles();
  const result = classifySetup(candles, config);
  assert.equal(result.valid, true, result.reason);
  assert.equal(result.side, "long");
  assert.ok(result.stopLoss < result.entryPrice);
  assert.ok(result.takeProfit > result.entryPrice);
  assert.ok(result.rewardRiskRatio >= config.strategy.minimumRewardRisk);
  candles.at(-2).low -= 10;
  assert.equal(classifySetup(candles, config).valid, false);
});

test("never classifies an in-progress latest candle", () => {
  const candles = setupCandles();
  candles.at(-1).closed = false;
  assert.equal(classifySetup(candles, createConfig()).reason, "input contains an unconfirmed candle");
});

test("risk limits reject a daily loss, closed session, and invalid sizing", () => {
  const config = createConfig();
  const timestamp = Date.UTC(2026, 0, 5, 12);
  const common = { config, timestamp, equity: 10000, dayStartEquity: 10000, stopDistance: 1 };
  assert.equal(evaluateRisk({ ...common, dailyRealizedPnl: -150 }).allowed, false);
  assert.equal(evaluateRisk({ ...common, dailyRealizedPnl: 0, timestamp: Date.UTC(2026, 0, 4, 12) }).allowed, false);
  const noTradeConfig = createConfig({ time: { noTradeWindows: [{ start: "11:00", end: "13:00" }] } });
  assert.equal(evaluateRisk({ ...common, config: noTradeConfig, dailyRealizedPnl: 0 }).allowed, false);
  assert.equal(sizePosition({ equity: 10000, entryPrice: 100, stopPrice: 100, config }), 0);
  assert.equal(sizePosition({ equity: 10000, entryPrice: 100, stopPrice: 99, config }), 50);
});

test("paper mode executes bracketed positions and accounts for fees and slippage", () => {
  const config = createConfig({
    risk: { initialBalance: 10000 },
    orders: { entryType: "market", feeRate: 0.001, slippageRate: 0.001 },
  });
  const candles = setupCandles();
  const signal = classifySetup(candles, config);
  candles.push({
    timestamp: candles.at(-1).timestamp + 60000,
    open: signal.takeProfit + 1,
    high: signal.takeProfit + 1.1,
    low: signal.takeProfit + 0.9,
    close: signal.takeProfit + 1,
    volume: 100,
    closed: true,
  });
  const result = runPaper(candles, config);
  assert.equal(result.mode, "paper");
  assert.equal(result.tradeCount, 1);
  assert.equal(result.trades[0].exitReason, "take_profit");
  assert.ok(result.trades[0].fees > 0);
  assert.ok(result.trades[0].entryPrice > signal.entryPrice);
  assert.ok(result.trades[0].exitPrice < result.trades[0].takeProfit);
});

test("limit entries fill only during allowed hours and open brackets at the limit", () => {
  const candles = setupCandles();
  const signal = classifySetup(candles, createConfig());
  const next = {
    timestamp: candles.at(-1).timestamp + 60000,
    open: signal.entryPrice,
    high: signal.entryPrice + 0.1,
    low: signal.entryPrice - 0.1,
    close: signal.entryPrice,
    volume: 100,
    closed: true,
  };
  const config = createConfig({ orders: { entryType: "limit" } });
  const filled = runPaper([...candles, next], config);
  assert.equal(filled.openPositionAtEnd.orderType, "limit");
  assert.equal(filled.openPositionAtEnd.entryPrice, signal.entryPrice);

  const blockedConfig = createConfig({
    orders: { entryType: "limit" },
    time: { noTradeWindows: [{ start: "13:00", end: "14:00" }] },
  });
  const blocked = runPaper([...candles, next], blockedConfig);
  assert.equal(blocked.openPositionAtEnd, null);
});

test("an incomplete bar cannot fill or exit a paper position", () => {
  const candles = setupCandles();
  const signal = classifySetup(candles, createConfig());
  candles.push({
    timestamp: candles.at(-1).timestamp + 60000,
    open: signal.takeProfit,
    high: signal.takeProfit + 1,
    low: signal.takeProfit - 1,
    close: signal.takeProfit,
    volume: 100,
    closed: false,
  });
  const result = runPaper(candles, createConfig());
  assert.equal(result.tradeCount, 0);
  assert.ok(result.openPositionAtEnd);
});

test("CSV input validates OHLCV rows and assumes only supplied rows are closed bars", () => {
  const candles = parseCandlesCsv("timestamp,open,high,low,close,volume\n2026-01-05T12:00:00Z,10,11,9,10.5,20");
  assert.equal(candles[0].closed, true);
  assert.throws(() => parseCandlesCsv("timestamp,open,high,low,close,volume\n2026-01-05T12:00:00Z,10,9,11,10.5,20"), /invalid OHLCV/);
});

test("live execution fails closed without exact acknowledgement, account match, and atomic bracket adapter", () => {
  const config = createConfig({
    execution: { mode: "live", liveEnabled: true, allowedAccountId: "account-1" },
    mt5: { expectedDemoServer: "Exness-MT5Trial" },
  });
  const adapter = {
    demoOnly: true,
    supportsAtomicBracketOrders: true,
    verifyDemoAccount() {},
    getAccountSnapshot() {},
    sizePosition() {},
    submitBracketOrder() {},
    cancelPendingEntryOrders() {},
  };
  assert.throws(() => assertLiveSafeguards(config, {}, adapter), /TRADING_ACCOUNT_ID/);
  assert.throws(() => assertLiveSafeguards(config, {
    TRADING_ACCOUNT_ID: "account-1",
    TRADING_LIVE_ACK: "yes",
  }, adapter), /TRADING_LIVE_ACK/);
  assert.throws(() => assertLiveSafeguards(config, {
    TRADING_ACCOUNT_ID: "account-1",
    TRADING_LIVE_ACK: LIVE_ACKNOWLEDGEMENT,
  }, { ...adapter, supportsAtomicBracketOrders: false }), /demo-only adapter/);
  assert.doesNotThrow(() => assertLiveSafeguards(config, {
    TRADING_ACCOUNT_ID: "account-1",
    TRADING_LIVE_ACK: LIVE_ACKNOWLEDGEMENT,
  }, adapter));
});

test("MT5 adapter consumes mocked demo metadata and only emits closed history as warmup", async () => {
  const candles = setupCandles().map((candle) => ({ ...candle, symbol: "XAUUSD" }));
  const requests = [];
  const config = createConfig({
    execution: { allowedAccountId: "123456" },
    mt5: {
      expectedDemoServer: "Exness-MT5Trial",
      historyBars: 60,
      symbols: { XAUUSD: "XAUUSDm", BTCUSD: "BTCUSDm" },
    },
  });
  const adapter = createMt5Adapter(config, {
    request: async (operation, payload, context) => {
      requests.push({ operation, payload, context });
      if (operation === "verify_demo") return { verified: true, tradeMode: "demo", server: "Exness-MT5Trial" };
      if (operation === "candles") return candles.slice(-payload.count);
      if (operation === "symbol_candidates") return ["XAUUSDm", "BTCUSDm"];
      throw new Error(`Unexpected operation: ${operation}`);
    },
  });
  assert.equal((await adapter.verifyDemoAccount()).verified, true);
  const iterator = adapter.candleSource("XAUUSD")[Symbol.asyncIterator]();
  const first = await iterator.next();
  await iterator.return();
  assert.equal(first.value.symbol, "XAUUSD");
  assert.equal(first.value.warmup, true);
  assert.equal(requests[0].context.allowedAccountId, "123456");
  assert.equal(requests[1].payload.symbol, "XAUUSD");
  assert.deepEqual(await adapter.listSymbolCandidates(), ["XAUUSDm", "BTCUSDm"]);
});

test("MT5 EA installer copies the monitor-only source without enabling orders", async () => {
  const root = await mkdtemp(join(tmpdir(), "gold-spoon-ea-"));
  try {
    const result = await installMt5Expert({
      getTerminalPaths: async () => ({ dataPath: root, installPath: root }),
    }, { compile: false });
    const installed = await readFile(result.sourcePath, "utf8");
    assert.equal(result.compiled, false);
    assert.match(installed, /InpEnableDemoOrders = false/);
    assert.match(installed, /InpExpectedDemoLogin = 0/);

    const executablePath = result.sourcePath.replace(/\.mq5$/i, ".ex5");
    await writeFile(executablePath, "mock compiled output");
    const future = new Date(Date.now() + 5000);
    await utimes(executablePath, future, future);
    const compiled = await installMt5Expert({
      getTerminalPaths: async () => ({ dataPath: root, installPath: root }),
    });
    assert.equal(compiled.compiled, true);
    assert.equal(compiled.executablePath, executablePath);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("live runner submits a protective bracket and cancels pending entries on shutdown", async () => {
  const config = createConfig({
    execution: { mode: "live", liveEnabled: true, allowedAccountId: "account-1" },
    mt5: { expectedDemoServer: "Exness-MT5Trial" },
  });
  const orders = [];
  let cancelled = false;
  const adapter = {
    demoOnly: true,
    supportsAtomicBracketOrders: true,
    verifyDemoAccount: async () => ({ verified: true, tradeMode: "demo", server: "Exness-MT5Trial" }),
    getAccountSnapshot: async () => ({ equity: 10000, dayStartEquity: 10000, dailyRealizedPnl: 0, openPositions: 0, pendingEntryOrders: 0 }),
    sizePosition: async () => ({ volume: 0.05 }),
    submitBracketOrder: async (order) => (orders.push(order), { accepted: true }),
    cancelPendingEntryOrders: async () => { cancelled = true; },
  };
  async function* source() {
    for (const candle of setupCandles()) yield { ...candle, symbol: "XAUUSD" };
  }
  await runLive({
    candleSource: source(),
    adapter,
    config,
    env: { TRADING_ACCOUNT_ID: "account-1", TRADING_LIVE_ACK: LIVE_ACKNOWLEDGEMENT },
  });
  assert.equal(orders.length, 1);
  assert.equal(orders[0].minimumRewardRisk, config.strategy.minimumRewardRisk);
  assert.equal(orders[0].symbol, "XAUUSD");
  assert.ok(orders[0].stopLoss < orders[0].entryPrice);
  assert.equal(cancelled, true);
});
