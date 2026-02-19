// ============================================
// 🇷🇺 Российский Национальный Чат - Сервер
// ============================================

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 10000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ziganurov174_db_user:OABwcyu32hni3Tum@cluster0.y30awkl.mongodb.net/didi_messenger?retryWrites=true&w=majority';

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));



// ============================================
// Подключение к MongoDB
// ============================================
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ Подключено к MongoDB Atlas');
}).catch(err => {
    console.error('❌ Ошибка подключения к MongoDB:', err);
    process.exit(1);
});

// ============================================
// Схемы MongoDB
// ============================================

// Схема пользователя
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    publicKey: { type: String, required: true },
    privateKey: { type: String, required: true },
    avatar: { type: String, default: '😊' },
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    bio: { type: String, default: '' },
    lastSeen: { type: Date, default: Date.now },
    isOnline: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

// Схема заявок в друзья
const friendRequestSchema = new mongoose.Schema({
    fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    toUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

// Схема друзей
const friendSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    friendId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now }
});

// Схема чатов
const chatSchema = new mongoose.Schema({
    name: { type: String, default: '' },
    type: { type: String, enum: ['private', 'group'], required: true },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    lastMessage: { type: String, default: '' },
    lastMessageTime: { type: Date, default: Date.now },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
});

// Схема сообщений
const messageSchema = new mongoose.Schema({
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    text: { type: String, default: '' },
    encryptedText: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Схема закрепленных чатов
const pinnedChatSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true }
});

// Создание моделей
const User = mongoose.model('User', userSchema);
const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);
const Friend = mongoose.model('Friend', friendSchema);
const Chat = mongoose.model('Chat', chatSchema);
const Message = mongoose.model('Message', messageSchema);
const PinnedChat = mongoose.model('PinnedChat', pinnedChatSchema);

// ============================================
// API Эндпоинты
// ============================================

// ------------------------------
// Авторизация
// ------------------------------

