const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const util = require("util");
const moment = require("moment");

// Convert exec to promise
const execPromise = util.promisify(exec);

// Load project configurations
const configPath = path.join(__dirname, "../../config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

// In-memory job queue
const jobQueue = [];
let isProcessing = false;

// Helper function to find project by URL
function findProjectByUrl(repoUrl) {
  // Normalize URL by removing any trailing .git
  const normalizedUrl = repoUrl.replace(/\.git$/, "");
  return config[normalizedUrl];
}

// Helper function to find project by name
function findProjectByName(name) {
  // Search through all projects to find one with matching name
  for (const url in config) {
    const project = config[url];
    if (project.name === name) {
      return { project, url };
    }
  }
  return null;
}

// Helper function to find environment configuration for a branch
function findEnvironmentForBranch(project, branchName) {
  return project.environments[branchName];
}

// Helper function to get all available branches for a project
function getAvailableBranches(project) {
  return Object.keys(project.environments);
}

// Add job to queue
function addJobToQueue(job) {
  console.log(`Adding job to queue: ${job.repoUrl} (${job.branchName})`);

  // Add timestamp and trigger info
  job.timestamp = moment().format("YYYY-MM-DD HH:mm:ss");

  jobQueue.push(job);

  // Start processing if not already in progress
  if (!isProcessing) {
    processNextJob();
  }

  return { position: jobQueue.length };
}

// Process next job in queue
async function processNextJob() {
  if (jobQueue.length === 0) {
    isProcessing = false;
    return;
  }

  isProcessing = true;
  const job = jobQueue.shift();

  try {
    console.log(
      `Processing job for ${job.repoUrl} with branch ${job.branchName}`
    );

    // Find project and environment configuration
    const project = findProjectByUrl(job.repoUrl);
    if (!project) {
      console.error(`Project not found for repository: ${job.repoUrl}`);
      processNextJob();
      return;
    }

    const environment = findEnvironmentForBranch(project, job.branchName);
    if (!environment) {
      console.error(`Environment not found for branch: ${job.branchName}`);
      processNextJob();
      return;
    }

    // Execute the deployment
    await executeDeployment(project, job.branchName, environment, job);

    // Process next job
    processNextJob();
  } catch (error) {
    console.error(`Error processing job:`, error);
    processNextJob();
  }
}

const sendMessageInSlack = async (webhookUrl, payload) => {
  try {
    await axios.post(webhookUrl, payload);
  } catch (error) {
    console.error("Error sending Slack message:", error);
  }
};

// Execute a single command in the specified directory
const executeCommand = async (
  command,
  cwd,
  webhookUrl,
  projectName,
  deploymentInfo
) => {
  try {
    // Execute command without Slack notification
    console.log(`Executing command: ${command} in ${cwd}`);
    const { stdout, stderr } = await execPromise(command, { cwd });
    console.log(`Command succeeded: ${command}`);

    return { success: true, stdout, stderr };
  } catch (error) {
    console.error(`Command failed: ${command}`, error);

    // Send notification for failed command with detailed information
    await sendMessageInSlack(webhookUrl, {
      attachments: [
        {
          color: "#FF0000", // Red for failure
          title: `⚠️ Command Failed During Deployment`,
          text: `A command failed while deploying ${projectName}`,
          fields: [
            {
              title: "Failed Command",
              value: command,
            },
            {
              title: "Error Message",
              value: error.message,
            },
            {
              title: "Directory",
              value: cwd,
            },
          ],
          footer: "Wooffer CI/CD",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });

    throw error;
  }
};

// Execute all commands for a deployment
const executeDeployment = async (project, branchName, environment, job) => {
  const { name } = project;
  const { deployPath, commands, slackWebhookUrl } = environment;
  const triggeredBy = job.triggeredBy || "Unknown";
  const timestamp = job.timestamp || moment().format("YYYY-MM-DD HH:mm:ss");

  // Send deployment started notification with comprehensive information
  await sendMessageInSlack(slackWebhookUrl, {
    attachments: [
      {
        color: "#FFA500", // Orange for in-progress
        title: `🚀 Deployment Started: ${name}`,
        text: `Starting deployment for ${name} (${branchName})`,
        fields: [
          {
            title: "Project",
            value: name,
            short: true,
          },
          {
            title: "Branch",
            value: branchName,
            short: true,
          },
          {
            title: "Triggered By",
            value: triggeredBy,
            short: true,
          },
          {
            title: "Time Started",
            value: timestamp,
            short: true,
          },
        ],
        footer: "Wooffer CI/CD",
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  });

  try {
    // Execute commands sequentially without individual notifications
    for (const command of commands) {
      await executeCommand(command, deployPath, slackWebhookUrl, name);
    }

    // Only send notification upon successful completion of all commands
    await sendMessageInSlack(slackWebhookUrl, {
      attachments: [
        {
          color: "#7CD197", // Green for success
          title: `✅ Deployment Completed: ${name}`,
          text: `Successfully deployed ${name} (${branchName})`,
          fields: [
            {
              title: "Project",
              value: name,
              short: true,
            },
            {
              title: "Branch",
              value: branchName,
              short: true,
            },
            {
              title: "Triggered By",
              value: triggeredBy,
              short: true,
            },
            {
              title: "Time Completed",
              value: moment().format("YYYY-MM-DD HH:mm:ss"),
              short: true,
            },
            {
              title: "Duration",
              value:
                moment().diff(
                  moment(timestamp, "YYYY-MM-DD HH:mm:ss"),
                  "minutes"
                ) + " minutes",
              short: true,
            },
          ],
          footer: "Wooffer CI/CD",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });

    return { success: true };
  } catch (error) {
    // No additional failure notification - the individual command failure is enough
    console.error(`Deployment failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

const parseGithubPayload = (payload) => {
  const branchDetails = payload?.ref?.split("/");
  const branchName = branchDetails?.[branchDetails.length - 1] || "";
  const repoUrl = payload?.repository?.html_url || "";
  const userLoginName = payload?.sender?.login || "unknown";
  const isForcePush = payload?.forced || false;

  const slackMessage = `
    Repository: ${repoUrl}
    Branch: ${branchName}
    Sender: ${userLoginName}
    ${isForcePush ? `Force Push: ${isForcePush}` : ""}
  `;

  return { branchName, repoUrl, slackMessage, triggeredBy: userLoginName };
};

exports.gitPull = (req, res) => {
  const { branchName, repoUrl, triggeredBy } = parseGithubPayload(req.body);

  console.log(branchName, repoUrl);

  if (!repoUrl) {
    return res.status(400).json({
      message: "Repository URL not found in webhook payload",
    });
  }

  // Find project configuration
  const project = findProjectByUrl(repoUrl);
  console.log(project);
  if (!project) {
    return res.status(400).json({
      message: `Project not configured for repository: ${repoUrl}`,
    });
  }

  // Find environment for the branch
  const environment = findEnvironmentForBranch(project, branchName);
  console.log(environment);
  if (!environment) {
    return res.status(400).json({
      message: `Branch ${branchName} not configured for ${project.name}`,
    });
  }

  // Add to queue
  const jobInfo = addJobToQueue({ repoUrl, branchName, triggeredBy });
  res.status(200).json({
    message: `Deployment for ${project.name} (${branchName}) added to queue at position ${jobInfo.position}`,
  });
};

exports.rebuild = (req, res) => {
  const projectName = req.headers["x-project"] || req.body?.project;
  const branchName = req.headers["x-branch"] || req.body?.branch;
  const triggeredBy =
    req.headers["x-triggered-by"] || req.body?.triggeredBy || "Manual Trigger";

  if (!projectName) {
    return res.status(400).json({
      message: "Project name is required",
    });
  }

  // Find project configuration
  const result = findProjectByName(projectName);
  if (!result) {
    return res.status(400).json({
      message: `Project ${projectName} not found`,
    });
  }

  const { project, url: repoUrl } = result;
  const availableBranches = getAvailableBranches(project);

  // If branch is not specified but project has only one environment, use that
  if (!branchName && availableBranches.length === 1) {
    const singleBranch = availableBranches[0];
    const jobInfo = addJobToQueue({
      repoUrl,
      branchName: singleBranch,
      triggeredBy,
    });
    return res.status(200).json({
      message: `Deployment for ${projectName} (${singleBranch}) added to queue at position ${jobInfo.position}`,
    });
  }

  // Branch name is required if project has multiple environments
  if (!branchName) {
    return res.status(400).json({
      message: `Branch name is required. Available branches: ${availableBranches.join(
        ", "
      )}`,
    });
  }

  // Find environment for the branch
  const environment = findEnvironmentForBranch(project, branchName);
  if (!environment) {
    return res.status(400).json({
      message: `Branch ${branchName} not configured for ${projectName}. Available branches: ${availableBranches.join(
        ", "
      )}`,
    });
  }

  // Add to queue
  const jobInfo = addJobToQueue({ repoUrl, branchName, triggeredBy });
  res.status(200).json({
    message: `Deployment for ${projectName} (${branchName}) added to queue at position ${jobInfo.position}`,
  });
};
