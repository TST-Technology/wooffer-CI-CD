"use strict";
const axios = require("axios");
var exec = require("child_process").exec;

const responseInClientSlack = async (url, body) => {
  try {
    return await axios.post(url, body, {});
  } catch {
    return;
  }
};

const sendMessageInSlack = async (title, text, color) => {
  await responseInClientSlack(process.env.slackID, {
    attachments: [
      {
        title,
        text,
        color,
      },
    ],
  });
};

const executeBuildCommand = async () => {
  await sendMessageInSlack(`Website Build Started`, "", "#FFA500");
  exec(process.env.NEXT_PUBLIC_COMMAND_RUN, (error, stdout, stderr) => {
    console.log("stdout: " + stdout);
    console.log("stderr: " + stderr);
    if (error !== null) {
      console.log("exec error: " + error);
      sendMessageInSlack(`Website Build Failed`, stderr, "#ff0000");
    } else {
      sendMessageInSlack(`Website Build Success`, "", "#7CD197");
    }
  });
};

exports.rebuild = async (req, res, next) => {
  executeBuildCommand();
  res.status(200).json({ message: "Wooffer" });
};

exports.gitPull = async (req, res, next) => {
  const { branchName, slackMessage } = githubReqBodyParser(req.body);

  if (branchName == process.env.branchName) {
    await sendMessageInSlack(
      `Website Git pull Started`,
      slackMessage,
      "#FFA500"
    );
    exec(process.env.NEXT_PUBLIC_GIT_PULL, async (error, stdout, stderr) => {
      console.log("stdout: " + stdout);
      console.log("stderr: " + stderr);
      if (error !== null) {
        console.log("exec error: " + error);
        sendMessageInSlack(`Website Git pull Failed`, stderr, "#ff0000");
      } else {
        await sendMessageInSlack(`Website Git pull Success`, stdout, "#7CD197");

        if ("Already up to date." != stdout.toString().trim()) {
          executeBuildCommand();
        }
      }
    });
  }

  res.status(200).json({ message: "Wooffer" });
};

const githubReqBodyParser = (payload) => {
  const branchDetails = payload?.ref?.split("/");
  let branchName = "";
  let slackMessage = "";
  let userLoginName = payload?.sender?.login;
  let commitMessage = payload?.head_commit?.message;
  let isForcePush = payload?.forced;

  if (branchDetails?.length > 0) {
    branchName = branchDetails[branchDetails?.length - 1];
    slackMessage = `Branch: ${branchName}`;
  }

  slackMessage += `\nSender: ${userLoginName}`;
  slackMessage += `\nCommit: ${commitMessage}`;
  if (isForcePush) {
    slackMessage += `\nForce Push: ${isForcePush}`;
  }
  console.log({
    branchName,
    userLoginName,
    commitMessage,
    isForcePush,
    slackMessage,
  });
  return {
    branchName,
    userLoginName,
    commitMessage,
    isForcePush,
    slackMessage,
  };
};
