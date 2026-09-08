import { routes } from "./routes.mjs";
export function dispatch(name, job) { return routes[name](job); }
