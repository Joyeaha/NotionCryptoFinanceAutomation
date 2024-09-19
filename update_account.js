import dotenv from "dotenv";
dotenv.config();

import { Client } from "@notionhq/client";
import pLimit from "p-limit";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const WALLET_DATABASE_ID = process.env.WALLET_DATABASE_ID;
const ACCOUNT_DATABASE_ID = process.env.ACCOUNT_DATABASE_ID;
const CURRENCY_CURRENT_DATABASE_ID = process.env.CURRENCY_CURRENT_DATABASE_ID;

const limit = pLimit(5);

async function getWalletTransactions() {
  const walletResponse = await notion.databases.query({
    database_id: WALLET_DATABASE_ID,
  });
  return walletResponse.results;
}

async function getCurrencyPrices() {
  const currencyResponse = await notion.databases.query({
    database_id: CURRENCY_CURRENT_DATABASE_ID,
  });

  const prices = {};
  currencyResponse.results.forEach((record) => {
    const id = record.id;
    const usdPrice = record.properties["Price(USD)"].number;
    const cnyPrice = record.properties["Price(CNY)"].number;

    prices[id] = { usdPrice, cnyPrice };
  });

  return prices;
}

async function getAllAccounts() {
  const accountResponse = await notion.databases.query({
    database_id: ACCOUNT_DATABASE_ID,
  });
  return accountResponse.results;
}

async function updateAccount(accountId, amount, usdPrice, cnyPrice) {
  await notion.pages.update({
    page_id: accountId,
    properties: {
      Amount: { number: amount },
      USD: { number: usdPrice },
      CNY: { number: cnyPrice },
    },
  });
}

async function calculateAndUpdateAccount(
  account,
  accountAmounts,
  currencyPrices
) {
  const accountId = account.id;
  const currencyRelation = account.properties.Currency.relation[0]?.id;

  if (!currencyRelation) return;

  const usdPrice = currencyPrices[currencyRelation].usdPrice ?? 0;
  const cnyPrice = currencyPrices[currencyRelation].cnyPrice ?? 0;

  const accountAmount = accountAmounts[accountId] || 0;

  await updateAccount(
    accountId,
    accountAmount,
    usdPrice * accountAmount,
    cnyPrice * accountAmount
  );
}

async function processWalletTransactions() {
  const walletTransactions = await getWalletTransactions();
  const currencyPrices = await getCurrencyPrices();
  const allAccounts = await getAllAccounts();

  const accountAmounts = {};

  for (const transaction of walletTransactions) {
    const action = transaction.properties.Action.select.name;
    const fromAccount = transaction.properties.From.relation[0]?.id;
    const toAccount = transaction.properties.To.relation[0]?.id;
    const amount = transaction.properties.Amount.number;

    if (action === "EXCHANGE") {
      if (fromAccount)
        accountAmounts[fromAccount] =
          (accountAmounts[fromAccount] || 0) - amount;
      if (toAccount)
        accountAmounts[toAccount] = (accountAmounts[toAccount] || 0) + amount;
    } else if (action === "IN") {
      if (toAccount)
        accountAmounts[toAccount] = (accountAmounts[toAccount] || 0) + amount;
    } else if (action === "OUT") {
      if (fromAccount)
        accountAmounts[fromAccount] =
          (accountAmounts[fromAccount] || 0) - amount;
    }
  }

  await Promise.all(
    allAccounts.map((account) =>
      limit(() =>
        calculateAndUpdateAccount(account, accountAmounts, currencyPrices)
      )
    )
  );

  console.log("Account database updated successfully.");
}

processWalletTransactions().catch((error) => console.error(error));
