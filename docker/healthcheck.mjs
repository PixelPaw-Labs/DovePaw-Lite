import { get } from "node:http";

const port = process.env.DOVEPAW_PORT || 8473;
get(`http://localhost:${port}/`, (res) => process.exit(res.statusCode < 400 ? 0 : 1)).on(
  "error",
  () => process.exit(1),
);
