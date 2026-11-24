import { readFile } from "node:fs/promises";

export const DEFAULT_CONFIG = Object.freeze({
  execution: { mode: "paper", liveEnabled: false, provider: "mt5", allowedAccountId: "" },
  mt5: {
    expectedDemoServer: "",
    pythonExecutable: "python",
    timeframe: "M15",
    symbols: { XAUUSD: "XAUUSD", BTCUSD: "BTCUSD" },
    historyBars: 500,
    pollIntervalMs: 5000,
    maxSignalAgeSeconds: 900,
    limitExpiryBars: 3,
    deviationPoints: 20,
  },
  strategy: {
    fastEma: 20,
    slowEma: 50,
    minimumTrendStrength: 0.0015,
    atrPeriod: 14,
    pullbackLookback: 20,
    vwapLookback: 20,
    volumeLookback: 20,
    volumeExpansion: 1.2,
    levelToleranceAtr: 0.15,
    maximumWickRatio: 0.25,
    stopAtrMultiple: 1.5,
    structureBufferAtr: 0.2,
    minimumRewardRisk: 2,
  },
  risk: {
    initialBalance: 10000,
    riskPerTrade: 0.005,
    maximumDailyLoss: 0.015,
    maximumLeverage: 1,
    maximumOpenPositions: 1,
    cooldownBars: 5,
  },
  orders: {
    entryType: "market",
    limitExpiryBars: 3,
    feeRate: 0.001,
    slippageRate: 0.0005,
  },
  time: {
    timezone: "UTC",
    session: { start: "00:00", end: "23:59", weekdays: [1, 2, 3, 4, 5] },
    noTradeWindows: [],
  },
});

function mergeConfig(base, override) {
  const result = { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    result[key] = value && typeof value === "object" && !Array.isArray(value)
      ? mergeConfig(base[key] || {}, value)
      : value;
  }
  return result;
}

