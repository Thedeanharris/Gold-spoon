import { classifySetup } from "./strategy.js";
import { evaluateRisk, sizePosition } from "./risk.js";
import { isAllowedTradingTime, localDateKey } from "./time.js";
import { validateCandle } from "./csv.js";

function applySlippage(price, side, isEntry, rate) {
  const direction = side === "long" ? 1 : -1;
  return price * (1 + direction * (isEntry ? 1 : -1) * rate);
}

export class PaperBroker {
  constructor(config, logger = () => {}) {
    this.config = config;
    this.logger = logger;
    this.balance = config.risk.initialBalance;
    this.position = null;
    this.pendingEntry = null;
    this.trades = [];
    this.equityPoints = [];
  }

  get equity() {
    return this.balance;
  }

  get hasExposure() {
    return Boolean(this.position || this.pendingEntry);
  }

  placeMarket(setup, timestamp) {
    const price = applySlippage(setup.entryPrice, setup.side, true, this.config.orders.slippageRate);
    this.openPosition(setup, price, timestamp, "market");
  }

  placeLimit(setup, index) {
    this.pendingEntry = { setup, createdIndex: index };
    this.logger("entry_order_placed", { type: "limit", side: setup.side, price: setup.entryPrice, timestamp: setup.timestamp });
  }

  openPosition(setup, price, timestamp, orderType) {
    const stopDistance = Math.abs(price - setup.stopLoss);
    if (setup.side === "long" ? setup.stopLoss >= price : setup.stopLoss <= price) {
      this.logger("entry_skipped", { reason: "fill would invalidate the ATR stop", timestamp });
      return;
    }
    const quantity = sizePosition({ equity: this.balance, entryPrice: price, stopPrice: setup.stopLoss, config: this.config });
    if (quantity <= 0) {
      this.logger("entry_skipped", { reason: "position size is zero", timestamp });
      return;
    }
    const entryFee = quantity * price * this.config.orders.feeRate;
    this.balance -= entryFee;
    const targetDistance = stopDistance * this.config.strategy.minimumRewardRisk;
    const takeProfit = setup.side === "long" ? price + targetDistance : price - targetDistance;
    this.position = {
      side: setup.side,
      quantity,
      entryPrice: price,
      stopLoss: setup.stopLoss,
      takeProfit,
      entryFee,
      entryTimestamp: timestamp,
      orderType,
    };
    this.logger("position_opened", { side: setup.side, quantity, entryPrice: price, stopLoss: setup.stopLoss, takeProfit, timestamp, orderType });
  }

  processCandle(candle, index, { allowEntryFill = true } = {}) {
    let closedTrade = false;
    if (this.pendingEntry) {
      const { setup, createdIndex } = this.pendingEntry;
      if (!allowEntryFill) {
        this.cancelPendingEntries("outside allowed trading time");
      } else if (index - createdIndex > this.config.orders.limitExpiryBars) {
        this.pendingEntry = null;
        this.logger("entry_order_expired", { timestamp: candle.timestamp });
      } else {
        const filled = setup.side === "long"
          ? candle.low <= setup.entryPrice
          : candle.high >= setup.entryPrice;
        if (filled) {
          this.pendingEntry = null;
          const price = setup.side === "long" && candle.open < setup.entryPrice
            ? candle.open
            : setup.side === "short" && candle.open > setup.entryPrice ? candle.open : setup.entryPrice;
          this.openPosition(setup, price, candle.timestamp, "limit");
        }
      }
    }
    if (this.position) closedTrade = this.checkExit(candle);
    this.equityPoints.push({ timestamp: candle.timestamp, equity: this.balance });
    return closedTrade;
  }

