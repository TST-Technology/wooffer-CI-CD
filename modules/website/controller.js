const axios = require("axios");
const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");
const util = require("util");
const moment = require("moment");
const os = require("os");

// Convert exec to promise
const execPromise = util.promisify(exec);

// Load project configurations
const configPath = path.join(__dirname, "../../config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

// Default logging settings
const defaultLogSettings = {
  detailedLog: false, // By default, detailed logging is disabled
};

// In-memory job queue
const jobQueue = [];
let isProcessing = false;

// Function for standardized console logging
function logInfo(prefix, message) {
  const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");
  console.log(`[${timestamp}] [INFO] [${prefix}] ${message}`);
}

function logError(prefix, message) {
  const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");
  console.error(`[${timestamp}] [ERROR] [${prefix}] ${message}`);
}

function logCommand(
  project,
  branch,
  command,
  output,
  isError = false,
  enableDetailedLog = false
) {
  // Skip detailed command logging if not enabled
  if (!enableDetailedLog && !isError) {
    // Always log a summary even when detailed logging is disabled
    const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");
    const logMethod = console.log;
    logMethod(
      `[${timestamp}] [SUMMARY] [${project}/${branch}] Command: ${command} - Completed ${
        isError ? "with errors" : "successfully"
      }`
    );
    return;
  }

  const timestamp = moment().format("YYYY-MM-DD HH:mm:ss");
  const logPrefix = `${project}/${branch}`;
  const logMethod = isError ? console.error : console.log;

  logMethod(`\n${"=".repeat(80)}`);
  logMethod(
    `[${timestamp}] [${
      isError ? "ERROR" : "OUTPUT"
    }] [${logPrefix}] Command: ${command}`
  );
  logMethod(`${"-".repeat(80)}`);
  logMethod(output);
  logMethod(`${"=".repeat(80)}\n`);
}

// Function to get logging configuration for a project/environment
function getLogSettings(project, branchName) {
  // Check if project has logging settings
  if (!project || !project.environments || !project.environments[branchName]) {
    return defaultLogSettings;
  }

  const environment = project.environments[branchName];

  // Check if environment has logging settings
  if (!environment.logSettings) {
    return defaultLogSettings;
  }

  return {
    ...defaultLogSettings,
    ...environment.logSettings,
  };
}

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
  logInfo("Queue", `Adding job to queue: ${job.repoUrl} (${job.branchName})`);

  // Add timestamp and trigger info
  job.timestamp = moment().format("YYYY-MM-DD HH:mm:ss");

  // Find project and environment configuration for Slack notification
  const project = findProjectByUrl(job.repoUrl);
  if (!project) {
    logError("Queue", `Project not found for repository: ${job.repoUrl}`);
    return { position: -1 };
  }

  const environment = findEnvironmentForBranch(project, job.branchName);
  if (!environment) {
    logError("Queue", `Environment not found for branch: ${job.branchName}`);
    return { position: -1 };
  }

  jobQueue.push(job);
  const queuePosition = jobQueue.length;

  logInfo("Queue", `Job added at position ${queuePosition}`);

  // If there's already a job running or other jobs in the queue, send a queued notification
  if (isProcessing || queuePosition > 1) {
    sendQueuedNotification(
      project,
      job.branchName,
      environment,
      job,
      queuePosition
    );
  }

  // Start processing if not already in progress
  if (!isProcessing) {
    processNextJob();
  }

  return { position: queuePosition };
}

