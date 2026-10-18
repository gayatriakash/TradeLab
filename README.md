# TradeLab — Trading Strategy Simulator

This project implements the six assignment requirements in one browser application.

## Included features

1. **Trading indicators + strategy simulator**
   - Moving Average
   - Bollinger Bands
   - RSI
   - MA / RSI / Bollinger strategies
   - Simulated strategy return and trade count

2. **Firebase Authentication + Firestore**
   - Email/password registration
   - Login/logout
   - User-specific portfolio and preferences
   - Firestore persistence

3. **Multi-Asset Chart**
   - TECH, BANK, GOLD, BOND, BTC
   - Toggle assets
   - Line, bar and candlestick views
   - 50/100/150 point ranges

4. **Candlestick Pattern Recognition**
   - Hammer
   - Doji
   - Bullish Engulfing
   - Bearish Engulfing
   - Pattern filtering

5. **Advanced Portfolio Simulation**
   - Buy/sell
   - Quantity
   - Cash
   - Holdings
   - Average cost
   - Unrealized P/L
   - Trade history
   - 0.10% simulated transaction fee

6. **Analytics Dashboard**
   - Moving average
   - Volatility
   - RSI
   - Return
   - Select asset and period

## Setup

### 1. Firebase
In Firebase Console:
- Create/open your project.
- Authentication -> Sign-in method -> enable **Email/Password**.
- Firestore Database -> Create database.
- Project settings -> Your apps -> Web app.
- Copy the Firebase config into `firebase.js`.
- Publish the rules from `firestore.rules`.

### 2. Run
Do not open `index.html` directly with `file://`.

From this folder run:

```bash
python -m http.server 8000
```

Then open:

`http://localhost:8000`

## Important
This is a paper-trading educational simulator. It does not connect to a real broker and does not use real money or real market prices.
