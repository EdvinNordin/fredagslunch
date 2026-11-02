import { getTodayLunchOptions } from "./scraper.js";

const restaurantLimit = Number.parseInt(process.env.RESTAURANT_LIMIT || "10", 10);
const itemLimitPerRestaurant = Number.parseInt(process.env.ITEM_LIMIT_PER_RESTAURANT || "3", 10);
const fridayOnly = (process.env.FRIDAY_ONLY || "true").toLowerCase() === "true";

async function main() {
  const data = await getTodayLunchOptions({
    restaurantLimit,
    itemLimitPerRestaurant,
    fridayOnly
  });

  console.log(`Date: ${data.menuDate || "unknown"}`);

  if (!data.options.length) {
    console.log("No lunch options found.");
    return;
  }

  for (const restaurant of data.options) {
    console.log(`\n${restaurant.name}`);
    for (const item of restaurant.items) {
      console.log(`- ${item}`);
    }
  }

  console.log(`\nSource: ${data.source}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