// Send queued notification to Slack
async function sendQueuedNotification(
  project,
  branchName,
  environment,
  job,
  position
) {
  const { name } = project;
  const { slackWebhookUrl } = environment;
  const triggeredBy = job.triggeredBy || "Unknown";
  const timestamp = job.timestamp || moment().format("YYYY-MM-DD HH:mm:ss");
  const jobsAhead = position - 1;

  logInfo(
    "Notification",
    `Sending queued notification for ${name}/${branchName}`
  );

  // Send queued notification with queue position
  await sendMessageInSlack(slackWebhookUrl, {
    attachments: [
      {
        color: "#808080", // Gray for queued
        title: `⏳ Deployment Queued: ${name}`,
        text: `Deployment for ${name} (${branchName}) has been queued${
          jobsAhead > 0
            ? ` at position #${position} (${jobsAhead} ${
                jobsAhead === 1 ? "job" : "jobs"
              } ahead)`
            : ""
        }`,
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
            title: "Time Queued",
            value: timestamp,
            short: true,
          },
          {
            title: "Status",
            value: "Queued",
            short: true,
          },
        ],
        footer: "Wooffer CI/CD",
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  });
}

// Process next job in queue
async function processNextJob() {
  if (jobQueue.length === 0) {
    isProcessing = false;
    logInfo("Queue", "No more jobs in queue. Processing complete.");
    return;
  }

  isProcessing = true;
  const job = jobQueue.shift();

  try {
    logInfo(
      "Processing",
      `Starting job for ${job.repoUrl} (${job.branchName})`
    );

    // Find project and environment configuration
    const project = findProjectByUrl(job.repoUrl);
    if (!project) {
      logError(
        "Processing",
        `Project not found for repository: ${job.repoUrl}`
      );
      processNextJob();
      return;
    }

    const environment = findEnvironmentForBranch(project, job.branchName);
    if (!environment) {
      logError(
        "Processing",
        `Environment not found for branch: ${job.branchName}`
      );
      processNextJob();
      return;
    }

    // Execute the deployment
    await executeDeployment(project, job.branchName, environment, job);

    // Process next job automatically
    processNextJob();
  } catch (error) {
    logError("Processing", `Error processing job: ${error.message}`);
    // Process next job even if there's an error
    processNextJob();
  }
}

const sendMessageInSlack = async (webhookUrl, payload) => {
  // Return early if webhook URL is not valid
  if (
    !webhookUrl ||
    typeof webhookUrl !== "string" ||
    !webhookUrl.startsWith("http")
  ) {
    logInfo(
      "Slack",
      "Skipping Slack notification: Invalid or missing webhook URL"
    );
    return;
  }

  try {
    await axios.post(webhookUrl, payload, {
      timeout: 120000, // 120 second timeout to prevent long waits
      headers: {
        "Content-Type": "application/json",
      },
    });
    logInfo("Slack", "Notification sent successfully");
  } catch (error) {
    // Log the error but don't throw it - allow the pipeline to continue
    logError("Slack", `Error sending Slack message: ${error.message}`);
    logInfo(
      "Slack",
      "Continuing deployment despite Slack notification failure"
    );
  }
};

