import dotenv from "dotenv";
import { App } from "@slack/bolt";
import { getTodayLunchOptions } from "./scraper.js";
import { buildLunchPollMessage, buildLunchSlackMessage } from "./format.js";

dotenv.config();

const requiredEnv = ["SLACK_BOT_TOKEN", "SLACK_SIGNING_SECRET", "SLACK_APP_TOKEN"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const useSocketMode = (process.env.SLACK_SOCKET_MODE || "true").toLowerCase() === "true";
const fridayOnly = (process.env.FRIDAY_ONLY || "true").toLowerCase() === "true";

const VOTE_REACTIONS = [
  { name: "pizza", symbol: "🍕" },
  { name: "hamburger", symbol: "🍔" },
  { name: "taco", symbol: "🌮" },
  { name: "burrito", symbol: "🌯" },
  { name: "sushi", symbol: "🍣" },
  { name: "fries", symbol: "🍟" },
  { name: "hotdog", symbol: "🌭" },
  { name: "sandwich", symbol: "🥪" },
  { name: "green_salad", symbol: "🥗" },
  { name: "spaghetti", symbol: "🍝" },
  { name: "curry", symbol: "🍛" },
  { name: "stew", symbol: "🍲" },
  { name: "ramen", symbol: "🍜" },
  { name: "meat_on_bone", symbol: "🍖" },
  { name: "poultry_leg", symbol: "🍗" },
  { name: "fish", symbol: "🐟" },
  { name: "shrimp", symbol: "🍤" },
  { name: "egg", symbol: "🥚" },
  { name: "cheese_wedge", symbol: "🧀" },
  { name: "apple", symbol: "🍎" },
  { name: "banana", symbol: "🍌" },
  { name: "grapes", symbol: "🍇" },
  { name: "strawberry", symbol: "🍓" },
  { name: "watermelon", symbol: "🍉" },
  { name: "cherries", symbol: "🍒" },
  { name: "lemon", symbol: "🍋" }
];

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: useSocketMode,
  appToken: process.env.SLACK_APP_TOKEN
});

async function fetchAndFormatLunch() {
  const data = await getTodayLunchOptions({ fridayOnly });

  return buildLunchSlackMessage(data);
}

async function fetchLunchData() {
  return getTodayLunchOptions({ fridayOnly });
}

function toSafeSlashText(message) {
  const text = (message?.text || "Kunde inte hamta lunch just nu.").trim();
  // Keep slash command payload comfortably below Slack text limits.
  return text.length > 2800 ? `${text.slice(0, 2799)}…` : text;
}

function isChannelNotFoundError(error) {
  return error?.code === "slack_webapi_platform_error" && error?.data?.error === "channel_not_found";
}

function isMissingReactionsScopeError(error) {
  return (
    error?.code === "slack_webapi_platform_error" &&
    error?.data?.error === "missing_scope" &&
    error?.data?.needed === "reactions:write"
  );
}

function isInvalidReactionNameError(error) {
  return error?.code === "slack_webapi_platform_error" && error?.data?.error === "invalid_name";
}

app.command("/frelunch", async ({ ack, respond, command, client }) => {
  await ack();

  try {
    const data = await fetchLunchData();
    const poll = buildLunchPollMessage(
      data,
      VOTE_REACTIONS.map((reaction) => reaction.symbol)
    );

    if (!poll.options.length) {
      await respond({
        response_type: "ephemeral",
        text: toSafeSlashText({ text: poll.text })
      });
      return;
    }

    if (poll.options.length > VOTE_REACTIONS.length) {
      await respond({
        response_type: "ephemeral",
        text:
          "För många restauranger för en enda omröstning. " +
          `Max med unika reaktioner är ${VOTE_REACTIONS.length}.`
      });
      return;
    }

    let post;

    try {
      post = await client.chat.postMessage({
        channel: command.channel_id,
        text: poll.text,
        unfurl_links: false,
        unfurl_media: false
      });
    } catch (postError) {
      if (isChannelNotFoundError(postError)) {
        await respond({
          response_type: "in_channel",
          text:
            `${toSafeSlashText({ text: poll.text })}\n\n` +
            "Obs: Jag kunde inte posta med bot-token i denna kanal, så reaktionsröstning lades inte till. " +
            "Bjud in appen till kanalen och försök igen för automatisk reaktionspoll."
        });
        return;
      }

      throw postError;
    }

    try {
      for (let i = 0; i < poll.options.length; i += 1) {
        await client.reactions.add({
          channel: command.channel_id,
          timestamp: post.ts,
          name: VOTE_REACTIONS[i].name
        });
      }
    } catch (reactionError) {
      if (isMissingReactionsScopeError(reactionError)) {
        console.warn("Missing reactions:write scope. Poll posted without reaction voting.");
        await respond({
          response_type: "ephemeral",
          text:
            "Pollen postades, men jag kan inte lägga till röstningsreaktioner. " +
            "Lägg till `reactions:write` under OAuth & Permissions och reinstallera appen."
        });
        return;
      }

      if (isInvalidReactionNameError(reactionError)) {
        console.warn("One or more reaction names were rejected by Slack.", reactionError?.data);
        await respond({
          response_type: "ephemeral",
          text:
            "Pollen postades men en emoji kunde inte läggas till automatiskt. " +
            "Uppdatera appen till senaste kod och försök igen."
        });
        return;
      }

      throw reactionError;
    }
  } catch (error) {
    console.error("/frelunch failed:", error);

    try {
      await respond({
        response_type: "ephemeral",
        text: "Kunde inte hämta lunch just nu. Forsök igen om en stund."
      });
    } catch (respondError) {
      console.error("/frelunch fallback respond failed:", {
        message: respondError?.message,
        status: respondError?.response?.status,
        data: respondError?.response?.data
      });
    }
  }
});

app.event("app_mention", async ({ event, say }) => {
  const text = event.text?.toLowerCase() || "";
  if (!text.includes("lunch")) {
    return;
  }

  try {
    const message = await fetchAndFormatLunch();
    await say({ text: message.text, blocks: message.blocks });
  } catch (error) {
    console.error("app_mention failed:", error);
    await say("Kunde inte hamta lunch just nu.");
  }
});

(async () => {
  const port = Number.parseInt(process.env.PORT || "3000", 10);

  if (useSocketMode) {
    await app.start();
    console.log("Slack lunch bot is running in Socket Mode.");
  } else {
    await app.start(port);
    console.log(`Slack lunch bot is running on port ${port}.`);
  }
})();
