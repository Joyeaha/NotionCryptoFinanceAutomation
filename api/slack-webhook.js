// api/slack-webhook.js

export default async function handler(req, res) {
  if (req.method === "POST") {
    const { type } = req.body;
    if (type === "url_verification") {
      const { challenge } = req.body;
      res.status(200).json({ challenge });
    } else if (type === "event_callback") {
      const { event } = req.body;
      if (
        event.type === "message" &&
        (event.channel_type === "im" ||
          event.channel === process.env.SLACK_CHANNEL_ID) &&
        event.bot_profile?.name === "Notion" &&
        event.text?.includes("Update Account")
      ) {
        triggerGithubWorkflow()
          .then((data) => res.status(200).json(data))
          .catch((error) => {
            res.status(500).json({
              error,
            });
          });
      } else {
        res.status(200).json({
          message: "No action triggered",
        });
      }
    } else {
      res.status(404).end();
    }
  } else {
    res.status(404).end();
  }
}

async function triggerGithubWorkflow() {
  // 调用 GitHub API 触发 GitHub Action
  const githubResponse = await fetch(
    "https://api.github.com/repos/Joyeaha/NotionCryptoFinanceAutomation/actions/workflows/118112199/dispatches",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.GITHUB_ACCESS_TOKEN}`,
        Accept: "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        ref: "main",
      }),
    }
  );

  if (!githubResponse.ok) {
    throw new Error(
      `GitHub API responded with status ${githubResponse.status}`
    );
  }
  return {
    message: "GitHub Action triggered",
  };
}
