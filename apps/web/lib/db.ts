import { createDb } from "@aiesec/db";
import { getServerEnv } from "./env";

export function getDb() {
  return createDb(getServerEnv().DATABASE_URL);
}
