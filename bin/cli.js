#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Check for dry run flag
const isDryRun = process.argv.includes("--dry-run");

console.log("🚀 Setting up Wooffer CI/CD system...");

// Create wooffer-ci-cd directory in current directory
const baseDir = process.cwd();
const targetDir = path.join(baseDir, "wooffer-ci-cd");

// Create the target directory if it doesn't exist
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log("✅ Created directory: wooffer-ci-cd");
} else {
  console.log("ℹ️ Directory wooffer-ci-cd already exists");
}

// Create config.json with default example configuration if it doesn't exist
if (!fs.existsSync(path.join(targetDir, "config.json"))) {
  const defaultConfig = {
    "https://github.com/your-org/your-repo": {
      name: "example-project",
      secret: "your-github-webhook-secret-here",
      environments: {
        main: {
          deployPath: "/path/to/your/project",
          slackWebhookUrl:
            "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
          commands: [
            "git restore .",
            "git pull",
            "npm install",
            "npm run build",
            "pm2 restart example-app",
          ],
        },
      },
    },
  };

  fs.writeFileSync(
    path.join(targetDir, "config.json"),
    JSON.stringify(defaultConfig, null, 2),
    "utf8"
  );
  console.log("✅ Created config.json with example configuration");
} else {
  console.log("ℹ️ config.json already exists, skipping");
}

// Copy all necessary files
try {
  // Source directory within the package
  const sourceDir = path.join(__dirname, "..");

  // Files and directories to copy (excluding node_modules and unnecessary files)
  const filesToCopy = [
    "app.js",
    "bin/www",
    "middlewares",
    "modules",
    "routes",
    "README.md",
  ];

  // Create directories
  ["bin", "middlewares", "modules/website", "routes"].forEach((dir) => {
    const dirPath = path.join(targetDir, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  });

  // Copy each file/directory
  filesToCopy.forEach((file) => {
    const sourcePath = path.join(sourceDir, file);
    const targetPath = path.join(targetDir, file);

    if (fs.existsSync(sourcePath)) {
      if (fs.lstatSync(sourcePath).isDirectory()) {
        // For directories, copy recursively
        copyDir(sourcePath, targetPath);
      } else {
        // For files, simply copy
        fs.copyFileSync(sourcePath, targetPath);
      }
      console.log(`✅ Copied ${file}`);
    }
  });

  // If package.json doesn't exist in target, create it
  if (!fs.existsSync(path.join(targetDir, "package.json"))) {
    // Create a minimal package.json
    const packageJson = {
      name: "wooffer-ci-cd-app",
      version: "1.0.0",
      description: "Wooffer CI/CD system for automated deployments",
      main: "app.js",
      scripts: {
        start: "node ./bin/www",
        dev: "nodemon ./bin/www",
      },
      dependencies: {
        axios: "^1.7.3",
        compression: "^1.7.4",
        "cookie-parser": "~1.4.4",
        cors: "^2.8.5",
        debug: "~2.6.9",
        dotenv: "^16.4.5",
        express: "^4.19.2",
        helmet: "^7.1.0",
        "http-errors": "^2.0.0",
        moment: "^2.29.4",
        morgan: "~1.9.1",
      },
    };

    fs.writeFileSync(
      path.join(targetDir, "package.json"),
      JSON.stringify(packageJson, null, 2),
      "utf8"
    );
    console.log("✅ Created package.json");
  } else {
    console.log("ℹ️ package.json already exists, skipping");
  }

  // Make bin/www executable
  fs.chmodSync(path.join(targetDir, "bin/www"), "755");

  // Install dependencies (skip if dry run)
  console.log("\n📦 Installing dependencies...");
  if (!isDryRun) {
    execSync("npm install", { stdio: "inherit", cwd: targetDir });
  } else {
    console.log("⏩ Skipping actual installation (dry run)");
  }

  console.log(
    "\n🎉 Wooffer CI/CD has been set up successfully in the wooffer-ci-cd directory!"
  );
  console.log("\n📋 Next steps:");
  console.log("1. cd wooffer-ci-cd");
  console.log(
    "2. Edit config.json with your actual GitHub repository URL, webhook secret, and deployment paths"
  );
  console.log("3. Start the service with: npm start");
  console.log(
    "4. Set up GitHub webhooks to point to your server at: /api/v1/deployment/webhook"
  );
} catch (error) {
  console.error("❌ Error setting up Wooffer CI/CD:", error.message);
  process.exit(1);
}

// Helper function to copy directories recursively
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
