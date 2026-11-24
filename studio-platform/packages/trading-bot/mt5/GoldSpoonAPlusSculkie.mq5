#property strict
#property version   "1.0"
#property description "Gold Spoon A+ Sculkie: closed-bar M1/M5 scalp EA; demo orders disabled by default."

#include <Trade/Trade.mqh>

input string InpExpectedServer = "Exness-MT5Trial10";
input string InpExpectedCurrency = "ZAR";
input long InpExpectedDemoLogin = 0;
input string InpXauSymbol = "XAUUSDm";
input string InpBtcSymbol = "BTCUSDm";
input ENUM_TIMEFRAMES InpTimeframe = PERIOD_M5;

input bool InpEnableDemoOrders = false;
input ulong InpMagicNumber = 73141024;
input int InpDeviationPoints = 15;

input int InpFastEma = 9;
input int InpSlowEma = 21;
input int InpAtrPeriod = 14;
input int InpVwapLookback = 16;
input int InpSwingLookback = 12;
input int InpVolumeLookback = 16;
input int InpHigherFastEma = 20;
input int InpHigherSlowEma = 50;
input double InpMinimumTrendAtr = 0.20;
input double InpMinimumVolumeExpansion = 1.10;
input double InpMaximumWickRatio = 0.22;
input double InpLevelToleranceAtr = 0.08;
input double InpStopAtrMultiple = 0.85;
input double InpStopBufferAtr = 0.10;
input double InpMaximumStopAtr = 1.50;
input double InpMinimumRewardRisk = 1.50;
input double InpMaximumSpreadAtr = 0.12;

input double InpRiskPerTradePercent = 0.25;
input double InpMaximumDailyLossPercent = 1.0;
input double InpMaximumMarginFraction = 0.20;
input int InpCooldownBars = 3;
input int InpMaximumAccountExposure = 1;
input string InpSessionStartUTC = "06:00";
input string InpSessionEndUTC = "20:00";
input string InpNoTradeStartUTC = "";
input string InpNoTradeEndUTC = "";
input bool InpAllowSunday = false;
input bool InpAllowSaturday = false;

CTrade g_trade;
int g_fastHandle = INVALID_HANDLE;
int g_slowHandle = INVALID_HANDLE;
int g_atrHandle = INVALID_HANDLE;
int g_higherFastHandle = INVALID_HANDLE;
int g_higherSlowHandle = INVALID_HANDLE;
ENUM_TIMEFRAMES g_higherTimeframe = PERIOD_M15;
long g_accountLeverage = 0;
datetime g_currentBar = 0;
datetime g_lastOrderSignalTime = 0;
string g_status = "Waiting for a closed candle";

struct SetupInfo
{
   int side;
   datetime signalTime;
   double entry;
   double stop;
   double target;
   double atr;
   string reason;
};

int ParseClock(const string value)
{
   string parts[];
   ushort separator = StringGetCharacter(":", 0);
   if(StringSplit(value, separator, parts) != 2)
      return -1;
   int hour = (int)StringToInteger(parts[0]);
   int minute = (int)StringToInteger(parts[1]);
   if(hour < 0 || hour > 23 || minute < 0 || minute > 59)
      return -1;
   return hour * 60 + minute;
}

bool IsInsideWindow(const int minuteOfDay, const int start, const int end)
{
   if(start <= end)
      return minuteOfDay >= start && minuteOfDay < end;
   return minuteOfDay >= start || minuteOfDay < end;
}

bool IsAllowedTime(const datetime utcTime)
{
   MqlDateTime parts;
   TimeToStruct(utcTime, parts);
   if((parts.day_of_week == 0 && !InpAllowSunday)
      || (parts.day_of_week == 6 && !InpAllowSaturday))
      return false;

   int sessionStart = ParseClock(InpSessionStartUTC);
   int sessionEnd = ParseClock(InpSessionEndUTC);
   if(sessionStart < 0 || sessionEnd < 0)
      return false;
   int minuteOfDay = parts.hour * 60 + parts.min;
   if(!IsInsideWindow(minuteOfDay, sessionStart, sessionEnd))
      return false;

   if(InpNoTradeStartUTC == "" && InpNoTradeEndUTC == "")
      return true;
   int noTradeStart = ParseClock(InpNoTradeStartUTC);
   int noTradeEnd = ParseClock(InpNoTradeEndUTC);
   if(noTradeStart < 0 || noTradeEnd < 0)
      return false;
   return !IsInsideWindow(minuteOfDay, noTradeStart, noTradeEnd);
}