// Регистрация
app.post('/register', async (req, res) => {
    try {
        const { username, password, publicKey, privateKey, avatar, firstName, lastName, bio } = req.body;
        
        // Проверка существования пользователя
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь с таким ником уже существует' });
        }
        
        // Хеширование пароля
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Создание пользователя
        const user = new User({
            username,
            password: hashedPassword,
            publicKey,
            privateKey,
            avatar: avatar || '😊',
            firstName: firstName || '',
            lastName: lastName || '',
            bio: bio || ''
        });
        
        await user.save();
        
        res.json({
            success: true,
            user: {
                _id: user._id,
                username: user.username,
                avatar: user.avatar,
                firstName: user.firstName,
                lastName: user.lastName,
                bio: user.bio
            }
        });
    } catch (err) {
        console.error('Ошибка регистрации:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Вход
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        // Поиск пользователя
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        // Проверка пароля
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        // Обновление статуса онлайн
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();
        
        res.json({
            success: true,
            user: {
                _id: user._id,
                username: user.username,
                avatar: user.avatar,
                firstName: user.firstName,
                lastName: user.lastName,
                bio: user.bio,
                privateKey: user.privateKey,
                publicKey: user.publicKey
            }
        });
    } catch (err) {
        console.error('Ошибка входа:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ------------------------------
// Пользователи
// ------------------------------

// Получение всех пользователей кроме текущего
app.get('/users/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const users = await User.find({ _id: { $ne: userId } })
            .select('_id username avatar firstName lastName bio isOnline lastSeen publicKey');
        
        res.json(users);
    } catch (err) {
        console.error('Ошибка получения пользователей:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ------------------------------
// Друзья
// ------------------------------

// Отправка заявки в друзья
app.post('/friend-request', async (req, res) => {
    try {
        const { fromUserId, toUsername } = req.body;
        
        // Поиск пользователя по нику
        const toUser = await User.findOne({ username: toUsername });
        if (!toUser) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        // Проверка существующей заявки
        const existingRequest = await FriendRequest.findOne({
            $or: [
                { fromUserId, toUserId: toUser._id },
                { fromUserId: toUser._id, toUserId: fromUserId }
            ]
        });
        
        if (existingRequest) {
            return res.status(400).json({ error: 'Заявка уже существует' });
        }
        
        // Проверка, не друзья ли уже
        const existingFriend = await Friend.findOne({
            $or: [
                { userId: fromUserId, friendId: toUser._id },
                { userId: toUser._id, friendId: fromUserId }
            ]
        });
        
        if (existingFriend) {
            return res.status(400).json({ error: 'Вы уже друзья' });
        }
        
        // Создание заявки
        const request = new FriendRequest({
            fromUserId,
            toUserId: toUser._id
        });
        
        await request.save();
        
        res.json({ success: true, requestId: request._id });
    } catch (err) {
        console.error('Ошибка отправки заявки:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Принятие заявки в друзья
app.post('/accept-friend', async (req, res) => {
    try {
        const { requestId, userId } = req.body;
        
        const request = await FriendRequest.findById(requestId);
        if (!request) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        
        // Обновление статуса заявки
        request.status = 'accepted';
        await request.save();
        
        // Создание записи о дружбе в обе стороны
        const friend1 = new Friend({
            userId: request.fromUserId,
            friendId: request.toUserId
        });
        
        const friend2 = new Friend({
            userId: request.toUserId,
            friendId: request.fromUserId
        });
        
        await friend1.save();
        await friend2.save();
        
        // Создание личного чата
        const existingChat = await Chat.findOne({
            type: 'private',
            participants: { $all: [request.fromUserId, request.toUserId] }
        });
        
        if (!existingChat) {
            const chat = new Chat({
                type: 'private',
                participants: [request.fromUserId, request.toUserId]
            });
            await chat.save();
        }
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка принятия заявки:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Отклонение заявки
app.post('/reject-friend', async (req, res) => {
    try {
        const { requestId } = req.body;
        
        await FriendRequest.findByIdAndDelete(requestId);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка отклонения заявки:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение списка друзей
app.get('/friends/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const friends = await Friend.find({ userId })
            .populate('friendId', '_id username avatar firstName lastName isOnline lastSeen');
        
        res.json(friends.map(f => f.friendId));
    } catch (err) {
        console.error('Ошибка получения друзей:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение входящих заявок
app.get('/friend-requests/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const requests = await FriendRequest.find({ toUserId: userId, status: 'pending' })
            .populate('fromUserId', '_id username avatar firstName lastName');
        
        res.json(requests);
    } catch (err) {
        console.error('Ошибка получения заявок:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ------------------------------
// Чаты
// ------------------------------

// Создание чата
app.post('/chats', async (req, res) => {
    try {
        const { type, name, participants, createdBy } = req.body;
        
        // Для личных чатов проверяем существование
        if (type === 'private') {
            const existingChat = await Chat.findOne({
                type: 'private',
                participants: { $all: participants, $size: 2 }
            });
            
            if (existingChat) {
                return res.json({ success: true, chat: existingChat });
            }
        }
        
        const chat = new Chat({
            type,
            name: name || '',
            participants,
            createdBy
        });
        
        await chat.save();
        
        res.json({ success: true, chat });
    } catch (err) {
        console.error('Ошибка создания чата:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение чатов пользователя
app.get('/chats/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        
        const chats = await Chat.find({ participants: userId })
            .populate('participants', '_id username avatar firstName lastName isOnline lastSeen')
            .sort({ lastMessageTime: -1 });
        
        // Получаем закрепленные чаты
        const pinnedChats = await PinnedChat.find({ userId }).distinct('chatId');
        
        const chatsWithInfo = await Promise.all(chats.map(async (chat) => {
            const lastMessage = await Message.findOne({ chatId: chat._id })
                .sort({ createdAt: -1 });
            
            return {
                ...chat.toObject(),
                isPinned: pinnedChats.includes(chat._id.toString()),
                lastMessage: lastMessage ? {
                    text: lastMessage.text,
                    senderName: lastMessage.senderName,
                    createdAt: lastMessage.createdAt
                } : null
            };
        }));
        
        res.json(chatsWithInfo);
    } catch (err) {
        console.error('Ошибка получения чатов:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Закрепление чата
app.post('/chats/pin', async (req, res) => {
    try {
        const { userId, chatId } = req.body;
        
        const pinned = new PinnedChat({ userId, chatId });
        await pinned.save();
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка закрепления чата:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Открепление чата
app.post('/chats/unpin', async (req, res) => {
    try {
        const { userId, chatId } = req.body;
        
        await PinnedChat.findOneAndDelete({ userId, chatId });
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка открепления чата:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Удаление чата
app.delete('/chats/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        
        await Chat.findByIdAndDelete(chatId);
        await Message.deleteMany({ chatId });
        await PinnedChat.deleteMany({ chatId });
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления чата:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ------------------------------
// Сообщения
// ------------------------------

// Отправка сообщения
app.post('/messages', async (req, res) => {
    try {
        const { chatId, senderId, senderName, text, encryptedText } = req.body;
        
        const message = new Message({
            chatId,
            senderId,
            senderName,
            text,
            encryptedText
        });
        
        await message.save();
        
        // Обновление последнего сообщения в чате
        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: text,
            lastMessageTime: new Date()
        });
        
        res.json({ success: true, message });
    } catch (err) {
        console.error('Ошибка отправки сообщения:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение сообщений из чата
app.get('/messages/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        
        const messages = await Message.find({ chatId })
            .populate('senderId', '_id username avatar firstName lastName')
            .sort({ createdAt: 1 });
        
        res.json(messages);
    } catch (err) {
        console.error('Ошибка получения сообщений:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ------------------------------
// Профиль
// ------------------------------

// Обновление профиля
app.post('/user/update', async (req, res) => {
    try {
        const { userId, firstName, lastName, bio, avatar } = req.body;
        
        const updateData = {};
        if (firstName !== undefined) updateData.firstName = firstName;
        if (lastName !== undefined) updateData.lastName = lastName;
        if (bio !== undefined) updateData.bio = bio;
        if (avatar !== undefined) updateData.avatar = avatar;
        
        await User.findByIdAndUpdate(userId, updateData);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления профиля:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обновление статуса онлайн
app.post('/user/status', async (req, res) => {
    try {
        const { userId, isOnline } = req.body;
        
        await User.findByIdAndUpdate(userId, {
            isOnline,
            lastSeen: new Date()
        });
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка обновления статуса:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ------------------------------
// Здоровье сервера
// ------------------------------
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date() });
});

// ============================================
// Отдача статических файлов (В САМОМ КОНЦЕ!)
// ============================================
app.use(express.static(__dirname));

// Этот маршрут должен быть ПОСЛЕДНИМ!
app.get('*', (req, res) => {
    // Проверяем, не API ли это запрос
    if (req.url.startsWith('/users/') || 
        req.url.startsWith('/friend-requests/') || 
        req.url.startsWith('/friends/') || 
        req.url.startsWith('/chats/') || 
        req.url.startsWith('/messages/') ||
        req.url.startsWith('/register') ||
        req.url.startsWith('/login') ||
        req.url.startsWith('/accept-friend') ||
        req.url.startsWith('/reject-friend') ||
        req.url.startsWith('/user/') ||
        req.url.startsWith('/health')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(__dirname + '/index.html');
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});