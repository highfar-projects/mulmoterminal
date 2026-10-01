// The dev server's proxy must hand the API the Host the browser used. The API refuses a change whose Origin is not its
// own Host (skills/api), and under `yarn dev` the browser's Origin is the Vite port: a proxy that rewrites the Host to
// the API's own port makes every change look cross-site. Vite rewrites it for a proxy written as a plain string (it
// adds changeOrigin: true) and for one that sets changeOrigin: true itself.

/** Every proxy entry of a resolved Vite config that rewrites the Host, as a problem the agent can act on. */
export function proxyProblems(proxy) {
  if (proxy === undefined || proxy === null) return [];
  return Object.entries(proxy).flatMap(([context, options]) => {
    const where = `vite.config server.proxy["${context}"]`;
    if (typeof options === "string") {
      return [
        `${where} is the string ${JSON.stringify(options)}: Vite then rewrites the Host to the API's port, so the API refuses every change made in yarn dev as cross-site. Write { target: ${JSON.stringify(options)}, changeOrigin: false }`,
      ];
    }
    return options?.changeOrigin === true
      ? [
          `${where} sets changeOrigin: true: the API then sees its own port as the Host while the browser sends the Vite port as the Origin, and refuses every change made in yarn dev as cross-site. Set changeOrigin: false`,
        ]
      : [];
  });
}
