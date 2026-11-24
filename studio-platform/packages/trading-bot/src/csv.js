import { readFile } from "node:fs/promises";

export function validateCandle(candle) {
  if (!candle || !Number.isFinite(candle.timestamp)
      || ![candle.open, candle.high, candle.low, candle.close, candle.volume].every(Number.isFinite)
      || typeof candle.closed !== "boolean") {
    throw new Error("Candle must have a finite timestamp, OHLCV numbers, and a closed boolean");
  }
  if (candle.low > Math.min(candle.open, candle.close) || candle.high < Math.max(candle.open, candle.close)
      || candle.low > candle.high || candle.volume < 0) {
    throw new Error("Candle contains invalid OHLCV values");
  }
  return candle;
}

export function parseCandlesCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV must include a header and at least one candle");
  const headers = lines[0].split(",").map((header) => header.trim().toLowerCase());
  const required = ["timestamp", "open", "high", "low", "close", "volume"];
  for (const name of required) if (!headers.includes(name)) throw new Error(`CSV is missing required column: ${name}`);

  let previousTimestamp = -Infinity;
  return lines.slice(1).map((line, index) => {
    const fields = line.split(",");
    if (fields.length !== headers.length) throw new Error(`CSV row ${index + 2} has the wrong number of columns`);
    const row = Object.fromEntries(headers.map((header, i) => [header, fields[i].trim()]));
    if (row.closed !== undefined && !["true", "false"].includes(row.closed.toLowerCase())) {
      throw new Error(`CSV row ${index + 2} has an invalid closed value`);
    }
    const candle = {
      timestamp: Date.parse(row.timestamp),
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
      volume: Number(row.volume),
      closed: row.closed === undefined ? true : row.closed.toLowerCase() === "true",
    };
    try {
      validateCandle(candle);
    } catch (error) {
      throw new Error(`CSV row ${index + 2}: ${error.message}`);
    }
    if (candle.timestamp <= previousTimestamp) throw new Error("CSV candle timestamps must be strictly increasing");
    previousTimestamp = candle.timestamp;
    return candle;
  });
}

export async function loadCandlesCsv(path) {
  return parseCandlesCsv(await readFile(path, "utf8"));
}

export async function* csvCandleSource(path) {
  for (const candle of await loadCandlesCsv(path)) yield candle;
}
