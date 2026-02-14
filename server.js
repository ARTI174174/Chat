const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();

// Middleware (промежуточное ПО)
app.use(cors()); // Разрешаем запросы с других доменов (потом с фронтенда)
app.use(express.json()); // Позволяет серверу читать JSON из тела запроса

// Подключаем базу данных
const db = new sqlite3.Database('./database.db');

// Создаём таблицу users, если её нет
db.run(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL
  )
`, (err) => {
  if (err) {
    console.error('Ошибка создания таблицы:', err);
  } else {
    console.log('Таблица users готова');
  }
});

// ========== НОВЫЕ ТАБЛИЦЫ ДЛЯ ЧАТОВ ==========
// Создаём таблицу chats (чаты)
db.run(`
  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('private', 'group')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`, (err) => {
  if (err) {
    console.error('Ошибка создания таблицы chats:', err);
  } else {
    console.log('Таблица chats готова');
  }
});

// Создаём таблицу chat_users (кто в каком чате состоит)
db.run(`
  CREATE TABLE IF NOT EXISTS chat_users (
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (chat_id, user_id),
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`, (err) => {
  if (err) {
    console.error('Ошибка создания таблицы chat_users:', err);
  } else {
    console.log('Таблица chat_users готова');
  }
});

// Создаём таблицу messages (сообщения)
db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    text TEXT,
    image_url TEXT,
    voice_url TEXT,
    message_type TEXT NOT NULL CHECK(message_type IN ('text', 'image', 'voice')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )
`, (err) => {
  if (err) {
    console.error('Ошибка создания таблицы messages:', err);
  } else {
    console.log('Таблица messages готова');
  }
});
// ========== КОНЕЦ НОВЫХ ТАБЛИЦ ==========
// Маршрут для регистрации (уже есть)
app.post('/register', (req, res) => {
  const { username, password } = req.body;

  // Простая валидация
  if (!username || !password) {
    return res.status(400).json({ error: 'Нужно указать имя пользователя и пароль' });
  }

  const sql = `INSERT INTO users (username, password) VALUES (?, ?)`;
  db.run(sql, [username, password], function(err) {
    if (err) {
      // Если пользователь уже существует
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(400).json({ error: 'Пользователь с таким именем уже существует' });
      }
      return res.status(500).json({ error: 'Ошибка базы данных' });
    }

    // Успех! Возвращаем данные нового пользователя
    res.status(201).json({
      message: 'Пользователь создан',
      user: {
        id: this.lastID, // ID только что созданной записи
        username: username
      }
    });
  });
});

// ========== НОВЫЙ МАРШРУТ: ВХОД ==========
app.post('/login', (req, res) => {
  const { username, password } = req.body;

  // 1. Проверяем, что передали оба поля
  if (!username || !password) {
    return res.status(400).json({ error: 'Нужно указать имя пользователя и пароль' });
  }

  // 2. Ищем пользователя в базе
  const sql = `SELECT id, username, password FROM users WHERE username = ?`;
  db.get(sql, [username], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Ошибка базы данных' });
    }

    // 3. Если пользователь не найден
    if (!row) {
      return res.status(401).json({ error: 'Пользователь не найден' });
    }

    // 4. Проверяем пароль (ПОКА ПРОСТОЕ СРАВНЕНИЕ СТРОК!)
    if (row.password !== password) {
      return res.status(401).json({ error: 'Неверный пароль' });
    }

    // 5. УСПЕХ! Возвращаем данные пользователя (без пароля!)
    res.json({
      message: 'Вход выполнен',
      user: {
        id: row.id,
        username: row.username
      }
    });
  });
});

