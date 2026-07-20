const { Client } = require('pg');

async function main() {
  const admin = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres',
  });
  await admin.connect();

  const dbs = await admin.query("SELECT 1 FROM pg_database WHERE datname = 'aviator'");
  if (dbs.rowCount === 0) {
    await admin.query('CREATE DATABASE aviator');
    console.log('created database aviator');
  } else {
    console.log('database aviator exists');
  }

  const users = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = 'aviator'");
  if (users.rowCount === 0) {
    await admin.query("CREATE USER aviator WITH PASSWORD 'aviator_secret'");
    console.log('created user aviator');
  } else {
    await admin.query("ALTER USER aviator WITH PASSWORD 'aviator_secret'");
    console.log('reset password for aviator');
  }

  await admin.query('GRANT ALL PRIVILEGES ON DATABASE aviator TO aviator');
  await admin.end();

  const db = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'aviator',
  });
  await db.connect();
  await db.query('GRANT ALL ON SCHEMA public TO aviator');
  await db.query('ALTER SCHEMA public OWNER TO aviator');
  await db.query('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO aviator');
  await db.query('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO aviator');
  await db.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO aviator');
  await db.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO aviator');
  console.log('grants applied');
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
