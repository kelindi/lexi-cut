use rusqlite::{Connection, params};
use std::path::PathBuf;
use std::sync::Mutex;

/// Cache database wrapper with thread-safe connection
pub struct CacheDb {
    conn: Mutex<Connection>,
}

impl CacheDb {
    /// Initialize the cache database
    pub fn init(app_data_dir: PathBuf) -> Result<Self, String> {
        // Ensure directory exists
        std::fs::create_dir_all(&app_data_dir)
            .map_err(|e| format!("Failed to create app data dir: {}", e))?;

        let db_path = app_data_dir.join("cache.db");
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("Failed to open database: {}", e))?;

        // Create tables
        conn.execute(
            "CREATE TABLE IF NOT EXISTS cache (
                cid TEXT NOT NULL,
                data_type TEXT NOT NULL,
                data_json TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (cid, data_type)
            )",
            [],
        )
        .map_err(|e| format!("Failed to create cache table: {}", e))?;

        // Create indexes
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cache_type ON cache(data_type)",
            [],
        )
        .map_err(|e| format!("Failed to create type index: {}", e))?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cache_updated ON cache(updated_at)",
            [],
        )
        .map_err(|e| format!("Failed to create updated index: {}", e))?;

        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Get cached data by CID and data type
    pub fn get_cached(&self, cid: &str, data_type: &str) -> Result<Option<String>, String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let mut stmt = conn
            .prepare("SELECT data_json FROM cache WHERE cid = ?1 AND data_type = ?2")
            .map_err(|e| format!("Prepare error: {}", e))?;

        let result: Result<String, _> = stmt.query_row(params![cid, data_type], |row| row.get(0));

        match result {
            Ok(json) => Ok(Some(json)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(format!("Query error: {}", e)),
        }
    }

    /// Set cached data by CID and data type
    pub fn set_cached(&self, cid: &str, data_type: &str, data_json: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("Lock error: {}", e))?;

        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| format!("Time error: {}", e))?
            .as_secs() as i64;

        conn.execute(
            "INSERT OR REPLACE INTO cache (cid, data_type, data_json, created_at, updated_at)
             VALUES (?1, ?2, ?3,
                COALESCE((SELECT created_at FROM cache WHERE cid = ?1 AND data_type = ?2), ?4),
                ?4)",
            params![cid, data_type, data_json, now],
        )
        .map_err(|e| format!("Insert error: {}", e))?;

        Ok(())
    }
}
