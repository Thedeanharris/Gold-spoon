import { classifySetup } from "./strategy.js";
import { evaluateRisk } from "./risk.js";
import { validateCandle } from "./csv.js";
import { isAllowedTradingTime } from "./time.js";

export const LIVE_ACKNOWLEDGEMENT = "I_ACCEPT_LIVE_TRADING_RISK";

export function assertLiveSafeguards(config, env, adapter) {
  if (config.execution.mode !== "live" || config.execution.liveEnabled !== true) {
    throw new Error("Live execution requires execution.mode=live and execution.liveEnabled=true");
  }
  if (!config.execution.allowedAccountId || env.TRADING_ACCOUNT_ID !== config.execution.allowedAccountId) {
    throw new Error("TRADING_ACCOUNT_ID does not match the configured execution.allowedAccountId");
  }
  if (env.TRADING_LIVE_ACK !== LIVE_ACKNOWLEDGEMENT) {
    throw new Error(`Set TRADING_LIVE_ACK=${LIVE_ACKNOWLEDGEMENT} to explicitly acknowledge live-trading risk`);
  }
  if (config.execution.provider !== "mt5" || !config.mt5.expectedDemoServer || !adapter || adapter.demoOnly !== true
      || adapter.supportsAtomicBracketOrders !== true
      || typeof adapter.verifyDemoAccount !== "function"
      || typeof adapter.getAccountSnapshot !== "function"
      || typeof adapter.sizePosition !== "function"
      || typeof adapter.submitBracketOrder !== "function"
      || typeof adapter.cancelPendingEntryOrders !== "function") {
    throw new Error("Live execution requires a demo-only adapter that verifies its server/account, sizes positions from broker metadata, and supports protective brackets");
  }
}

export async function runLive({ candleSource, adapter, config, env = process.env, signal, logger = () => {} }) {
  assertLiveSafeguards(config, env, adapter);
  const verification = await adapter.verifyDemoAccount();
  if (verification?.verified !== true || verification.tradeMode !== "demo" || verification.server !== config.mt5.expectedDemoServer) {
    throw new Error("Live execution stopped because the MT5 demo server/account was not verified");
  }
  const candles = [];
  let lastTimestamp = -Infinity;
  let lastSubmittedIndex = -Infinity;
  let liveCandlesStarted = false;
  try {
    for await (const candle of candleSource) {
      if (signal?.aborted) break;
      validateCandle(candle);
      if (typeof candle.symbol !== "string" || !Object.hasOwn(config.mt5.symbols, candle.symbol)) {
        throw new Error("Live candle has a symbol that is not enabled in the MT5 configuration");
      }
      if (candle.closed !== true) {
        logger("candle_ignored", { reason: "not confirmed closed", timestamp: candle.timestamp });
        continue;
      }
      if (candle.timestamp <= lastTimestamp) throw new Error("Live candle timestamps must be strictly increasing");
      lastTimestamp = candle.timestamp;
      candles.push(candle);
      if (candle.warmup === true) {
        if (liveCandlesStarted) throw new Error("Warmup candles must be supplied before live candles");
        continue;
      }
      liveCandlesStarted = true;
      const account = await adapter.getAccountSnapshot();
      if (!account || !Number.isFinite(account.equity) || !Number.isFinite(account.dayStartEquity)
          || !Number.isFinite(account.dailyRealizedPnl) || !Number.isInteger(account.openPositions) || account.openPositions < 0
          || !Number.isInteger(account.pendingEntryOrders) || account.pendingEntryOrders < 0) {
        throw new Error("Live adapter returned an invalid account-risk snapshot");
      }
      const riskWindowClosed = !isAllowedTradingTime(candle.timestamp, config.time)
        || account.equity <= 0
        || account.openPositions >= config.risk.maximumOpenPositions
        || account.dailyRealizedPnl <= -account.dayStartEquity * config.risk.maximumDailyLoss;
      if (riskWindowClosed) {
        await adapter.cancelPendingEntryOrders();
        logger("pending_entries_cancelled", { reason: "risk or session filter", timestamp: candle.timestamp });
        continue;
      }
      if (account.openPositions + account.pendingEntryOrders >= config.risk.maximumOpenPositions) continue;
      const setup = classifySetup(candles, config);
      if (!setup.valid || candles.length - 1 <= lastSubmittedIndex) continue;

      const decision = evaluateRisk({
        config,
        timestamp: candle.timestamp,
        equity: account.equity,
        dayStartEquity: account.dayStartEquity,
        dailyRealizedPnl: account.dailyRealizedPnl,
        stopDistance: Math.abs(setup.entryPrice - setup.stopLoss),
        openPositions: account.openPositions + account.pendingEntryOrders,
        cooldownActive: candles.length - 1 - lastSubmittedIndex <= config.risk.cooldownBars,
      });
      if (!decision.allowed) {
        logger("trade_rejected", { reason: decision.reason, timestamp: candle.timestamp });
        continue;
      }
      const sizing = await adapter.sizePosition({
        symbol: candle.symbol,
        side: setup.side,
        entryType: config.orders.entryType,
        entryPrice: setup.entryPrice,
        stopPrice: setup.stopLoss,
        equity: account.equity,
        riskPerTrade: config.risk.riskPerTrade,
        maximumLeverage: config.risk.maximumLeverage,
        deviationPoints: config.mt5.deviationPoints,
      });
      const quantity = sizing?.volume;
      if (!Number.isFinite(quantity)) throw new Error("MT5 adapter returned an invalid position volume");
      if (quantity <= 0) continue;
      const submitted = await adapter.submitBracketOrder({
        symbol: candle.symbol,
        type: config.orders.entryType,
        side: setup.side,
        quantity,
        entryPrice: setup.entryPrice,
        stopLoss: setup.stopLoss,
        takeProfit: setup.takeProfit,
        minimumRewardRisk: config.strategy.minimumRewardRisk,
        limitExpiryBars: config.mt5.limitExpiryBars,
        timestamp: candle.timestamp,
      });
      if (submitted?.accepted !== true) {
        logger("trade_rejected", { reason: submitted?.reason || "MT5 did not confirm the bracketed order", timestamp: candle.timestamp });
        continue;
      }
      lastSubmittedIndex = candles.length - 1;
      logger("live_bracket_submitted", { side: setup.side, quantity, stopLoss: setup.stopLoss, takeProfit: setup.takeProfit, timestamp: candle.timestamp });
    }
  } finally {
    // Preserve protective stop/target orders; only unfilled entries are cancelled.
    await adapter.cancelPendingEntryOrders();
  }
}
