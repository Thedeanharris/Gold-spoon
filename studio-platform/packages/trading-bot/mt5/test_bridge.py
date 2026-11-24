import unittest
import time
from types import SimpleNamespace

from bridge import BOT_MAGIC, Mt5Bridge


class FakeMt5:
    ACCOUNT_TRADE_MODE_DEMO = 0
    ACCOUNT_TRADE_MODE_REAL = 2
    TIMEFRAME_M15 = 15
    ORDER_TYPE_BUY = 0
    ORDER_TYPE_SELL = 1
    ORDER_TYPE_BUY_LIMIT = 2
    ORDER_TYPE_SELL_LIMIT = 3
    ORDER_TIME_GTC = 0
    ORDER_TIME_SPECIFIED = 2
    ORDER_FILLING_FOK = 0
    ORDER_FILLING_IOC = 1
    ORDER_FILLING_RETURN = 2
    SYMBOL_FILLING_IOC = 2
    SYMBOL_FILLING_FOK = 1
    TRADE_ACTION_DEAL = 1
    TRADE_ACTION_PENDING = 5
    TRADE_ACTION_REMOVE = 8
    TRADE_RETCODE_DONE = 10009
    TRADE_RETCODE_PLACED = 10008
    DEAL_TYPE_BUY = 0
    DEAL_TYPE_SELL = 1

    def __init__(self, trade_mode=0, server="Exness-MT5Trial", login=123456):
        self.initialized = False
        self.trade_mode = trade_mode
        self.server = server
        self.login = login
        self.requests = []
        self.rate_request = None
        self.pending_orders = []

    def initialize(self):
        self.initialized = True
        return True

    def shutdown(self):
        self.initialized = False

    def account_info(self):
        return SimpleNamespace(
            trade_mode=self.trade_mode,
            server=self.server,
            login=self.login,
            balance=10000.0,
            equity=10000.0,
        )

    def terminal_info(self):
        return SimpleNamespace(
            path="C:\\Program Files\\Exness MT5",
            data_path="C:\\Users\\Tester\\AppData\\Roaming\\MetaQuotes\\Terminal\\abc",
        )

    def symbol_select(self, symbol, enabled):
        return symbol in ("XAUUSD", "BTCUSD")

    def symbol_info(self, symbol):
        if symbol not in ("XAUUSD", "BTCUSD"):
            return None
        return SimpleNamespace(
            digits=2,
            point=0.01,
            trade_tick_size=0.01,
            trade_tick_value_loss=1.0,
            volume_min=0.01,
            volume_max=100.0,
            volume_step=0.01,
            trade_stops_level=1,
            filling_mode=self.SYMBOL_FILLING_IOC,
        )

    def symbol_info_tick(self, symbol):
        return SimpleNamespace(ask=2000.0, bid=1999.9)

    def copy_rates_from_pos(self, symbol, timeframe, start, count):
        self.rate_request = (symbol, timeframe, start, count)
        return [{
            "time": 1795377600,
            "open": 2000.0,
            "high": 2001.0,
            "low": 1999.0,
            "close": 2000.5,
            "real_volume": 10,
            "tick_volume": 20,
        }]

    def history_deals_get(self, start, end):
        return []

    def positions_get(self):
        return ()

    def orders_get(self):
        return tuple(self.pending_orders)

    def order_calc_profit(self, order_type, symbol, volume, entry, stop):
        return -abs(entry - stop) * 100

    def order_calc_margin(self, order_type, symbol, volume, price):
        return 100

    def order_check(self, request):
        self.requests.append(("check", request))
        return SimpleNamespace(retcode=0)

    def order_send(self, request):
        self.requests.append(("send", request))
        return SimpleNamespace(retcode=self.TRADE_RETCODE_DONE, order=7, deal=8)


