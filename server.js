// ============================================
// 🇷🇺 Российский Национальный Чат - Сервер
// ============================================

const path = require("path");
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');          // ← НОВОЕ
const rateLimit = require('express-rate-limit'); // ← НОВОЕ
const { v4: uuidv4 } = require('uuid');       // ← НОВОЕ
const helmet = require('helmet');              // ← НОВОЕ
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const app = express();
const PORT = process.env.PORT || 10000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ziganurov174_db_user:OABwcyu32hni3Tum@cluster0.y30awkl.mongodb.net/didi_messenger?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this-please-123!'; // ← НОВОЕ

// Настройка Cloudinary
cloudinary.config({
    cloud_name: 'dm6lwftjb',
    api_key: '283934211791159',
    api_secret: 'l5tvTltt3Lxhh0Bj4wd-vUE2Fp0'
});

// Настройка Multer для загрузки файлов (в память)
const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB максимум
    fileFilter: (req, file, cb) => {
        // Разрешаем только изображения и аудио
        if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Можно загружать только изображения и аудио'), false);
        }
    }
});

// Middleware
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ============================================
// Middleware для проверки JWT токена
// ============================================
function authenticateToken(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Требуется авторизация' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Недействительный токен' });
        }
        req.user = user;
        next();
    });
}

// ============================================
// Подключение к MongoDB
// ============================================

// Helmet для безопасности заголовков (с настройками для инлайн-скриптов)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            scriptSrcAttr: ["'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:", "https://res.cloudinary.com"],
            mediaSrc: ["'self'", "https://res.cloudinary.com"],
            connectSrc: ["'self'", "https://chat-jy2v.onrender.com", "https://res.cloudinary.com"],
        },
    },
}));

// Rate limiting для всех запросов
const limiter = rateLimit({ // ← НОВОЕ
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 100, // максимум 100 запросов с одного IP
    message: { error: 'Слишком много запросов, попробуйте позже' },
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/api/', limiter); // ← НОВОЕ

// Особо строгий лимит для входа
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 минут
    max: 5, // максимум 5 попыток
    skipSuccessfulRequests: true, // не считаем успешные входы
    keyGenerator: (req) => {
        // Блокируем по комбинации IP + username
        return req.ip + '_' + (req.body.username || '').toLowerCase();
    },
    handler: (req, res) => {
        res.status(429).json({ 
            error: 'Слишком много попыток входа',
            message: 'Подождите 15 минут перед следующей попыткой'
        });
    }
});

// ========== НОВЫЙ ЛИМИТЕР ДЛЯ РЕГИСТРАЦИИ ==========
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 час
    max: 3, // максимум 3 регистрации с одного IP
    message: { error: 'Слишком много попыток регистрации. Подождите 1 час' },
    keyGenerator: (req) => {
        return req.ip; // Блокируем по IP
    },
    handler: (req, res) => {
        res.status(429).json({ 
            error: 'Слишком много попыток регистрации',
            message: 'Подождите 1 час перед следующей попыткой'
        });
    }
});


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
    username: { type: String, required: true }, // больше не unique
    usernameLower: { type: String, required: true, unique: true }, // для поиска
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
    createdAt: { type: Date, default: Date.now },
    // Храним количество непрочитанных сообщений для каждого участника
    unreadCount: { type: Map, of: Number, default: {} }
});

// Схема сообщений
const messageSchema = new mongoose.Schema({
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    senderName: { type: String, required: true },
    text: { type: String, default: '' },
    encryptedText: { type: String, default: '' },
    type: { type: String, enum: ['text', 'image', 'audio'], default: 'text' },
    fileUrl: { type: String, default: '' },
    fileDuration: { type: Number, default: 0 }, // для аудио (длительность в секундах)
    createdAt: { type: Date, default: Date.now }
});

// Схема закрепленных чатов
const pinnedChatSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true }
});

// Схема прочитанных сообщений
const readReceiptSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', required: true },
    chatId: { type: mongoose.Schema.Types.ObjectId, ref: 'Chat', required: true },
    readAt: { type: Date, default: Date.now }
});

