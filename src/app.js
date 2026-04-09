const express = require("express");
const path = require("path");
const routes = require("./routes");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "..", "public")));
app.use(routes);

app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

app.use((error, req, res, next) => {
  console.error(error);
  const statusCode = Number(error.statusCode || error.status || 500);
  if (req.accepts("html") && !req.path.startsWith("/api/")) {
    return res.status(statusCode).render("error", {
      title: "Application Error",
      statusCode,
      message: error.message,
    });
  }
  res.status(statusCode).json({
    error: statusCode >= 500 ? "Internal server error" : error.message,
    message: error.message,
  });
});

module.exports = app;
