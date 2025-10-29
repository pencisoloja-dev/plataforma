require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Configuración de CORS
app.use(cors());

// Middleware para parsear JSON
app.use(express.json());

// Crear directorio uploads si no existe
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Directorio uploads creado');
}

// --- Configuración de Base de Datos ---
const dbConfig = {
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'taxapp',
    port: process.env.MYSQLPORT || 3306
};

console.log('Configuración DB:', {
    host: dbConfig.host,
    user: dbConfig.user,
    database: dbConfig.database,
    port: dbConfig.port
});

// Crear un pool de conexiones
const pool = mysql.createPool(dbConfig);

// Verificar conexión a la base de datos
pool.getConnection()
    .then(connection => {
        console.log('✅ Conexión a MySQL exitosa');
        connection.release();
    })
    .catch(err => {
        console.error('❌ Error conectando a MySQL:', err.message);
    });

// --- Configuración de Subida de Archivos (Multer) ---
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const userId = req.body.userId || 'unknown';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, `${userId}-${uniqueSuffix}-${file.originalname}`);
    }
});

const upload = multer({ storage: storage });

// --- Middleware de Autenticación ---
const checkAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ message: 'Acceso denegado: No hay token' });
        }
        
        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'Acceso denegado: Token mal formado' });
        }

        // Verificar que JWT_SECRET esté configurado
        if (!process.env.JWT_SECRET) {
            console.error('❌ JWT_SECRET no está configurado en variables de entorno');
            return res.status(500).json({ message: 'Error de configuración del servidor' });
        }

        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        req.userData = { userId: decodedToken.userId };
        next();

    } catch (error) {
        console.error('Error de autenticación:', error.message);
        return res.status(401).json({ message: 'Token no válido o expirado' });
    }
};

// --- Rutas Estáticas ---
app.use('/uploads', express.static(uploadsDir));

// --- Health Check (importante para Easypanel) ---
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Rutas de Páginas HTML ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'inicio.html'));
});

app.get('/formulario', (req, res) => {
    res.sendFile(path.join(__dirname, 'formulario_vps.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// --- Rutas de API ---

// 1. API para ENVIAR el formulario
app.post('/api/submit-form', upload.array('files'), async (req, res) => {
    try {
        const formData = JSON.parse(req.body.formData);
        const files = req.files || [];

        const fileUrls = files.map(file => {
            return {
                originalName: file.originalname,
                url: `/uploads/${file.filename}`
            };
        });

        const submission = {
            ...formData,
            files: JSON.stringify(fileUrls),
            submission_date: new Date()
        };

        const connection = await pool.getConnection();
        await connection.query('INSERT INTO submissions (data) VALUES (?)', [JSON.stringify(submission)]);
        connection.release();

        console.log('✅ Formulario guardado exitosamente');
        res.status(200).json({ message: 'Formulario enviado con éxito' });

    } catch (error) {
        console.error('❌ Error al guardar en la base de datos:', error);
        res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
});

// 2. API para OBTENER todos los envíos (PROTEGIDA)
app.get('/api/get-submissions', checkAuth, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query('SELECT * FROM submissions ORDER BY id DESC');
        connection.release();

        const submissions = rows.map(row => {
            const data = JSON.parse(row.data);
            return {
                id: row.id,
                ...data 
            };
        });
        
        res.status(200).json(submissions);

    } catch (error) {
        console.error('❌ Error al obtener los envíos:', error);
        res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
});

// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(404).json({ message: 'Ruta no encontrada' });
});

// Iniciar el servidor en 0.0.0.0 para Docker
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Servidor iniciado en http://0.0.0.0:${port}`);
    console.log(`📝 Formulario: http://0.0.0.0:${port}/formulario`);
    console.log(`👤 Admin: http://0.0.0.0:${port}/admin`);
});