  checkExit(candle) {
    const position = this.position;
    const long = position.side === "long";
    const stopHit = long ? candle.low <= position.stopLoss : candle.high >= position.stopLoss;
    const targetHit = long ? candle.high >= position.takeProfit : candle.low <= position.takeProfit;
    if (!stopHit && !targetHit) return false;

    // When both bracket levels occur in one OHLC bar, assume the stop filled first.
    const reason = stopHit ? "stop_loss" : "take_profit";
    const rawExit = reason === "stop_loss" ? position.stopLoss : position.takeProfit;
    const exitPrice = applySlippage(rawExit, position.side, false, this.config.orders.slippageRate);
    const exitFee = position.quantity * exitPrice * this.config.orders.feeRate;
    const grossPnl = (exitPrice - position.entryPrice) * position.quantity * (long ? 1 : -1);
    const netPnl = grossPnl - position.entryFee - exitFee;
    this.balance += grossPnl - exitFee;
    const trade = {
      side: position.side,
      quantity: position.quantity,
      entryPrice: position.entryPrice,
      exitPrice,
      stopLoss: position.stopLoss,
      takeProfit: position.takeProfit,
      entryTimestamp: position.entryTimestamp,
      exitTimestamp: candle.timestamp,
      exitReason: reason,
      grossPnl,
      fees: position.entryFee + exitFee,
      netPnl,
      balance: this.balance,
    };
    this.trades.push(trade);
    this.position = null;
    this.logger("position_closed", trade);
    return true;
  }

  cancelPendingEntries(reason = "shutdown") {
    if (this.pendingEntry) {
      this.pendingEntry = null;
      this.logger("pending_entry_cancelled", { reason });
    }
  }
}

export function runBacktest(candles, config, { logger = () => {}, mode = "backtest" } = {}) {
  const broker = new PaperBroker(config, logger);
  let dayKey = null;
  let dayStartEquity = config.risk.initialBalance;
  let dailyRealizedPnl = 0;
  let cooldownUntil = -1;
  let previousTimestamp = -Infinity;

  for (let index = 0; index < candles.length; index++) {
    const candle = candles[index];
    validateCandle(candle);
    if (candle.timestamp <= previousTimestamp) throw new Error("Candle timestamps must be strictly increasing");
    previousTimestamp = candle.timestamp;
    if (candle.closed !== true) continue;
    const key = localDateKey(candle.timestamp, config.time.timezone);
    if (key !== dayKey) {
      dayKey = key;
      dayStartEquity = broker.equity;
      dailyRealizedPnl = 0;
    }
    const exited = broker.processCandle(candle, index, {
      allowEntryFill: isAllowedTradingTime(candle.timestamp, config.time),
    });
    if (exited) {
      const closed = broker.trades.at(-1);
      dailyRealizedPnl += closed.netPnl;
      cooldownUntil = index + config.risk.cooldownBars;
      continue;
    }
    if (broker.hasExposure || index <= cooldownUntil) continue;

    const setup = classifySetup(candles.slice(0, index + 1), config);
    if (!setup.valid) continue;
    const decision = evaluateRisk({
      config,
      timestamp: candle.timestamp,
      equity: broker.equity,
      dayStartEquity,
      dailyRealizedPnl,
      stopDistance: Math.abs(setup.entryPrice - setup.stopLoss),
      openPositions: broker.position ? 1 : 0,
    });
    if (!decision.allowed) {
      logger("trade_rejected", { reason: decision.reason, timestamp: candle.timestamp });
      continue;
    }
    logger("setup_accepted", { ...setup, mode });
    if (config.orders.entryType === "market") broker.placeMarket(setup, candle.timestamp);
    else broker.placeLimit(setup, index);
  }

  broker.cancelPendingEntries();
  const finalBalance = broker.equity;
  const wins = broker.trades.filter((trade) => trade.netPnl > 0).length;
  return {
    mode,
    initialBalance: config.risk.initialBalance,
    finalBalance,
    netPnl: finalBalance - config.risk.initialBalance,
    tradeCount: broker.trades.length,
    winRate: broker.trades.length ? wins / broker.trades.length : 0,
    trades: broker.trades,
    equity: broker.equityPoints,
    openPositionAtEnd: broker.position,
  };
}

export function runPaper(candles, config, options = {}) {
  return runBacktest(candles, config, { ...options, mode: "paper" });
}
