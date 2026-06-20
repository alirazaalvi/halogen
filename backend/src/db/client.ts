import { drizzle } from "drizzle-orm/node-postgres";
import { pool } from "./connection";
import { schema } from "./schema";

export const db = drizzle(pool, { schema });
