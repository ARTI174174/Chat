const express = require('express');
const cors = require('cors');
const { MongoClient } = require('mongodb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ===== ПОДКЛЮЧЕНИЕ К MONGODB =====
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://didi_user:Didi123456@cluster0.y30awkl.mongodb.net/?retryWrites=true&w=majority';
const client = new MongoClient(MONGODB_URI);
let db;

async function connectDB() {
    try {
        await client.connect();
        db = client.db('didi_messenger');
        console.log('✅ Подключено к MongoDB Atlas');
        
        // Создаём коллекции
        await db.createCollection('messages');
        
        // Добавляем тестовые сообщения, если их нет
        const messages = db.collection('messages');
        const count = await messages.countDocuments();
        if (count === 0) {
            await messages.insertOne({
                text: 'Добро пожаловать в тестовый чат!',
                sender: 'system',
                created_at: new Date()
            });
        }
        console.log('✅ Коллекции готовы');
    } catch (err) {
        console.error('❌ Ошибка подключения к MongoDB:', err);
    }
}
connectDB();

// ===== API =====

// Получить все сообщения
app.get('/messages', async (req, res) => {
    try {
        const messages = db.collection('messages');
        const allMessages = await messages.find({})
            .sort({ created_at: 1 })
            .toArray();
        res.json({ messages: allMessages });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка получения сообщений' });
    }
});

// Отправить сообщение
app.post('/messages', async (req, res) => {
    const { text, sender } = req.body;
    
    if (!text || !sender) {
        return res.status(400).json({ error: 'Нужен текст и отправитель' });
    }
    
    try {
        const messages = db.collection('messages');
        const result = await messages.insertOne({
            text,
            sender,
            created_at: new Date()
        });
        
        res.json({ 
            success: true, 
            message: 'Сообщение отправлено',
            id: result.insertedId
        });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка отправки' });
    }
});

// Очистить все сообщения (для теста)
app.delete('/messages', async (req, res) => {
    try {
        const messages = db.collection('messages');
        await messages.deleteMany({});
        res.json({ success: true, message: 'Все сообщения удалены' });
    } catch (err) {
        res.status(500).json({ error: 'Ошибка очистки' });
    }
});

// Отдаём фронтенд
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});