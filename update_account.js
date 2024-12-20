import dotenv from "dotenv";
dotenv.config();

import { Client } from "@notionhq/client";
import pLimit from "p-limit";

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const TRADE_DATABASE_ID = process.env.TRADE_DATABASE_ID;
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

async function getTradeTransactions() {
  const tradeResponse = await notion.databases.query({
    database_id: TRADE_DATABASE_ID,
  });
  return tradeResponse.results;
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

async function processWalletTransactions(accountAmounts) {
  const walletTransactions = await getWalletTransactions();

  for (const transaction of walletTransactions) {
    const action = transaction.properties.Action.select.name;
    const fromAccount = transaction.properties.From.relation[0]?.id;
    const toAccount = transaction.properties.To.relation[0]?.id;
    const amount = transaction.properties.Amount.number;
    const toAmount = transaction.properties.toAmount.number;
    const fee = transaction.properties.Fee.relation[0]?.id;
    const feeAmount = transaction.properties.feeAmount.number;

    if (action === "EXCHANGE") {
      if (fromAccount)
        accountAmounts[fromAccount] =
          (accountAmounts[fromAccount] || 0) - amount;
      if (toAccount)
        accountAmounts[toAccount] =
          (accountAmounts[toAccount] || 0) + (toAmount ?? amount);
    } else if (action === "IN") {
      if (toAccount)
        accountAmounts[toAccount] = (accountAmounts[toAccount] || 0) + amount;
    } else if (action === "OUT") {
      if (fromAccount)
        accountAmounts[fromAccount] =
          (accountAmounts[fromAccount] || 0) - amount;
    }

    if (fee && feeAmount) {
      accountAmounts[fee] = (accountAmounts[fee] || 0) - feeAmount;
    }
  }
  console.log("Wallet transactions processed successfully.");
}

async function processTradeTransactions(accountAmounts) {
  const tradeTransactions = await getTradeTransactions();

  for (const trade of tradeTransactions) {
    const baseAccount = trade.properties.Base?.relation?.[0]?.id;
    const assetAccount = trade.properties.Asset?.relation?.[0]?.id;
    const type = trade.properties.Type.select.name;

    if (type === "Spot") {
      const action = trade.properties["Action"].select.name;
      const amount = trade.properties.Amount.number;
      const fee = trade.properties.fee.relation[0]?.id;
      const feeAmount = trade.properties.feeAmount?.number || 0;
      const price = trade.properties["Start Price"].number;

      if (action === "Buy") {
        if (assetAccount)
          accountAmounts[assetAccount] =
            (accountAmounts[assetAccount] || 0) + amount;
        if (baseAccount)
          accountAmounts[baseAccount] =
            (accountAmounts[baseAccount] || 0) - price * amount;
      } else if (action === "Sell") {
        if (baseAccount)
          accountAmounts[baseAccount] =
            (accountAmounts[baseAccount] || 0) + price * amount;
        if (assetAccount)
          accountAmounts[assetAccount] =
            (accountAmounts[assetAccount] || 0) - amount;
      }

      if (fee && feeAmount) {
        accountAmounts[fee] = (accountAmounts[fee] || 0) - feeAmount;
      }
    } else if (type === "Perp") {
      const win = trade.properties.Win.number;
      if (baseAccount)
        accountAmounts[baseAccount] = (accountAmounts[baseAccount] || 0) + win;
    }
  }

  console.log("Trade transactions processed successfully.");
}

export async function updateAllAccounts() {
  const currencyPrices = await getCurrencyPrices();
  const allAccounts = await getAllAccounts();

  const accountAmounts = {};
  await processWalletTransactions(accountAmounts);
  await processTradeTransactions(accountAmounts);

  await Promise.all(
    allAccounts.map((account) =>
      limit(() =>
        calculateAndUpdateAccount(account, accountAmounts, currencyPrices)
      )
    )
  );
  console.log("Account database updated successfully.");
}

updateAllAccounts().catch((error) => console.error(error));
