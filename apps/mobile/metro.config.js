// Metro config for a package inside an npm-workspaces monorepo.
//
// Two things differ from a standalone Expo app:
//  1. `watchFolders` must include the repo root so edits in
//     packages/api-contract trigger a reload.
//  2. `nodeModulesPaths` must include the hoisted root node_modules, since npm
//     installs most dependencies there rather than in apps/mobile.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("node:path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules")
];
// The web app is on React 18 and hoists it to the repo root; this app is on
// React 19. A dependency that itself lives at the root would otherwise resolve
// the root's React 18 and blow up with "invalid hook call" at runtime. Pinning
// the alias makes every module in the bundle share this app's copy.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  react: path.resolve(projectRoot, "node_modules/react"),
  "react-native": path.resolve(projectRoot, "node_modules/react-native")
};

// supabase-js's ESM build contains a bare `import("@opentelemetry/api")` for
// optional tracing. Hermes can't parse it ("Invalid expression encountered")
// and the export fails at the bytecode step, after a successful bundle. Its
// CJS build compiles that same call down to a `require`, so point Metro at it.
// Scoped to this one package rather than flipping package-exports off globally.
const defaultResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === "@supabase/supabase-js") {
    return {
      type: "sourceFile",
      filePath: require.resolve("@supabase/supabase-js/dist/index.cjs", { paths: [projectRoot] })
    };
  }
  return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
