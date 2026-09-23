import http from "node:http";
import { route } from "./src/routes.js";

const port = Number(process.env.PORT || 3037);
const server = http.createServer((req, res) => { route(req, res); });
server.listen(port, () => console.log("磨面温升与冷却复磨准入台 listening on http://localhost:" + port));
