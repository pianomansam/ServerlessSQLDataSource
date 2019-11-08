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

    this.mysql = serverlessMysql({
      config: {
        ...config.connection,
        debug: true,
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

  executeCachedQuery(knexInstance) {
    const cacheKey = crypto
      .createHash('sha1')
      .update(knexInstance.toString())
      .digest('base64');

    return this.cache.get(cacheKey).then(entry => {
      if (entry) return Promise.resolve(JSON.parse(entry));

      return this._execute(knexInstance).then(rows => {
        if (rows) {
          this.cache.set(cacheKey, JSON.stringify(rows), {
            ttl: knexInstance.useCache(),
          });
        }

        return Promise.resolve(rows);
      });
    });
  }
}

module.exports = { SQLDataSource };