export function validateConfig(config) {
  const fail = (message) => { throw new Error(`Invalid configuration: ${message}`); };
  const positive = (value, name) => {
    if (!Number.isFinite(value) || value <= 0) fail(`${name} must be a positive number`);
  };
  const ratio = (value, name) => {
    if (!Number.isFinite(value) || value < 0 || value > 1) fail(`${name} must be between 0 and 1`);
  };

  if (!["paper", "backtest", "live"].includes(config.execution.mode)) fail("execution.mode must be paper, backtest, or live");
  if (config.execution.provider !== "mt5") fail("execution.provider must be mt5");
  if (typeof config.execution.liveEnabled !== "boolean" || typeof config.execution.allowedAccountId !== "string") {
    fail("execution.liveEnabled must be boolean and execution.allowedAccountId must be a string");
  }
  if (config.mt5.timeframe !== "M15") fail("mt5.timeframe must be M15");
  if (typeof config.mt5.expectedDemoServer !== "string") fail("mt5.expectedDemoServer must be a string");
  if (typeof config.mt5.pythonExecutable !== "string" || !config.mt5.pythonExecutable.trim()) fail("mt5.pythonExecutable must be a non-empty executable name or path");
  const allowedSymbols = Object.keys(config.mt5.symbols || {});
  if (allowedSymbols.length !== 2 || !allowedSymbols.includes("XAUUSD") || !allowedSymbols.includes("BTCUSD")
      || allowedSymbols.some((symbol) => typeof config.mt5.symbols[symbol] !== "string" || !config.mt5.symbols[symbol].trim())) {
    fail("mt5.symbols must map XAUUSD and BTCUSD to non-empty exact MT5 symbols");
  }
  const requiredHistory = Math.max(config.strategy.slowEma, config.strategy.pullbackLookback + 2, config.strategy.vwapLookback + 2, config.strategy.volumeLookback + 2, config.strategy.atrPeriod);
  if (!Number.isInteger(config.mt5.historyBars) || config.mt5.historyBars < requiredHistory) fail("mt5.historyBars must cover the strategy indicator and lookback periods");
  if (!Number.isInteger(config.mt5.pollIntervalMs) || config.mt5.pollIntervalMs < 1000) fail("mt5.pollIntervalMs must be at least 1000");
  if (!Number.isInteger(config.mt5.maxSignalAgeSeconds) || config.mt5.maxSignalAgeSeconds < 1 || config.mt5.maxSignalAgeSeconds > 900) {
    fail("mt5.maxSignalAgeSeconds must be between 1 and 900");
  }
  if (!Number.isInteger(config.mt5.limitExpiryBars) || config.mt5.limitExpiryBars < 1) fail("mt5.limitExpiryBars must be a positive integer");
  if (!Number.isInteger(config.mt5.deviationPoints) || config.mt5.deviationPoints < 0) fail("mt5.deviationPoints must be a non-negative integer");
  if (!Number.isInteger(config.strategy.fastEma) || config.strategy.fastEma < 1
      || !Number.isInteger(config.strategy.slowEma) || config.strategy.slowEma < 1
      || config.strategy.fastEma >= config.strategy.slowEma) {
    fail("fastEma and slowEma must be positive integers with fastEma < slowEma");
  }
  for (const name of ["atrPeriod", "pullbackLookback", "vwapLookback", "volumeLookback"]) {
    if (!Number.isInteger(config.strategy[name]) || config.strategy[name] < 2) fail(`${name} must be an integer of at least 2`);
  }
  for (const name of ["minimumTrendStrength", "volumeExpansion", "levelToleranceAtr", "stopAtrMultiple", "structureBufferAtr", "minimumRewardRisk"]) {
    positive(config.strategy[name], `strategy.${name}`);
  }
  ratio(config.strategy.maximumWickRatio, "strategy.maximumWickRatio");
  positive(config.risk.initialBalance, "risk.initialBalance");
  if (config.risk.riskPerTrade > 0.02) fail("riskPerTrade cannot exceed 0.02 (2%)");
  if (config.risk.maximumDailyLoss > 0.05) fail("maximumDailyLoss cannot exceed 0.05 (5%)");
  ratio(config.risk.riskPerTrade, "risk.riskPerTrade");
  ratio(config.risk.maximumDailyLoss, "risk.maximumDailyLoss");
  positive(config.risk.maximumLeverage, "risk.maximumLeverage");
  if (config.risk.maximumOpenPositions !== 1) fail("maximumOpenPositions must be 1");
  if (!Number.isInteger(config.risk.cooldownBars) || config.risk.cooldownBars < 0) fail("cooldownBars must be a non-negative integer");
  if (!["market", "limit"].includes(config.orders.entryType)) fail("orders.entryType must be market or limit");
  if (!Number.isInteger(config.orders.limitExpiryBars) || config.orders.limitExpiryBars < 1) fail("limitExpiryBars must be a positive integer");
  for (const name of ["feeRate", "slippageRate"]) ratio(config.orders[name], `orders.${name}`);
  if (!Array.isArray(config.time.session.weekdays) || config.time.session.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
    fail("time.session.weekdays must contain weekday numbers from 0 to 6");
  }
  const validTime = (time) => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  if (!validTime(config.time.session.start) || !validTime(config.time.session.end)) fail("session start and end must use HH:MM");
  if (!Array.isArray(config.time.noTradeWindows)) fail("noTradeWindows must be an array");
  for (const window of config.time.noTradeWindows) {
    if (!validTime(window.start) || !validTime(window.end)) fail("no-trade window start and end must use HH:MM");
    if (window.weekdays && (!Array.isArray(window.weekdays) || window.weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6))) {
      fail("no-trade window weekdays must contain weekday numbers from 0 to 6");
    }
  }
  try {
    new Intl.DateTimeFormat("en", { timeZone: config.time.timezone }).format(new Date());
  } catch {
    fail("time.timezone must be a valid IANA timezone");
  }
  return config;
}

export function createConfig(overrides = {}) {
  return validateConfig(mergeConfig(DEFAULT_CONFIG, overrides));
}

export async function loadConfig(path) {
  const overrides = JSON.parse(await readFile(path, "utf8"));
  return createConfig(overrides);
}
