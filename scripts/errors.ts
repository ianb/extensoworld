import { execSync } from "node:child_process";

const args = process.argv.slice(2);
let search = "";
let full = false;
let limit = 20;

for (let i = 0; i < args.length; i++) {
  const arg = args[i]!;
  if (arg === "--search" && args[i + 1]) {
    search = args[i + 1]!;
    i++;
  } else if (arg.startsWith("--search=")) {
    search = arg.slice("--search=".length);
  } else if (arg === "--full") {
    full = true;
  } else if (arg === "--limit" && args[i + 1]) {
    limit = Number(args[i + 1]);
    i++;
  }
}

const columns = full
  ? "*"
  : "timestamp, source, message, stack, context, user_id, game_id";

const where = search
  ? `WHERE message LIKE '%${search.replace(/'/g, "''")}%' OR stack LIKE '%${search.replace(/'/g, "''")}%' OR context LIKE '%${search.replace(/'/g, "''")}%'`
  : "";

const sql = `SELECT ${columns} FROM error_log ${where} ORDER BY timestamp DESC LIMIT ${limit}`;

try {
  const result = execSync(
    `wrangler d1 execute rooms-upon-rooms --remote --command "${sql.replace(/"/g, '\\"')}"`,
    { stdio: "inherit" },
  );
} catch (_e) {
  process.exit(1);
}
