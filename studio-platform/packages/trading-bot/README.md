# Conservative OHLCV trading bot

This dependency-free Node.js core provides a deterministic A+ setup classifier, closed-candle CSV input, a transaction-cost-aware paper/backtest simulator, and an optional local Exness MT5 adapter. Paper remains the default. Live mode is restricted to an MT5 account verified as demo, the exact configured server and login, and the XAUUSD/BTCUSD allowlist. Trading can lose money; no strategy outcome or profit is guaranteed.

## Paper and backtest

Use Node.js 22 or newer. From `studio-platform/`:

```powershell
node --test packages/trading-bot/test/trading-bot.test.js
node packages/trading-bot/src/cli.js --mode backtest --candles path\to\candles.csv
node packages/trading-bot/src/cli.js --mode paper --candles path\to\candles.csv
```

The CSV header must contain `timestamp,open,high,low,close,volume`, in strictly increasing timestamp order. Optional `closed` values are `true` or `false`; absent values mean supplied historical rows are complete. Rows must be plain comma-separated fields, with ISO-8601 timestamps recommended.

Copy `config.example.json` to the ignored `config.local.json` to adjust settings. Defaults are one open position, 0.5% risk per trade, a 1.5% daily realized-loss limit, 2:1 minimum reward-to-risk, a 1x exposure cap, 0.1% simulated fees, and 0.05% simulated slippage per fill. The default session is weekdays in UTC.

## A+ setup

A signal requires confirmed closed candles, persistent fast/slow EMA alignment and minimum normalized EMA separation, then a preceding pullback candle that touches prior-window support/resistance or rolling VWAP without piercing the touched level. The confirmation candle must close in trend direction beyond the pullback close, have a bounded opposing wick, and exceed prior average volume by the configured multiplier. The stop is beyond both the ATR distance and pullback extreme. Risk, session/no-trade windows, cooldown, and one-position limits are checked before entry. If a stop and target could both fill in one historical bar, the simulator assumes the stop was first.

Market entries use adverse slippage; limit orders rest for a bounded number of closed bars and are cancelled outside permitted trading times. Stop-loss and take-profit brackets are simulated, and fees are charged on both sides. OHLCV backtests cannot model every execution, liquidity, funding, or market-gap behavior.

## Where the files are

`studio-platform` is an existing folder in this repository; the bot lives inside it, not in a separate repository. From the repository root, the main files are:

| File | Purpose |
|---|---|
| `studio-platform\packages\trading-bot\README.md` | This guide |
| `studio-platform\packages\trading-bot\config.example.json` | Safe starter settings; paper mode is on |
| `studio-platform\packages\trading-bot\config.local.json` | Your local settings; ignored by Git and not committed |
| `studio-platform\packages\trading-bot\src\cli.js` | Commands for backtest, paper, read-only MT5 verify, EA installation, and explicitly enabled demo trading |
| `studio-platform\packages\trading-bot\src\mt5-adapter.js` | Node.js adapter that talks to the local bridge |
| `studio-platform\packages\trading-bot\mt5\bridge.py` | Python bridge to the installed MT5 terminal |
| `studio-platform\packages\trading-bot\mt5\GoldSpoonAPlus.mq5` | MT5 chart Expert Advisor; demo order execution is off by default |
| `studio-platform\packages\trading-bot\mt5\GoldSpoonAPlusSculkie.mq5` | Separate M1/M5 scalp Expert Advisor; demo order execution is off by default |
| `studio-platform\packages\trading-bot\src\install-ea.js` | Verifies the local demo terminal, installs the EA source, and compiles when possible |
| `studio-platform\packages\trading-bot\mt5\requirements.txt` | Python MT5 package dependency |

The MT5 connector attaches to the already-running desktop terminal; it does not accept or store a password. Do not send credentials in chat or commit them. The bridge verifies MT5's account trade mode is **demo**, the server exactly matches `mt5.expectedDemoServer`, and the account login exactly matches `execution.allowedAccountId` before every bridge operation. It only permits configured XAUUSD and BTCUSD; broker symbols may have suffixes. It counts account-wide positions and pending orders to enforce a single exposure, sizes in broker lots using MT5's profit/margin calculations and volume step, and submits stop-loss/take-profit values with the entry request. These calculations use the account currency and broker contract/leverage reported by MT5; they do not assume USD. Shutdown cancels only this bot's pending limit entries; it does not remove protective stops or close positions.

## Step-by-step: log in and verify (read-only)

