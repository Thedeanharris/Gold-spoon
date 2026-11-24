import { isAllowedTradingTime } from "./time.js";

export function evaluateRisk({ config, timestamp, equity, dayStartEquity, dailyRealizedPnl, stopDistance, openPositions = 0, cooldownActive = false }) {
  if (!isAllowedTradingTime(timestamp, config.time)) return { allowed: false, reason: "outside trading session or inside a no-trade window" };
  if (!Number.isFinite(equity) || equity <= 0) return { allowed: false, reason: "account equity is not positive" };
  if (openPositions >= config.risk.maximumOpenPositions) return { allowed: false, reason: "maximum open positions reached" };
  if (cooldownActive) return { allowed: false, reason: "cooldown is active" };
  if (!Number.isFinite(dayStartEquity) || dayStartEquity <= 0 || !Number.isFinite(dailyRealizedPnl)) return { allowed: false, reason: "daily risk snapshot is invalid" };
  if (dailyRealizedPnl <= -dayStartEquity * config.risk.maximumDailyLoss) return { allowed: false, reason: "daily loss limit reached" };
  if (!Number.isFinite(stopDistance) || stopDistance <= 0) return { allowed: false, reason: "stop distance is invalid" };
  return { allowed: true, reason: "risk checks passed" };
}

export function sizePosition({ equity, entryPrice, stopPrice, config }) {
  const distance = Math.abs(entryPrice - stopPrice);
  if (![equity, entryPrice, distance].every(Number.isFinite) || equity <= 0 || entryPrice <= 0 || distance <= 0) return 0;
  const riskBudget = equity * config.risk.riskPerTrade;
  const riskSizedQuantity = riskBudget / distance;
  const exposureCap = equity * config.risk.maximumLeverage / entryPrice;
  return Math.max(0, Math.min(riskSizedQuantity, exposureCap));
}
