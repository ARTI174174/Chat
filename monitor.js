// ===== ОТДЕЛЬНЫЙ МОНИТОР ДЛЯ ПРОСМОТРА ВСЕХ СООБЩЕНИЙ =====
// Запускается на порту 3001 отдельно от основного чата

const http = require('http');
const fs = require('fs');
const url = require('url');

const PORT = 3001;
const MONITOR_FILE = 'monitor_log.json';

// Загружаем историю
let messageLog = [];
if (fs.existsSync(MONITOR_FILE)) {
    try {
        messageLog = JSON.parse(fs.readFileSync(MONITOR_FILE));
    } catch (e) {
        messageLog = [];
    }
}

// Сохраняем в файл
function saveLog() {
    fs.writeFileSync(MONITOR_FILE, JSON.stringify(messageLog, null, 2));
}

// ===== ПЕРЕХВАТ СООБЩЕНИЙ ИЗ ОСНОВНОГО СЕРВЕРА =====
// Это нужно добавить в ваш server.js, но мы сделаем отдельный монитор

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    
    // ===== СТРАНИЦА МОНИТОРИНГА =====
    if (parsedUrl.pathname === '/') {
        res.writeHead(200, { 
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        
        // Получаем фильтры
        const filterUser = parsedUrl.query.user || '';
        const filterChat = parsedUrl.query.chat || '';
        const searchText = parsedUrl.query.search || '';
        
        // Фильтруем сообщения
        let filteredMessages = messageLog;
        if (filterUser) {
            filteredMessages = filteredMessages.filter(m => m.sender === filterUser);
        }
        if (filterChat) {
            filteredMessages = filteredMessages.filter(m => m.chatId === filterChat);
        }
        if (searchText) {
            filteredMessages = filteredMessages.filter(m => 
                m.text.toLowerCase().includes(searchText.toLowerCase())
            );
        }
        
        // Разворачиваем хронологически (новые сверху)
        filteredMessages = filteredMessages.reverse();
        
        // Статистика
        const uniqueUsers = [...new Set(messageLog.map(m => m.sender))];
        const uniqueChats = [...new Set(messageLog.map(m => m.chatId))];
        const encryptedCount = messageLog.filter(m => m.encrypted).length;
        
        // Генерируем HTML
        let html = `<!DOCTYPE html>
<html>
<head>
    <title>🔍 DIDI - Монитор сообщений</title>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="5">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            font-family: 'Segoe UI', 'Courier New', monospace;
        }
        body {
            background: #0a0c0e;
            color: #e0e0e0;
            padding: 30px;
        }
        .container {
            max-width: 1600px;
            margin: 0 auto;
        }
        .header {
            background: linear-gradient(135deg, #1a1e24, #0f1217);
            padding: 25px;
            border-radius: 16px;
            margin-bottom: 30px;
            border-left: 6px solid #00ff88;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        h1 {
            color: #00ff88;
            font-size: 32px;
            margin-bottom: 10px;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .badge {
            background: #ff6b6b;
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 14px;
            font-weight: normal;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: #1e1e1e;
            padding: 20px;
            border-radius: 12px;
            border-bottom: 3px solid #00ff88;
        }
        .stat-number {
            font-size: 42px;
            font-weight: 800;
            color: #00ff88;
            font-family: 'Courier New', monospace;
        }
        .stat-label {
            color: #888;
            font-size: 14px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .filters {
            background: #1e1e1e;
            padding: 25px;
            border-radius: 12px;
            margin-bottom: 30px;
            display: flex;
            gap: 15px;
            flex-wrap: wrap;
            align-items: center;
        }
        .filter-input {
            flex: 1;
            min-width: 200px;
            padding: 12px 18px;
            background: #2a2a2a;
            border: 1px solid #444;
            color: white;
            border-radius: 8px;
            font-size: 14px;
        }
        .filter-input:focus {
            border-color: #00ff88;
            outline: none;
        }
        .btn {
            padding: 12px 24px;
            background: #333;
            color: white;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            transition: 0.3s;
            display: inline-flex;
            align-items: center;
            gap: 8px;
        }
        .btn-primary {
            background: linear-gradient(90deg, #667eea, #764ba2);
        }
        .btn-success {
            background: #00ff88;
            color: #000;
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,255,136,0.2);
        }
        .users-panel {
            background: #1e1e1e;
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 30px;
        }
        .user-tag {
            display: inline-block;
            padding: 8px 18px;
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
            border-radius: 25px;
            margin: 5px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            transition: 0.3s;
            box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        }
        .user-tag:hover {
            transform: scale(1.05);
            box-shadow: 0 5px 15px rgba(102,126,234,0.4);
        }
        .chat-list {
            background: #1e1e1e;
            padding: 20px;
            border-radius: 12px;
            margin-bottom: 30px;
        }
        .chat-tag {
            display: inline-block;
            padding: 6px 15px;
            background: #2a2a2a;
            color: #00ff88;
            border-radius: 20px;
            margin: 5px;
            font-size: 12px;
            border: 1px solid #00ff88;
            cursor: pointer;
        }
        .messages {
            background: #1a1a1a;
            border-radius: 12px;
            padding: 20px;
        }
        .message-item {
            background: #222;
            border-left: 4px solid #667eea;
            padding: 18px;
            margin-bottom: 12px;
            border-radius: 8px;
            display: grid;
            grid-template-columns: 80px 140px 1fr 100px;
            gap: 15px;
            align-items: center;
            transition: 0.3s;
        }
        .message-item:hover {
            background: #2a2a2a;
            transform: translateX(5px);
        }
        .message-item.encrypted {
            border-left-color: #00ff88;
            background: #1e2a1e;
        }
        .time {
            color: #888;
            font-family: 'Courier New', monospace;
            font-size: 13px;
        }
        .sender {
            color: #667eea;
            font-weight: 700;
            font-size: 14px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .chat-id {
            color: #ffaa66;
            font-size: 12px;
            font-family: 'Courier New', monospace;
            background: #333;
            padding: 3px 8px;
            border-radius: 4px;
        }
        .message-text {
            color: #fff;
            word-break: break-all;
            font-size: 14px;
            line-height: 1.5;
        }
        .encrypted-badge {
            background: #00ff88;
            color: #000;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: 700;
            display: inline-block;
        }
        .footer {
            margin-top: 40px;
            padding: 20px;
            background: #1e1e1e;
            border-radius: 8px;
            text-align: center;
            color: #666;
            font-size: 12px;
        }
        .auto-refresh {
            margin-left: auto;
            display: flex;
            align-items: center;
            gap: 10px;
            color: #00ff88;
        }
        .highlight {
            background: #ffd700;
            color: #000;
            padding: 2px 5px;
            border-radius: 3px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>
                🔍 DIDI - МОНИТОР СООБЩЕНИЙ 
                <span class="badge">LIVE</span>
            </h1>
            <p style="color: #888;">Порт: ${PORT} | Обновление каждые 5 сек | Всего сообщений: ${messageLog.length}</p>
        </div>
        
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-number">${messageLog.length}</div>
                <div class="stat-label">Всего сообщений</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${uniqueUsers.length}</div>
                <div class="stat-label">Пользователей</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${uniqueChats.length}</div>
                <div class="stat-label">Чатов</div>
            </div>
            <div class="stat-card">
                <div class="stat-number">${encryptedCount}</div>
                <div class="stat-label">Зашифровано 🔐</div>
            </div>
        </div>
        
        <div class="filters">
            <input type="text" id="searchInput" class="filter-input" placeholder="🔍 Поиск по тексту..." value="${searchText}">
            <select id="userSelect" class="filter-input">
                <option value="">👥 Все пользователи</option>
                ${uniqueUsers.map(u => `<option value="${u}" ${filterUser === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
            <select id="chatSelect" class="filter-input">
                <option value="">💬 Все чаты</option>
                ${uniqueChats.map(c => `<option value="${c}" ${filterChat === c ? 'selected' : ''}>${c.substring(0, 30)}...</option>`).join('')}
            </select>
            <button class="btn btn-primary" onclick="applyFilters()">🔍 Применить</button>
            <button class="btn" onclick="clearFilters()">🗑️ Сбросить</button>
            <button class="btn" onclick="exportData()">📥 Экспорт JSON</button>
            <button class="btn" onclick="clearAll()">⚠️ Очистить всё</button>
            <div class="auto-refresh">
                <span>⏱️ Автообновление</span>
                <span>5 сек</span>
            </div>
        </div>
        
        <div class="users-panel">
            <h3 style="margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
                👥 Активные пользователи 
                <span style="background: #00ff88; color: #000; padding: 2px 10px; border-radius: 20px; font-size: 12px;">${uniqueUsers.length}</span>
            </h3>
            <div>
                ${uniqueUsers.map(u => `<span class="user-tag" onclick="filterByUser('${u}')">${u}</span>`).join('')}
            </div>
        </div>
        
        <div class="chat-list">
            <h3 style="margin-bottom: 15px;">💬 Активные чаты</h3>
            <div>
                ${uniqueChats.map(c => `<span class="chat-tag" onclick="filterByChat('${c}')">${c.substring(0, 20)}...</span>`).join('')}
            </div>
        </div>
        
        <div class="messages">
            <h3 style="margin-bottom: 20px; display: flex; justify-content: space-between;">
                <span>📨 Лента сообщений (${filteredMessages.length})</span>
                <span style="color: #888; font-size: 12px;">🔐 Зашифровано • ✅ Доставлено • ✓✓ Прочитано</span>
            </h3>
            
            ${filteredMessages.length === 0 ? `
                <div style="text-align: center; padding: 60px; color: #666;">
                    <div style="font-size: 48px; margin-bottom: 20px;">📭</div>
                    <h3>Нет сообщений</h3>
                    <p>Сообщения появятся здесь когда пользователи начнут чатиться</p>
                </div>
            ` : filteredMessages.map(msg => `
                <div class="message-item ${msg.encrypted ? 'encrypted' : ''}">
                    <div class="time">${msg.time || '--:--'}</div>
                    <div class="sender">
                        ${msg.sender}
                        ${msg.encrypted ? '<span class="encrypted-badge">🔐 E2EE</span>' : ''}
                    </div>
                    <div class="message-text">${escapeHtml(msg.text)}</div>
                    <div class="chat-id">${msg.chatId.substring(0, 16)}...</div>
                </div>
            `).join('')}
        </div>
        
        <div class="footer">
            🔐 DIDI E2EE Монитор | RSA-2048 | Все сообщения перехватываются ДО шифрования | 
            Версия 2.0 | ${new Date().toLocaleString()}
        </div>
    </div>
    
    <script>
        function applyFilters() {
            let url = '/?';
            const search = document.getElementById('searchInput').value;
            const user = document.getElementById('userSelect').value;
            const chat = document.getElementById('chatSelect').value;
            
            if (search) url += 'search=' + encodeURIComponent(search) + '&';
            if (user) url += 'user=' + encodeURIComponent(user) + '&';
            if (chat) url += 'chat=' + encodeURIComponent(chat) + '&';
            
            window.location.href = url;
        }
        
        function clearFilters() {
            window.location.href = '/';
        }
        
        function filterByUser(username) {
            window.location.href = '/?user=' + encodeURIComponent(username);
        }
        
        function filterByChat(chatId) {
            window.location.href = '/?chat=' + encodeURIComponent(chatId);
        }
        
        function exportData() {
            window.location.href = '/export';
        }
        
        function clearAll() {
            if (confirm('❌ Очистить ВСЮ историю сообщений из монитора?')) {
                window.location.href = '/clear';
            }
        }
    </script>
</body>
</html>`;
        
        res.end(html);
    }
    
    // ===== API ДЛЯ ДОБАВЛЕНИЯ СООБЩЕНИЙ =====
    else if (parsedUrl.pathname === '/api/log' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                data.timestamp = Date.now();
                data.receivedAt = new Date().toISOString();
                
                // Добавляем в лог
                messageLog.push(data);
                
                // Ограничиваем размер лога (последние 1000 сообщений)
                if (messageLog.length > 1000) {
                    messageLog = messageLog.slice(-1000);
                }
                
                saveLog();
                
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, count: messageLog.length }));
            } catch (e) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: e.message }));
            }
        });
    }
    
    // ===== ЭКСПОРТ ДАННЫХ =====
    else if (parsedUrl.pathname === '/export') {
        res.writeHead(200, { 
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename=didi_monitor_export.json'
        });
        res.end(JSON.stringify({
            exportDate: new Date().toISOString(),
            totalMessages: messageLog.length,
            users: [...new Set(messageLog.map(m => m.sender))],
            chats: [...new Set(messageLog.map(m => m.chatId))],
            messages: messageLog
        }, null, 2));
    }
    
    // ===== ОЧИСТКА ЛОГА =====
    else if (parsedUrl.pathname === '/clear') {
        messageLog = [];
        saveLog();
        res.writeHead(302, { 'Location': '/' });
        res.end();
    }
    
    // ===== СТАТИСТИКА JSON =====
    else if (parsedUrl.pathname === '/api/stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            totalMessages: messageLog.length,
            users: [...new Set(messageLog.map(m => m.sender))],
            chats: [...new Set(messageLog.map(m => m.chatId))],
            encrypted: messageLog.filter(m => m.encrypted).length,
            lastUpdate: new Date().toISOString()
        }));
    }
    
    else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

// Функция для экранирования HTML
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

server.listen(PORT, () => {
    console.log('\n🔍 ===== DIDI МОНИТОР СООБЩЕНИЙ =====');
    console.log(`📡 Сервер запущен на порту: ${PORT}`);
    console.log(`🌐 Открой в браузере: http://localhost:${PORT}`);
    console.log(`📁 Лог-файл: ${MONITOR_FILE}`);
    console.log(`📊 Всего сообщений в логе: ${messageLog.length}`);
    console.log('=====================================\n');
});

// Обработка завершения
process.on('SIGINT', () => {
    console.log('\n💾 Сохраняю лог перед выходом...');
    saveLog();
    process.exit();
});