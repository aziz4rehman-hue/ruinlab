# RuinLab

> Simulate thousands of futures for your trading system before the market does it for real.
>
> **[▶ Try it live](https://aziz4rehman-hue.github.io/ruinlab/)**

Most trading calculators tell you about one trade. RuinLab tells you about the next few hundred. Enter
your win rate, reward-to-risk ratio and risk per trade, and it runs thousands of Monte Carlo
simulations to show what your account could actually go through.

No install, no server, no sign-up. Everything runs in your browser.

## What it shows

| Output | Why it matters |
|---|---|
| **Risk of ruin** | The share of simulated futures where the account falls below your "ruin" line |
| **Edge per trade** | Expectancy in R, plus the break-even win rate for your reward-to-risk ratio |
| **Equity fan chart** | 5–95% and 25–75% bands, the median path, and 40 real individual runs (ruined ones in red) |
| **Worst drawdown histogram** | How deep the pain gets in a typical run, and in a bad one |
| **Losing-streak reality check** | The exact probability of N losses in a row somewhere in your sample, so a 9-trade losing streak doesn't make you abandon a good system |
| **Kelly bet size** | The mathematically optimal risk fraction, and how far above or below it you are betting |

Four presets (Scalper, Swing, Gambler, Trend) show how different styles behave, and **Copy share
link** saves your settings in the URL.

## The lesson it teaches

The **Gambler** preset has a real, positive edge, yet about half of its futures still hit ruin
because it risks 10% per trade. Drop the risk slider to 2% and the same edge becomes survivable.
Position size matters as much as edge.

## How it works

- Each trade is a win (with your win rate) paying `risk × R`, or a loss of `risk`.
- With compounding on, risk is a % of the *current* balance. With it off, risk is a % of the *starting* balance.
- A run stops when the balance falls below the ruin line.
- Losing-streak odds are calculated exactly with dynamic programming, not simulated.

## Run it locally

Download the repo and open `index.html`, or serve the folder with any static server.

## Disclaimer

Educational tool, not financial advice. It assumes every trade is independent with a fixed win rate
and payoff. Real markets have changing conditions, correlated trades, slippage and fees.

## License

MIT
