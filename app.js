const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const createError = require("http-errors");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const dotenv = require("dotenv");
const indexRouter = require("./routes");

dotenv.config();

const app = express();

// Middleware for parsing JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Middleware for parsing cookies
app.use(cookieParser());

// Serve static files from the "public" directory
app.use(express.static(path.join(__dirname, "public")));
app.use(cors()); // Configure CORS
// Enable compression middleware
app.use(compression());
// Enhance security with helmet middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Customize your CSP policy as needed
  })
);

//<==================== Rotes ====================>
app.use("/", indexRouter);
// app.use("/", indexRouter);

// Catch all routes that don't match any other routes and return 404 error
app.use((req, res, next) => {
  next(createError(404, `Can't find ${req.originalUrl} on this server!`));
});

// Error handler
app.use((err, req, res, next) => {
  // Handle Sequelize errors
  if (err.name === "SequelizeUniqueConstraintError") {
    // Handle unique constraint errors (e.g., duplicate data)
    err.status = 409;
    let msg = "";

    err.errors.map((el) => {
      msg += `${el.path} '${el.value.split("-")[0]}' already registered`;
    });

    err.message = msg;
  } else if (err.name === "SequelizeValidationError") {
    // Handle validation errors
    err.status = 400;
    let msg = "";

    err.errors.map((el) => {
      if (el.type === "notNull Violation") {
        msg += el.path + " is required. ";
      } else {
        msg += el.message;
      }
    });

    err.message = msg;
  } else if (
    err.name === "JsonWebTokenError" &&
    err.message === "jwt malformed"
  ) {
    return res.status(401).json({
      status: 401,
      message: "Unauthorized attempt, login again!",
      // token: req.header("Authorization"),
    });
  }

  // Handle other errors
  res.status(err.status || 500).json({
    status: err.status || 500,
    message: err.message || "Unknown Error",
  });

  app.use((err, req, res, next) => {
    throw err;
  });
});
module.exports = app;
