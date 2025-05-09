# Wooffer CI/CD Service

A flexible CI/CD service that supports centralized deployment for multiple projects, regardless of their stack (Node.js, React, etc.).

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

# Start the service once configuration is complete
npm start
```

## Important: Default Configuration

The installation provides a default configuration in `config.json` that looks like this:

```json
{
  "https://github.com/your-org/your-repo": {
    "name": "example-project",
    "secret": "your-github-webhook-secret-here",
    "environments": {
      "main": {
        "deployPath": "/path/to/your/project",
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

## Features

- Support for multiple projects with multiple environments (production, staging, etc.)
- GitHub webhook integration for automatic deployments
- Manual deployment triggering via API
- In-memory job queue for processing deployments
- Slack notifications for deployment status
- Sequential command execution with per-command status updates
- Secret validation for security

## Configuration

The deployment configuration is stored in `config.json` in the root directory. This file defines all projects and their deployment environments using GitHub repository URLs as top-level keys.

### Configuration Format

```json
{
  "https://github.com/organization/repo-name": {
    "name": "project-name",
    "secret": "your-secret-key-here",
    "environments": {
      "main": {
        "deployPath": "/path/to/deployment/directory",
        "slackWebhookUrl": "https://hooks.slack.com/services/XXX/YYY/ZZZ",
        "commands": [
          "git restore .",
          "git pull",
          "npm install",
          "npm run build",
          "pm2 restart app-name"
        ]
      },
      "staging": {
        "deployPath": "/path/to/staging/directory",
        "slackWebhookUrl": "https://hooks.slack.com/services/XXX/YYY/ZZZ",
        "commands": [
          "git restore .",
          "git pull",
          "npm install",
          "npm run build",
          "pm2 restart app-name-staging"
        ]
      }
    }
  }
}
```

### Configuration Properties

- **Repository URL** (top-level key): The GitHub repository URL as it appears in the webhook payload (e.g., `https://github.com/organization/repo-name`)
  - **name**: Display name for the project (used in logs and notifications)
  - **secret**: Secret key for validating GitHub webhooks
  - **environments**: Object containing environment configurations with branch names as keys
    - **Branch name** (e.g., "main", "staging", "production")
      - **deployPath**: Absolute path where the code is deployed
      - **slackWebhookUrl**: Slack webhook URL for notifications
      - **commands**: Array of commands to be executed sequentially

## How It Works

1. When a webhook is received or manual deployment is triggered, a job is added to the in-memory queue
2. Jobs are processed sequentially, executing the commands specified in the configuration
3. Each step of the deployment process sends notifications to Slack
4. The queue automatically processes the next job when the current one completes

## API Endpoints

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
4. Set the Payload URL to `https://your-server.com/api/v1/deployment/webhook`
5. Set the Content type to `application/json`
6. Set the Secret to the same value as defined in your `config.json`
7. Select "Just the push event" for triggering deployments on code pushes
8. Ensure the webhook is active

## Environment Setup

For each project, ensure:

1. The deployment path specified in the configuration exists and is writable
2. The service has appropriate permissions to execute the commands
3. Any dependencies required by the commands are installed on the server

## Running the Service

```bash
# Production mode
npm start

# Development mode with auto-restart
npm run dev
```

## Security Considerations

- Keep your `config.json` file secure as it contains sensitive information
- Use strong, unique secrets for each project
- Regularly rotate secrets and Slack webhook URLs
- Consider implementing IP restrictions for webhook endpoints