Do these steps on the Windows computer where Exness MT5 is installed. For this first check, the bot only reads account details, symbol metadata, and historical candles. It does **not** place, change, or cancel orders.

1. **Open MT5 and sign into your Exness demo account.**
   - Start the Exness MetaTrader 5 desktop app.
   - In MT5, choose **File → Login to Trade Account**.
   - Enter the demo account's login number and its trading password in MT5. Choose the exact demo server shown in the Exness account details/welcome email. Keep credentials inside MT5; never paste them into PowerShell, the config file, or chat.
   - Click **OK**. Confirm the connection/status indicator in MT5 shows connected and that the account is the demo account.
2. **Find the exact account server and login number.** Use the name of the server you selected and the demo login number from Exness. The server and number must be typed exactly into the local config in a later step.
3. **Find the exact instrument names.**
   - In MT5 press **Ctrl+M** to show **Market Watch**.
   - Right-click inside Market Watch and choose **Symbols** (or press **Ctrl+U**).
   - Search for gold and Bitcoin; show the matching symbols in Market Watch if needed.
   - Record the exact symbol strings displayed, including suffixes, for example `XAUUSD` / `BTCUSD` or a broker-specific variant. Do not assume the example names match your account.
4. **Open PowerShell in the repository's `studio-platform` folder.** The folder is inside the checked-out repository. If you are not sure where the checkout is, use the Copilot project workspace location shown for this session, then open its `studio-platform` subfolder. In PowerShell, change to that folder before running the commands below. The path should end with `\studio-platform`.
5. **Install the local Python bridge dependency and create your private config.** These commands create files under the bot package; the virtual environment and local config are excluded from Git:

   ```powershell
   py -m venv packages\trading-bot\.venv
   .\packages\trading-bot\.venv\Scripts\python.exe -m pip install -r packages\trading-bot\mt5\requirements.txt
   Copy-Item packages\trading-bot\config.example.json packages\trading-bot\config.local.json
   ```

   If `py` is not recognized, install 64-bit Python for Windows first, open a new PowerShell, and retry. If `Copy-Item` says the destination already exists, edit the existing local config instead of overwriting it.
6. **Edit `packages\trading-bot\config.local.json`** in a text editor. Change only the setup fields for now:
   - `execution.allowedAccountId`: your Exness demo login number as a string, e.g. `"123456"` (example only).
   - `execution.mode`: leave `"paper"`; leave `execution.liveEnabled` as `false`.
   - `mt5.expectedDemoServer`: the exact demo server selected in MT5.
   - `mt5.pythonExecutable`: `".\\packages\\trading-bot\\.venv\\Scripts\\python.exe"`.
   - `mt5.symbols.XAUUSD` and `mt5.symbols.BTCUSD`: the exact Market Watch symbols you found.
   - Leave `mt5.timeframe` as `"M15"`.

   Save the file. `config.local.json` is ignored and must stay on your computer. It contains an account ID, never a password.
7. **Run the read-only verification from the same `studio-platform` PowerShell window.** Replace the placeholder with your demo login number only:

   ```powershell
   $env:TRADING_ACCOUNT_ID = "your-demo-login-number"
   node packages\trading-bot\src\cli.js --mode verify-mt5 --config packages\trading-bot\config.local.json
   ```

   This attaches to the local terminal, verifies the demo account/server, and reads M15 history and symbol metadata. It does not submit or modify orders. A successful result prints `mt5_demo_verified` and symbol metadata for both instruments. If it fails, stop and check the exact server, login number, symbol strings, Python install, and that MT5 is open and logged into the **demo** account. Share only the error text with credentials/account numbers removed if you need help. The mocked tests are not a substitute for this local read-only verification.

**Stop here after the read-only check.** Do not switch to order execution just to test connectivity. A later, separate demo trial would require your explicit decision to change the local config to `execution.mode: "live"` and `execution.liveEnabled: true`, then set `TRADING_LIVE_ACK=I_ACCEPT_LIVE_TRADING_RISK` in PowerShell while keeping `TRADING_ACCOUNT_ID` equal to the demo login. Only then would `node packages\trading-bot\src\cli.js --mode live --config packages\trading-bot\config.local.json` start the two M15 feeds and be able to submit demo orders when a setup occurs. Monitor MT5 continuously during any such trial. The program fails closed on a real account, wrong server/login, missing acknowledgement, unsupported symbols, invalid broker volume/stop rules, stale bars, or rejected bracket checks.

