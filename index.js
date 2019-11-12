/* eslint-disable no-console */
/* eslint-disable no-underscore-dangle */
const crypto = require('crypto');
const { DataSource } = require('apollo-datasource');
const { InMemoryLRUCache } = require('apollo-server-caching');
const knex = require('knex');
const knexTinyLogger = require('knex-tiny-logger').default;
const serverlessMysql = require('serverless-mysql');

const { DEBUG } = process.env;

let hasLogger = false;

class SQLDataSource extends DataSource {
  constructor(config) {
    super();

    // eslint-disable-next-line no-unused-expressions
    this.context;
    // eslint-disable-next-line no-unused-expressions
    this.cache;

    this.db = knex({ client: 'mysql', debug: true });

    this.defaultTTL = config.defaultTTL;

    this.mysql = serverlessMysql({
      config: {
        ...config.connection,
      },
      onConnect: () => {
        console.log('onConnect');
      },
      onKill: threadId => {
        console.log('onKill', threadId);
      },
      onClose: () => {
        console.log('onClose');
      },
      onConnectError: e => {
        console.log(`onConnectError: ${e.code}`);
      },
      onError: e => {
        console.log(`onError: ${e.code}`);
      },
      onKillError: e => {
        console.log(`onKillError: ${e.code}`);
      },
      onRetry: (err, retries, delay, type) => {
        console.log('onRetry', { err, retries, delay, type });
      },
    });

    if (!this.db.cache) {
      knex.QueryBuilder.extend('cache', function cache(ttl) {
        this._cache = ttl;
        return this;
      });
      knex.QueryBuilder.extend('useCache', function useCache() {
        return this._cache;
      });
    }

    const self = this;
    if (!this.db.execute) {
      knex.QueryBuilder.extend('execute', function execute() {
        return self.execute(this);
      });
    }
  }

  initialize(config) {
    this.context = config.context;
    this.cache = config.cache || new InMemoryLRUCache();

    if (DEBUG && !hasLogger) {
      hasLogger = true; // Prevent duplicate loggers
      knexTinyLogger(this.db); // Add a logging utility for debugging
    }
  }

  _execute(knexInstance) {
    const query = knexInstance.toSQL().toNative();
    return this.mysql.query(query.sql, query.bindings);
  }

  execute(knexInstance) {
    if (typeof knexInstance.useCache() !== 'undefined') {
      return this.executeCachedQuery(knexInstance);
    }

    return this._execute(knexInstance);
  }

  createCacheKey(s) {
    return crypto
      .createHash('sha1')
      .update(s)
      .digest('base64');
  }

  async executeCachedQuery(knexInstance) {
    const cacheKey = this.createCacheKey(knexInstance.toString());

    const entry = await this.cache.get(cacheKey);

    if (entry) return JSON.parse(entry);

    const rows = await this._execute(knexInstance);

    if (rows) {
      await this.updateCache(knexInstance, rows);
    }

    return rows;
  }

  async updateCache(knexInstance, rows, force = false) {
    const cacheKey = this.createCacheKey(knexInstance.toString());
    await this.cache.set(cacheKey, JSON.stringify(rows), {
      ttl: force ? this.defaultTTL : knexInstance.useCache(),
    });
  }
}

module.exports = { SQLDataSource };
