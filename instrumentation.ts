import type { Instrumentation } from "next";

/** Every uncaught server error (pages, server actions, API routes) → an email alert to the admin. */
export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportError } = await import("./lib/alerts");
  await reportError("Server error", error, { path: request.path, method: request.method, route: context.routePath, type: context.routeType });
};