bool IsAllowedSymbol(const string symbol)
{
   return symbol == InpXauSymbol || symbol == InpBtcSymbol;
}

bool VerifyDemoAccount(string &reason)
{
   if(AccountInfoInteger(ACCOUNT_TRADE_MODE) != ACCOUNT_TRADE_MODE_DEMO)
   {
      reason = "Refusing: connected account is not a demo account";
      return false;
   }
   if(InpExpectedDemoLogin <= 0 || AccountInfoInteger(ACCOUNT_LOGIN) != InpExpectedDemoLogin)
   {
      reason = "Refusing: set the exact expected demo login in EA inputs";
      return false;
   }
   if(InpExpectedServer == "" || AccountInfoString(ACCOUNT_SERVER) != InpExpectedServer)
   {
      reason = "Refusing: connected server does not match the expected demo server";
      return false;
   }
   if(InpExpectedCurrency == "" || AccountInfoString(ACCOUNT_CURRENCY) != InpExpectedCurrency)
   {
      reason = "Refusing: connected account currency does not match the expected currency";
      return false;
   }
   return true;
}

bool LoadSetup(SetupInfo &setup)
{
   setup.side = 0;
   setup.reason = "No qualifying A+ scalp setup";
   int needed = MathMax(InpSlowEma, InpAtrPeriod);
   needed = MathMax(needed, InpVwapLookback + 2);
   needed = MathMax(needed, InpSwingLookback + 2);
   needed = MathMax(needed, InpVolumeLookback + 1);
   needed += 3;

   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   if(CopyRates(_Symbol, InpTimeframe, 1, needed, rates) < needed)
   {
      setup.reason = "Waiting for sufficient closed-candle history";
      return false;
   }

   double fast[];
   double slow[];
   double atrValue[];
   double higherFast[];
   double higherSlow[];
   ArrayResize(fast, 2);
   ArrayResize(slow, 2);
   ArrayResize(atrValue, 1);
   ArrayResize(higherFast, 1);
   ArrayResize(higherSlow, 1);
   ArraySetAsSeries(fast, true);
   ArraySetAsSeries(slow, true);
   ArraySetAsSeries(atrValue, true);
   ArraySetAsSeries(higherFast, true);
   ArraySetAsSeries(higherSlow, true);
   if(CopyBuffer(g_fastHandle, 0, 1, 2, fast) != 2
      || CopyBuffer(g_slowHandle, 0, 1, 2, slow) != 2
      || CopyBuffer(g_atrHandle, 0, 1, 1, atrValue) != 1
      || CopyBuffer(g_higherFastHandle, 0, 1, 1, higherFast) != 1
      || CopyBuffer(g_higherSlowHandle, 0, 1, 1, higherSlow) != 1)
   {
      setup.reason = "Indicator data is not ready";
      return false;
   }

   const MqlRates confirmation = rates[0];
   const MqlRates pullback = rates[1];
   double atr = atrValue[0];
   if(confirmation.close <= 0.0 || atr <= 0.0)
   {
      setup.reason = "Invalid close or ATR";
      return false;
   }

   int side = fast[0] > slow[0] ? 1 : (fast[0] < slow[0] ? -1 : 0);
   if(side == 0
      || (side == 1 && (fast[1] <= slow[1] || higherFast[0] <= higherSlow[0]))
      || (side == -1 && (fast[1] >= slow[1] || higherFast[0] >= higherSlow[0])))
   {
      setup.reason = "Local and higher-timeframe trends are not aligned";
      return false;
   }
   if(MathAbs(fast[0] - slow[0]) / atr < InpMinimumTrendAtr)
   {
      setup.reason = "Trend strength is below the ATR-normalized threshold";
      return false;
   }

   double valueVolume = 0.0;
   double volumeSum = 0.0;
   double support = DBL_MAX;
   double resistance = -DBL_MAX;
   for(int i = 2; i < 2 + InpVwapLookback; i++)
   {
      double volume = (double)rates[i].tick_volume;
      double typical = (rates[i].high + rates[i].low + rates[i].close) / 3.0;
      valueVolume += typical * volume;
      volumeSum += volume;
   }
   for(int i = 2; i < 2 + InpSwingLookback; i++)
   {
      support = MathMin(support, rates[i].low);
      resistance = MathMax(resistance, rates[i].high);
   }
   double vwap = volumeSum > 0.0 ? valueVolume / volumeSum : 0.0;
   double tolerance = atr * InpLevelToleranceAtr;
   bool touched = false;
   bool reclaimed = false;
   if(side == 1)
   {
      touched = (pullback.low <= fast[1] + tolerance && pullback.low >= fast[1])
                || (vwap > 0.0 && pullback.low <= vwap + tolerance && pullback.low >= vwap)
                || (pullback.low <= support + tolerance && pullback.low >= support);
      reclaimed = confirmation.close > fast[0] && confirmation.close > pullback.close;
   }
   else
   {
      touched = (pullback.high >= fast[1] - tolerance && pullback.high <= fast[1])
                || (vwap > 0.0 && pullback.high >= vwap - tolerance && pullback.high <= vwap)
                || (pullback.high >= resistance - tolerance && pullback.high <= resistance);
      reclaimed = confirmation.close < fast[0] && confirmation.close < pullback.close;
   }
   if(!touched || !reclaimed)
   {
      setup.reason = "Pullback did not respect a level and reclaim trend direction";
      return false;
   }

   double range = confirmation.high - confirmation.low;
   if(range <= 0.0)
   {
      setup.reason = "Confirmation candle has no range";
      return false;
   }
   double opposingWick = side == 1
      ? confirmation.high - MathMax(confirmation.open, confirmation.close)
      : MathMin(confirmation.open, confirmation.close) - confirmation.low;
   if((side == 1 && confirmation.close <= confirmation.open)
      || (side == -1 && confirmation.close >= confirmation.open)
      || opposingWick / range > InpMaximumWickRatio)
   {
      setup.reason = "Confirmation candle direction or wick failed";
      return false;
   }

   double averageVolume = 0.0;
   for(int i = 1; i <= InpVolumeLookback; i++)
      averageVolume += (double)rates[i].tick_volume;
   averageVolume /= InpVolumeLookback;
   if(averageVolume <= 0.0 || (double)confirmation.tick_volume < averageVolume * InpMinimumVolumeExpansion)
   {
      setup.reason = "Confirmation tick volume did not expand";
      return false;
   }

   double stop = side == 1
      ? MathMin(confirmation.close - atr * InpStopAtrMultiple, pullback.low - atr * InpStopBufferAtr)
      : MathMax(confirmation.close + atr * InpStopAtrMultiple, pullback.high + atr * InpStopBufferAtr);
   double stopDistance = MathAbs(confirmation.close - stop);
   if(stopDistance <= 0.0 || stopDistance > atr * InpMaximumStopAtr)
   {
      setup.reason = "ATR/structure stop is invalid or too wide for a scalp";
      return false;
   }

   setup.side = side;
   setup.signalTime = confirmation.time;
   setup.entry = confirmation.close;
   setup.stop = stop;
   setup.target = confirmation.close + (side == 1 ? 1.0 : -1.0) * stopDistance * InpMinimumRewardRisk;
   setup.atr = atr;
   setup.reason = "A+ scalp conditions confirmed";
   return true;
}

