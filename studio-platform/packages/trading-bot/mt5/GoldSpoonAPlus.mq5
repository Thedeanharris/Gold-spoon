#property strict
#property version   "1.0"
#property description "Gold Spoon A+ M15 monitor; demo orders are disabled by default."

#include <Trade/Trade.mqh>

input string InpExpectedServer = "Exness-MT5Trial10";
input string InpExpectedCurrency = "ZAR";
input long InpExpectedDemoLogin = 0;
input string InpXauSymbol = "XAUUSDm";
input string InpBtcSymbol = "BTCUSDm";
input ENUM_TIMEFRAMES InpTimeframe = PERIOD_M15;

input bool InpEnableDemoOrders = false;
input bool InpUseLimitOrders = false;
input int InpLimitExpiryBars = 3;
input int InpDeviationPoints = 20;

input int InpFastEma = 20;
input int InpSlowEma = 50;
input double InpMinimumTrendStrength = 0.0015;
input int InpAtrPeriod = 14;
input int InpPullbackLookback = 20;
input int InpVwapLookback = 20;
input int InpVolumeLookback = 20;
input double InpVolumeExpansion = 1.2;
input double InpLevelToleranceAtr = 0.15;
input double InpMaximumWickRatio = 0.25;
input double InpStopAtrMultiple = 1.5;
input double InpStructureBufferAtr = 0.2;
input double InpMinimumRewardRisk = 2.0;

input double InpRiskPerTradePercent = 0.5;
input double InpMaximumDailyLossPercent = 1.5;
input double InpMaximumMarginFraction = 0.25;
input int InpCooldownBars = 5;
input int InpMaximumAccountExposure = 1;
input string InpSessionStartUTC = "00:00";
input string InpSessionEndUTC = "23:59";
input string InpNoTradeStartUTC = "";
input string InpNoTradeEndUTC = "";
input bool InpAllowSunday = false;
input bool InpAllowSaturday = false;

input ulong InpMagicNumber = 73141023;

CTrade g_trade;
int g_fastHandle = INVALID_HANDLE;
int g_slowHandle = INVALID_HANDLE;
int g_atrHandle = INVALID_HANDLE;
datetime g_currentBar = 0;
datetime g_lastOrderSignalTime = 0;
string g_status = "Waiting for the next closed M15 candle";

