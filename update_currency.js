import pLimit from "p-limit";
import { Client } from "@notionhq/client";
import axios from "axios";
const limit = pLimit(2);

import dotenv from "dotenv";
dotenv.config();

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const CURRENT_DATABASE_ID = process.env.CURRENT_DATABASE_ID;
const HISTORY_DATABASE_ID = process.env.HISTORY_DATABASE_ID;

async function getCryptoList() {
  const response = await notion.databases.query({
    database_id: CURRENT_DATABASE_ID,
  });

  const cryptoList = response.results.map((result) => ({
    name: result.properties.Name.title[0].plain_text,
    coinId: result.properties.id.rich_text[0].plain_text,
    pageId: result.id,
  }));

  return cryptoList;
}

// fetch prices from CoinGecko
async function getCryptoPrices(cryptoList) {
  const coinIds = cryptoList.map((crypto) => crypto.coinId).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${coinIds}&vs_currencies=usd,cny`;

  try {
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error("Error fetching prices from CoinGecko:", error);
  }
}

// update the prices of Current Database
async function updateCurrentDatabase(name, pageId, usdPrice, cnyPrice) {
  try {
    await notion.pages.update({
      page_id: pageId,
      properties: {
        "Price(USD)": {
          number: usdPrice,
        },
        "Price(CNY)": {
          number: cnyPrice,
        },
      },
    });
  } catch (error) {
    console.error(`Failed to update Current Database for ${name}:`, error);
  }
}

async function insertIntoHistoryDatabase(name, usdPrice, cnyPrice) {
  try {
    await notion.pages.create({
      parent: { database_id: HISTORY_DATABASE_ID },
      properties: {
        Name: {
          title: [{ text: { content: name } }],
        },
        "Price(USD)": {
          number: usdPrice,
        },
        "Price(CNY)": {
          number: cnyPrice,
        },
        Date: {
          date: { start: new Date().toISOString() },
        },
      },
    });
  } catch (error) {
    console.error(`Failed to insert into History Database for ${name}:`, error);
  }
}

async function main() {
  const cryptoList = await getCryptoList();
  const prices = await getCryptoPrices(cryptoList);

  const updatePromises = cryptoList.map((crypto) => {
    const { name, pageId, coinId } = crypto;
    const priceData = prices[coinId.toLowerCase()];

    if (priceData) {
      const usdPrice = priceData.usd;
      const cnyPrice = priceData.cny;

      return limit(async () => {
        await updateCurrentDatabase(name, pageId, usdPrice, cnyPrice);
        await insertIntoHistoryDatabase(name, usdPrice, cnyPrice);
        console.log(
          `Updated prices for ${name}: USD ${usdPrice}, CNY ${cnyPrice}`
        );
      });
    }
  });

  await Promise.all(updatePromises);
  console.log(
    "All records updated and history inserted with limited concurrency"
  );
}

main();
