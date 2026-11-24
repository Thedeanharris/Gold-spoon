import datetime as dt
import json
import math
import sys
from decimal import Decimal, ROUND_DOWN


BOT_MAGIC = 73141022
TIMEFRAME_SECONDS = 15 * 60
ALLOWED_LOGICAL_SYMBOLS = {"XAUUSD", "BTCUSD"}


def field(value, name, default=None):
    try:
        return value[name]
    except (TypeError, KeyError, IndexError):
        return getattr(value, name, default)


def number(value, name):
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{name} must be finite")
    return result


class Mt5Bridge:
    def __init__(self, mt5, context):
        self.mt5 = mt5
        self.context = context

    def handle(self, operation, payload):
        expected_server = str(self.context.get("expectedDemoServer") or "").strip()
        expected_login = str(self.context.get("allowedAccountId") or "").strip()
        if not expected_server or not expected_login:
            raise RuntimeError("Expected demo server and account ID must be configured")
        if not self.mt5.initialize():
            raise RuntimeError("Could not initialize the already-installed MT5 terminal")
        try:
            account = self._verify_demo(expected_server, expected_login)
            if operation == "verify_demo":
                return {"verified": True, "server": str(account.server), "tradeMode": "demo"}
            if operation == "symbol_info":
                return self._symbol_info(payload.get("symbol"))
            if operation == "symbol_candidates":
                return self._symbol_candidates()
            if operation == "terminal_paths":
                return self._terminal_paths()
            if operation == "candles":
                return self._candles(payload.get("symbol"), payload.get("count"))
            if operation == "account_snapshot":
                return self._account_snapshot(account)
            if operation == "size_position":
                return self._size_position(payload)
            if operation == "submit_bracket_order":
                return self._submit_bracket_order(payload)
            if operation == "cancel_pending_entry_orders":
                return self._cancel_pending_entry_orders()
            raise ValueError("Unsupported MT5 bridge operation")
        finally:
            self.mt5.shutdown()

    def _verify_demo(self, expected_server, expected_login):
        account = self.mt5.account_info()
        demo_mode = getattr(self.mt5, "ACCOUNT_TRADE_MODE_DEMO", None)
        if account is None or demo_mode is None or field(account, "trade_mode") != demo_mode:
            raise RuntimeError("Connected MT5 account is not verified as a demo account")
        if str(field(account, "server", "")) != expected_server:
            raise RuntimeError("Connected MT5 server does not match the configured demo server")
        if str(field(account, "login", "")) != expected_login:
            raise RuntimeError("Connected MT5 account does not match the configured demo account ID")
        return account

    def _symbol_name(self, logical_symbol):
        if logical_symbol not in ALLOWED_LOGICAL_SYMBOLS:
            raise ValueError("Only XAUUSD and BTCUSD are enabled for this demo adapter")
        symbol = self.context.get("symbols", {}).get(logical_symbol)
        if not isinstance(symbol, str) or not symbol.strip():
            raise RuntimeError(f"No exact MT5 Market Watch symbol is configured for {logical_symbol}")
        return symbol

    def _symbol(self, logical_symbol):
        symbol = self._symbol_name(logical_symbol)
        if not self.mt5.symbol_select(symbol, True):
            raise RuntimeError(f"MT5 symbol is unavailable: {symbol}")
        info = self.mt5.symbol_info(symbol)
        if info is None:
            raise RuntimeError(f"MT5 returned no symbol metadata for {symbol}")
        return symbol, info

    def _symbol_info(self, logical_symbol):
        symbol, info = self._symbol(logical_symbol)
        return {
            "logicalSymbol": logical_symbol,
            "symbol": symbol,
            "digits": int(field(info, "digits", 0)),
            "point": number(field(info, "point", 0), "symbol point"),
            "tickSize": number(field(info, "trade_tick_size", 0), "symbol tick size"),
            "tickValueLoss": number(field(info, "trade_tick_value_loss", 0), "symbol tick value"),
            "volumeMin": number(field(info, "volume_min", 0), "minimum volume"),
            "volumeMax": number(field(info, "volume_max", 0), "maximum volume"),
            "volumeStep": number(field(info, "volume_step", 0), "volume step"),
            "stopsLevel": int(field(info, "trade_stops_level", 0)),
        }

    def _symbol_candidates(self):
        symbols = self.mt5.symbols_get()
        if symbols is None:
            raise RuntimeError("MT5 could not list available symbols")
        candidates = []
        for item in symbols:
            name = str(field(item, "name", ""))
            normalized = name.upper()
            if any(token in normalized for token in ("XAUUSD", "BTCUSD", "GOLD", "BITCOIN")):
                candidates.append(name)
        return sorted(set(candidates), key=str.casefold)

    def _terminal_paths(self):
        terminal = self.mt5.terminal_info()
        if terminal is None:
            raise RuntimeError("MT5 could not report its terminal installation and data folders")
        install_path = str(field(terminal, "path", ""))
        data_path = str(field(terminal, "data_path", ""))
        if not install_path or not data_path:
            raise RuntimeError("MT5 returned incomplete terminal folder paths")
        return {"installPath": install_path, "dataPath": data_path}

    def _candles(self, logical_symbol, count):
        symbol, _ = self._symbol(logical_symbol)
        if not isinstance(count, int) or count < 2 or count > 2000:
            raise ValueError("Candle count must be between 2 and 2000")
        rates = self.mt5.copy_rates_from_pos(symbol, self.mt5.TIMEFRAME_M15, 1, count)
        if rates is None:
            raise RuntimeError("MT5 could not read closed M15 candles")
        candles = []
        for rate in rates:
            timestamp = int(field(rate, "time"))
            real_volume = int(field(rate, "real_volume", 0) or 0)
            tick_volume = int(field(rate, "tick_volume", 0) or 0)
            candles.append({
                "symbol": logical_symbol,
                "timestamp": (timestamp + TIMEFRAME_SECONDS) * 1000,
                "open": number(field(rate, "open"), "candle open"),
                "high": number(field(rate, "high"), "candle high"),
                "low": number(field(rate, "low"), "candle low"),
                "close": number(field(rate, "close"), "candle close"),
                "volume": float(real_volume or tick_volume),
                "closed": True,
            })
        return sorted(candles, key=lambda candle: candle["timestamp"])

    def _account_snapshot(self, account):
        now = dt.datetime.now(dt.timezone.utc)
        midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
        deals = self.mt5.history_deals_get(midnight, now)
        if deals is None:
            raise RuntimeError("MT5 could not read today's account deals for daily-loss controls")
        buy_type = getattr(self.mt5, "DEAL_TYPE_BUY", -1)
        sell_type = getattr(self.mt5, "DEAL_TYPE_SELL", -1)
        daily_pnl = sum(
            float(field(deal, "profit", 0) or 0)
            + float(field(deal, "commission", 0) or 0)
            + float(field(deal, "swap", 0) or 0)
            + float(field(deal, "fee", 0) or 0)
            for deal in deals
            if field(deal, "type") in (buy_type, sell_type)
        )
        positions = self.mt5.positions_get()
        orders = self.mt5.orders_get()
        if positions is None or orders is None:
            raise RuntimeError("MT5 could not list account exposure for risk controls")
        balance = number(field(account, "balance"), "account balance")
        return {
            "equity": number(field(account, "equity"), "account equity"),
            "dayStartEquity": balance - daily_pnl,
            "dailyRealizedPnl": daily_pnl,
            "openPositions": len(positions),
            "pendingEntryOrders": len(orders),
        }

    def _size_position(self, payload):
        logical_symbol = payload.get("symbol")
        symbol, info = self._symbol(logical_symbol)
        side = payload.get("side")
        if side not in ("long", "short"):
            raise ValueError("Position side must be long or short")
        order_type = self.mt5.ORDER_TYPE_BUY if side == "long" else self.mt5.ORDER_TYPE_SELL
        entry = number(payload.get("entryPrice"), "entry price")
        if payload.get("entryType") == "market":
            tick = self.mt5.symbol_info_tick(symbol)
            if tick is None:
                raise RuntimeError(f"MT5 returned no quote for {symbol}")
            entry = number(field(tick, "ask" if side == "long" else "bid"), "market quote")
            point = number(field(info, "point"), "symbol point")
            deviation = int(payload.get("deviationPoints", 0))
            entry += (deviation * point) * (1 if side == "long" else -1)
        stop = number(payload.get("stopPrice"), "stop price")
        if (side == "long" and stop >= entry) or (side == "short" and stop <= entry):
            return {"volume": 0, "reason": "stop is invalid at the estimated fill price"}
        loss = self.mt5.order_calc_profit(order_type, symbol, 1.0, entry, stop)
        margin = self.mt5.order_calc_margin(order_type, symbol, 1.0, entry)
        if loss is None or margin is None or abs(float(loss)) <= 0 or float(margin) <= 0:
            raise RuntimeError("MT5 could not calculate contract-aware loss and margin per lot")
        equity = number(payload.get("equity"), "account equity")
        risk = number(payload.get("riskPerTrade"), "risk per trade")
        leverage = number(payload.get("maximumLeverage"), "maximum leverage")
        risk_volume = equity * risk / abs(float(loss))
        margin_volume = equity * leverage / float(margin)
        volume_max = number(field(info, "volume_max"), "maximum volume")
        volume_min = number(field(info, "volume_min"), "minimum volume")
        step = number(field(info, "volume_step"), "volume step")
        if step <= 0 or volume_min <= 0 or volume_max < volume_min:
            raise RuntimeError("MT5 returned invalid volume limits")
        raw_volume = min(risk_volume, margin_volume, volume_max)
        stepped = (Decimal(str(raw_volume)) / Decimal(str(step))).to_integral_value(rounding=ROUND_DOWN) * Decimal(str(step))
        volume = float(stepped)
        if volume < volume_min:
            return {"volume": 0, "reason": "risk budget is below the broker minimum volume"}
        return {"volume": volume}

    def _submit_bracket_order(self, payload):
        logical_symbol = payload.get("symbol")
        symbol, info = self._symbol(logical_symbol)
        side = payload.get("side")
        entry_type = payload.get("type")
        if side not in ("long", "short") or entry_type not in ("market", "limit"):
            raise ValueError("Only long/short market or limit entries are supported")
        positions = self.mt5.positions_get()
        orders = self.mt5.orders_get()
        if positions is None or orders is None:
            raise RuntimeError("MT5 could not list account exposure before order submission")
        if positions or orders:
            return {"accepted": False, "reason": "account already has a position or pending order"}
        timestamp = number(payload.get("timestamp"), "signal timestamp") / 1000
        max_age = int(self.context.get("maxSignalAgeSeconds", TIMEFRAME_SECONDS))
        age = dt.datetime.now(dt.timezone.utc).timestamp() - timestamp
        if age < -60 or age > max_age:
            raise RuntimeError("Signal is stale or has a future timestamp")
        tick = self.mt5.symbol_info_tick(symbol)
        if tick is None:
            raise RuntimeError(f"MT5 returned no quote for {symbol}")
        point = number(field(info, "point"), "symbol point")
        digits = int(field(info, "digits"))
        stop = round(number(payload.get("stopLoss"), "stop loss"), digits)
        deviation = int(self.context.get("deviationPoints", 20))
        if entry_type == "market":
            price = number(field(tick, "ask" if side == "long" else "bid"), "market quote")
            order_kind = self.mt5.ORDER_TYPE_BUY if side == "long" else self.mt5.ORDER_TYPE_SELL
            action = self.mt5.TRADE_ACTION_DEAL
        else:
            price = round(number(payload.get("entryPrice"), "limit price"), digits)
            price_field = field(tick, "ask" if side == "long" else "bid")
            current_price = number(price_field, "market quote")
            if (side == "long" and price >= current_price) or (side == "short" and price <= current_price):
                raise RuntimeError("Limit price is marketable; refusing a stale limit entry")
            order_kind = self.mt5.ORDER_TYPE_BUY_LIMIT if side == "long" else self.mt5.ORDER_TYPE_SELL_LIMIT
            action = self.mt5.TRADE_ACTION_PENDING
        if (side == "long" and stop >= price) or (side == "short" and stop <= price):
            raise RuntimeError("Stop loss is invalid at the expected entry price")
        risk_distance = abs(price - stop)
        minimum_distance = int(field(info, "trade_stops_level", 0)) * point
        if risk_distance < minimum_distance:
            raise RuntimeError("Stop loss violates the broker minimum stop distance")
        reward_risk = number(payload.get("minimumRewardRisk"), "minimum reward-to-risk")
        target = round(price + (1 if side == "long" else -1) * risk_distance * reward_risk, digits)
        if abs(target - price) < minimum_distance:
            raise RuntimeError("Take profit violates the broker minimum stop distance")
        volume = number(payload.get("quantity"), "volume")
        volume_min = number(field(info, "volume_min"), "minimum volume")
        volume_max = number(field(info, "volume_max"), "maximum volume")
        volume_step = number(field(info, "volume_step"), "volume step")
        if volume < volume_min or volume > volume_max or volume_step <= 0:
            raise RuntimeError("Order volume is outside broker limits")
        volume_steps = Decimal(str(volume)) / Decimal(str(volume_step))
        if volume_steps != volume_steps.to_integral_value():
            raise RuntimeError("Order volume does not match the broker volume step")

        request = {
            "action": action,
            "symbol": symbol,
            "volume": volume,
            "type": order_kind,
            "price": price,
            "sl": stop,
            "tp": target,
            "deviation": deviation,
            "magic": BOT_MAGIC,
            "comment": "GoldSpoon demo",
            "type_time": self.mt5.ORDER_TIME_GTC,
            "type_filling": self._filling_mode(info, entry_type),
        }
        if entry_type == "limit":
            expiry = int(dt.datetime.now(dt.timezone.utc).timestamp()) + TIMEFRAME_SECONDS * int(self.context.get("limitExpiryBars", 3))
            request["type_time"] = self.mt5.ORDER_TIME_SPECIFIED
            request["expiration"] = expiry
        checked = self.mt5.order_check(request)
        if checked is None or field(checked, "retcode") != 0:
            raise RuntimeError("MT5 rejected the protective bracket during order_check")
        result = self.mt5.order_send(request)
        accepted = {
            getattr(self.mt5, "TRADE_RETCODE_DONE", -1),
            getattr(self.mt5, "TRADE_RETCODE_PLACED", -1),
        }
        if result is None or field(result, "retcode") not in accepted:
            raise RuntimeError("MT5 did not confirm the bracketed demo order")
        return {
            "accepted": True,
            "order": int(field(result, "order", 0) or 0),
            "deal": int(field(result, "deal", 0) or 0),
            "symbol": logical_symbol,
            "side": side,
            "volume": volume,
            "entryPrice": price,
            "stopLoss": stop,
            "takeProfit": target,
        }

    def _filling_mode(self, info, entry_type):
        if entry_type == "limit":
            return self.mt5.ORDER_FILLING_RETURN
        supported = int(field(info, "filling_mode", 0))
        if supported & getattr(self.mt5, "SYMBOL_FILLING_IOC", 2):
            return self.mt5.ORDER_FILLING_IOC
        if supported & getattr(self.mt5, "SYMBOL_FILLING_FOK", 1):
            return self.mt5.ORDER_FILLING_FOK
        return self.mt5.ORDER_FILLING_RETURN

    def _cancel_pending_entry_orders(self):
        removed = 0
        orders = self.mt5.orders_get()
        if orders is None:
            raise RuntimeError("MT5 could not list pending orders for safe shutdown")
        symbols = set(self.context.get("symbols", {}).values())
        pending_types = {
            getattr(self.mt5, "ORDER_TYPE_BUY_LIMIT", -1),
            getattr(self.mt5, "ORDER_TYPE_SELL_LIMIT", -1),
        }
        for order in orders:
            if field(order, "magic") != BOT_MAGIC or field(order, "symbol") not in symbols:
                continue
            if field(order, "type") not in pending_types:
                continue
            result = self.mt5.order_send({
                "action": self.mt5.TRADE_ACTION_REMOVE,
                "order": int(field(order, "ticket")),
                "magic": BOT_MAGIC,
                "comment": "GoldSpoon demo shutdown",
            })
            if result is None or field(result, "retcode") != getattr(self.mt5, "TRADE_RETCODE_DONE", -1):
                raise RuntimeError("MT5 did not confirm cancellation of a pending bot entry")
            removed += 1
        return {"cancelled": removed}


def main():
    request = json.loads(sys.stdin.readline())
    try:
        import MetaTrader5
        context = request.get("context") or {}
        result = Mt5Bridge(MetaTrader5, context).handle(request.get("operation"), request.get("payload") or {})
        response = {"ok": True, "result": result}
    except Exception as error:
        response = {"ok": False, "error": str(error)}
    sys.stdout.write(json.dumps(response, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    main()
