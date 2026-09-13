const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const rawUrl = process.env.SUPABASE_URL || '';
const supabaseUrl = rawUrl.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const supabaseKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();

// Check if live Supabase is configured
const isPlaceholder = !supabaseUrl ||
  !supabaseKey ||
  supabaseUrl.includes('placeholder-project') ||
  supabaseKey.includes('placeholder');

const isTestEnv = process.env.NODE_ENV === 'test' && process.env.USE_LIVE_DB_IN_TESTS !== 'true';

let client;

if (!isPlaceholder && !isTestEnv && process.env.USE_MOCK_DB !== 'true') {
  client = createClient(supabaseUrl, supabaseKey);
} else {
  // Built-in in-memory fallback adapter for testing and offline development
  // Mirrors Supabase PostgREST query builder API
  const memoryStore = {
    telemetry_packets: [],
    intermediate_files: [],
    idfs_datasets: [],
    archive_records: [],
    users: [],
    system_logs: []
  };

  let idCounters = {
    telemetry_packets: 1,
    intermediate_files: 1,
    idfs_datasets: 1,
    archive_records: 1,
    users: 1,
    system_logs: 1
  };

  class MockQueryBuilder {
    constructor(tableName) {
      this.tableName = tableName;
      if (!memoryStore[tableName]) {
        memoryStore[tableName] = [];
        idCounters[tableName] = 1;
      }
      this.table = memoryStore[tableName];
      this.filters = [];
      this.selectFields = '*';
      this.orderRules = [];
      this.limitCount = null;
      this.isSingle = false;
      this.isMaybeSingle = false;
      this.pendingAction = null;
    }

    select(fields = '*') {
      this.selectFields = fields;
      if (!this.pendingAction) this.pendingAction = 'select';
      return this;
    }

    insert(data) {
      this.pendingAction = 'insert';
      this.insertData = Array.isArray(data) ? data : [data];
      return this;
    }

    upsert(data, options = {}) {
      this.pendingAction = 'upsert';
      this.upsertData = Array.isArray(data) ? data : [data];
      this.onConflict = options.onConflict || 'id';
      return this;
    }

    update(data) {
      this.pendingAction = 'update';
      this.updateData = data;
      return this;
    }

    delete() {
      this.pendingAction = 'delete';
      return this;
    }

    eq(column, value) {
      this.filters.push((row) => row[column] === value);
      return this;
    }

    neq(column, value) {
      this.filters.push((row) => row[column] !== value);
      return this;
    }

    gte(column, value) {
      this.filters.push((row) => row[column] >= value);
      return this;
    }

    lte(column, value) {
      this.filters.push((row) => row[column] <= value);
      return this;
    }

    order(column, { ascending = true } = {}) {
      this.orderRules.push({ column, ascending });
      return this;
    }

    limit(count) {
      this.limitCount = count;
      return this;
    }

    single() {
      this.isSingle = true;
      return this;
    }

    maybeSingle() {
      this.isMaybeSingle = true;
      return this;
    }

    async then(resolve, reject) {
      try {
        let result = null;
        let error = null;

        if (this.pendingAction === 'insert') {
          const inserted = [];
          for (const item of this.insertData) {
            const copy = { ...item };
            if (copy.id === undefined) {
              copy.id = idCounters[this.tableName]++;
            }
            if (this.tableName === 'telemetry_packets' && !copy.received_at) {
              copy.received_at = new Date().toISOString();
            }
            if (this.tableName === 'system_logs' && !copy.created_at) {
              copy.created_at = new Date().toISOString();
            }
            if (this.tableName === 'intermediate_files' && !copy.generated_at) {
              copy.generated_at = new Date().toISOString();
            }
            if (this.tableName === 'idfs_datasets' && !copy.created_at) {
              copy.created_at = new Date().toISOString();
            }
            if (this.tableName === 'archive_records' && !copy.stored_at) {
              copy.stored_at = new Date().toISOString();
            }
            this.table.push(copy);
            inserted.push(copy);
          }
          result = inserted;
        } else if (this.pendingAction === 'upsert') {
          const upserted = [];
          for (const item of this.upsertData) {
            const conflictKey = this.onConflict;
            const existingIdx = this.table.findIndex(
              (row) => row[conflictKey] === item[conflictKey]
            );
            if (existingIdx >= 0) {
              this.table[existingIdx] = { ...this.table[existingIdx], ...item };
              upserted.push(this.table[existingIdx]);
            } else {
              const copy = { ...item };
              if (copy.id === undefined) copy.id = idCounters[this.tableName]++;
              this.table.push(copy);
              upserted.push(copy);
            }
          }
          result = upserted;
        } else if (this.pendingAction === 'update') {
          const updated = [];
          for (let i = 0; i < this.table.length; i++) {
            if (this.filters.every((f) => f(this.table[i]))) {
              this.table[i] = { ...this.table[i], ...this.updateData };
              updated.push(this.table[i]);
            }
          }
          result = updated;
        } else if (this.pendingAction === 'delete') {
          const kept = [];
          const deleted = [];
          for (const row of this.table) {
            if (this.filters.every((f) => f(row))) {
              deleted.push(row);
            } else {
              kept.push(row);
            }
          }
          memoryStore[this.tableName] = kept;
          this.table = kept;
          result = deleted;
        } else {
          // select
          let rows = this.table.filter((row) =>
            this.filters.every((f) => f(row))
          );

          for (const { column, ascending } of this.orderRules) {
            rows.sort((a, b) => {
              if (a[column] < b[column]) return ascending ? -1 : 1;
              if (a[column] > b[column]) return ascending ? 1 : -1;
              return 0;
            });
          }

          if (this.limitCount !== null) {
            rows = rows.slice(0, this.limitCount);
          }

          result = rows.map((r) => ({ ...r }));
        }

        if (this.isSingle) {
          if (!result || result.length === 0) {
            error = { message: 'Row not found', code: 'PGRST116' };
            result = null;
          } else {
            result = result[0];
          }
        } else if (this.isMaybeSingle) {
          result = result && result.length > 0 ? result[0] : null;
        }

        resolve({ data: result, error });
      } catch (err) {
        resolve({ data: null, error: err });
      }
    }
  }

  client = {
    from: (table) => new MockQueryBuilder(table),
    _memoryStore: memoryStore,
    _resetMemoryStore: () => {
      for (const key of Object.keys(memoryStore)) {
        memoryStore[key] = [];
        idCounters[key] = 1;
      }
    }
  };
}

module.exports = client;
