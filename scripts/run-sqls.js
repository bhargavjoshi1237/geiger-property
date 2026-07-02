require("dotenv").config();
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

// Mirrors geiger-flow's scripts/run-sqls.js. Executes every supabase/sqls/*.sql
// in filename order against the project in STRING_URI. Statements are split on
// top-level `;` (dollar-quoted function bodies are kept intact), `create table`
// / `create index` are made idempotent and skipped when they already exist, and
// everything else (alter/policy/trigger/insert…) re-runs safely because the SQL
// files are written idempotently. Add a feature → drop a new .sql in the folder
// and re-run `node scripts/run-sqls.js`.

const STRING_URI = process.env.STRING_URI;

if (!STRING_URI) {
  console.error("ERROR: STRING_URI environment variable is not set.");
  process.exit(1);
}

const SQL_DIR = "supabase/sqls";

function getSqlFiles() {
  const dir = path.join(process.cwd(), SQL_DIR);
  if (!fs.existsSync(dir)) {
    return [];
  }
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => `${SQL_DIR}/${file}`);
}

const SQL_FILES = getSqlFiles();

function extractTableName(stmt) {
  // Captures an optional schema qualifier so events.* tables are checked in the
  // right schema (defaults to public when unqualified).
  const match = stmt.match(
    /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:(\w+)\.)?(\w+)/i,
  );
  if (!match) return null;
  return { schema: match[1] || "public", name: match[2] };
}

function extractIndexName(stmt) {
  const match = stmt.match(
    /create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?(\w+)/i,
  );
  return match ? match[1] : null;
}

function addIfNotExists(stmt) {
  if (/^create\s+table\s+/i.test(stmt) && !/if\s+not\s+exists/i.test(stmt)) {
    return stmt.replace(/create\s+table\s+/i, "create table if not exists ");
  }
  if (
    /^create\s+(?:unique\s+)?index\s+/i.test(stmt) &&
    !/if\s+not\s+exists/i.test(stmt)
  ) {
    return stmt.replace(/create\s+(?:unique\s+)?index\s+/i, "$&if not exists ");
  }
  return stmt;
}

function stripLeadingComments(stmt) {
  const lines = stmt.split("\n");
  let i = 0;
  while (
    i < lines.length &&
    (lines[i].trim() === "" || lines[i].trim().startsWith("--"))
  ) {
    i++;
  }
  return lines.slice(i).join("\n").trim();
}

function splitStatements(sql) {
  const statements = [];
  let current = "";
  let inDollarQuote = false;
  let dollarTag = "";
  let i = 0;

  while (i < sql.length) {
    if (sql[i] === "$") {
      const tagMatch = sql.slice(i).match(/^\$([a-zA-Z_]*)\$/);
      if (tagMatch) {
        const tag = tagMatch[0];
        if (!inDollarQuote) {
          inDollarQuote = true;
          dollarTag = tag;
          current += tag;
          i += tag.length;
          continue;
        } else if (tag === dollarTag) {
          inDollarQuote = false;
          current += tag;
          i += tag.length;
          dollarTag = "";
          continue;
        }
      }
    }

    if (sql[i] === ";" && !inDollarQuote) {
      current += ";";
      const code = stripLeadingComments(current);
      if (code) {
        statements.push(code);
      }
      current = "";
      i++;
      continue;
    }

    if (sql[i] === "-" && sql[i + 1] === "-" && !inDollarQuote) {
      const lineEnd = sql.indexOf("\n", i);
      if (lineEnd === -1) {
        current += sql.slice(i);
        break;
      }
      current += sql.slice(i, lineEnd + 1);
      i = lineEnd + 1;
      continue;
    }

    current += sql[i];
    i++;
  }

  const code = stripLeadingComments(current);
  if (code) {
    statements.push(code);
  }

  return statements;
}

async function tableExists(client, schema, tableName) {
  const res = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = $2
     ) AS exists`,
    [schema, tableName],
  );
  return res.rows[0].exists;
}

async function indexExists(client, indexName) {
  // Index names are unique per schema; match by name across any schema so
  // events.* indexes are detected too.
  const res = await client.query(
    `SELECT EXISTS (
       SELECT 1 FROM pg_indexes WHERE indexname = $1
     ) AS exists`,
    [indexName],
  );
  return res.rows[0].exists;
}

async function run() {
  const client = new Client({
    connectionString: STRING_URI,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("Connected to database.\n");

    // NOTE: this Supabase project is SHARED across the Geiger suite, so a
    // blanket "drop all flow_* tables" (as geiger-flow does) would destroy other
    // apps' data. --clean here is deliberately scoped to this app's own tables,
    // which live in the dedicated `events` schema.
    if (process.argv.includes("--clean")) {
      console.log("Dropping events.* app tables (events app only)...");
      await client.query(`
        drop table if exists
          events.event_orders,
          events.event_notes,
          events.registrations,
          events.registration_forms,
          events.event_templates,
          events.events,
          events.event_series
        cascade`);
      console.log("Clean complete.\n");
    }

    for (const file of SQL_FILES) {
      const filePath = path.join(process.cwd(), file);
      if (!fs.existsSync(filePath)) {
        console.log(`SKIP (not found): ${file}`);
        continue;
      }

      console.log(`\n========== ${file} ==========`);
      const sql = fs.readFileSync(filePath, "utf-8");
      const statements = splitStatements(sql);

      for (const rawStmt of statements) {
        const stmt = addIfNotExists(rawStmt);
        const table = extractTableName(stmt);
        const tableLabel = table ? `${table.schema}.${table.name}` : null;
        const indexName = extractIndexName(stmt);

        if (
          table &&
          /^create\s+table\s+/i.test(stmt) &&
          (await tableExists(client, table.schema, table.name))
        ) {
          console.log(`  SKIP (exists): table ${tableLabel}`);
          continue;
        }

        if (
          indexName &&
          /^create\s+(?:unique\s+)?index\s+/i.test(stmt) &&
          (await indexExists(client, indexName))
        ) {
          console.log(`  SKIP (exists): index ${indexName}`);
          continue;
        }

        try {
          await client.query(stmt);
          const label = tableLabel
            ? `table ${tableLabel}`
            : indexName
              ? `index ${indexName}`
              : stmt.slice(0, 80).replace(/\n/g, " ");
          console.log(`  OK: ${label}`);
        } catch (err) {
          console.error("Statement error:");
          console.error(err);
        }
      }
    }

    console.log("\nDone.");
  } catch (err) {
    console.error("Fatal error:");
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

run();
