// Криптография
let encryptionKey = null; // Ключ в памяти
let currentUser = null;

// Генерация слепка устройства
async function getDeviceFingerprint() {
    const components = [
        navigator.userAgent,
        screen.width + 'x' + screen.height,
        screen.colorDepth,
        navigator.language,
        navigator.hardwareConcurrency || 0,
        navigator.deviceMemory || 0,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
        // Псевдо-ID из localStorage
        localStorage.getItem('device_fingerprint_seed') || (() => {
            const seed = Math.random().toString(36) + Date.now();
            localStorage.setItem('device_fingerprint_seed', seed);
            return seed;
        })()
    ];
    
    // Попытка получить модель устройства (через UA)
    const ua = navigator.userAgent;
    const match = ua.match(/\(([^)]+)\)/);
    if (match && (ua.includes('Android') || ua.includes('iPhone'))) {
        components.push(match[1]); // Модель из UA
    }
    
    const str = components.join('|');
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// PBKDF2 для получения ключа
async function deriveKey(login, password, fingerprint, salt, iterations = 100000) {
    const input = `${login}:${password}:${fingerprint}`;
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(input),
        'PBKDF2',
        false,
        ['deriveBits', 'deriveKey']
    );
    
    const saltBuffer = typeof salt === 'string' ? encoder.encode(salt) : new Uint8Array(salt);
    
    return await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: iterations,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
}

// Хеш для проверки (scrypt нет в WebCrypto, используем PBKDF2)
async function hashForCheck(login, fingerprint, salt, iterations = 100000) {
    const input = `${login}:${fingerprint}`;
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(input),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    
    const saltBuffer = typeof salt === 'string' ? encoder.encode(salt) : new Uint8Array(salt);
    
    const bits = await crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: saltBuffer,
            iterations: iterations,
            hash: 'SHA-256'
        },
        keyMaterial,
        256
    );
    
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Проверка, существует ли уже учётка
function accountExists() {
    const result = dbConfig.exec("SELECT COUNT(*) FROM auth");
    return result.length && result[0].values[0][0] > 0;
}

// Создание учётной записи
async function register(login, password) {
    const isDebug = getRuntimeValue('debug_mode') === '1';
    const fingerprint = isDebug ? 'debug_mode_enabled' : await getDeviceFingerprint();
    
    // Генерация солей
    const salt1 = crypto.getRandomValues(new Uint8Array(32));
    const salt2 = crypto.getRandomValues(new Uint8Array(32));
    const iterations = 100000;
    
    const loginHash = await hashForCheck(login, fingerprint, salt1, iterations);
    
    // Сохраняем в auth
    dbConfig.run(
        `INSERT INTO auth (login_hash, device_hash, salt1, salt2, iterations) 
         VALUES (?, ?, ?, ?, ?)`,
        [loginHash, isDebug ? '' : fingerprint, salt1, salt2, iterations]
    );
    saveConfigDB();
    
    // Устанавливаем флаг инициализации
    setRuntimeValue('init_flag', '1');
    setRuntimeValue('launch_counter', (parseInt(getRuntimeValue('launch_counter')) + 1).toString());
    
    return { success: true };
}

// Вход
async function login(login, password) {
    const isDebug = getRuntimeValue('debug_mode') === '1';
    const fingerprint = isDebug ? 'debug_mode_enabled' : await getDeviceFingerprint();
    
    // Получаем данные из auth
    const result = dbConfig.exec("SELECT login_hash, device_hash, salt1, salt2, iterations FROM auth LIMIT 1");
    if (!result.length || !result[0].values.length) {
        return { success: false, error: 'Учётная запись не найдена. Создайте её.' };
    }
    
    const [storedLoginHash, storedDeviceHash, salt1, salt2, iterations] = result[0].values[0];
    
    // Проверка логина
    const computedLoginHash = await hashForCheck(login, fingerprint, salt1, iterations);
    if (computedLoginHash !== storedLoginHash) {
        return { success: false, error: 'Неверный логин или пароль' };
    }
    
    // Проверка слепка (только не в debug)
    if (!isDebug && storedDeviceHash !== fingerprint) {
        return { success: false, error: 'Это устройство не авторизовано' };
    }
    
    // Вычисляем ключ шифрования
    encryptionKey = await deriveKey(login, password, fingerprint, salt2, iterations);
    currentUser = login;
    
    // Обновляем счётчик и флаг выхода
    setRuntimeValue('launch_counter', (parseInt(getRuntimeValue('launch_counter')) + 1).toString());
    setRuntimeValue('last_exit_normal', '1'); // При входе сбрасываем аварийный флаг
    
    return { success: true };
}

// Выход
function logout() {
    encryptionKey = null;
    currentUser = null;
    setRuntimeValue('last_exit_normal', '1');
    location.reload();
}

// Проверка авторизации
function isAuthenticated() {
    return encryptionKey !== null;
}

// Получить ключ (для шифрования данных позже)
function getEncryptionKey() {
    return encryptionKey;
}