struct SetupInfo
{
   int side;
   datetime signalTime;
   double entry;
   double stop;
   double target;
   double atr;
   double trendStrength;
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

bool IsAllowedTime(const datetime barTime)
{
   MqlDateTime parts;
   TimeToStruct(barTime, parts);
   if(parts.day_of_week == 0 && !InpAllowSunday)
      return false;
   if(parts.day_of_week == 6 && !InpAllowSaturday)
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
      reason = "Refusing: connected server does not match the expected Exness demo server";
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
   setup.reason = "No qualifying A+ setup";
   int needed = MathMax(InpSlowEma, InpAtrPeriod);
   needed = MathMax(needed, InpPullbackLookback + 2);
   needed = MathMax(needed, InpVwapLookback + 2);
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
   ArrayResize(fast, 2);
   ArrayResize(slow, 2);
   ArrayResize(atrValue, 1);
   ArraySetAsSeries(fast, true);
   ArraySetAsSeries(slow, true);
   ArraySetAsSeries(atrValue, true);
   if(CopyBuffer(g_fastHandle, 0, 1, 2, fast) != 2
      || CopyBuffer(g_slowHandle, 0, 1, 2, slow) != 2
      || CopyBuffer(g_atrHandle, 0, 1, 1, atrValue) != 1)
   {
      setup.reason = "Indicator data is not ready";
      return false;
   }

   const MqlRates confirmation = rates[0];
   const MqlRates pullback = rates[1];
   if(confirmation.close <= 0.0 || atrValue[0] <= 0.0)
   {
      setup.reason = "Invalid close or ATR";
      return false;
   }
   int side = fast[0] > slow[0] ? 1 : (fast[0] < slow[0] ? -1 : 0);
   if(side == 0)
   {
      setup.reason = "EMAs are not directionally aligned";
      return false;
   }
   if((side == 1 && fast[1] <= slow[1]) || (side == -1 && fast[1] >= slow[1]))
   {
      setup.reason = "Trend alignment did not persist through pullback";
      return false;
   }
   double strength = MathAbs(fast[0] - slow[0]) / confirmation.close;
   if(strength < InpMinimumTrendStrength)
   {
      setup.reason = "Trend strength is below threshold";
      return false;
   }

   double support = DBL_MAX;
   double resistance = -DBL_MAX;
   double valueVolume = 0.0;
   double volumeSum = 0.0;
   for(int i = 2; i < 2 + InpPullbackLookback; i++)
   {
      support = MathMin(support, rates[i].low);
      resistance = MathMax(resistance, rates[i].high);
   }
   for(int i = 2; i < 2 + InpVwapLookback; i++)
   {
      double volume = (double)rates[i].tick_volume;
      double typical = (rates[i].high + rates[i].low + rates[i].close) / 3.0;
      valueVolume += typical * volume;
      volumeSum += volume;
   }
   double vwap = volumeSum > 0.0 ? valueVolume / volumeSum : 0.0;
   double tolerance = atrValue[0] * InpLevelToleranceAtr;
   bool touched = false;
   if(side == 1)
      touched = (pullback.low <= support + tolerance && pullback.low >= support && support < pullback.close)
                || (vwap > 0.0 && pullback.low <= vwap + tolerance && pullback.low >= vwap && vwap < pullback.close);
   else
      touched = (pullback.high >= resistance - tolerance && pullback.high <= resistance && resistance > pullback.close)
                || (vwap > 0.0 && pullback.high >= vwap - tolerance && pullback.high <= vwap && vwap > pullback.close);
   if(!touched)
   {
      setup.reason = "Pullback did not respect support/resistance or rolling VWAP";
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
   if((side == 1 && (confirmation.close <= confirmation.open || confirmation.close <= pullback.close))
      || (side == -1 && (confirmation.close >= confirmation.open || confirmation.close >= pullback.close)))
   {
      setup.reason = "Confirmation candle did not close in trend direction";
      return false;
   }
   if(opposingWick / range > InpMaximumWickRatio)
   {
      setup.reason = "Confirmation candle wick exceeds limit";
      return false;
   }

   double baselineVolume = 0.0;
   for(int i = 1; i <= InpVolumeLookback; i++)
      baselineVolume += (double)rates[i].tick_volume;
   baselineVolume /= InpVolumeLookback;
   if(baselineVolume <= 0.0 || (double)confirmation.tick_volume <= baselineVolume * InpVolumeExpansion)
   {
      setup.reason = "Confirmation volume did not expand";
      return false;
   }

   double entry = confirmation.close;
   double stop = side == 1
      ? MathMin(entry - atrValue[0] * InpStopAtrMultiple, pullback.low - atrValue[0] * InpStructureBufferAtr)
      : MathMax(entry + atrValue[0] * InpStopAtrMultiple, pullback.high + atrValue[0] * InpStructureBufferAtr);
   if((side == 1 && stop >= entry) || (side == -1 && stop <= entry))
   {
      setup.reason = "ATR stop invalidates the setup";
      return false;
   }
   double stopDistance = MathAbs(entry - stop);
   setup.side = side;
   setup.signalTime = confirmation.time;
   setup.entry = entry;
   setup.stop = stop;
   setup.target = entry + (side == 1 ? 1.0 : -1.0) * stopDistance * InpMinimumRewardRisk;
   setup.atr = atrValue[0];
   setup.trendStrength = strength;
   setup.reason = "All A+ conditions confirmed";
   return true;
}

double DailyRealizedPnl(bool &ok)
{
   ok = false;
   datetime now = TimeGMT();
   datetime midnight = (datetime)((long)now - ((long)now % 86400));
   if(!HistorySelect(midnight, now))
      return 0.0;
   double pnl = 0.0;
   int count = HistoryDealsTotal();
   for(int i = 0; i < count; i++)
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

void CancelOwnPendingOrders()
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0)
         continue;
      if((ulong)OrderGetInteger(ORDER_MAGIC) != InpMagicNumber
         || OrderGetString(ORDER_SYMBOL) != _Symbol)
         continue;
      ENUM_ORDER_TYPE type = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
      if(type == ORDER_TYPE_BUY_LIMIT || type == ORDER_TYPE_SELL_LIMIT)
         g_trade.OrderDelete(ticket);
   }
}

