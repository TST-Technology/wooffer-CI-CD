# Publishing wooffer-ci-cd to npm

This document provides instructions for publishing the wooffer-ci-cd package to npm.

## Pre-publishing Checklist

1. Ensure all files are correctly included in the `files` array in package.json
2. Verify that bin/cli.js is executable (`chmod +x bin/cli.js`)
3. Make sure .npmignore is configured to exclude unnecessary files
4. Test the CLI script locally with `node bin/cli.js --dry-run`
5. Update the version number in package.json if necessary

## Publishing Steps

1. Login to npm:

   ```bash
   npm login
   ```

2. Publish the package:

   ```bash
   npm publish
   ```

3. Test installation with npx:

   ```bash
   # Create a test directory
   mkdir test-dir
   cd test-dir

   # Run the CLI tool - this will create a wooffer-ci-cd folder
   npx wooffer-ci-cd@latest

   # Verify the installation was successful
   cd wooffer-ci-cd
   ls -la
   ```

## Updating the Package

1. Make your changes to the codebase
2. Update the version in package.json (following semantic versioning)
3. Publish the new version:
   ```bash
   npm publish
   ```

## Notes

- The first time you publish, you'll need to choose a unique package name if "wooffer-ci-cd" is already taken
- Consider setting up GitHub Actions for automated publishing on releases
- Remember to update the version number for each release
- Users will always get the latest version when using `npx wooffer-ci-cd@latest`
- The tool creates a new folder named `wooffer-ci-cd` in the user's current directory