// Составной индекс для уникальности (пользователь + сообщение)
readReceiptSchema.index({ userId: 1, messageId: 1 }, { unique: true });

// ============================================
// Создание моделей (ТОЛЬКО ОДИН РАЗ!)
// ============================================
const User = mongoose.model('User', userSchema);
const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);
const Friend = mongoose.model('Friend', friendSchema);
const Chat = mongoose.model('Chat', chatSchema);
const Message = mongoose.model('Message', messageSchema);
const PinnedChat = mongoose.model('PinnedChat', pinnedChatSchema);
const ReadReceipt = mongoose.model('ReadReceipt', readReceiptSchema);



// ============================================
// API Эндпоинты
// ============================================

// Эндпоинт для загрузки файлов в Cloudinary (В САМОМ НАЧАЛЕ!)
app.post('/api/upload', upload.single('file'), async (req, res) => {
    console.log('🔥 /api/upload вызван!', req.file ? 'Файл есть' : 'Файла нет');
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }
        
        // Определяем папку в Cloudinary в зависимости от типа файла
        let folder = 'chat_images';
        let resourceType = 'image';
        
        if (req.file.mimetype.startsWith('audio/')) {
            folder = 'chat_audio';
            resourceType = 'video'; // Cloudinary использует 'video' для аудио
        }
        
        // Загружаем файл в Cloudinary
        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: folder,
                    resource_type: resourceType,
                    format: req.file.mimetype.startsWith('audio/') ? 'mp3' : undefined,
                    transformation: req.file.mimetype.startsWith('image/') ? [
                        { width: 1200, crop: 'limit' }
                    ] : undefined
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            
            uploadStream.end(req.file.buffer);
        });
        
		// Эндпоинт для загрузки аватарок пользователей
app.post('/api/upload-avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
    console.log('🖼️ /api/upload-avatar вызван!', req.file ? 'Файл есть' : 'Файла нет');
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не загружен' });
        }

        // Загружаем в папку avatars, сжимаем до квадрата 300x300
        const result = await new Promise((resolve, reject) => {
            const uploadStream = cloudinary.uploader.upload_stream(
                {
                    folder: 'avatars',
                    transformation: [
                        { width: 300, height: 300, crop: 'fill', gravity: 'face' },
                        { quality: 'auto:low' }
                    ]
                },
                (error, result) => {
                    if (error) reject(error);
                    else resolve(result);
                }
            );
            uploadStream.end(req.file.buffer);
        });

        // Обновляем аватар у пользователя в базе
        const user = await User.findByIdAndUpdate(
            req.user.userId,
            { avatar: result.secure_url },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }

        res.json({
            success: true,
            url: result.secure_url
        });

    } catch (err) {
        console.error('Ошибка загрузки аватара:', err);
        res.status(500).json({ error: 'Ошибка загрузки аватара' });
    }
});
		
        res.json({ 
            success: true, 
            url: result.secure_url,
            duration: req.body.duration ? parseFloat(req.body.duration) : 0
        });
        
    } catch (err) {
        console.error('Ошибка загрузки файла:', err);
        res.status(500).json({ error: 'Ошибка загрузки файла' });
    }
});


// ------------------------------
// Авторизация
// ------------------------------