double DailyRealizedPnl(bool &ok)
{
   ok = false;
   datetime now = TimeTradeServer();
   if(now <= 0)
      return 0.0;
   MqlDateTime parts;
   TimeToStruct(now, parts);
   parts.hour = 0;
   parts.min = 0;
   parts.sec = 0;
   datetime dayStart = StructToTime(parts);
   if(!HistorySelect(dayStart, now))
      return 0.0;

   double pnl = 0.0;
   for(int i = 0; i < HistoryDealsTotal(); i++)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0)
         continue;
      long type = HistoryDealGetInteger(ticket, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL)
         continue;
      pnl += HistoryDealGetDouble(ticket, DEAL_PROFIT)
             + HistoryDealGetDouble(ticket, DEAL_COMMISSION)
             + HistoryDealGetDouble(ticket, DEAL_SWAP)
             + HistoryDealGetDouble(ticket, DEAL_FEE);
   }
   ok = true;
   return pnl;
}

bool CooldownPassed(const datetime signalTime)
{
   if(g_lastOrderSignalTime == 0 || InpCooldownBars <= 0)
      return true;
   int shift = iBarShift(_Symbol, InpTimeframe, g_lastOrderSignalTime, false);
   return shift < 0 || shift > InpCooldownBars + 1;
}

