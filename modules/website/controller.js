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

function logCommand(project, branch, command, output, isError = false) {
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
  try {
    // Execute command with elevated privileges based on platform
    logInfo(
      `${projectName}/${branchName}`,
      `Executing command: ${command} in ${cwd}`
    );

    const platform = os.platform();
    let result;

    if (platform === "win32") {
      // Windows - use cmd.exe with runas for elevation
      try {
        // Create a temporary batch file to run the command with elevation
        const tempBatchPath = path.join(
          os.tmpdir(),
          `wooffer_elevated_${Date.now()}.bat`
        );

        // Create batch file content - includes working directory change and command execution
        const batchContent = `@echo off
cd /d "${cwd}"
${command}
exit /b %errorlevel%`;

        // Write the batch file
        fs.writeFileSync(tempBatchPath, batchContent);

        logInfo(
          `${projectName}/${branchName}`,
          `Created temporary batch file at ${tempBatchPath}`
        );

        // Run the batch file with runas command for elevation
        result = await execPromise(
          `runas /trustlevel:0x20000 "cmd.exe /c ${tempBatchPath}"`
        );

        // Log the complete output to console
        if (result.stdout) {
          logCommand(projectName, branchName, command, result.stdout);
        }
        if (result.stderr) {
          logCommand(projectName, branchName, command, result.stderr, true);
        }

        // Clean up the temporary batch file
        try {
          fs.unlinkSync(tempBatchPath);
          logInfo(
            `${projectName}/${branchName}`,
            `Removed temporary batch file`
          );
        } catch (cleanupError) {
          logError(
            `${projectName}/${branchName}`,
            `Failed to remove temporary batch file: ${cleanupError.message}`
          );
        }
      } catch (elevationError) {
        logError(
          `${projectName}/${branchName}`,
          `Failed to elevate command on Windows: ${elevationError.message}`
        );

        // Second attempt with different elevation approach - using ShellExecute
        try {
          const vbsPath = path.join(
            os.tmpdir(),
            `wooffer_elevated_${Date.now()}.vbs`
          );
          const batchPath = path.join(
            os.tmpdir(),
            `wooffer_command_${Date.now()}.bat`
          );

          // Create batch file with commands
          const batchContent = `@echo off
cd /d "${cwd}"
${command}
exit /b %errorlevel%`;

          // Create VBS script that elevates the batch file
          const vbsContent = `Set UAC = CreateObject("Shell.Application")
UAC.ShellExecute "${batchPath}", "", "", "runas", 1
WScript.Sleep 10000 ' Wait for command to complete`;

          fs.writeFileSync(batchPath, batchContent);
          fs.writeFileSync(vbsPath, vbsContent);

          logInfo(
            `${projectName}/${branchName}`,
            `Second elevation attempt: Created temporary files at ${vbsPath} and ${batchPath}`
          );

          // Execute the VBS script which will elevate the batch file
          result = await execPromise(`cscript //nologo "${vbsPath}"`);

          // Log the complete output to console
          if (result.stdout) {
            logCommand(projectName, branchName, command, result.stdout);
          }
          if (result.stderr) {
            logCommand(projectName, branchName, command, result.stderr, true);
          }

          // Clean up temporary files
          try {
            fs.unlinkSync(vbsPath);
            fs.unlinkSync(batchPath);
            logInfo(
              `${projectName}/${branchName}`,
              `Removed temporary VBS and batch files`
            );
          } catch (cleanupError) {
            logError(
              `${projectName}/${branchName}`,
              `Failed to remove temporary files: ${cleanupError.message}`
            );
          }
        } catch (vbsError) {
          logError(
            `${projectName}/${branchName}`,
            `Failed second elevation attempt on Windows: ${vbsError.message}`
          );

          // Fallback - attempt to run without elevation
          logInfo(
            `${projectName}/${branchName}`,
            `Trying command without elevation as fallback`
          );
          result = await execPromise(command, { cwd });

          // Log the complete output to console
          if (result.stdout) {
            logCommand(projectName, branchName, command, result.stdout);
          }
          if (result.stderr) {
            logCommand(projectName, branchName, command, result.stderr, true);
          }
        }
      }
    } else {
      // Other platforms - run without elevation
      result = await execPromise(command, { cwd });

      // Log the complete output to console
      if (result.stdout) {
        logCommand(projectName, branchName, command, result.stdout);
      }
      if (result.stderr) {
        logCommand(
          projectName,
          branchName,
          command,
          result.stderr,
          result.stderr.length > 0
        );
      }
    }

    logInfo(
      `${projectName}/${branchName}`,
      `Command completed successfully: ${command}`
    );
    return {
      success: true,
      stdout: result?.stdout || "",
      stderr: result?.stderr || "",
    };
  } catch (error) {
    logError(
      `${projectName}/${branchName}`,
      `Command failed: ${command}\nError: ${error.message}`
    );

    // Determine if the failure is permission-related
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

    // Send notification for failed command with detailed information - wrapped in try/catch
    try {
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
                value: errorMessage,
              },
              {
                title: "Directory",
                value: cwd,
              },
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

  logInfo(
    `${name}/${branchName}`,
    `Starting deployment for ${name} (${branchName})`
  );

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
