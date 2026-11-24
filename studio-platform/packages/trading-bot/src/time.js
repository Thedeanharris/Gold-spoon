function partsAt(timestamp, timezone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(values.weekday),
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute),
  };
}

function minuteOfDay(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function insideWindow(time, start, end) {
  const current = time.minuteOfDay;
  const first = minuteOfDay(start);
  const last = minuteOfDay(end);
  return first <= last ? current >= first && current < last : current >= first || current < last;
}

export function localDateKey(timestamp, timezone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isAllowedTradingTime(timestamp, timeConfig) {
  const local = partsAt(timestamp, timeConfig.timezone);
  const session = timeConfig.session;
  if (!session.weekdays.includes(local.weekday) || !insideWindow(local, session.start, session.end)) return false;
  return !timeConfig.noTradeWindows.some((window) => {
    if (window.weekdays && !window.weekdays.includes(local.weekday)) return false;
    return insideWindow(local, window.start, window.end);
  });
}
