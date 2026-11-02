# Fredagslunch Slack Bot

A Slack bot that scrapes https://umealunchguide.se/ and returns lunch options for the current day.

## Features

- Slash command: `/frelunch` (posts a poll with reactions)
- Optional mention trigger: mention the bot and include the word `lunch`
- Scrapes restaurant names and menu items from Umea Lunch Guide
- Friday-only mode by default (`FRIDAY_ONLY=true`)

## 1. Create a Slack App

1. Go to https://api.slack.com/apps and click **Create New App**.
2. Enable **Socket Mode** and generate an **App-Level Token** with scope `connections:write`.
3. Under **OAuth & Permissions**, add these bot token scopes:
   - `commands`
   - `chat:write`
   - `reactions:write`
   - `app_mentions:read`
4. Install the app to your workspace and copy the **Bot User OAuth Token** (`xoxb-...`).
5. Under **Basic Information**, copy the **Signing Secret**.
6. Under **Slash Commands**, create `/frelunch`.

## 2. Configure environment

Copy `.env.example` to `.env` and fill in your values.

## 3. Install and run

```bash
npm install
npm start
```

## 4. Test the scraper without Slack

```bash
npm run scrape
```

## Notes

- The bot is Friday-only by default and returns Friday menus from the site's embedded data.
- You can set `FRIDAY_ONLY=false` in `.env` to return whatever date is current in the feed.
- Poll size can be changed with `POLL_OPTION_LIMIT` in `.env` (max 9).
