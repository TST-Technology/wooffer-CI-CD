const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const Queue = require("bull");

const projectsConfigPath = path.join(__dirname, "../../configs.json");
const projectsConfig = JSON.parse(fs.readFileSync(projectsConfigPath, "utf8"));

const buildQueue = new Queue("build-queue");

buildQueue.process(async (job, done) => {
  const { projectName, type } = job.data;
  const projectConfig = projectsConfig.projects[projectName];

  if (type === "git-pull") {
    await handleGitPull(projectConfig);
  } else if (type === "rebuild") {
    await handleRebuild(projectConfig);
  }

  done();
});

const sendMessageInSlack = async (slackWebhookUrl, title, text, color) => {
  await axios.post(slackWebhookUrl, {
    attachments: [{ title, text, color }],
  });
};

const handleGitPull = async (projectConfig) => {
  exec(projectConfig.gitPullCommand, async (error, stdout, stderr) => {
    if (error) {
      console.error("Git pull error:", error);
      await sendMessageInSlack(
        projectConfig.slackWebhookUrl,
        `Git pull failed for ${projectConfig.name}`,
        stderr,
        "#FF0000"
      );
    } else {
      await sendMessageInSlack(
        projectConfig.slackWebhookUrl,
        `Git pull successful for ${projectConfig.name}`,
        stdout,
        "#7CD197"
      );
      if (!stdout.toString().trim().includes("Already up to date.")) {
        await handleRebuild(projectConfig);
      }
    }
  });
};

const handleRebuild = async (projectConfig) => {
  await sendMessageInSlack(
    projectConfig.slackWebhookUrl,
    `Rebuild started for ${projectConfig.name}`,
    "",
    "#FFA500"
  );

  exec(projectConfig.buildCommand, async (error, stdout, stderr) => {
    if (error) {
      console.error("Build error:", error);
      await sendMessageInSlack(
        projectConfig.slackWebhookUrl,
        `Rebuild failed for ${projectConfig.name}`,
        stderr,
        "#FF0000"
      );
    } else {
      await sendMessageInSlack(
        projectConfig.slackWebhookUrl,
        `Rebuild successful for ${projectConfig.name}`,
        stdout,
        "#7CD197"
      );
    }
  });
};

const addBuildJobToQueue = (projectName, type) => {
  buildQueue.add({ projectName, type });
};

const parseGithubPayload = (payload) => {
  const branchDetails = payload?.ref?.split("/");
  const branchName = branchDetails?.[branchDetails.length - 1] || "";
  const userLoginName = payload?.sender?.login || "unknown";
  const isForcePush = payload?.forced || false;

  const slackMessage = `
    Branch: ${branchName}
    Sender: ${userLoginName}
    ${isForcePush ? `Force Push: ${isForcePush}` : ""}
  `;

  return { branchName, slackMessage };
};

exports.gitPull = (req, res) => {
  const projectName = req.headers["x-project"] || req.body?.project;
  const { branchName, slackMessage } = parseGithubPayload(req.body);

  const projectConfig = projectsConfig.projects[projectName];

  if (projectConfig && branchName === projectConfig.targetBranch) {
    addBuildJobToQueue(projectName, "git-pull");
    res
      .status(200)
      .json({ message: `Git pull for ${projectName} added to queue` });
  } else {
    res.status(400).json({
      message: `Branch ${branchName} not configured for ${projectName}`,
    });
  }
};

exports.rebuild = (req, res) => {
  const projectName = req.headers["x-project"] || req.body?.project;

  const projectConfig = projectsConfig.projects[projectName];

  if (projectConfig) {
    addBuildJobToQueue(projectName, "rebuild");
    res
      .status(200)
      .json({ message: `Rebuild for ${projectName} added to queue` });
  } else {
    res.status(400).json({ message: `Project ${projectName} not found` });
  }
};