void EnforcePendingOrderGuards(const datetime signalTime)
{
   if(!InpEnableDemoOrders)
      return;
   bool historyOk = false;
   double dailyPnl = DailyRealizedPnl(historyOk);
   double dayStart = AccountInfoDouble(ACCOUNT_BALANCE) - dailyPnl;
   if(!IsAllowedTime(signalTime) || !historyOk || dayStart <= 0.0
      || dailyPnl <= -dayStart * InpMaximumDailyLossPercent / 100.0)
      CancelOwnPendingOrders();
}

void DrawSignal(const SetupInfo &setup)
{
   string name = "GoldSpoonAPlus_" + IntegerToString((long)setup.signalTime);
   double price = setup.side == 1 ? iLow(_Symbol, InpTimeframe, 1) - setup.atr * 0.15
                                  : iHigh(_Symbol, InpTimeframe, 1) + setup.atr * 0.15;
   if(ObjectFind(0, name) >= 0)
      return;
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
   string accountReason;
   if(!VerifyDemoAccount(accountReason))
   {
      g_status = accountReason;
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
      CancelOwnPendingOrders();
      g_status = "Setup skipped: daily loss limit reached";
      return;
   }

   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
   {
      g_status = "Setup skipped: current MT5 quote unavailable";
      return;
   }
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double entry = InpUseLimitOrders ? setup.entry : (setup.side == 1 ? tick.ask : tick.bid);
   double stop = NormalizeDouble(setup.stop, digits);
   if((setup.side == 1 && stop >= entry) || (setup.side == -1 && stop <= entry))
   {
      g_status = "Setup skipped: stop invalid at expected fill";
      return;
   }
   if(InpUseLimitOrders && ((setup.side == 1 && entry >= tick.ask) || (setup.side == -1 && entry <= tick.bid)))
   {
      g_status = "Setup skipped: limit price is marketable";
      return;
   }
   double stopDistance = MathAbs(entry - stop);
   long stopsLevel = SymbolInfoInteger(_Symbol, SYMBOL_TRADE_STOPS_LEVEL);
   if(stopDistance < (double)stopsLevel * point)
   {
      g_status = "Setup skipped: broker minimum stop distance";
      return;
   }
   double target = NormalizeDouble(entry + (setup.side == 1 ? 1.0 : -1.0) * stopDistance * InpMinimumRewardRisk, digits);
   ENUM_ORDER_TYPE orderType = setup.side == 1 ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double volume = 0.0;
   if(!CalculateVolume(orderType, entry, stop, volume))
      return;

   g_trade.SetExpertMagicNumber(InpMagicNumber);
   g_trade.SetDeviationInPoints(InpDeviationPoints);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   bool sent = false;
   if(InpUseLimitOrders)
   {
      datetime expiry = TimeTradeServer() + PeriodSeconds(InpTimeframe) * InpLimitExpiryBars;
      if(setup.side == 1)
         sent = g_trade.BuyLimit(volume, entry, _Symbol, stop, target, ORDER_TIME_SPECIFIED, expiry, "Gold Spoon A+ demo");
      else
         sent = g_trade.SellLimit(volume, entry, _Symbol, stop, target, ORDER_TIME_SPECIFIED, expiry, "Gold Spoon A+ demo");
   }
   else if(setup.side == 1)
      sent = g_trade.Buy(volume, _Symbol, 0.0, stop, target, "Gold Spoon A+ demo");
   else
      sent = g_trade.Sell(volume, _Symbol, 0.0, stop, target, "Gold Spoon A+ demo");

   uint retcode = g_trade.ResultRetcode();
   if(!sent || (retcode != TRADE_RETCODE_DONE && retcode != TRADE_RETCODE_DONE_PARTIAL && retcode != TRADE_RETCODE_PLACED))
   {
      g_status = "MT5 rejected demo order: " + g_trade.ResultRetcodeDescription();
      return;
   }
   g_lastOrderSignalTime = setup.signalTime;
   g_status = "Demo order accepted with broker-attached stop and target";
}