// ========== НОВЫЙ КОД ДЛЯ ВХОДА ==========
// Когда приходит запрос на /login
app.post('/login', (req, res) => {
  // Получаем логин и пароль из запроса
  const { username, password } = req.body;

  // Проверяем, что оба поля заполнены
  if (!username || !password) {
    return res.json({ 
      success: false, 
      message: 'Нужно указать имя пользователя и пароль' 
    });
  }

  // Ищем пользователя в базе данных
  const sql = `SELECT id, username, password FROM users WHERE username = ?`;
  
  db.get(sql, [username], (err, row) => {
    if (err) {
      return res.json({ 
        success: false, 
        message: 'Ошибка базы данных' 
      });
    }

    // Если пользователь не найден
    if (!row) {
      return res.json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }

    // Проверяем пароль (пока простое сравнение)
    if (row.password !== password) {
      return res.json({ 
        success: false, 
        message: 'Неверный пароль' 
      });
    }

    // ВСЁ ПРАВИЛЬНО! Возвращаем успех
    res.json({
      success: true,
      message: 'Вход выполнен',
      user: {
        id: row.id,
        username: row.username
      }
    });
  });
});
// ========== КОНЕЦ НОВОГО КОДА ==========
// ========== СОЗДАНИЕ ЛИЧНОГО ЧАТА ==========
// POST /chats - создать личный чат с другим пользователем
app.post('/chats', (req, res) => {
  const { user1_id, user2_id } = req.body;

  // Проверяем, что передали ID обоих пользователей
  if (!user1_id || !user2_id) {
    return res.status(400).json({ 
      success: false, 
      message: 'Нужно указать ID обоих пользователей' 
    });
  }

  // Проверяем, что это разные пользователи
  if (user1_id === user2_id) {
    return res.status(400).json({ 
      success: false, 
      message: 'Нельзя создать чат с самим собой' 
    });
  }

  // Сначала проверяем, что оба пользователя существуют
  const checkUsersSql = `SELECT id FROM users WHERE id IN (?, ?)`;
  db.all(checkUsersSql, [user1_id, user2_id], (err, rows) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Ошибка базы данных' 
      });
    }

    // Если нашли меньше 2 пользователей - кого-то нет
    if (rows.length < 2) {
      return res.status(404).json({ 
        success: false, 
        message: 'Один из пользователей не найден' 
      });
    }

    // Проверяем, не существует ли уже такой чат
    const checkChatSql = `
      SELECT c.id 
      FROM chats c
      JOIN chat_users cu1 ON c.id = cu1.chat_id
      JOIN chat_users cu2 ON c.id = cu2.chat_id
      WHERE c.type = 'private' 
        AND cu1.user_id = ? 
        AND cu2.user_id = ?
    `;
    
    db.get(checkChatSql, [user1_id, user2_id], (err, existingChat) => {
      if (err) {
        return res.status(500).json({ 
          success: false, 
          message: 'Ошибка базы данных' 
        });
      }

      // Если чат уже существует
      if (existingChat) {
        return res.status(400).json({ 
          success: false, 
          message: 'Чат уже существует',
          chat_id: existingChat.id
        });
      }

      // СОЗДАЁМ НОВЫЙ ЧАТ
      // 1. Создаём запись в таблице chats
      const createChatSql = `
        INSERT INTO chats (name, type) 
        VALUES (?, 'private')
      `;
      const chatName = `Чат ${user1_id}-${user2_id}`;
      
      db.run(createChatSql, [chatName], function(err) {
        if (err) {
          return res.status(500).json({ 
            success: false, 
            message: 'Ошибка создания чата' 
          });
        }

        const chatId = this.lastID; // ID созданного чата
        
        // 2. Добавляем обоих пользователей в чат
        const addUsersSql = `INSERT INTO chat_users (chat_id, user_id) VALUES (?, ?)`;
        
        // Первый пользователь
        db.run(addUsersSql, [chatId, user1_id], (err) => {
          if (err) {
            // Если ошибка - удаляем созданный чат
            db.run(`DELETE FROM chats WHERE id = ?`, [chatId]);
            return res.status(500).json({ 
              success: false, 
              message: 'Ошибка добавления пользователя в чат' 
            });
          }

          // Второй пользователь
          db.run(addUsersSql, [chatId, user2_id], (err) => {
            if (err) {
              // Если ошибка - удаляем созданный чат
              db.run(`DELETE FROM chats WHERE id = ?`, [chatId]);
              return res.status(500).json({ 
                success: false, 
                message: 'Ошибка добавления пользователя в чат' 
              });
            }

            // ВСЁ УСПЕШНО!
            res.status(201).json({
              success: true,
              message: 'Чат создан',
              chat: {
                id: chatId,
                name: chatName,
                type: 'private',
                participants: [user1_id, user2_id]
              }
            });
          });
        });
      });
    });
  });
});
// ========== КОНЕЦ СОЗДАНИЯ ЧАТА ==========
// ========== ПОЛУЧЕНИЕ ЧАТОВ ПОЛЬЗОВАТЕЛЯ ==========
// GET /chats/:user_id - получить все чаты пользователя
app.get('/chats/:user_id', (req, res) => {
  const userId = req.params.user_id;

  // Проверяем, что пользователь существует
  const checkUserSql = `SELECT id FROM users WHERE id = ?`;
  db.get(checkUserSql, [userId], (err, user) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Ошибка базы данных' 
      });
    }

    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Пользователь не найден' 
      });
    }

    // Получаем все чаты пользователя
    const getChatsSql = `
      SELECT 
        c.id,
        c.name,
        c.type,
        c.created_at,
        GROUP_CONCAT(cu.user_id) as participant_ids
      FROM chats c
      JOIN chat_users cu ON c.id = cu.chat_id
      WHERE c.id IN (
        SELECT chat_id FROM chat_users WHERE user_id = ?
      )
      GROUP BY c.id
      ORDER BY c.created_at DESC
    `;

    db.all(getChatsSql, [userId], (err, chats) => {
      if (err) {
        return res.status(500).json({ 
          success: false, 
          message: 'Ошибка базы данных' 
        });
      }

      // Форматируем ответ
      const formattedChats = chats.map(chat => ({
        id: chat.id,
        name: chat.name,
        type: chat.type,
        created_at: chat.created_at,
        participants: chat.participant_ids.split(',').map(id => parseInt(id))
      }));

      res.json({
        success: true,
        message: 'Список чатов получен',
        chats: formattedChats
      });
    });
  });
});
// ========== КОНЕЦ ПОЛУЧЕНИЯ ЧАТОВ ==========
// ========== ОТПРАВКА СООБЩЕНИЯ ==========
// POST /messages - отправить сообщение в чат
app.post('/messages', (req, res) => {
  const { chat_id, user_id, text, message_type } = req.body;

  // Проверяем обязательные поля
  if (!chat_id || !user_id || !message_type) {
    return res.status(400).json({ 
      success: false, 
      message: 'Нужно указать chat_id, user_id и message_type' 
    });
  }

  // Проверяем, что для текстового сообщения есть текст
  if (message_type === 'text' && !text) {
    return res.status(400).json({ 
      success: false, 
      message: 'Для текстового сообщения нужен текст' 
    });
  }

  // Проверяем, что чат существует
  const checkChatSql = `SELECT id FROM chats WHERE id = ?`;
  db.get(checkChatSql, [chat_id], (err, chat) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Ошибка базы данных' 
      });
    }

    if (!chat) {
      return res.status(404).json({ 
        success: false, 
        message: 'Чат не найден' 
      });
    }

    // Проверяем, что пользователь существует И состоит в этом чате
    const checkUserSql = `
      SELECT u.id 
      FROM users u
      JOIN chat_users cu ON u.id = cu.user_id
      WHERE u.id = ? AND cu.chat_id = ?
    `;
    
    db.get(checkUserSql, [user_id, chat_id], (err, user) => {
      if (err) {
        return res.status(500).json({ 
          success: false, 
          message: 'Ошибка базы данных' 
        });
      }

      if (!user) {
        return res.status(403).json({ 
          success: false, 
          message: 'Пользователь не состоит в этом чате или не существует' 
        });
      }

      // ВСЁ ПРОВЕРИЛИ - СОЗДАЁМ СООБЩЕНИЕ
      const createMessageSql = `
        INSERT INTO messages (chat_id, user_id, text, message_type, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `;

      db.run(createMessageSql, [chat_id, user_id, text || null, message_type], function(err) {
        if (err) {
          return res.status(500).json({ 
            success: false, 
            message: 'Ошибка сохранения сообщения' 
          });
        }

        const messageId = this.lastID;

        // Получаем созданное сообщение для ответа
        const getMessageSql = `
          SELECT 
            m.id,
            m.chat_id,
            m.user_id,
            m.text,
            m.image_url,
            m.voice_url,
            m.message_type,
            m.created_at,
            u.username as sender_name
          FROM messages m
          JOIN users u ON m.user_id = u.id
          WHERE m.id = ?
        `;

        db.get(getMessageSql, [messageId], (err, message) => {
          if (err) {
            return res.status(500).json({ 
              success: false, 
              message: 'Ошибка получения сообщения' 
            });
          }

          res.status(201).json({
            success: true,
            message: 'Сообщение отправлено',
            message_data: message
          });
        });
      });
    });
  });
});
// ========== КОНЕЦ ОТПРАВКИ СООБЩЕНИЯ ==========
// ========== ПОЛУЧЕНИЕ СООБЩЕНИЙ ИЗ ЧАТА (УПРОЩЁННЫЙ) ==========
// GET /messages/:chat_id - получить все сообщения из чата
app.get('/messages/:chat_id', (req, res) => {
  const chatId = req.params.chat_id;
  
  // Просто проверяем, что чат существует
  const checkChatSql = `SELECT id FROM chats WHERE id = ?`;
  db.get(checkChatSql, [chatId], (err, chat) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: 'Ошибка базы данных' 
      });
    }

    if (!chat) {
      return res.status(404).json({ 
        success: false, 
        message: 'Чат не найден' 
      });
    }

    // Получаем все сообщения из чата
    const getMessagesSql = `
      SELECT 
        m.id,
        m.chat_id,
        m.user_id,
        m.text,
        m.image_url,
        m.voice_url,
        m.message_type,
        m.created_at,
        u.username as sender_name
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.chat_id = ?
      ORDER BY m.created_at ASC
    `;

    db.all(getMessagesSql, [chatId], (err, messages) => {
      if (err) {
        console.error('Ошибка получения сообщений:', err);
        return res.status(500).json({ 
          success: false, 
          message: 'Ошибка получения сообщений' 
        });
      }

      res.json({
        success: true,
        message: 'Сообщения получены',
        chat_id: parseInt(chatId),
        count: messages.length,
        messages: messages
      });
    });
  });
});
// ========== КОНЕЦ ПОЛУЧЕНИЯ СООБЩЕНИЙ ==========
// Отдаём наш фронтенд (index.html)
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 3000;

// Запускаем сервер
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Сервер запущен на порту ${PORT}`);
});