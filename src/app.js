const express = require("express");
const path = require("path");
const routes = require("./routes");

const app = express();

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

function appendUtf8Charset(contentType) {
  if (typeof contentType !== "string" || /charset=/i.test(contentType)) {
    return contentType;
  }

  if (
    contentType.startsWith("text/") ||
    contentType.startsWith("application/javascript") ||
    contentType.startsWith("application/json")
  ) {
    return `${contentType}; charset=utf-8`;
  }

  return contentType;
}

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  const originalSetHeader = res.setHeader.bind(res);

  res.setHeader = (name, value) => {
    if (String(name).toLowerCase() === "content-type") {
      return originalSetHeader(name, appendUtf8Charset(value));
    }

    return originalSetHeader(name, value);
  };

  next();
});

app.use(
  express.static(path.join(__dirname, "..", "public"), {
    setHeaders(res) {
      const currentType = res.getHeader("Content-Type");
      if (currentType) {
        res.setHeader("Content-Type", currentType);
      }
    },
  })
);
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
