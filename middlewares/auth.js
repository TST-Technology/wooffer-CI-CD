"use strict";

const createHttpError = require("http-errors");
const jwt = require("jsonwebtoken");
const requestorService = require("../modules/user/service");
const { cl, jwtDecoder } = require("../utils/service");

exports.protectRoute = (roles) => async (req, res, next) => {
  try {
    const jwtUser = await jwtDecoder(req);
    if (!roles.includes(jwtUser.role))
      return next(new Error("Access denied", 401));

    req.requestor = jwtUser;
    next();
  } catch (err) {
    next(err);
  }
};

exports.authMiddleware = async (req, res, next) => {
  let token;

  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      status: 401,
      message: "Token not passed",
    });
  }

  try {
    const jwtUser = jwt.verify(token, process.env.JWT_SECRET);
    let requestor;
    let role;

    if (jwtUser.role === "Admin") {
      requestor = await requestorService.findOne({
        where: {
          id: jwtUser.id,
          role: "Admin",
        },
      });
      role = "Admin";
    }
    //  else if (jwtUser.role === "User") {
    //   requestor = await userService.findOne({
    //     where: {
    //       id: jwtUser.id,
    //     },
    //   });
    //   role = "User";
    // }

    if (!requestor) {
      res.status(401).json({
        status: 401,
        message: "Access Denied",
      });
    } else {
      requestor.dataValues.role = role;
      req.requestor = requestor.toJSON();
      next();

      cl("API Call--->", {
        API: req.method + " " + req.originalUrl,
        body: req.body,
        requestor: requestor.toJSON(),
      });
    }
  } catch (err) {
    cl("Error in authMiddleware", err);
    next(err);
  }
};
