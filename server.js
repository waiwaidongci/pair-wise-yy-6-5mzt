import { createServer } from "./src/entry.js";

const port = Number(process.env.PORT || 3037);
createServer().listen(port, () => console.log("墨锭试磨室 · 磨面温升与冷却复磨准入台 listening on http://localhost:" + port));
