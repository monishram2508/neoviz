const { rateLimit } = require("express-rate-limit");
const { config } = require("./config");

const MINUTE = 60 * 1000;
const AUTH_WINDOW = 15 * MINUTE;
const AUTH_LIMIT = 10;
const SUBMIT_WINDOW = 60 * MINUTE;
const SUBMIT_LIMIT = 30;
const EDIT_WINDOW = 60 * MINUTE;
const EDIT_LIMIT = 60;

const shared = {
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => config.nodeEnv === "test",
  message: { error: "Too many attempts. Try again later." }
};

const authLimiter = rateLimit({ ...shared, windowMs: AUTH_WINDOW, limit: AUTH_LIMIT });

const submitLimiter = rateLimit({
  ...shared,
  windowMs: SUBMIT_WINDOW,
  limit: SUBMIT_LIMIT,
  keyGenerator: (req) => String(req.account.id)
});

const editLimiter = rateLimit({
  ...shared,
  windowMs: EDIT_WINDOW,
  limit: EDIT_LIMIT,
  keyGenerator: (req) => String(req.account.id)
});

module.exports = { authLimiter, submitLimiter, editLimiter };
