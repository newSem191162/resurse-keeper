// Определение окружения
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

let debugMode = false;

// Инициализация приложения
async function init() {
    await initDatabases();
    
    // Устанавливаем debug_mode автоматически
    if (!isMobile) {
        setRuntimeValue('debug_mode', '1');
        debugMode = true;
    } else {
        const currentDebug = getRuntimeValue('debug_mode');
        if (currentDebug !== '1') {
            setRuntimeValue('debug_mode', '0');
        }
        debugMode = false;
    }
    
    // Проверяем аварийное завершение
    const lastExit = getRuntimeValue('last_exit_normal');
    const initFlag = getRuntimeValue('init_flag');
    
    if (initFlag === '0') {
        // Первый запуск или незавершённая инициализация
        showMessage('Создайте учётную запись', 'info');
    } else if (lastExit === '0') {
        showMessage('⚠️ Предупреждение: предыдущий сеанс завершился аварийно. Данные должны быть в порядке.', 'info');
    }
    
    // Показываем бейдж отладки
    if (debugMode) {
        const badge = document.getElementById('debugBadge');
        badge.textContent = '🐞 DEBUG MODE';
        badge.style.display = 'block';
        badge.onclick = () => {
            console.log('=== DEBUG INFO ===');
            console.log('isMobile:', isMobile);
            console.log('debugMode:', debugMode);
            console.log('init_flag:', getRuntimeValue('init_flag'));
            console.log('last_exit_normal:', getRuntimeValue('last_exit_normal'));
            console.log('launch_counter:', getRuntimeValue('launch_counter'));
            console.log('accountExists:', accountExists());
            console.log('authenticated:', isAuthenticated());
        };
    } else {
        document.getElementById('debugBadge').style.display = 'none';
    }
    
    // Если уже авторизованы (ключ есть), показываем главный экран
    // Но ключ теряется при перезагрузке, так что всегда сначала экран входа
    showAuthScreen();
    
    // Навешиваем обработчики
    document.getElementById('loginBtn').onclick = handleLogin;
    document.getElementById('registerBtn').onclick = handleRegister;
    document.getElementById('logoutBtn').onclick = () => {
        logout();
    };
}

function showAuthScreen() {
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('mainScreen').classList.add('hidden');
    document.getElementById('login').value = '';
    document.getElementById('password').value = '';
    clearMessage();
}

function showMainScreen() {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('mainScreen').classList.remove('hidden');
    clearMessage();
}

function showMessage(text, type) {
    const msgDiv = document.getElementById('authMessage');
    msgDiv.textContent = text;
    msgDiv.className = `message ${type}`;
    msgDiv.classList.remove('hidden');
}

function clearMessage() {
    const msgDiv = document.getElementById('authMessage');
    msgDiv.classList.add('hidden');
}

async function handleLogin() {
    const login = document.getElementById('login').value.trim();
    const password = document.getElementById('password').value;
    
    if (!login || !password) {
        showMessage('Введите логин и пароль', 'error');
        return;
    }
    
    if (!accountExists()) {
        showMessage('Учётная запись не существует. Создайте её.', 'error');
        return;
    }
    
    showMessage('Проверка...', 'info');
    
    const result = await login(login, password);
    
    if (result.success) {
        showMessage('Вход выполнен!', 'success');
        setTimeout(() => showMainScreen(), 500);
    } else {
        showMessage(result.error, 'error');
    }
}

async function handleRegister() {
    const login = document.getElementById('login').value.trim();
    const password = document.getElementById('password').value;
    
    if (!login || !password) {
        showMessage('Введите логин и пароль', 'error');
        return;
    }
    
    if (password.length < 4) {
        showMessage('Пароль должен быть не менее 4 символов', 'error');
        return;
    }
    
    if (accountExists()) {
        showMessage('Учётная запись уже существует. Выполните вход.', 'error');
        return;
    }
    
    showMessage('Создание учётной записи...', 'info');
    
    const result = await register(login, password);
    
    if (result.success) {
        showMessage('Учётная запись создана! Теперь выполните вход.', 'success');
        // Очищаем поля
        document.getElementById('login').value = '';
        document.getElementById('password').value = '';
    } else {
        showMessage(result.error || 'Ошибка создания', 'error');
    }
}

// Добавляем обработчик аварийного завершения
window.addEventListener('beforeunload', () => {
    if (isAuthenticated()) {
        // Пользователь был авторизован, но закрывает страницу не через кнопку Выйти
        // Устанавливаем флаг аварийного завершения
        setRuntimeValue('last_exit_normal', '0');
        saveConfigDB();
    }
});

// Запуск
init().catch(console.error);