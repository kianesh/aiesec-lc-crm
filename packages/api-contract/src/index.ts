export * from "./enums";
export * from "./errors";
export * from "./me";
export * from "./dashboard";
export * from "./contacts";
export * from "./conversations";
export * from "./appointments";
export * from "./expa";
export * from "./social";
export * from "./email";
export * from "./push";

/** Bumped whenever a breaking change lands; the app sends it as `X-Client-API`. */
export const API_VERSION = "v1";
export const API_BASE_PATH = "/api/mobile/v1";
