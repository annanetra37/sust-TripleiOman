const router = require('express').Router();
const { Pool } = require('pg');
const prisma = require('../config/prisma');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { requireFeature } = require('../middleware/tier');
const { formatError } = require('../utils/errors');

// Database connections are a Professional+ feature — gate the entire router
// in one place so every endpoint here is protected.
router.use(authenticate, requireAdmin, requireFeature('db_connections'));

router.get('/', async (req, res) => {
  try {
    const connections = await prisma.dataConnection.findMany({
      where: { companyId: req.user.companyId },
      orderBy: { createdAt: 'desc' },
    });
    const safe = connections.map((c) => ({
      ...c,
      config: { ...c.config, password: c.config.password ? '****' : undefined },
    }));
    res.json(safe);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, type, config: connConfig } = req.body;
    if (!name) return res.status(400).json({ error: 'Connection name is required.' });

    const validTypes = ['postgresql', 'mysql', 'sqlserver', 'aws_rds', 'rest_api'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: `Invalid connection type "${type}". Supported: ${validTypes.join(', ')}` });
    }

    const connection = await prisma.dataConnection.create({
      data: { companyId: req.user.companyId, name, type, config: connConfig || {} },
    });
    res.status(201).json(connection);
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

router.post('/:id/test', async (req, res) => {
  try {
    const conn = await prisma.dataConnection.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!conn) return res.status(404).json({ error: 'Connection not found.' });

    const cfg = conn.config;

    if (conn.type === 'rest_api') {
      if (!cfg.baseUrl) return res.status(400).json({ error: 'Base URL is required for REST API connections.' });
      const response = await fetch(cfg.baseUrl + (cfg.path || ''), {
        method: cfg.method || 'GET',
        headers: cfg.headers || {},
      });
      if (!response.ok) throw new Error(`API returned status ${response.status}: ${response.statusText}`);
    } else {
      if (!cfg.host) return res.status(400).json({ error: 'Host is required for database connections.' });
      if (!cfg.database) return res.status(400).json({ error: 'Database name is required for database connections.' });
    }

    await prisma.dataConnection.update({
      where: { id: conn.id },
      data: { status: 'connected' },
    });

    res.json({ status: 'connected', message: 'Connection test successful.' });
  } catch (err) {
    const connId = req.params.id;
    try {
      await prisma.dataConnection.update({ where: { id: connId }, data: { status: 'error' } });
    } catch {}
    res.status(400).json({ status: 'error', error: err.message || 'Connection test failed.' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await prisma.dataConnection.deleteMany({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (result.count === 0) return res.status(404).json({ error: 'Connection not found.' });
    res.json({ message: 'Connection deleted successfully.' });
  } catch (err) {
    const { status, error } = formatError(err);
    res.status(status).json({ error });
  }
});

// ─── Browse: List tables in a connection ────────────────────

router.get('/:id/tables', async (req, res) => {
  try {
    const conn = await prisma.dataConnection.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!conn) return res.status(404).json({ error: 'Connection not found.' });

    const cfg = conn.config;
    const schema = cfg.schema || 'public';

    if (!['postgresql', 'aws_rds'].includes(conn.type)) {
      return res.status(400).json({ error: `Table browsing supported for PostgreSQL/RDS. ${conn.type} coming soon.` });
    }

    const pool = new Pool({
      host: cfg.host, port: cfg.port || 5432,
      database: cfg.database, user: cfg.username, password: cfg.password,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
    });

    try {
      const result = await pool.query(
        `SELECT table_name,
                (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name AND c.table_schema = $1) as column_count
         FROM information_schema.tables t
         WHERE t.table_schema = $1 AND t.table_type = 'BASE TABLE'
         ORDER BY table_name`, [schema]
      );

      const tables = [];
      for (const row of result.rows) {
        try {
          const cnt = await pool.query(`SELECT count(*) FROM "${schema}"."${row.table_name}"`);
          tables.push({ name: row.table_name, columns: parseInt(row.column_count), rows: parseInt(cnt.rows[0].count) });
        } catch {
          tables.push({ name: row.table_name, columns: parseInt(row.column_count), rows: '?' });
        }
      }
      res.json({ schema, tables });
    } finally {
      await pool.end();
    }
  } catch (err) {
    console.error('[Connections] Table list error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to list tables.' });
  }
});

// ─── Browse: List columns + sample data ─────────────────────

router.get('/:id/tables/:tableName/columns', async (req, res) => {
  try {
    const conn = await prisma.dataConnection.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!conn) return res.status(404).json({ error: 'Connection not found.' });

    const cfg = conn.config;
    const schema = cfg.schema || 'public';
    const pool = new Pool({
      host: cfg.host, port: cfg.port || 5432,
      database: cfg.database, user: cfg.username, password: cfg.password,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
    });

    try {
      const cols = await pool.query(
        `SELECT column_name, data_type, is_nullable FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2 ORDER BY ordinal_position`, [schema, req.params.tableName]
      );
      const sample = await pool.query(`SELECT * FROM "${schema}"."${req.params.tableName}" LIMIT 5`);
      res.json({
        table: req.params.tableName,
        columns: cols.rows.map((c) => ({ name: c.column_name, type: c.data_type, nullable: c.is_nullable === 'YES' })),
        sampleRows: sample.rows,
      });
    } finally {
      await pool.end();
    }
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to list columns.' });
  }
});

// ─── Pull: Import data from a table ─────────────────────────

router.post('/:id/pull', async (req, res) => {
  try {
    const conn = await prisma.dataConnection.findFirst({
      where: { id: req.params.id, companyId: req.user.companyId },
    });
    if (!conn) return res.status(404).json({ error: 'Connection not found.' });

    const { tableName, limit } = req.body;
    if (!tableName) return res.status(400).json({ error: 'Table name is required.' });

    const cfg = conn.config;
    const schema = cfg.schema || 'public';
    const rowLimit = Math.min(parseInt(limit) || 1000, 10000);

    const pool = new Pool({
      host: cfg.host, port: cfg.port || 5432,
      database: cfg.database, user: cfg.username, password: cfg.password,
      ssl: cfg.ssl ? { rejectUnauthorized: false } : false,
      connectionTimeoutMillis: 10000,
    });

    try {
      const result = await pool.query(`SELECT * FROM "${schema}"."${tableName}" LIMIT $1`, [rowLimit]);
      res.json({ table: tableName, columns: result.fields.map((f) => f.name), rows: result.rows, totalPulled: result.rows.length });
    } finally {
      await pool.end();
    }
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to pull data.' });
  }
});

module.exports = router;