def context():
    return {
        "expectedDemoServer": "Exness-MT5Trial",
        "allowedAccountId": "123456",
        "symbols": {"XAUUSD": "XAUUSD", "BTCUSD": "BTCUSD"},
        "maxSignalAgeSeconds": 900,
        "limitExpiryBars": 3,
        "deviationPoints": 20,
    }


class Mt5BridgeTests(unittest.TestCase):
    def test_refuses_real_account_before_read_or_trade_operations(self):
        mt5 = FakeMt5(trade_mode=FakeMt5.ACCOUNT_TRADE_MODE_REAL)
        with self.assertRaisesRegex(RuntimeError, "not verified as a demo"):
            Mt5Bridge(mt5, context()).handle("verify_demo", {})
        self.assertEqual(mt5.requests, [])

    def test_refuses_unexpected_demo_server_or_account(self):
        with self.assertRaisesRegex(RuntimeError, "server does not match"):
            Mt5Bridge(FakeMt5(server="Exness-MT5Real"), context()).handle("verify_demo", {})
        with self.assertRaisesRegex(RuntimeError, "account does not match"):
            Mt5Bridge(FakeMt5(login=789), context()).handle("verify_demo", {})

    def test_candles_use_only_closed_m15_rates(self):
        mt5 = FakeMt5()
        candles = Mt5Bridge(mt5, context()).handle("candles", {"symbol": "XAUUSD", "count": 100})
        self.assertEqual(mt5.rate_request, ("XAUUSD", FakeMt5.TIMEFRAME_M15, 1, 100))
        self.assertEqual(candles[0]["symbol"], "XAUUSD")
        self.assertTrue(candles[0]["closed"])
        self.assertEqual(candles[0]["volume"], 10.0)

    def test_contract_aware_position_sizing_obeys_volume_step(self):
        mt5 = FakeMt5()
        result = Mt5Bridge(mt5, context()).handle("size_position", {
            "symbol": "XAUUSD",
            "side": "long",
            "entryType": "limit",
            "entryPrice": 2000,
            "stopPrice": 1990,
            "equity": 10000,
            "riskPerTrade": 0.005,
            "maximumLeverage": 1,
        })
        self.assertEqual(result["volume"], 0.05)

    def test_order_request_includes_broker_attached_stop_and_target(self):
        mt5 = FakeMt5()
        result = Mt5Bridge(mt5, context()).handle("submit_bracket_order", {
            "symbol": "XAUUSD",
            "side": "long",
            "type": "market",
            "quantity": 0.05,
            "entryPrice": 2000,
            "stopLoss": 1990,
            "minimumRewardRisk": 2,
            "timestamp": int(time.time() * 1000),
        })
        order = mt5.requests[-1][1]
        self.assertEqual(mt5.requests[-1][0], "send")
        self.assertEqual(order["magic"], BOT_MAGIC)
        self.assertEqual(order["sl"], 1990)
        self.assertEqual(order["tp"], 2020)
        self.assertTrue(result["accepted"])

    def test_only_cancels_pending_entries_owned_by_this_bot(self):
        mt5 = FakeMt5()
        mt5.pending_orders = [
            SimpleNamespace(magic=BOT_MAGIC, symbol="XAUUSD", type=FakeMt5.ORDER_TYPE_BUY_LIMIT, ticket=1),
            SimpleNamespace(magic=123, symbol="BTCUSD", type=FakeMt5.ORDER_TYPE_SELL_LIMIT, ticket=2),
        ]
        result = Mt5Bridge(mt5, context()).handle("cancel_pending_entry_orders", {})
        self.assertEqual(result["cancelled"], 1)
        self.assertEqual(mt5.requests[0][1]["order"], 1)

    def test_reads_terminal_paths_from_verified_demo_terminal(self):
        result = Mt5Bridge(FakeMt5(), context()).handle("terminal_paths", {})
        self.assertEqual(result["dataPath"], "C:\\Users\\Tester\\AppData\\Roaming\\MetaQuotes\\Terminal\\abc")


if __name__ == "__main__":
    unittest.main()
