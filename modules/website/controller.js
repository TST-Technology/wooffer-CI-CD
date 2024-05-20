"use strict";
const axios = require("axios");
const { exec } = require("child_process");

// Helper function to send responses to Slack
const responseInClientSlack = async (url, body) => {
  try {
    return await axios.post(url, body);
  } catch (error) {
    console.error("Slack response error:", error);
    return;
  }
};

// Helper function to send messages to Slack
const sendMessageInSlack = async (title, text, color) => {
  await responseInClientSlack(process.env.SLACK_WEBHOOK_URL, {
    attachments: [
      {
        title,
        text,
        color,
      },
    ],
  });
};

// Execute the build command
const executeBuildCommand = async () => {
  await sendMessageInSlack(`Website Build Started`, "", "#FFA500");
  exec(process.env.BUILD_COMMAND, (error, stdout, stderr) => {
    console.log("stdout: " + stdout);
    console.log("stderr: " + stderr);
    if (error) {
      console.error("exec error:", error);
      sendMessageInSlack(`Website Build Failed`, stderr, "#FF0000");
    } else {
      sendMessageInSlack(`Website Build Success`, stdout, "#7CD197");
    }
  });
};

// Handle rebuild request
exports.rebuild = async (req, res) => {
  await executeBuildCommand();
  res.status(200).json({ message: "Rebuild initiated" });
};

// Handle git pull request
exports.gitPull = async (req, res) => {
  const { branchName, slackMessage } = parseGithubPayload(req.body);

  if (branchName === process.env.TARGET_BRANCH) {
    await sendMessageInSlack(
      `Website Git pull Started`,
      slackMessage,
      "#FFA500"
    );
    exec(process.env.GIT_PULL_COMMAND, async (error, stdout, stderr) => {
      console.log("stdout: " + stdout);
      console.log("stderr: " + stderr);
      if (error) {
        console.error("exec error:", error);
        sendMessageInSlack(`Website Git pull Failed`, stderr, "#FF0000");
      } else {
        await sendMessageInSlack(`Website Git pull Success`, stdout, "#7CD197");
        if (!stdout.toString().trim().includes("Already up to date.")) {
          await executeBuildCommand();
        }
      }
    });
  } else {
    console.log(`Push to branch ${branchName} ignored.`);
  }

  res.status(200).json({ message: "Git pull processed" });
};

// Parse GitHub webhook payload
const parseGithubPayload = (payload) => {
  const branchDetails = payload?.ref?.split("/");
  const branchName = branchDetails?.[branchDetails.length - 1] || "";
  const userLoginName = payload?.sender?.login || "unknown";
  const commitMessage = payload?.head_commit?.message || "no commit message";
  const isForcePush = payload?.forced || false;

  const slackMessage = `
    Branch: ${branchName}
    Sender: ${userLoginName}
    Commit: ${commitMessage}
    ${isForcePush ? `Force Push: ${isForcePush}` : ""}
  `;

  return { branchName, slackMessage };
};