// Execute a single command in the specified directory
const executeCommand = async (
  command,
  cwd,
  webhookUrl,
  projectName,
  branchName
) => {
  // Get logging settings
  const project = findProjectByName(projectName)?.project;
  const logSettings = getLogSettings(project, branchName);
  const enableDetailedLog = logSettings.detailedLog === true;

  if (enableDetailedLog) {
    logInfo(
      `${projectName}/${branchName}`,
      `Detailed logging is enabled for this environment`
    );
  }

  try {
    const windir = process.env.windir || "C:\\Windows";
    if (command.includes("%windir%")) {
      command = command.replace(/%windir%/gi, windir);
    }

    logInfo(
      `${projectName}/${branchName}`,
      `Executing command: ${command} in ${cwd}`
    );

    const platform = os.platform();
    let result;
    let commandOutput = "";

    if (platform === "win32") {
      try {
        const timestamp = Date.now();
        const tempBatchPath = path.join(
          os.tmpdir(),
          `wooffer_elevated_${timestamp}.bat`
        );
        const logPath = path.join(
          os.tmpdir(),
          `wooffer_output_${timestamp}.log`
        );

        const batchContent = `@echo off
cd /d "${cwd}"
${command} > "${logPath}" 2>&1
exit /b %errorlevel%`;

        fs.writeFileSync(tempBatchPath, batchContent);

        // Use System32\cmd.exe instead of Sysnative (since you're on 64-bit Node.js)
        const cmd = `${windir}\\System32\\cmd.exe`;
        await execPromise(
          `powershell Start-Process "${cmd}" -ArgumentList '/c "${tempBatchPath}"' -Verb RunAs`
        );

        try {
          commandOutput = await waitForLogFile(logPath);
          logCommand(
            projectName,
            branchName,
            command,
            commandOutput,
            false,
            enableDetailedLog
          );
        } catch (readErr) {
          logError(
            projectName,
            branchName,
            `Failed to read log file: ${readErr.message}`
          );
        }

        try {
          fs.unlinkSync(tempBatchPath);
          fs.unlinkSync(logPath);
        } catch (cleanupError) {
          logError(
            projectName,
            branchName,
            `Failed to remove temporary files: ${cleanupError.message}`
          );
        }
      } catch (elevationError) {
        logError(
          `${projectName}/${branchName}`,
          `Failed to elevate command on Windows: ${elevationError.message}`
        );

        try {
          const timestamp = Date.now();
          const vbsPath = path.join(
            os.tmpdir(),
            `wooffer_elevated_${timestamp}.vbs`
          );
          const batchPath = path.join(
            os.tmpdir(),
            `wooffer_command_${timestamp}.bat`
          );
          const logPath = path.join(
            os.tmpdir(),
            `wooffer_output_${timestamp}.log`
          );

          const batchContent = `@echo off
cd /d "${cwd}"
${command} > "${logPath}" 2>&1
exit /b %errorlevel%`;

          const vbsContent = `Set UAC = CreateObject("Shell.Application")
UAC.ShellExecute "${batchPath}", "", "", "runas", 1
WScript.Sleep 10000`;

          fs.writeFileSync(batchPath, batchContent);
          fs.writeFileSync(vbsPath, vbsContent);

          await execPromise(`cscript //nologo "${vbsPath}"`);

          try {
            commandOutput = await waitForLogFile(logPath);
            logCommand(
              projectName,
              branchName,
              command,
              commandOutput,
              false,
              enableDetailedLog
            );
          } catch (readErr) {
            logError(
              projectName,
              branchName,
              `Failed to read log file: ${readErr.message}`
            );
          }

          try {
            fs.unlinkSync(vbsPath);
            fs.unlinkSync(batchPath);
            fs.unlinkSync(logPath);
          } catch (cleanupError) {
            logError(
              projectName,
              branchName,
              `Failed to remove temporary files: ${cleanupError.message}`
            );
          }
        } catch (vbsError) {
          logError(
            `${projectName}/${branchName}`,
            `Failed second elevation attempt on Windows: ${vbsError.message}`
          );

          result = await execPromise(command, { cwd });

          if (result.stdout)
            logCommand(
              projectName,
              branchName,
              command,
              result.stdout,
              false,
              enableDetailedLog
            );
          if (result.stderr)
            logCommand(
              projectName,
              branchName,
              command,
              result.stderr,
              true,
              enableDetailedLog
            );
        }
      }
    } else {
      result = await execPromise(command, { cwd });

      if (result.stdout)
        logCommand(
          projectName,
          branchName,
          command,
          result.stdout,
          false,
          enableDetailedLog
        );
      if (result.stderr)
        logCommand(
          projectName,
          branchName,
          command,
          result.stderr,
          result.stderr.length > 0,
          enableDetailedLog
        );
    }

    logInfo(
      `${projectName}/${branchName}`,
      `Command completed successfully: ${command}`
    );
    if (enableDetailedLog) {
      logInfo(
        `${projectName}/${branchName}`,
        `Command output:\n${commandOutput || result?.stdout || "[No Output]"}`
      );
    }

    return {
      success: true,
      stdout: commandOutput || result?.stdout || "",
      stderr: result?.stderr || "",
    };
  } catch (error) {
    logError(
      `${projectName}/${branchName}`,
      `Command failed: ${command}\nError: ${error.message}`
    );

    const isPermissionError =
      error.message.includes("Access is denied") ||
      error.message.includes("permission denied") ||
      error.message.includes("EPERM") ||
      error.message.includes("EACCES") ||
      error.message.includes("elevated privileges required");

    const errorMessage = isPermissionError
      ? `Permission error: This command requires elevated privileges. Please ensure the CI/CD service has appropriate permissions.`
      : error.message;

    logError(`${projectName}/${branchName}`, `Error details: ${errorMessage}`);

    try {
      await sendMessageInSlack(webhookUrl, {
        attachments: [
          {
            color: "#FF0000",
            title: `⚠️ Command Failed During Deployment`,
            text: `A command failed while deploying ${projectName}`,
            fields: [
              { title: "Failed Command", value: command },
              { title: "Error Message", value: errorMessage },
              { title: "Directory", value: cwd },
              ...(isPermissionError
                ? [
                    {
                      title: "Recommendation",
                      value: `Run the CI/CD service with administrator privileges or modify the command to use appropriate elevation.`,
                    },
                  ]
                : []),
            ],
            footer: "Wooffer CI/CD",
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      });
    } catch (notificationError) {
      logError(
        `${projectName}/${branchName}`,
        `Failed to send error notification: ${notificationError.message}`
      );
    }

    throw error;
  }
};

// Execute all commands for a deployment
const executeDeployment = async (project, branchName, environment, job) => {
  const { name } = project;
  const { deployPath, commands, slackWebhookUrl } = environment;
  const triggeredBy = job.triggeredBy || "Unknown";
  const timestamp = job.timestamp || moment().format("YYYY-MM-DD HH:mm:ss");

  // Check logging settings
  const logSettings = getLogSettings(project, branchName);
  const detailedLog = logSettings.detailedLog === true;

  logInfo(
    `${name}/${branchName}`,
    `Starting deployment for ${name} (${branchName})`
  );
  if (detailedLog) {
    logInfo(
      `${name}/${branchName}`,
      `Detailed logging is enabled for this deployment`
    );
  } else {
    logInfo(
      `${name}/${branchName}`,
      `Detailed logging is disabled. To enable, set detailedLog: true in config.json for this environment`
    );
  }

  // Send deployment started notification with comprehensive information
  // Wrap in try/catch to prevent notification errors from stopping deployment
  try {
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
            {
              title: "Detailed Logging",
              value: detailedLog ? "Enabled" : "Disabled",
              short: true,
            },
          ],
          footer: "Wooffer CI/CD",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    });
    logInfo(
      `${name}/${branchName}`,
      "Sent deployment started notification to Slack"
    );
  } catch (notificationError) {
    logError(
      `${name}/${branchName}`,
      `Failed to send start notification: ${notificationError.message}`
    );
    logInfo(
      `${name}/${branchName}`,
      "Continuing deployment despite notification failure"
    );
  }

  try {
    // Execute commands sequentially without individual notifications
    for (const command of commands) {
      logInfo(`${name}/${branchName}`, `Executing command: ${command}`);
      await executeCommand(
        command,
        deployPath,
        slackWebhookUrl,
        name,
        branchName
      );
    }

    logInfo(`${name}/${branchName}`, `Deployment completed successfully`);

    // Only send notification upon successful completion of all commands
    try {
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
              {
                title: "Detailed Logging",
                value: detailedLog ? "Enabled" : "Disabled",
                short: true,
              },
            ],
            footer: "Wooffer CI/CD",
            ts: Math.floor(Date.now() / 1000),
          },
        ],
      });
      logInfo(
        `${name}/${branchName}`,
        "Sent deployment completed notification to Slack"
      );
    } catch (notificationError) {
      logError(
        `${name}/${branchName}`,
        `Failed to send completion notification: ${notificationError.message}`
      );
      logInfo(
        `${name}/${branchName}`,
        "Deployment was successful despite notification failure"
      );
    }

    return { success: true };
  } catch (error) {
    logError(
      `${name}/${branchName}`,
      `Deployment failed with error: ${error.message}`
    );

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