bool CalculateVolume(const ENUM_ORDER_TYPE orderType, const double entry, const double stop, double &volume)
{
   double lossPerLot = 0.0;
   double marginPerLot = 0.0;
   if(!OrderCalcProfit(orderType, _Symbol, 1.0, entry, stop, lossPerLot)
      || !OrderCalcMargin(orderType, _Symbol, 1.0, entry, marginPerLot)
      || MathAbs(lossPerLot) <= 0.0 || marginPerLot <= 0.0)
   {
      g_status = "MT5 could not calculate contract-aware risk/margin";
      return false;
   }

   double equity = AccountInfoDouble(ACCOUNT_EQUITY);
   double riskBudget = equity * InpRiskPerTradePercent / 100.0;
   double rawVolume = MathMin(riskBudget / MathAbs(lossPerLot),
                              equity * InpMaximumMarginFraction / marginPerLot);
   double step = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   double minimum = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maximum = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   if(step <= 0.0 || minimum <= 0.0 || maximum < minimum)
   {
      g_status = "MT5 returned invalid broker volume limits";
      return false;
   }

   volume = MathMin(maximum, MathFloor(rawVolume / step + 1e-10) * step);
   int digits = 0;
   double scaledStep = step;
   while(digits < 8 && MathAbs(scaledStep - MathRound(scaledStep)) > 1e-8)
   {
      scaledStep *= 10.0;
      digits++;
   }
   volume = NormalizeDouble(volume, digits);
   if(volume < minimum)
   {
      g_status = "Risk budget is below the broker minimum lot size";
      return false;
   }
   return true;
}

void DrawSignal(const SetupInfo &setup)
{
   string name = "GoldSpoonAPlusSculkie_" + IntegerToString((long)setup.signalTime);
   if(ObjectFind(0, name) >= 0)
      return;
   double price = setup.side == 1
      ? iLow(_Symbol, InpTimeframe, 1) - setup.atr * 0.10
      : iHigh(_Symbol, InpTimeframe, 1) + setup.atr * 0.10;
   if(ObjectCreate(0, name, OBJ_ARROW, 0, setup.signalTime, price))
   {
      ObjectSetInteger(0, name, OBJPROP_ARROWCODE, setup.side == 1 ? 233 : 234);
      ObjectSetInteger(0, name, OBJPROP_COLOR, setup.side == 1 ? clrLimeGreen : clrTomato);
      ObjectSetInteger(0, name, OBJPROP_WIDTH, 2);
   }
}

void TryPlaceDemoOrder(const SetupInfo &setup)
{
   if(!InpEnableDemoOrders)
   {
      g_status = setup.reason + " (monitor-only; orders disabled)";
      return;
   }

   string reason;
   if(!VerifyDemoAccount(reason))
   {
      g_status = reason;
      return;
   }
   if(!CooldownPassed(setup.signalTime))
   {
      g_status = "Setup skipped: cooldown is active";
      return;
   }
   if(PositionsTotal() + OrdersTotal() >= InpMaximumAccountExposure)
   {
      g_status = "Setup skipped: account exposure limit reached";
      return;
   }

   bool historyOk = false;
   double dailyPnl = DailyRealizedPnl(historyOk);
   double dayStart = AccountInfoDouble(ACCOUNT_BALANCE) - dailyPnl;
   if(!historyOk || dayStart <= 0.0)
   {
      g_status = "Setup skipped: daily account history unavailable";
      return;
   }
   if(dailyPnl <= -dayStart * InpMaximumDailyLossPercent / 100.0)
   {
      g_status = "Setup skipped: daily loss limit reached";
      return;
   }

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick) || tick.ask <= 0.0 || tick.bid <= 0.0)
   {
      g_status = "Setup skipped: current MT5 quote unavailable";
      return;
   }
   if((tick.ask - tick.bid) / setup.atr > InpMaximumSpreadAtr)
   {
      g_status = "Setup skipped: spread exceeds the ATR-scaled limit";
      return;
   }

   double entry = setup.side == 1 ? tick.ask : tick.bid;
   double stop = NormalizeDouble(setup.stop, _Digits);
   double stopDistance = MathAbs(entry - stop);
   if((setup.side == 1 && stop >= entry) || (setup.side == -1 && stop <= entry)
      || stopDistance > setup.atr * InpMaximumStopAtr)
   {
      g_status = "Setup skipped: stop invalid at the current quote";
      return;
   }
   double target = NormalizeDouble(entry + (setup.side == 1 ? 1.0 : -1.0)
                                   * stopDistance * InpMinimumRewardRisk, _Digits);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   long stopsLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   if(point <= 0.0 || stopDistance < (double)stopsLevel * point)
   {
      g_status = "Setup skipped: broker minimum stop distance";
      return;
   }

   ENUM_ORDER_TYPE orderType = setup.side == 1 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double volume = 0.0;
   if(!CalculateVolume(orderType, entry, stop, volume))
      return;

   g_trade.SetExpertMagicNumber(InpMagicNumber);
   g_trade.SetDeviationInPoints(InpDeviationPoints);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   bool sent = setup.side == 1
      ? g_trade.Buy(volume, _Symbol, 0.0, stop, target, "Gold Spoon A+ Sculkie demo")
      : g_trade.Sell(volume, _Symbol, 0.0, stop, target, "Gold Spoon A+ Sculkie demo");
   uint retcode = g_trade.ResultRetcode();
   if(!sent || (retcode != TRADE_RETCODE_DONE
                && retcode != TRADE_RETCODE_DONE_PARTIAL
                && retcode != TRADE_RETCODE_PLACED))
   {
      g_status = "MT5 rejected demo order: " + g_trade.ResultRetcodeDescription();
      return;
   }

   g_lastOrderSignalTime = setup.signalTime;
   g_status = "Demo scalp accepted with broker-attached stop and target";
}

