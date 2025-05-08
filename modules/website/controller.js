const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const Queue = require("bull");
const util = require("util");

// Convert exec to promise
const execPromise = util.promisify(exec);

// Load project configurations
const configPath = path.join(__dirname, "../../config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const buildQueue = new Queue("build-queue", {
  redis: { host: "localhost", port: 6379 }, // Update as needed for your Redis configuration
});

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

buildQueue.process(async (job, done) => {
  try {
    console.log(
      `Processing job for ${job.data.repoUrl} with branch ${job.data.branchName}`
    );
    const { repoUrl, branchName } = job.data;

    // Find project and environment configuration
    const project = findProjectByUrl(repoUrl);
    if (!project) {
      return done(new Error(`Project not found for repository: ${repoUrl}`));
    }

    const environment = findEnvironmentForBranch(project, branchName);
    if (!environment) {
      return done(new Error(`Environment not found for branch: ${branchName}`));
    }

    // Execute the deployment
    await executeDeployment(project, branchName, environment);
    done();
  } catch (error) {
    console.error(`Error processing job:`, error);
    done(error);
  }
});

const sendMessageInSlack = async (webhookUrl, title, text, color) => {
  try {
    await axios.post(webhookUrl, {
      attachments: [{ title, text, color }],
    });
  } catch (error) {
    console.error("Error sending Slack message:", error);
  }
};

// Execute a single command in the specified directory
const executeCommand = async (command, cwd, webhookUrl, projectName) => {
  try {
    // Notify command starting
    await sendMessageInSlack(
      webhookUrl,
      `Command started for ${projectName}`,
      `Executing: ${command}`,
      "#FFA500" // Orange for in-progress
    );

    // Execute command
    const { stdout, stderr } = await execPromise(command, { cwd });

    // Notify success
    await sendMessageInSlack(
      webhookUrl,
      `Command successful for ${projectName}`,
      `Command: ${command}\nOutput: ${stdout.substring(0, 500)}${
        stdout.length > 500 ? "..." : ""
      }`,
      "#7CD197" // Green for success
    );

    return { success: true, stdout, stderr };
  } catch (error) {
    // Notify failure
    await sendMessageInSlack(
      webhookUrl,
      `Command failed for ${projectName}`,
      `Command: ${command}\nError: ${error.message}`,
      "#FF0000" // Red for failure
    );

    throw error;
  }
};

// Execute all commands for a deployment
const executeDeployment = async (project, branchName, environment) => {
  const { name } = project;
  const { deployPath, commands, slackWebhookUrl } = environment;

  // Send deployment started notification
  await sendMessageInSlack(
    slackWebhookUrl,
    `Deployment Started: ${name}`,
    `Starting deployment for ${name} (${branchName}) in ${deployPath}`,
    "#FFA500" // Orange for in-progress
  );

  try {
    // Execute commands sequentially
    for (const command of commands) {
      await executeCommand(command, deployPath, slackWebhookUrl, name);
    }

    // All commands succeeded
    await sendMessageInSlack(
      slackWebhookUrl,
      `Deployment Completed: ${name}`,
      `Successfully deployed ${name} (${branchName})`,
      "#7CD197" // Green for success
    );

    return { success: true };
  } catch (error) {
    // Handle any command failures
    await sendMessageInSlack(
      slackWebhookUrl,
      `Deployment Failed: ${name}`,
      `Deployment failed for ${name} (${branchName}): ${error.message}`,
      "#FF0000" // Red for failure
    );

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

  return { branchName, repoUrl, slackMessage };
};

exports.gitPull = (req, res) => {
  const { branchName, repoUrl } = parseGithubPayload(req.body);

  if (!repoUrl) {
    return res.status(400).json({
      message: "Repository URL not found in webhook payload",
    });
  }

  // Find project configuration
  const project = findProjectByUrl(repoUrl);
  if (!project) {
    return res.status(400).json({
      message: `Project not configured for repository: ${repoUrl}`,
    });
  }

  // Find environment for the branch
  const environment = findEnvironmentForBranch(project, branchName);
  if (!environment) {
    return res.status(400).json({
      message: `Branch ${branchName} not configured for ${project.name}`,
    });
  }

  // Add to queue
  buildQueue.add({ repoUrl, branchName });
  res.status(200).json({
    message: `Deployment for ${project.name} (${branchName}) added to queue`,
  });
};

exports.rebuild = (req, res) => {
  const projectName = req.headers["x-project"] || req.body?.project;
  const branchName = req.headers["x-branch"] || req.body?.branch;

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
    buildQueue.add({ repoUrl, branchName: singleBranch });
    return res.status(200).json({
      message: `Deployment for ${projectName} (${singleBranch}) added to queue`,
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
  buildQueue.add({ repoUrl, branchName });
  res.status(200).json({
    message: `Deployment for ${projectName} (${branchName}) added to queue`,
  });
};
