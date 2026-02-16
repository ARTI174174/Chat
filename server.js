const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ===== ПОДКЛЮЧЕНИЕ К MONGODB =====
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ziganurov174_db_user:OABwcyu32hni3Tum@cluster0.y30awkl.mongodb.net/?retryWrites=true&w=majority';
const client = new MongoClient(MONGODB_URI);
let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db('didi_messenger');
        console.log('✅ Подключено к MongoDB Atlas');
        
        // Создаём коллекции, если их нет
        await db.createCollection('users');
        await db.createCollection('chats');
        await db.createCollection('messages');
        console.log('✅ Коллекции готовы');
    } catch (err) {
        console.error('❌ Ошибка подключения к MongoDB:', err);
    }
}
connectDB();

// ===== API ЭНДПОИНТЫ =====

// Регистрация
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Нужно указать имя пользователя и пароль' });
    }
    
    try {
        const users = db.collection('users');
        const existingUser = await users.findOne({ username });
        
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь уже существует' });
        }
        
        const result = await users.insertOne({
            username,
            password,
            createdAt: new Date()
        });
        
        res.status(201).json({
            message: 'Пользователь создан',
            user: {
                id: result.insertedId,
                username
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка базы данных' });
    }
});

// Вход
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
        return res.status(400).json({ error: 'Нужно указать имя пользователя и пароль' });
    }
    
    try {
        const users = db.collection('users');
        const user = await users.findOne({ username, password });
        
        if (!user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        res.json({
            success: true,
            message: 'Вход выполнен',
            user: {
                id: user._id,
                username: user.username
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка базы данных' });
    }
});

// Получить всех пользователей (кроме текущего)
app.get('/users', async (req, res) => {
    try {
        const users = db.collection('users');
        const allUsers = await users.find({}).toArray();
        res.json({ users: allUsers.map(u => ({ id: u._id, username: u.username })) });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка получения пользователей' });
    }
});

// Создание личного чата
app.post('/chats', async (req, res) => {
    const { user1_id, user2_id } = req.body;
    
    try {
        const chats = db.collection('chats');
        
        const existingChat = await chats.findOne({
            type: 'private',
            participants: { $all: [user1_id, user2_id] }
        });
        
        if (existingChat) {
            return res.json({
                success: true,
                message: 'Чат уже существует',
                chat: existingChat
            });
        }
        
        const newChat = {
            name: `Чат`,
            type: 'private',
            participants: [user1_id, user2_id],
            lastMessage: '',
            lastMessageTime: '',
            createdAt: new Date()
        };
        
        const result = await chats.insertOne(newChat);
        
        res.status(201).json({
            success: true,
            message: 'Чат создан',
            chat: {
                id: result.insertedId,
                ...newChat
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка базы данных' });
    }
});

// Получение чатов пользователя
app.get('/chats/:user_id', async (req, res) => {
    const userId = req.params.user_id;
    
    try {
        const chats = db.collection('chats');
        const userChats = await chats.find({
            participants: userId
        }).toArray();
        
        res.json({
            success: true,
            chats: userChats
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка базы данных' });
    }
});

// Отправка сообщения
app.post('/messages', async (req, res) => {
    const { chat_id, user_id, text } = req.body;
    
    try {
        const messages = db.collection('messages');
        
        // Получаем имя отправителя
        const users = db.collection('users');
        const sender = await users.findOne({ _id: new ObjectId(user_id) });
        
        const newMessage = {
            chat_id,
            user_id,
            sender_name: sender ? sender.username : 'Unknown',
            text,
            createdAt: new Date()
        };
        
        const result = await messages.insertOne(newMessage);
        
        // Обновляем последнее сообщение в чате
        const chats = db.collection('chats');
        await chats.updateOne(
            { _id: new ObjectId(chat_id) },
            { 
                $set: { 
                    lastMessage: text.substring(0, 30) + (text.length > 30 ? '...' : ''),
                    lastMessageTime: new Date().toLocaleTimeString()
                } 
            }
        );
        
        res.status(201).json({
            success: true,
            message: 'Сообщение отправлено',
            message_data: {
                id: result.insertedId,
                ...newMessage
            }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка отправки' });
    }
});

// Получение сообщений из чата
app.get('/messages/:chat_id', async (req, res) => {
    const chatId = req.params.chat_id;
    
    try {
        const messages = db.collection('messages');
        const chatMessages = await messages.find({
            chat_id: chatId
        }).sort({ createdAt: 1 }).toArray();
        
        res.json({
            success: true,
            messages: chatMessages
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка получения сообщений' });
    }
});

// Отдаём фронтенд
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Запуск сервера
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});