void ProcessClosedBar()
{
   string reason;
   if(!VerifyDemoAccount(reason))
   {
      g_status = reason;
      Comment("Gold Spoon A+ Sculkie | ", _Symbol, " | ", reason);
      return;
   }
   if(!IsAllowedSymbol(_Symbol) || _Period != InpTimeframe)
   {
      g_status = "Attach only to an allowed symbol on the selected M1 or M5 chart";
      Comment("Gold Spoon A+ Sculkie | ", _Symbol, " | ", g_status);
      return;
   }
   if(!IsAllowedTime(TimeGMT()))
   {
      g_status = "Outside the configured UTC session or inside a no-trade window";
      Comment("Gold Spoon A+ Sculkie | ", _Symbol, " | ", g_status,
              " | Orders: ", InpEnableDemoOrders ? "ENABLED" : "MONITOR ONLY");
      return;
   }

   SetupInfo setup;
   if(!LoadSetup(setup))
   {
      g_status = setup.reason;
      Comment("Gold Spoon A+ Sculkie | ", _Symbol, " ", EnumToString(InpTimeframe),
              " | ", g_status, " | Orders: ",
              InpEnableDemoOrders ? "ENABLED" : "MONITOR ONLY");
      return;
   }

   DrawSignal(setup);
   string direction = setup.side == 1 ? "LONG" : "SHORT";
   g_status = direction + " A+ scalp confirmed at " + DoubleToString(setup.entry, _Digits);
   TryPlaceDemoOrder(setup);
   Comment("Gold Spoon A+ Sculkie | ", _Symbol, " ", EnumToString(InpTimeframe),
           " | ", g_status, " | Stop: ", DoubleToString(setup.stop, _Digits),
           " | Target: ", DoubleToString(setup.target, _Digits),
           " | Orders: ", InpEnableDemoOrders ? "ENABLED" : "MONITOR ONLY");
   Print("Gold Spoon A+ Sculkie | ", _Symbol, " | ", g_status);
}

