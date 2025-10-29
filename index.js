require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken'); // <-- AÑADIDO para el login

const app = express();
const port = 3000;

// Configuración de CORS
app.use(cors());

// Middleware para parsear JSON
app.use(express.json());

// --- Configuración de Base de Datos (leído desde Easypanel) ---
const dbConfig = {
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'taxapp',
    port: process.env.MYSQLPORT || 3306
};

// Crear un pool de conexiones
const pool = mysql.createPool(dbConfig);

// --- Configuración de Subida de Archivos (Multer) ---
// ... (Sin cambios aquí)
const storage = multer.diskStorage({
// ... (código existente)
// ... (código existente)
// ... (código existente)
    destination: (req, file, cb) => {
// ... (código existente)
        cb(null, 'uploads/');
// ... (código existente)
    },
// ... (código existente)
    filename: (req, file, cb) => {
// ... (código existente)
        // Renombrar archivo para evitar colisiones: userid-timestamp-originalname
// ... (código existente)
        const userId = req.body.userId || 'unknown';
// ... (código existente)
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
// ... (código existente)
        cb(null, `${userId}-${uniqueSuffix}-${file.originalname}`);
// ... (código existente)
    }
// ... (código existente)
});
// ... (código existente)
// ... (código existente)
const upload = multer({ storage: storage });
// ... (código existente)

// --- Middleware de Autenticación (NUEVO) ---
const checkAuth = (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            return res.status(401).json({ message: 'Acceso denegado: No hay token' });
        }
        
        // El token viene como "Bearer <token>"
        const token = authHeader.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'Acceso denegado: Token mal formado' });
        }

        // Verificar el token con el secreto de Easypanel
        const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
        req.userData = { userId: decodedToken.userId }; // Guardar datos del usuario si los necesitas
        next(); // El token es válido, continuar

    } catch (error) {
        console.error('Error de autenticación:', error.message);
        return res.status(401).json({ message: 'Token no válido o expirado' });
    }
};


// --- Rutas Estáticas ---
// Servir archivos subidos (para el admin panel)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- Rutas de Páginas HTML (ACTUALIZADAS) ---

// 1. Servir el NUEVO portal de inicio
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'inicio.html'));
});

// 2. Servir el formulario en /formulario
app.get('/formulario', (req, res) => {
    res.sendFile(path.join(__dirname, 'formulario_vps.html'));
});

// 3. Servir el panel de administrador (el HTML es público, pero la API está protegida)
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// --- Rutas de API ---

// 1. API para ENVIAR el formulario (Esta sigue siendo pública)
app.post('/api/submit-form', upload.array('files'), async (req, res) => {
// ... (código existente)
// ... (código existente)
// ... (código existente)
    try {
// ... (código existente)
        const formData = JSON.parse(req.body.formData);
// ... (código existente)
        const files = req.files || [];
// ... (código existente)
// ... (código existente)
        // Mapear archivos a sus URLs de servidor
// ... (código existente)
        const fileUrls = files.map(file => {
// ... (código existente)
            return {
// ... (código existente)
                originalName: file.originalname,
// ... (código existente)
                url: `/uploads/${file.filename}` // La URL que usará el admin
// ... (código existente)
            };
// ... (código existente)
        });
// ... (código existente)
// ... (código existente)
        const submission = {
// ... (código existente)
            ...formData,
// ... (código existente)
            files: JSON.stringify(fileUrls), // Guardar las URLs de los archivos
// ... (código existente)
            submission_date: new Date()
// ... (código existente)
        };
// ... (código existente)
// ... (código existente)
        const connection = await pool.getConnection();
// ... (código existente)
        
// ... (código existente)
        // Insertar en la base de datos
// ... (código existente)
        // Usamos JSON.stringify para los campos que son objetos o arrays
// ... (código existente)
        await connection.query('INSERT INTO submissions (data) VALUES (?)', [JSON.stringify(submission)]);
// ... (código existente)
        
// ... (código existente)
        connection.release();
// ... (código existente)
// ... (código existente)
        res.status(200).json({ message: 'Formulario enviado con éxito' });
// ... (código existente)
// ... (código existente)
    } catch (error) {
// ... (código existente)
        console.error('Error al guardar en la base de datos:', error);
// ... (código existente)
        res.status(500).json({ message: 'Error interno del servidor', error: error.message });
// ... (código existente)
    }
// ... (código existente)
});
// ... (código existente)

// 2. API para OBTENER todos los envíos (¡AHORA PROTEGIDA!)
app.get('/api/get-submissions', checkAuth, async (req, res) => {
    try {
// ... (código existente)
        const connection = await pool.getConnection();
// ... (código existente)
        
// ... (código existente)
        // Obtener todos los envíos, ordenados por fecha descendente
// ... (código existente)
        const [rows] = await connection.query('SELECT * FROM submissions ORDER BY id DESC');
// ... (código existente)
        
// ... (código existente)
        connection.release();
// ... (código existente)
// ... (código existente)
        // Parsear el campo 'data' de JSON a objeto
// ... (código existente)
        const submissions = rows.map(row => {
// ... (código existente)
            const data = JSON.parse(row.data);
// ... (código existente)
            return {
// ... (código existente)
                id: row.id,
// ... (código existente)
                ...data 
// ... (código existente)
            };
// ... (código existente)
        });
// ... (código existente)
        
// ... (código existente)
        res.status(200).json(submissions);
// ... (código existente)
// ... (código existente)
    } catch (error) {
// ... (código existente)
        console.error('Error al obtener los envíos:', error);
// ... (código existente)
        res.status(500).json({ message: 'Error interno del servidor', error: error.message });
// ... (código existente)
    }
// ... (código existente)
});
// ... (código existente)

// Iniciar el servidor
app.listen(port, () => {
// ... (código existente)
    console.log(`Servidor iniciado en http://localhost:${port}`);
// ... (código existente)
});
// ... (código existente)

