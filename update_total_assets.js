import dotenv from "dotenv";
dotenv.config();
import { Client } from "@notionhq/client";

// Notion API client
const notion = new Client({ auth: process.env.NOTION_TOKEN });

// 获取所有 Account 数据
async function getAllAccountData() {
  const response = await notion.databases.query({
    database_id: process.env.ACCOUNT_DATABASE_ID,
  });
  return response.results;
}

async function getCurrencies() {
  const response = await notion.databases.query({
    database_id: process.env.CURRENCY_CURRENT_DATABASE_ID,
  });

  return Object.fromEntries(
    response.results.map((result) => [
      result.id,
      result.properties.Name.title[0].plain_text,
    ])
  );
}

// 统计各 Currency 的总 Amount 以及 USD 和 CNY 的总资产
async function calculateTotalAssets() {
  const accounts = await getAllAccountData();
  const currencies = await getCurrencies();
  const currencyTotals = {};
  let totalUSD = 0;
  let totalCNY = 0;

  // 遍历 Account 数据，统计 Amount 和汇率
  accounts.forEach((account) => {
    const currency = currencies[account.properties.Currency.relation[0]?.id];
    const amount = account.properties.Amount.number || 0;
    const usdPrice = account.properties["USD"].number || 0;
    const cnyPrice = account.properties["CNY"].number || 0;

    // 累加 Currency 的 Amount 总和
    if (currency) {
      currencyTotals[currency] = (currencyTotals[currency] || 0) + amount;
    }

    // 累加 USD 和 CNY 总资产
    totalUSD += usdPrice;
    totalCNY += cnyPrice;
  });

  return { currencyTotals, totalUSD, totalCNY };
}

async function calculateAndUpdateTotalAssets() {
  const { currencyTotals, totalUSD, totalCNY } = await calculateTotalAssets();
  const trendingDatabase = await notion.databases.retrieve({
    database_id: process.env.FINANCE_DATABASE_ID,
  });

  const existingProperties = trendingDatabase.properties;
  const newRecordProperties = {
    USD: {
      type: "number",
      number: totalUSD,
    },
    CNY: {
      type: "number",
      number: totalCNY,
    },
  };

  for (const [currency, totalAmount] of Object.entries(currencyTotals)) {
    if (!existingProperties[currency]) {
      console.warn(
        `Warning: Field ${currency} does not exist in Finance Trending Database. Please add it manually.`
      );
    } else {
      newRecordProperties[currency] = {
        type: "number",
        number: totalAmount,
      };
    }
  }

  await notion.pages.create({
    parent: { database_id: process.env.FINANCE_DATABASE_ID },
    properties: newRecordProperties,
  });

  console.log("Finance Trending Database updated successfully.");
}

// 主函数
async function updateFinanceTrending() {
  try {
    const { currencyTotals, totalUSD, totalCNY } = await calculateTotalAssets();
    await calculateAndUpdateTotalAssets(currencyTotals, totalUSD, totalCNY);
  } catch (error) {
    console.error("Error updating Finance Trending Database:", error);
  }
}

// 执行主函数
updateFinanceTrending().catch((error) => console.error(error));
