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

exports.rebuild = async (req, res, next) => {
  sendMessageInSlack(`Website Build Started`, "", "#FFA500");
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
  res.status(200).json({ message: "Wooffer" });
};

exports.gitPull = async (req, res, next) => {
  sendMessageInSlack(`Website Git pull Started`, "", "#FFA500");
  exec(process.env.NEXT_PUBLIC_GIT_PULL, (error, stdout, stderr) => {
    console.log("stdout: " + stdout);
    console.log("stderr: " + stderr);
    if (error !== null) {
      console.log("exec error: " + error);
      sendMessageInSlack(`Website Git pull Failed`, stderr, "#ff0000");
    } else {
      sendMessageInSlack(`Website Git pull Success`, "", "#7CD197");
    }
  });
  res.status(200).json({ message: "Wooffer" });
};
