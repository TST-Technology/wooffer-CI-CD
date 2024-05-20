const express = require("express");
const path = require("path");
const cookieParser = require("cookie-parser");
const createError = require("http-errors");
const cors = require("cors");
const compression = require("compression");
const helmet = require("helmet");
const dotenv = require("dotenv");
const bodyParser = require("body-parser");
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

// Configure CORS
app.use(cors());

// Enable compression middleware
app.use(compression());

// Enhance security with helmet middleware
app.use(
  helmet({
    contentSecurityPolicy: false, // Customize your CSP policy as needed
  })
);

// Body parser middleware for handling raw body needed for signature verification
app.use(
  bodyParser.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Health check route
app.get("/", (req, res) => {
  res.status(200).json({ status: "Success", message: "Server is running..." });
});

// Routes
app.use("/", indexRouter);

// Catch all routes that don't match any other routes and return 404 error
app.use((req, res, next) => {
  next(createError(404, `Can't find ${req.originalUrl} on this server!`));
});

// Error handler
app.use((err, req, res, next) => {
  res.status(err.status || 500).json({
    status: err.status || 500,
    message: err.message || "Unknown Error",
  });
});

module.exports = app;