void ProcessClosedBar()
{
   string accountReason;
   if(!VerifyDemoAccount(accountReason))
   {
      g_status = accountReason;
      Comment("Gold Spoon A+ | ", _Symbol, " | ", accountReason);
      return;
   }
   if(!IsAllowedSymbol(_Symbol) || _Period != PERIOD_M15)
   {
      g_status = "Attach only to XAUUSDm or BTCUSDm on M15";
      Comment("Gold Spoon A+ | ", _Symbol, " | ", g_status);
      return;
   }

   datetime closedBarTime = iTime(_Symbol, InpTimeframe, 1);
   EnforcePendingOrderGuards(closedBarTime);
   SetupInfo setup;
   if(!LoadSetup(setup))
   {
      g_status = setup.reason;
      Comment("Gold Spoon A+ | ", _Symbol, " M15 | ", g_status,
              " | Orders: ", InpEnableDemoOrders ? "ENABLED" : "MONITOR ONLY");
      return;
   }
   if(!IsAllowedTime(setup.signalTime))
   {
      if(InpEnableDemoOrders)
         CancelOwnPendingOrders();
      g_status = "A+ pattern found, but outside session/no-trade filter";
      Comment("Gold Spoon A+ | ", _Symbol, " M15 | ", g_status);
      return;
   }

   DrawSignal(setup);
   string direction = setup.side == 1 ? "LONG" : "SHORT";
   g_status = direction + " A+ setup confirmed at " + DoubleToString(setup.entry, _Digits);
   TryPlaceDemoOrder(setup);
   Comment("Gold Spoon A+ | ", _Symbol, " M15 | ", g_status,
           " | Stop: ", DoubleToString(setup.stop, _Digits),
           " | Target: ", DoubleToString(setup.target, _Digits),
           " | Orders: ", InpEnableDemoOrders ? "ENABLED" : "MONITOR ONLY");
   Print("Gold Spoon A+ | ", _Symbol, " | ", g_status);
}

int OnInit()
{
   if(InpTimeframe != PERIOD_M15 || _Period != PERIOD_M15)
   {
      Print("Gold Spoon A+: attach this EA to an M15 chart.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(!IsAllowedSymbol(_Symbol))
   {
      Print("Gold Spoon A+: this symbol is not on the XAUUSDm/BTCUSDm allowlist.");
      return INIT_PARAMETERS_INCORRECT;
   }
   string accountReason;
   if(!VerifyDemoAccount(accountReason))
   {
      Print("Gold Spoon A+: ", accountReason);
      return INIT_FAILED;
   }
   if(InpFastEma >= InpSlowEma || InpFastEma < 1 || InpSlowEma < 2
      || InpAtrPeriod < 2 || InpPullbackLookback < 2 || InpVwapLookback < 2 || InpVolumeLookback < 2
      || InpRiskPerTradePercent <= 0.0 || InpRiskPerTradePercent > 2.0
      || InpMaximumDailyLossPercent <= 0.0 || InpMaximumDailyLossPercent > 5.0
      || InpMaximumMarginFraction <= 0.0 || InpMaximumMarginFraction > 1.0
      || InpMinimumRewardRisk < 2.0 || InpLimitExpiryBars < 1 || InpMaximumAccountExposure != 1)
   {
      Print("Gold Spoon A+: invalid or unsafe strategy/risk inputs.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(ParseClock(InpSessionStartUTC) < 0 || ParseClock(InpSessionEndUTC) < 0
      || ((InpNoTradeStartUTC == "") != (InpNoTradeEndUTC == ""))
      || (InpNoTradeStartUTC != "" && (ParseClock(InpNoTradeStartUTC) < 0 || ParseClock(InpNoTradeEndUTC) < 0)))
   {
      Print("Gold Spoon A+: invalid session or no-trade clock input.");
      return INIT_PARAMETERS_INCORRECT;
   }

   g_fastHandle = iMA(_Symbol, InpTimeframe, InpFastEma, 0, MODE_EMA, PRICE_CLOSE);
   g_slowHandle = iMA(_Symbol, InpTimeframe, InpSlowEma, 0, MODE_EMA, PRICE_CLOSE);
   g_atrHandle = iATR(_Symbol, InpTimeframe, InpAtrPeriod);
   if(g_fastHandle == INVALID_HANDLE || g_slowHandle == INVALID_HANDLE || g_atrHandle == INVALID_HANDLE)
   {
      Print("Gold Spoon A+: failed to create indicator handles.");
      return INIT_FAILED;
   }
   g_trade.SetExpertMagicNumber(InpMagicNumber);
   g_trade.SetDeviationInPoints(InpDeviationPoints);
   g_trade.SetTypeFillingBySymbol(_Symbol);
   g_currentBar = iTime(_Symbol, InpTimeframe, 0);
   g_status = "Attached and verified; waiting for a closed M15 candle";
   Comment("Gold Spoon A+ | ", _Symbol, " M15 | ", g_status,
           " | Orders: ", InpEnableDemoOrders ? "ENABLED" : "MONITOR ONLY");
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
