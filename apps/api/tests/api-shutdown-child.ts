import { startWorkosApi } from "../src/startApi.js";

const started = await startWorkosApi(process.env, { installSignals: true });
const health = await fetch(`http://127.0.0.1:${started.port}/api/health`);
if (health.status !== 200) {
  throw new Error(`health ${health.status}`);
}
process.emit("SIGTERM");
