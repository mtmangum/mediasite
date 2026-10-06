// Every API route: { method ("*" matches any), path, handler(req, res, ctx, url) }.
module.exports = [
  ...require("./connection"),
  ...require("./presentations"),
  ...require("./analytics"),
  ...require("./health"),
  ...require("./previews"),
  ...require("./views"),
];