// Регистрация
app.post('/register', registerLimiter, async (req, res) => {
    try {
        let { username, password, publicKey, privateKey, avatar, firstName, lastName, bio } = req.body;
        
        // Проверка на английские буквы (только a-z, A-Z, 0-9, _)
        const englishRegex = /^[a-zA-Z0-9_]+$/;
        if (!englishRegex.test(username)) {
            return res.status(400).json({ error: 'Логин может содержать только английские буквы, цифры и символ подчеркивания' });
        }
        
        // Проверка длины пароля
        if (password.length < 6) {
            return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
        }
        
        // Сохраняем оригинальный логин как есть, но для поиска используем lowercase
        const usernameLower = username.toLowerCase();
        
        // Проверка существования пользователя (регистронезависимо)
        const existingUser = await User.findOne({ 
            usernameLower: usernameLower 
        });
        
        if (existingUser) {
            return res.status(400).json({ error: 'Пользователь с таким ником уже существует' });
        }
        
        // Хеширование пароля
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Создание пользователя с полем для lowercase логина
        const user = new User({
            username,
            usernameLower, // ← новое поле для поиска
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
app.post('/login', loginLimiter, async (req, res) => {
    try {
        let { username, password } = req.body;
        
        // Приводим введенный логин к нижнему регистру для поиска
        const usernameLower = username.toLowerCase();
        
        // Поиск пользователя по usernameLower
        const user = await User.findOne({ usernameLower });
        if (!user) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        // Проверка пароля
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Неверный логин или пароль' });
        }
        
        // Создаем JWT токен
        const token = jwt.sign(
            { userId: user._id, username: user.username },
            JWT_SECRET,
            { expiresIn: '7d' }
        );
        
        // Обновление статуса онлайн
        user.isOnline = true;
        user.lastSeen = new Date();
        await user.save();
        
        res.json({
            success: true,
            token,
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

// Получение списка друзей
app.get('/friends/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Проверяем, что пользователь запрашивает свои данные
        if (req.user.userId !== userId) {
            return res.status(403).json({ error: 'Нет доступа к этим данным' });
        }
        
        const friends = await Friend.find({ userId })
            .populate('friendId', '_id username avatar firstName lastName isOnline lastSeen');
        
        res.json(friends.map(f => f.friendId));
    } catch (err) {
        console.error('Ошибка получения друзей:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ------------------------------
// Друзья
// ------------------------------

// Отправка заявки в друзья
app.post('/friend-request', authenticateToken, async (req, res) => {
    try {
        const { fromUserId, toUsername } = req.body;
        
        // Проверяем, что пользователь отправляет заявку от своего имени
        if (req.user.userId !== fromUserId) {
            return res.status(403).json({ error: 'Нет доступа' });
        }
        
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
app.post('/accept-friend', authenticateToken, async (req, res) => {
    try {
        const { requestId, userId } = req.body;
        
        // Проверяем, что пользователь принимает заявку от своего имени
        if (req.user.userId !== userId) {
            return res.status(403).json({ error: 'Нет доступа' });
        }
        
        const request = await FriendRequest.findById(requestId);
        if (!request) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        
        // Проверяем, что заявка адресована этому пользователю
        if (request.toUserId.toString() !== userId) {
            return res.status(403).json({ error: 'Это не ваша заявка' });
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
app.post('/reject-friend', authenticateToken, async (req, res) => {
    try {
        const { requestId } = req.body;
        
        const request = await FriendRequest.findById(requestId);
        if (!request) {
            return res.status(404).json({ error: 'Заявка не найдена' });
        }
        
        // Проверяем, что заявка адресована этому пользователю
        if (request.toUserId.toString() !== req.user.userId) {
            return res.status(403).json({ error: 'Это не ваша заявка' });
        }
        
        await FriendRequest.findByIdAndDelete(requestId);
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка отклонения заявки:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение входящих заявок
app.get('/friend-requests/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Проверяем, что пользователь запрашивает свои заявки
        if (req.user.userId !== userId) {
            return res.status(403).json({ error: 'Нет доступа' });
        }
        
        const requests = await FriendRequest.find({ toUserId: userId, status: 'pending' })
            .populate('fromUserId', '_id username avatar firstName lastName');
        
        res.json(requests);
    } catch (err) {
        console.error('Ошибка получения заявок:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});


// Получение всех пользователей кроме текущего
app.get('/users/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Проверяем, что пользователь запрашивает свои данные
        if (req.user.userId !== userId) {
            return res.status(403).json({ error: 'Нет доступа' });
        }
        
        const users = await User.find({ _id: { $ne: userId } })
            .select('_id username avatar firstName lastName bio isOnline lastSeen publicKey');
        
        res.json(users);
    } catch (err) {
        console.error('Ошибка получения пользователей:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ------------------------------
// Чаты
// ------------------------------

// Создание чата
app.post('/chats', authenticateToken, async (req, res) => {
    try {
        const { type, name, participants, createdBy } = req.body;
        
        // Проверяем, что создатель чата - текущий пользователь
        if (req.user.userId !== createdBy) {
            return res.status(403).json({ error: 'Нет доступа' });
        }
        
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
app.get('/chats/:userId', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.params;
        
        // Проверяем, что пользователь запрашивает свои чаты
        if (req.user.userId !== userId) {
            return res.status(403).json({ error: 'Нет доступа' });
        }
        
        const chats = await Chat.find({ participants: userId })
            .populate('participants', '_id username avatar firstName lastName isOnline lastSeen')
            .sort({ lastMessageTime: -1 });
        
        // Получаем закрепленные чаты
        const pinnedChats = await PinnedChat.find({ userId }).distinct('chatId');
        
        const chatsWithInfo = await Promise.all(chats.map(async (chat) => {
            const lastMessage = await Message.findOne({ chatId: chat._id })
                .sort({ createdAt: -1 });
            
            // Получаем количество непрочитанных для текущего пользователя
            const unreadCount = chat.unreadCount?.get(userId) || 0;
            
            return {
                ...chat.toObject(),
                isPinned: pinnedChats.includes(chat._id.toString()),
                unreadCount, // ← ЭТО НОВАЯ СТРОКА
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
app.post('/chats/pin', authenticateToken, async (req, res) => {
    try {
        const { userId, chatId } = req.body;
        
        // Проверяем, что пользователь закрепляет для себя
        if (req.user.userId !== userId) {
            return res.status(403).json({ error: 'Нет доступа' });
        }
        
        // Проверяем, что пользователь участвует в чате
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.participants.includes(userId)) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }
        
        const pinned = new PinnedChat({ userId, chatId });
        await pinned.save();
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка закрепления чата:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Открепление чата
app.post('/chats/unpin', authenticateToken, async (req, res) => {
    try {
        const { userId, chatId } = req.body;
        
        // Проверяем, что пользователь открепляет для себя
        if (req.user.userId !== userId) {
            return res.status(403).json({ error: 'Нет доступа' });
        }
        
        await PinnedChat.findOneAndDelete({ userId, chatId });
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка открепления чата:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Удаление чата
app.delete('/chats/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        // Проверяем, что пользователь является участником чата
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.participants.includes(req.user.userId)) {
            return res.status(403).json({ error: 'Нет доступа к этому чату' });
        }
        
        await Chat.findByIdAndDelete(chatId);
        await Message.deleteMany({ chatId });
        await PinnedChat.deleteMany({ chatId });
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка удаления чата:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// ========== ВСТАВЬТЕ СЮДА ==========
// Добавление участников в групповой чат
app.post('/chats/:chatId/add-members', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { newMembers } = req.body; // массив ID новых участников
        
        // Находим чат
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Чат не найден' });
        }
        
        // Проверяем, что это групповой чат
        if (chat.type !== 'group') {
            return res.status(400).json({ error: 'Можно добавлять только в групповые чаты' });
        }
        
        // Проверяем, что пользователь является участником чата
        if (!chat.participants.includes(req.user.userId)) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }
        
        // Добавляем новых участников (избегаем дубликатов)
        const existingParticipants = chat.participants.map(p => p.toString());
        const uniqueNewMembers = newMembers.filter(id => !existingParticipants.includes(id));
        
        chat.participants.push(...uniqueNewMembers);
        await chat.save();
        
        // Отправляем системное сообщение о новых участниках
        if (uniqueNewMembers.length > 0) {
            const users = await User.find({ _id: { $in: uniqueNewMembers } });
            const names = users.map(u => u.username).join(', ');
            
            const systemMessage = new Message({
                chatId,
                senderId: req.user.userId,
                senderName: 'Система',
                text: `Добавлены участники: ${names}`,
                encryptedText: `Добавлены участники: ${names}`
            });
            await systemMessage.save();
            
            // Обновляем время последнего сообщения
            chat.lastMessage = `Добавлены участники: ${names}`;
            chat.lastMessageTime = new Date();
            await chat.save();
        }
        
        res.json({ 
            success: true, 
            addedMembers: uniqueNewMembers 
        });
    } catch (err) {
        console.error('Ошибка добавления участников:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Выход из группового чата
app.post('/chats/:chatId/leave', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        // Находим чат
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Чат не найден' });
        }
        
        // Проверяем, что это групповой чат
        if (chat.type !== 'group') {
            return res.status(400).json({ error: 'Нельзя выйти из личного чата' });
        }
        
        // Проверяем, что пользователь является участником
        if (!chat.participants.includes(req.user.userId)) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }
        
        // Удаляем пользователя из участников
        chat.participants = chat.participants.filter(id => id.toString() !== req.user.userId);
        
        // Если участников не осталось - удаляем чат
        if (chat.participants.length === 0) {
            await Chat.findByIdAndDelete(chatId);
            await Message.deleteMany({ chatId });
            await PinnedChat.deleteMany({ chatId });
            return res.json({ success: true, chatDeleted: true });
        }
        
        await chat.save();
        
        // Отправляем системное сообщение о выходе
        const user = await User.findById(req.user.userId);
        const systemMessage = new Message({
            chatId,
            senderId: req.user.userId,
            senderName: 'Система',
            text: `Пользователь ${user.username} покинул чат`,
            encryptedText: `Пользователь ${user.username} покинул чат`
        });
        await systemMessage.save();
        
        // Обновляем время последнего сообщения
        chat.lastMessage = `Пользователь ${user.username} покинул чат`;
        chat.lastMessageTime = new Date();
        await chat.save();
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка выхода из чата:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение списка друзей, не участвующих в чате
app.get('/chats/:chatId/available-friends', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        // Находим чат
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Чат не найден' });
        }
        
        // Проверяем, что пользователь является участником
        if (!chat.participants.includes(req.user.userId)) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }
        
        // Получаем всех друзей пользователя
        const userFriends = await Friend.find({ userId: req.user.userId })
            .populate('friendId', '_id username avatar firstName lastName');
        
        const friends = userFriends.map(f => f.friendId);
        
        // Фильтруем друзей, которые уже в чате
        const availableFriends = friends.filter(friend => 
            !chat.participants.some(p => p.toString() === friend._id.toString())
        );
        
        res.json(availableFriends);
    } catch (err) {
        console.error('Ошибка получения доступных друзей:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});
// ========== КОНЕЦ ВСТАВКИ ==========

// ------------------------------
// Сообщения
// ------------------------------

// Отправка сообщения
app.post('/messages', authenticateToken, async (req, res) => {
    try {
        const { chatId, senderId, senderName, text, encryptedText, type, fileUrl, fileDuration } = req.body;
        
        // Проверяем, что отправитель - текущий пользователь
        if (req.user.userId !== senderId) {
            return res.status(403).json({ error: 'Нет доступа' });
        }
        
        // Проверяем, что пользователь участвует в чате
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.participants.includes(req.user.userId)) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }
        
        // Создаем сообщение
        const messageData = {
            chatId,
            senderId,
            senderName,
            type: type || 'text'
        };
        
        // Для текстовых сообщений
        if (type === 'text' || !type) {
            messageData.text = text || '';
            messageData.encryptedText = encryptedText || '';
        } 
        // Для изображений и аудио
        else if (type === 'image' || type === 'audio') {
            messageData.fileUrl = fileUrl;
            if (fileDuration) {
                messageData.fileDuration = fileDuration;
            }
            // Для обратной совместимости сохраняем текст как пустую строку
            messageData.text = '';
            messageData.encryptedText = '';
        }
        
        const message = new Message(messageData);
        await message.save();
        
        // Обновление последнего сообщения в чате
        let lastMessageText = '';
        if (type === 'image') lastMessageText = '📷 Фото';
        else if (type === 'audio') lastMessageText = '🎤 Голосовое сообщение';
        else lastMessageText = text || '';
        
        await Chat.findByIdAndUpdate(chatId, {
            lastMessage: lastMessageText,
            lastMessageTime: new Date()
        });
        
        // Увеличиваем счетчик непрочитанных для всех участников, кроме отправителя
        const participants = chat.participants.filter(p => p.toString() !== senderId);
        
        // Обновляем unreadCount для каждого участника
        participants.forEach(async (participantId) => {
            const key = participantId.toString();
            const currentCount = chat.unreadCount?.get(key) || 0;
            chat.unreadCount.set(key, currentCount + 1);
        });
        
        await chat.save();
        
        res.json({ success: true, message });
    } catch (err) {
        console.error('Ошибка отправки сообщения:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Получение сообщений из чата
app.get('/messages/:chatId', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        
        // Проверяем, что пользователь участвует в чате
        const chat = await Chat.findById(chatId);
        if (!chat || !chat.participants.includes(req.user.userId)) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }
        
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
app.post('/user/update', authenticateToken, async (req, res) => {
    try {
        const { userId, firstName, lastName, bio, avatar } = req.body;
        
        // Проверяем, что пользователь обновляет свой профиль
        if (req.user.userId !== userId) {
            return res.status(403).json({ error: 'Нет доступа' });
        }
        
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

// ========== НОВЫЙ МАРШРУТ ДЛЯ СМЕНЫ ПАРОЛЯ ==========
// Смена пароля
app.post('/user/change-password', authenticateToken, async (req, res) => {
    try {
        const { userId, currentPassword, newPassword } = req.body;
        
        // Проверяем, что пользователь меняет свой пароль
        if (req.user.userId !== userId) {
            return res.status(403).json({ error: 'Нет доступа' });
        }
        
        // Проверка длины нового пароля
        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Новый пароль должен быть не менее 6 символов' });
        }
        
        // Находим пользователя
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'Пользователь не найден' });
        }
        
        // Проверяем текущий пароль
        const validPassword = await bcrypt.compare(currentPassword, user.password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Неверный текущий пароль' });
        }
        
        // Хешируем новый пароль
        const hashedPassword = await bcrypt.hash(newPassword, 10);
        
        // Обновляем пароль
        user.password = hashedPassword;
        await user.save();
        
        res.json({ success: true, message: 'Пароль успешно изменен' });
		
    } catch (err) {
        console.error('Ошибка смены пароля:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});
// ========== КОНЕЦ НОВОГО МАРШРУТА ==========

// Отметить сообщения как прочитанные
app.post('/chats/:chatId/read', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const userId = req.user.userId;
        
        // Находим чат
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({ error: 'Чат не найден' });
        }
        
        // Проверяем, что пользователь является участником
        if (!chat.participants.includes(userId)) {
            return res.status(403).json({ error: 'Вы не участник этого чата' });
        }
        
        // Получаем все непрочитанные сообщения в чате
        const messages = await Message.find({ 
            chatId, 
            senderId: { $ne: userId } // Не свои сообщения
        });
        
        // Создаем записи о прочтении для каждого сообщения
        const readReceipts = messages.map(msg => ({
            userId,
            messageId: msg._id,
            chatId,
            readAt: new Date()
        }));
        
        // Используем bulkWrite для вставки с игнорированием дубликатов
        if (readReceipts.length > 0) {
            await ReadReceipt.bulkWrite(
                readReceipts.map(receipt => ({
                    updateOne: {
                        filter: { userId: receipt.userId, messageId: receipt.messageId },
                        update: { $set: receipt },
                        upsert: true
                    }
                }))
            );
        }
        
        // Сбрасываем счетчик непрочитанных для пользователя
        chat.unreadCount.set(userId, 0);
        await chat.save();
        
        res.json({ success: true });
    } catch (err) {
        console.error('Ошибка отметки прочитанных:', err);
        res.status(500).json({ error: 'Ошибка сервера' });
    }
});

// Обновление статуса онлайн
app.post('/user/status', authenticateToken, async (req, res) => {
    try {
        const { userId, isOnline } = req.body;
        
        // Проверяем, что пользователь обновляет свой статус
        if (req.user.userId !== userId) {
            return res.status(403).json({ error: 'Нет доступа' });
        }
        
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
app.use((req, res, next) => {
    // Если это API запрос, но мы дошли до сюда - значит эндпоинт не найден
    if (req.url.startsWith('/api/')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    
    // Для всех остальных запросов отдаем HTML
    res.sendFile(__dirname + '/index.html');
});

// Запуск сервера
app.listen(PORT, () => {
    console.log(`✅ Сервер запущен на порту ${PORT}`);
});