int OnInit()
{
   if((InpTimeframe != PERIOD_M1 && InpTimeframe != PERIOD_M5) || _Period != InpTimeframe)
   {
      Print("Gold Spoon A+ Sculkie: choose M1 or M5 and attach to that timeframe.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(!IsAllowedSymbol(_Symbol))
   {
      Print("Gold Spoon A+ Sculkie: symbol is not on the configured allowlist.");
      return INIT_PARAMETERS_INCORRECT;
   }

   string reason;
   if(!VerifyDemoAccount(reason))
   {
      Print("Gold Spoon A+ Sculkie: ", reason);
      return INIT_FAILED;
   }
   g_accountLeverage = AccountInfoInteger(ACCOUNT_LEVERAGE);
   if(g_accountLeverage <= 0)
   {
      Print("Gold Spoon A+ Sculkie: MT5 did not report a valid account leverage.");
      return INIT_FAILED;
   }

   if(InpFastEma < 1 || InpSlowEma <= InpFastEma
      || InpAtrPeriod < 2 || InpVwapLookback < 2 || InpSwingLookback < 2 || InpVolumeLookback < 2
      || InpHigherFastEma < 1 || InpHigherSlowEma <= InpHigherFastEma
      || InpMinimumTrendAtr <= 0.0 || InpMinimumVolumeExpansion <= 0.0
      || InpMaximumWickRatio <= 0.0 || InpMaximumWickRatio >= 1.0
      || InpLevelToleranceAtr < 0.0 || InpStopAtrMultiple <= 0.0
      || InpStopBufferAtr < 0.0 || InpMaximumStopAtr <= 0.0
      || InpMinimumRewardRisk < 1.0 || InpMaximumSpreadAtr <= 0.0
      || InpRiskPerTradePercent <= 0.0 || InpRiskPerTradePercent > 0.5
      || InpMaximumDailyLossPercent <= 0.0 || InpMaximumDailyLossPercent > 2.0
      || InpMaximumMarginFraction <= 0.0 || InpMaximumMarginFraction > 0.5
      || InpCooldownBars < 0 || InpMaximumAccountExposure != 1)
   {
      Print("Gold Spoon A+ Sculkie: invalid or unsafe strategy/risk inputs.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(ParseClock(InpSessionStartUTC) < 0 || ParseClock(InpSessionEndUTC) < 0
      || ((InpNoTradeStartUTC == "") != (InpNoTradeEndUTC == ""))
      || (InpNoTradeStartUTC != ""
          && (ParseClock(InpNoTradeStartUTC) < 0 || ParseClock(InpNoTradeEndUTC) < 0)))
   {
      Print("Gold Spoon A+ Sculkie: invalid session or no-trade clock input.");
      return INIT_PARAMETERS_INCORRECT;
   }

   g_higherTimeframe = InpTimeframe == PERIOD_M1 ? PERIOD_M5 : PERIOD_M15;
   g_fastHandle = iMA(_Symbol, InpTimeframe, InpFastEma, 0, MODE_EMA, PRICE_CLOSE);
   g_slowHandle = iMA(_Symbol, InpTimeframe, InpSlowEma, 0, MODE_EMA, PRICE_CLOSE);
   g_atrHandle = iATR(_Symbol, InpTimeframe, InpAtrPeriod);
   g_higherFastHandle = iMA(_Symbol, g_higherTimeframe, InpHigherFastEma, 0, MODE_EMA, PRICE_CLOSE);
   g_higherSlowHandle = iMA(_Symbol, g_higherTimeframe, InpHigherSlowEma, 0, MODE_EMA, PRICE_CLOSE);
   if(g_fastHandle == INVALID_HANDLE || g_slowHandle == INVALID_HANDLE || g_atrHandle == INVALID_HANDLE
      || g_higherFastHandle == INVALID_HANDLE || g_higherSlowHandle == INVALID_HANDLE)
   {
      Print("Gold Spoon A+ Sculkie: failed to create indicator handles.");
      return INIT_FAILED;
   }

   g_trade.SetExpertMagicNumber(InpMagicNumber);
   g_trade.SetDeviationInPoints(InpDeviationPoints);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   g_currentBar = iTime(_Symbol, InpTimeframe, 0);
   g_status = "Demo " + InpExpectedCurrency + "; MT5 leverage 1:"
              + IntegerToString((int)g_accountLeverage) + "; waiting for a closed candle";
   Comment("Gold Spoon A+ Sculkie | ", _Symbol, " ", EnumToString(InpTimeframe),
           " | ", g_status, " | Orders: ",
           InpEnableDemoOrders ? "ENABLED" : "MONITOR ONLY");
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   if(g_fastHandle != INVALID_HANDLE)
      IndicatorRelease(g_fastHandle);
   if(g_slowHandle != INVALID_HANDLE)
      IndicatorRelease(g_slowHandle);
   if(g_atrHandle != INVALID_HANDLE)
      IndicatorRelease(g_atrHandle);
   if(g_higherFastHandle != INVALID_HANDLE)
      IndicatorRelease(g_higherFastHandle);
   if(g_higherSlowHandle != INVALID_HANDLE)
      IndicatorRelease(g_higherSlowHandle);
   Comment("");
}

void OnTick()
{
   datetime current = iTime(_Symbol, InpTimeframe, 0);
   if(current == 0 || current == g_currentBar)
      return;
   g_currentBar = current;
   ProcessClosedBar();
}