The adapter and bridge tests are mocked and never connect to MT5 or place an order. The CLI intentionally separates read-only verification (`verify-mt5`) from explicit order execution (`live`).

## Install the MT5 chart monitor (orders disabled)

The chart Expert Advisor is separate from the Node.js order loop. It can display A+ signals on the `XAUUSDm` and `BTCUSDm` M15 charts, but it does not place orders unless `InpEnableDemoOrders` is explicitly changed. Keep it `false` while the Node.js demo runner is in use, to avoid duplicate trading.

1. Keep MT5 open and signed in to the expected Exness demo account. From `studio-platform`, run:

   ```powershell
   node packages\trading-bot\src\cli.js --mode install-ea --config packages\trading-bot\config.local.json
   ```

   The command verifies the demo server/account against the local config, copies the EA into MT5's `MQL5\Experts\Gold Spoon` folder, and compiles it if MetaEditor is available.
2. If compilation was not reported, open MetaEditor from MT5 with **F4**. In MetaEditor choose **File → Open**, browse to MT5's data folder → `MQL5\Experts\Gold Spoon\GoldSpoonAPlus.mq5`, then press **F7**. Confirm the compile result shows `0 errors` and creates `GoldSpoonAPlus.ex5`.
3. In MT5 press **Ctrl+N** to show Navigator. Refresh **Expert Advisors** if needed, then expand **Gold Spoon** and find **GoldSpoonAPlus**.
4. Drag **GoldSpoonAPlus** onto the `XAUUSDm,M15` chart. In **Inputs**, set `InpExpectedDemoLogin` to the demo login number. Confirm `InpExpectedServer` is the expected demo server, `InpExpectedCurrency` is `ZAR`, and `InpEnableDemoOrders` is `false`, then click **OK**.
5. Repeat on the `BTCUSDm,M15` chart. The chart should show a “waiting for a closed M15 candle” status after the EA verifies the demo account. It only checks completed candles; no valid signal may appear for a while.

If MT5 says the EA cannot initialize, remove it from the chart and verify the exact demo login/server and symbol suffixes. Never enter a trading password into the EA, config file, or chat. MT5 daily realized-loss accounting uses UTC midnight. No profitability or outcome is guaranteed.

## GoldSpoonAPlusSculkie (separate M1/M5 scalp EA)

`GoldSpoonAPlusSculkie.mq5` is a separate Expert Advisor; it does not replace or change `GoldSpoonAPlus.mq5`. It accepts M1 or M5 charts only and checks completed candles. M1 requires trend alignment on M5; M5 requires alignment on M15. Its filters combine local EMA direction/strength, higher-timeframe EMA alignment, a pullback that respects fast EMA/VWAP/recent structure, a directional low-wick confirmation with higher tick volume, an ATR-and-structure stop, and an ATR-scaled spread ceiling. It uses market orders with broker-attached stop and take-profit when explicitly enabled.

The conservative defaults are monitor-only (`InpEnableDemoOrders=false`), ZAR account-currency verification, 0.25% equity risk per order, a 1% daily realized-loss stop, one account-wide exposure, three-bar cooldown, minimum 1.5:1 reward/risk, and a 06:00–20:00 UTC session. Risk sizing uses `OrderCalcProfit`, and the margin cap uses `OrderCalcMargin` with the actual MT5 symbol contract and account leverage; position size is not a fixed USD amount or lot size. The chart displays the leverage MT5 reports, while the margin cap limits allocated margin to 20% of equity. Confirm the demo's currency and leverage in MT5 Account/Specification before any order-enabled testing. A tight scalp target does not mean a higher chance of winning; spreads, fees, slippage, gaps, and losses can erase small wins. No profitability or low-loss result is promised. Do not run this EA's order mode alongside another order-placing bot on the same account.

To try it on an M1 or M5 chart, compile `GoldSpoonAPlusSculkie.mq5` in MetaEditor (F4 from MT5, then open the source and press F7). Copy both the `.mq5` and resulting `.ex5` into MT5's data folder under `MQL5\Experts\Gold Spoon Sculkie`, refresh **Navigator → Expert Advisors**, then attach it to the matching `XAUUSDm` or `BTCUSDm` chart. Set `InpExpectedDemoLogin` to the demo login shown in MT5, verify the expected demo server and `InpExpectedCurrency=ZAR`, and leave `InpEnableDemoOrders=false` for signal-only observation. This EA is demo-only: it refuses to initialize unless MT5 reports a demo account with the exact configured login/server/currency. This code change does not install, attach, connect, or place orders.
