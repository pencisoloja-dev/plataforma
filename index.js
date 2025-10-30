require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 80;

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

// Verificar conexión y crear base de datos/tabla si no existen
async function initDatabase() {
    try {
        // Primero conectar sin especificar base de datos
        const initPool = mysql.createPool({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            port: dbConfig.port
        });

        const connection = await initPool.getConnection();
        
        // Crear base de datos si no existe
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
        console.log(`✅ Base de datos '${dbConfig.database}' verificada/creada`);
        
        // Usar la base de datos
        await connection.query(`USE ${dbConfig.database}`);
        
        // Crear tabla si no existe
        await connection.query(`
            CREATE TABLE IF NOT EXISTS submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                data JSON NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabla submissions verificada/creada');
        
        connection.release();
        await initPool.end();
        
        // Ahora verificar la conexión con el pool principal
        const testConnection = await pool.getConnection();
        console.log('✅ Conexión a MySQL exitosa');
        testConnection.release();
        
    } catch (err) {
        console.error('❌ Error inicializando base de datos:', err.message);
        process.exit(1); // Salir si no se puede conectar
    }
}

// Inicializar base de datos al arrancar
initDatabase();

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

// --- Middleware de Autenticación (Compatible con n8n) ---
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

        // Aceptar el token de n8n directamente (simple validación)
        // El token de n8n es generado por el webhook, simplemente verificamos que exista
        if (token && token.length > 10) {
            req.userData = { userId: 'admin' };
            next();
        } else {
            return res.status(401).json({ message: 'Token no válido' });
        }

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

// --- RUTA DE LOGIN (ya no se usa con n8n) ---
app.post('/api/login', (req, res) => {
    res.status(401).json({ 
        success: false, 
        message: 'Use el sistema de autenticación con n8n' 
    });
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

// 2. API para OBTENER todos los envíos (PROTEGIDA con n8n token)
app.get('/api/get-submissions', checkAuth, async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query('SELECT * FROM submissions ORDER BY id DESC');
        connection.release();

        const submissions = rows.map(row => {
            try {
                // row.data ya es un objeto si MySQL lo parseó automáticamente
                const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
                return {
                    id: row.id,
                    ...data 
                };
            } catch (parseError) {
                console.error('Error parseando row:', parseError, row);
                return {
                    id: row.id,
                    error: 'Error al parsear datos'
                };
            }
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
