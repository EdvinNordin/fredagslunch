const PAGE_URL = "https://umealunchguide.se/";
const FRIDAY_INDEX = 5;
const ALLOWED_RESTAURANT_KEYS = new Set([
  "olearys",
  "harlequin",
  "angelini",
  "tonkabistro",
  "ramencafe",
  "senstreetkitchen",
  "rex",
  "hornet",
  "novas",
  "sjobris",
  "tonkastrandgatan",
  "megazone",
  "clarion",
  "harriets",
  "artonnittiosju",
  "guiltypleasure",
  "orangeriet"
]);

const ALWAYS_INCLUDE_RESTAURANTS = [
  "Ramen Café",
  "Droskan",
  "Sen Street Kitchen",
];

function normalizeSpace(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeRestaurantKey(value) {
  return normalizeSpace(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function isAllowedRestaurant(name) {
  const key = normalizeRestaurantKey(name);
  for (const allowed of ALLOWED_RESTAURANT_KEYS) {
    if (key.includes(allowed)) {
      return true;
    }
  }
  return false;
}

function ensureAlwaysIncludedRestaurants(options) {
  const existingKeys = new Set(options.map((option) => normalizeRestaurantKey(option.name)));
  const result = [...options];

  for (const forcedName of ALWAYS_INCLUDE_RESTAURANTS) {
    const forcedKey = normalizeRestaurantKey(forcedName);
    if (existingKeys.has(forcedKey)) {
      continue;
    }

    result.push({
      name: forcedName,
      url: PAGE_URL,
      items: []
    });
    existingKeys.add(forcedKey);
  }

  return result;
}

function parseEmbeddedData(html) {
  const match = html.match(/window\.__data__\s*=\s*decodeURIComponent\("([\s\S]*?)"\);/);
  if (!match) {
    throw new Error("Could not find embedded lunch data on the page.");
  }

  return JSON.parse(decodeURIComponent(match[1]));
}

function parseDate(value) {
  return new Date(`${value}T12:00:00`);
}

function getFridayMenuDate(availableDates, now) {
  const today = now.toISOString().slice(0, 10);
  const fridays = availableDates
    .filter((value) => parseDate(value).getDay() === FRIDAY_INDEX)
    .sort((a, b) => a.localeCompare(b));

  if (!fridays.length) {
    return null;
  }

  if (today && fridays.includes(today)) {
    return today;
  }

  const nextFriday = fridays.find((value) => value >= today);
  return nextFriday || fridays[fridays.length - 1];
}

function collectItemsFromLunch(lunch) {
  if (!lunch || typeof lunch !== "object") {
    return [];
  }

  const items = [];

  if (Array.isArray(lunch.courses)) {
    for (const course of lunch.courses) {
      if (typeof course === "string") {
        const text = normalizeSpace(course);
        if (text) {
          items.push(text);
        }
        continue;
      }

      if (!course || typeof course !== "object") {
        continue;
      }

      const title = normalizeSpace(course.title);
      const description = normalizeSpace(course.description);

      if (!title && !description) {
        continue;
      }

      // Keep only the headline/title when available.
      items.push(title || description);
    }
  }

  if (!items.length) {
    const fallbackText = [lunch.title, lunch.description, lunch.text]
      .map((value) => normalizeSpace(value))
      .filter(Boolean)
      .join(" - ");

    if (fallbackText) {
      items.push(fallbackText);
    }
  }

  const deduped = [];
  const seen = new Set();

  for (const item of items) {
    const normalized = normalizeSpace(item);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(normalized);
    }
  }

  return deduped;
}

function toRestaurantOption(restaurant, dateKey) {
  const lunch = restaurant?.lunches?.[dateKey];
  const items = collectItemsFromLunch(lunch);

  if (!items.length) {
    return null;
  }

  const name = normalizeSpace(restaurant?.meta?.name);
  const slug = normalizeSpace(restaurant?.meta?.slug);
  const url = slug ? `${PAGE_URL}${slug}` : PAGE_URL;

  if (!name) {
    return null;
  }

  return { name, url, items };
}

export async function getTodayLunchOptions({
  fridayOnly = true
} = {}) {
  const response = await fetch(PAGE_URL, {
    headers: {
      "user-agent": "Mozilla/5.0 (compatible; SlackLunchBot/1.0)"
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch lunch page: HTTP ${response.status}`);
  }

  const html = await response.text();
  const data = parseEmbeddedData(html);

  const availableDates = Array.isArray(data?.dates?.availableDates)
    ? data.dates.availableDates
    : [];

  const now = new Date();
  let targetDate = now.toISOString().slice(0, 10);

  if (fridayOnly) {
    targetDate = getFridayMenuDate(availableDates, now);
  } else if (availableDates.length && !availableDates.includes(targetDate)) {
    targetDate = availableDates[0];
  }

  const restaurants = Array.isArray(data?.restaurants) ? data.restaurants : [];

  const options = restaurants
    .map((restaurant) => toRestaurantOption(restaurant, targetDate))
    .filter(Boolean)
    .filter((restaurant) => isAllowedRestaurant(restaurant.name));

  const optionsWithForced = ensureAlwaysIncludedRestaurants(options);

  const isFridayMenu = targetDate ? parseDate(targetDate).getDay() === FRIDAY_INDEX : false;

  return {
    source: PAGE_URL,
    fetchedAt: new Date().toISOString(),
    menuDate: targetDate,
    fridayOnly,
    isFridayMenu,
    options: optionsWithForced
  };
}
