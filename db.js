// SQLite через sql.js (чистый JS, работает везде)
let dbConfig = null;
let dbData = null;

const DB_CONFIG_NAME = 'resource_config.db';
const DB_DATA_NAME = 'resource_data.db';

// Инициализация БД
async function initDatabases() {
    // Загружаем sql.js
    if (!window.SQL) {
        const SQL = await initSqlJs({
            locateFile: file => `https://sql.js.org/dist/${file}`
        });
        window.SQL = SQL;
    }

    // Конфигурационная БД (не шифруется)
    let configBuffer = localStorage.getItem(DB_CONFIG_NAME);
    if (configBuffer) {
        const bytes = new Uint8Array(configBuffer.split(',').map(Number));
        dbConfig = new window.SQL.Database(bytes);
    } else {
        dbConfig = new window.SQL.Database();
        initConfigSchema();
        saveConfigDB();
    }

    // БД данных (создаём пустую, пока без шифрования)
    let dataBuffer = localStorage.getItem(DB_DATA_NAME);
    if (dataBuffer) {
        const bytes = new Uint8Array(dataBuffer.split(',').map(Number));
        dbData = new window.SQL.Database(bytes);
    } else {
        dbData = new window.SQL.Database();
        initDataSchema();
        saveDataDB();
    }
}

function initConfigSchema() {
    dbConfig.run(`
        CREATE TABLE IF NOT EXISTS auth (
            login_hash TEXT,
            device_hash TEXT,
            salt1 BLOB,
            salt2 BLOB,
            iterations INT
        );
        
        CREATE TABLE IF NOT EXISTS runtime (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `);
    
    // Инициализация runtime, если пусто
    const count = dbConfig.exec("SELECT COUNT(*) FROM runtime");
    if (!count.length || count[0].values[0][0] === 0) {
        dbConfig.run("INSERT INTO runtime (key, value) VALUES ('init_flag', '0')");
        dbConfig.run("INSERT INTO runtime (key, value) VALUES ('last_exit_normal', '1')");
        dbConfig.run("INSERT INTO runtime (key, value) VALUES ('launch_counter', '0')");
        dbConfig.run("INSERT INTO runtime (key, value) VALUES ('debug_mode', '0')");
        dbConfig.run("INSERT INTO runtime (key, value) VALUES ('schema_version', '1')");
    }
}

function initDataSchema() {
    // Пустая схема для data.db (позже добавим таблицы)
    dbData.run(`
        CREATE TABLE IF NOT EXISTS metadata (
            version TEXT
        );
    `);
    dbData.run("INSERT OR IGNORE INTO metadata (version) VALUES ('1.0')");
}

function saveConfigDB() {
    const data = dbConfig.export();
    const bytes = Array.from(data);
    localStorage.setItem(DB_CONFIG_NAME, bytes.join(','));
}

function saveDataDB() {
    const data = dbData.export();
    const bytes = Array.from(data);
    localStorage.setItem(DB_DATA_NAME, bytes.join(','));
}

function getRuntimeValue(key) {
    const result = dbConfig.exec(`SELECT value FROM runtime WHERE key = '${key}'`);
    if (result.length && result[0].values.length) {
        return result[0].values[0][0];
    }
    return null;
}

function setRuntimeValue(key, value) {
    dbConfig.run(`INSERT OR REPLACE INTO runtime (key, value) VALUES ('${key}', '${value}')`);
    saveConfigDB();
}