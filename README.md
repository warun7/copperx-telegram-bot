# Copperx Telegram Bot

A Telegram bot for Copperx Payout that allows users to manage their Copperx account, view balances, and make transfers directly from Telegram.

## Features

- **Authentication & Account Management**

  - User login/authentication with Copperx credentials
  - View account profile and status
  - Check KYC/KYB approval status

- **Wallet Management**

  - View all wallet balances across networks
  - Set default wallet for transactions
  - View transaction history

- **Fund Transfers**

  - Send funds to email addresses
  - Send funds to external wallet addresses
  - Withdraw funds to bank accounts
  - View last 10 transactions

- **Deposit Notifications**
  - Receive real-time deposit notifications via Pusher

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- A Telegram bot token (obtained from BotFather)

### Installation

1. Clone the repository:

   ```
   git clone https://github.com/yourusername/copperx-telegram-bot.git
   cd copperx-telegram-bot
   ```

2. Install dependencies:

   ```
   npm install
   ```

3. Create a `.env` file in the root directory with the following content:

   ```
   BOT_TOKEN=your_telegram_bot_token
   ```

4. Build the project:

   ```
   npm run build
   ```

5. Start the bot:
   ```
   npm start
   ```

### Development

To run the bot in development mode with hot reloading:

```
npm run dev
```

## Bot Commands

- `/start` - Start the bot
- `/help` - Show help message
- `/support` - Get support information
- `/login` - Login to your Copperx account
- `/logout` - Logout from your account
- `/profile` - View your profile information
- `/balance` - Check your wallet balances
- `/wallets` - List your wallets
- `/setdefault` - Set your default wallet
- `/send` - Send funds to an email
- `/withdraw` - Withdraw funds to a wallet or bank account
- `/history` - View your transaction history

## API Integration

This bot integrates with the Copperx Payout API. The complete API documentation is available at: https://income-api.copperx.io/api/doc

## Security Considerations

- The bot uses secure session management
- Authentication tokens are stored securely
- Sensitive operations require confirmation
- No plaintext passwords are stored

## Support

For support, please join the Copperx community: https://t.me/copperxcommunity/2183
