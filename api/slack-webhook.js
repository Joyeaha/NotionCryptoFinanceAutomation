// api/slack-webhook.js

// const axios = require("axios");

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { challenge } = req.body;
    console.log(req.body);
    res.status(200).json({ challenge });
  }
  //   if (req.method === "POST") {
  //     const { event } = req.body;

  //     // 根据 Slack 消息中的内容来判断是否触发 GitHub Action
  //     if (event && event.text && event.text.includes("trigger action")) {
  //       try {
  //         // 调用 GitHub API 触发 GitHub Action
  //         const githubResponse = await axios.post(
  //           "https://api.github.com/repos/Joyeaha/NotionCryptoFinanceAutomation/actions/workflows/118112199/dispatches",
  //           {
  //             ref: "main", // 你想触发的分支
  //           },
  //           {
  //             headers: {
  //               Authorization: `Bearer ${process.env.GITHUB_ACCESS_TOKEN}`,
  //               Accept: "application/vnd.github.v3+json",
  //               "X-GitHub-Api-Version": "2022-11-28",
  //             },
  //           }
  //         );

  //         res.status(200).json({
  //           message: "GitHub Action triggered",
  //           githubResponse: githubResponse.data,
  //         });
  //       } catch (error) {
  //         console.error("Error triggering GitHub Action:", error);
  //         res.status(500).json({ error: "Failed to trigger GitHub Action" });
  //       }
  //     } else {
  //       res.status(200).json({ message: "No action triggered" });
  //     }
  //   } else {
  //     res.setHeader("Allow", ["POST"]);
  //     res.status(405).end(`Method ${req.method} Not Allowed`);
  //   }
}
