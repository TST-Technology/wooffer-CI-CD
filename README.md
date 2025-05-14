# Wooffer CI/CD Service

A flexible CI/CD service that supports centralized deployment for multiple projects, regardless of their stack (Node.js, React, etc.).

## Features

- Support for multiple projects with multiple environments (production, staging, etc.)
- GitHub webhook integration for automatic deployments
- Manual deployment triggering via API
- In-memory job queue for processing deployments
- Slack notifications for deployment status
- Sequential command execution with per-command status updates
- Secret validation for security

## Quick Start with NPX

The easiest way to set up Wooffer CI/CD is using npx:

```bash
npx wooffer-ci-cd@latest
```

This command will:

1. Create a new folder named `wooffer-ci-cd` in your current directory
2. Set up all necessary files inside this folder
3. Create a config.json file with example configuration (you must modify this with your actual settings)
4. Install all required dependencies
5. Provide instructions on next steps

After installation, you should:

```bash
# Navigate to the wooffer-ci-cd directory
cd wooffer-ci-cd

# Edit the config.json file to replace example values with your actual configuration
nano config.json  # or use any text editor
```

## Important: Default Configuration

The installation provides a default configuration in `config.json`, located in the root directory. This file defines all projects and their deployment environments, using GitHub repository URLs as the top-level keys.

```json
{
  "https://github.com/your-repo": {
    "name": "Your Project Name",
    "secret": "your-github-webhook-secret-here",
    "environments": {
      "main": {
        "deployPath": "/path/to/your/project/from/root",
        "slackWebhookUrl": "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
        "commands": [
          "git restore .",
          "git pull",
          "npm install",
          "npm run build",
          "pm2 restart example-app"
        ]
      }
    }
  }
}
```

You **must** edit this file to replace:

- The GitHub repository URL (`https://github.com/your-org/your-repo`)
- The project name (`example-project`)
- The secret key (`your-github-webhook-secret-here`)
- The deploy path (`/path/to/your/project`)
- The Slack webhook URL (`https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK`)
- The commands, if needed

The service will not work properly until this configuration is updated with your actual values.

## Configuration Properties Table

| Property                  | Description                                                                       | Example                                           | Notes                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub Repository URL** | The URL of your GitHub repository                                                 | `https://github.com/TST-Technology/wooffer-CI-CD` | If the URL ends with .git, remove the .git suffix                                                                                                         |
| **name**                  | Display name for the project                                                      | `"wooffer-ci-cd"`                                 | Used in logs and Slack notifications. This serves as a unique identifier for your project, so we recommend following the {projectname} in naming pattern. |
| **secret**                | The secret key is a randomly generated value used for validating GitHub webhooks. | `"a5b7c9d1e3f5"`                                  | This key must exactly match the secret configured in the GitHub webhook settings.                                                                         |
| **environments**          | Object containing deployment configs for different branches                       | See below                                         | Branch names are used as keys                                                                                                                             |
| **Branch name**           | Git branch on which you want to set the triggers.                                 | `"main"`, `"staging"`                             | It is case-sensitive, so it must exactly match the actual branch name.                                                                                    |
| **deployPath**            | Absolute path to the project folder on your server                                | `"/var/www/myapp"`                                | Must have proper permissions for all commands                                                                                                             |
| **slackWebhookUrl**       | URL for sending notifications to Slack                                            | `"https://hooks.slack.com/services/XXX/YYY/ZZZ"`  | Create a Slack Incoming Webhook by following the steps shown in this video: https://www.youtube.com/watch?v=sxtC40gUS2A Webhooks                          |
| **commands**              | Array of shell commands to execute sequentially                                   | `["git pull", "npm install", "npm run build"]`    | Commands will run under the provided folder path.                                                                                                         |

### 🔧 Configuration Example

```json
{
  "https://github.com/TST-Technology/wooffer-CI-CD": {
    "name": "wooffer-ci-cd",
    "secret": "wejwhgehjfsguyg$56^qwsd23ds@#45dcvb",
    "environments": {
      "development": {
        "deployPath": "/tst/wooffer-ci-cd/development",
        "slackWebhookUrl": "https://hooks.slack.com/services/XXX/YYY/ZZZ",
        "commands": [
          "git restore .",
          "git pull",
          "npm install",
          "npm run build",
          "pm2 restart app-name" //We use PM2 for deployment. Please replace your deployment command accordingly.
        ]
      },
      "staging": {
        "deployPath": "/tst/wooffer-ci-cd/staging",
        "slackWebhookUrl": "https://hooks.slack.com/services/XXX/YYY/ZZZ",
        "commands": [
          "git restore .",
          "git pull",
          "npm install",
          "npm run build",
          "pm2 restart app-name-staging" //We use PM2 for deployment. Please replace your deployment command accordingly.
        ]
      }
    }
  }
}
```

## How It Works

1. When a webhook is received or manual deployment is triggered, a job is added to the in-memory queue
2. Jobs are processed sequentially, executing the commands specified in the configuration
3. Each step of the deployment process sends notifications to Slack
4. The queue automatically processes the next job when the current one completes
5. You will receive the log in the Slack channel via the shared slack incoming webhook.

## Set up the port

By default, the application will start on port 3000. If you want to change the port number, follow the command below inside the wooffer-ci-cd folder:

```bash
# create .env file
nano .env

# Add PORT variable
PORT=4968 #You can replace <your-desired-port> with any port number that is not already in use by another process.
```

Press `Ctrl + s` to save, then `Ctrl + x` to exit and return to the terminal.

## CI CD Deployment

Our local configuration is ready. Now, let's start the CI/CD application by running the `npm start` command inside the woffer-ci-cd folder.

To make it a permanent deployment and accessible via IP, we use PM2. If you're using PM2, you can deploy with the following command:

```bash
pm2 start npm --name "woffer-ci-cd" -- start
```

This command will start the Wooffer CI-CD service on the specified port. You can now access it through your server's IP address.

If you want to link it with a subdomain, point your subdomain to the server's IP address and configure port forwarding (or use a reverse proxy like Nginx) to route the subdomain to the port defined in your environment settings.

## API Endpoints Details

### GitHub Webhook (Automatic Deployment)

```
POST /api/v1/deployment/webhook
```

This endpoint receives webhook requests from GitHub and triggers deployments based on the repository and branch information.

### Manual Deployment

```
POST /api/v1/deployment/deploy
```

Required headers or body parameters:

- `x-project` or `project` in body: The name of the project to deploy
- `x-branch` or `branch` in body: The branch to deploy (optional if project has only one environment)

## Setting Up GitHub Webhooks

1. Go to your GitHub repository settings
2. Navigate to Webhooks
3. Add a new webhook
4. Set the Payload URL to `https://your-server.com/api/v1/deployment/webhook` or `http://<your-server-IP>:<PORT>/api/v1/deployment/webhook`
5. Set the Content type to `application/json`
6. Set the Secret to the same value as defined in your `config.json`
7. Disable SSL verification if you are using an IP-based URL. If you are using an HTTPS (SSL-secured) link, keep SSL verification enabled.
8. Select "Just the push event" for triggering deployments on code pushes
9. Ensure the webhook is active

## Environment Setup

For each project, ensure:

1. The deployment path specified in the configuration exists and is writable
2. The service has appropriate permissions to execute the commands
3. Any dependencies required by the commands are installed on the server

## Security Considerations

- Keep your `config.json` file secure as it contains sensitive information
- Use strong, unique secrets for each project
