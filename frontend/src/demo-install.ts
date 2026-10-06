import { demoResponse } from "./demo-api";

// Serves the app's API calls from the built-in demo data instead of the network, with a short
// delay so loading states look the way they would against a real server.
export function installDemo() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const request = input instanceof Request ? input : null;
    const url = new URL(request ? request.url : String(input), location.href);
    if (url.origin === location.origin) {
      const method = (init?.method || request?.method || "GET").toUpperCase();
      const body = typeof init?.body === "string" ? init.body : undefined;
      const reply = demoResponse(method, url.pathname, url.searchParams, body);
      if (reply) {
        await new Promise((resolve) =>
          setTimeout(resolve, 120 + Math.random() * 260),
        );
        return new Response(JSON.stringify(reply.body), {
          status: reply.status,
          headers: { "Content-Type": "application/json" },
        });
      }
    }
    return realFetch(input, init);
  };
}
