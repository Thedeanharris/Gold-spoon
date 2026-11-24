export function ema(values, period) {
  const output = Array(values.length).fill(null);
  if (values.length < period) return output;
  const seed = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  output[period - 1] = seed;
  const multiplier = 2 / (period + 1);
  for (let i = period; i < values.length; i++) output[i] = (values[i] - output[i - 1]) * multiplier + output[i - 1];
  return output;
}

export function atr(candles, period) {
  const ranges = candles.map((candle, index) => {
    if (index === 0) return candle.high - candle.low;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - candles[index - 1].close), Math.abs(candle.low - candles[index - 1].close));
  });
  const output = Array(candles.length).fill(null);
  if (ranges.length < period) return output;
  let value = ranges.slice(0, period).reduce((sum, range) => sum + range, 0) / period;
  output[period - 1] = value;
  for (let i = period; i < ranges.length; i++) {
    value = (value * (period - 1) + ranges[i]) / period;
    output[i] = value;
  }
  return output;
}

export function rollingVwap(candles, endIndex, period) {
  const start = Math.max(0, endIndex - period);
  let valueVolume = 0;
  let volume = 0;
  for (let i = start; i < endIndex; i++) {
    const candle = candles[i];
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    valueVolume += typicalPrice * candle.volume;
    volume += candle.volume;
  }
  return volume > 0 ? valueVolume / volume : null;
}
