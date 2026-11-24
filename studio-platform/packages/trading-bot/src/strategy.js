import { atr, ema, rollingVwap } from "./indicators.js";

const rejected = (reason) => ({ valid: false, reason });

export function classifySetup(candles, config) {
  if (!candles.length || candles.some((candle) => candle.closed !== true)) return rejected("input contains an unconfirmed candle");
  const s = config.strategy;
  const index = candles.length - 1;
  const pullbackIndex = index - 1;
  const minimumBars = Math.max(s.slowEma, s.atrPeriod, s.pullbackLookback + 2, s.volumeLookback + 2, s.vwapLookback + 2);
  if (index < minimumBars) return rejected("not enough closed candles");

  const closes = candles.map((candle) => candle.close);
  const fast = ema(closes, s.fastEma);
  const slow = ema(closes, s.slowEma);
  const atrValues = atr(candles, s.atrPeriod);
  const currentAtr = atrValues[index];
  if (!Number.isFinite(currentAtr) || currentAtr <= 0) return rejected("ATR is unavailable");

  const side = fast[index] > slow[index] ? "long" : fast[index] < slow[index] ? "short" : null;
  if (!side) return rejected("EMAs are not directionally aligned");
  const strength = Math.abs(fast[index] - slow[index]) / closes[index];
  if (strength < s.minimumTrendStrength) return rejected("trend strength is below threshold");
  if (side === "long" ? fast[pullbackIndex] <= slow[pullbackIndex] : fast[pullbackIndex] >= slow[pullbackIndex]) {
    return rejected("trend alignment did not persist through the pullback");
  }

  const pullback = candles[pullbackIndex];
  const confirmation = candles[index];
  const priorStart = Math.max(0, pullbackIndex - s.pullbackLookback);
  const prior = candles.slice(priorStart, pullbackIndex);
  const levelTolerance = currentAtr * s.levelToleranceAtr;
  const support = Math.min(...prior.map((candle) => candle.low));
  const resistance = Math.max(...prior.map((candle) => candle.high));
  const vwap = rollingVwap(candles, pullbackIndex, s.vwapLookback);

  const touched = side === "long"
    ? (pullback.low <= support + levelTolerance && pullback.low >= support && support < pullback.close)
      || (Number.isFinite(vwap) && pullback.low <= vwap + levelTolerance && pullback.low >= vwap && vwap < pullback.close)
    : (pullback.high >= resistance - levelTolerance && pullback.high <= resistance && resistance > pullback.close)
      || (Number.isFinite(vwap) && pullback.high >= vwap - levelTolerance && pullback.high <= vwap && vwap > pullback.close);
  if (!touched) return rejected("pullback did not respect prior support/resistance or rolling VWAP");

  const range = confirmation.high - confirmation.low;
  if (range <= 0) return rejected("confirmation candle has no range");
  const relevantWick = side === "long"
    ? confirmation.high - Math.max(confirmation.open, confirmation.close)
    : Math.min(confirmation.open, confirmation.close) - confirmation.low;
  const wickRatio = relevantWick / range;
  if ((side === "long" && (confirmation.close <= confirmation.open || confirmation.close <= pullback.close))
      || (side === "short" && (confirmation.close >= confirmation.open || confirmation.close >= pullback.close))) {
    return rejected("confirmation candle did not close back in trend direction");
  }
  if (wickRatio > s.maximumWickRatio) return rejected("confirmation candle wick exceeds limit");

  const volumeStart = Math.max(0, index - s.volumeLookback);
  const baselineVolume = candles.slice(volumeStart, index).reduce((sum, candle) => sum + candle.volume, 0) / (index - volumeStart);
  if (baselineVolume <= 0 || confirmation.volume <= baselineVolume * s.volumeExpansion) return rejected("confirmation volume did not expand");

  const entryPrice = confirmation.close;
  const stopLoss = side === "long"
    ? Math.min(entryPrice - currentAtr * s.stopAtrMultiple, pullback.low - currentAtr * s.structureBufferAtr)
    : Math.max(entryPrice + currentAtr * s.stopAtrMultiple, pullback.high + currentAtr * s.structureBufferAtr);
  const stopDistance = Math.abs(entryPrice - stopLoss);
  if (!(stopDistance > 0) || (side === "long" ? stopLoss >= entryPrice : stopLoss <= entryPrice)) {
    return rejected("ATR stop placement invalidates the setup");
  }
  const takeProfit = side === "long"
    ? entryPrice + stopDistance * s.minimumRewardRisk
    : entryPrice - stopDistance * s.minimumRewardRisk;

  return {
    valid: true,
    reason: "all A+ conditions confirmed",
    side,
    timestamp: confirmation.timestamp,
    entryPrice,
    stopLoss,
    takeProfit,
    atr: currentAtr,
    trendStrength: strength,
    wickRatio,
    volumeRatio: confirmation.volume / baselineVolume,
    rewardRiskRatio: s.minimumRewardRisk,
    pullbackLevel: vwap,
  };
}
