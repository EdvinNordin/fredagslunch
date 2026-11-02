function truncateText(text, maxLen) {
  if (text.length <= maxLen) {
    return text;
  }

  return `${text.slice(0, maxLen - 1)}…`;
}

function formatDate(dateString) {
  if (!dateString) {
    return "okänd dag";
  }

  return new Date(`${dateString}T12:00:00`).toLocaleDateString("sv-SE", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

export function buildLunchSlackMessage(data) {
  const menuDateText = formatDate(data.menuDate);

  if (!data.options.length) {
    return {
      response_type: "ephemeral",
      text: `Hittade inga lunchalternativ för ${menuDateText}. Kolla ${data.source}`
    };
  }

  const lines = [];
  for (const restaurant of data.options) {
    lines.push(`*${restaurant.name}*`);

    for (const item of restaurant.items) {
      lines.push(`• ${truncateText(item, 140)}`);
    }

    lines.push("");
  }

  const body = lines.join("\n").trim();
  const fridayNote = data.fridayOnly ? "(endast fredag)" : "";
  const text = truncateText(
    `Lunchförslag för ${menuDateText} ${fridayNote}\n\n${body}\n\nKälla: ${data.source}`,
    3500
  );

  return {
    response_type: "in_channel",
    text,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text
        }
      }
    ]
  };
}

export function buildLunchPollMessage(data, voteSymbols = []) {
  const menuDateText = formatDate(data.menuDate);

  if (!data.options.length) {
    return {
      text: `Hittade inga lunchalternativ för ${menuDateText}. Kolla ${data.source}`,
      options: []
    };
  }

  const options = data.options.map((restaurant, idx) => {
    const items = Array.isArray(restaurant.items) ? restaurant.items : [];
    const mealHeadlines = items.length ? items.join(", ") : "";
    return {
      index: idx + 1,
      voteEmoji: voteSymbols[idx] || "⬜",
      restaurant: restaurant.name,
      item: mealHeadlines
    };
  });

  const lines = [
    `*Fredagslunch poll för ${menuDateText}*`,
    "Rösta med en reaktion nedan:"
  ];

  for (const option of options) {
    const suffix = option.item ? ` - ${option.item}` : "";
    lines.push(`${option.voteEmoji} *${option.restaurant}*${suffix}`);
  }

  lines.push("");
  lines.push(`Källa: ${data.source}`);

  return {
    text: lines.join("\n"),
    options
  };
}
