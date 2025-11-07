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

// --- Rutas Estáticas ---
app.use('/uploads', express.static(uploadsDir));

// --- Health Check (importante para Easypanel) ---
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Rutas de Páginas HTML ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

app.get('/formulario', (req, res) => {
    res.sendFile(path.join(__dirname, 'formulario_vps.html'));
});

// --- RUTA DE ENVÍO DEL FORMULARIO ---
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
            files: fileUrls, // Guardar como array, no como JSON string
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

// API para OBTENER los envíos (para admin.html)
app.get('/api/get-submissions', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query('SELECT * FROM submissions ORDER BY created_at DESC');
        connection.release();

        // Mapear los resultados para parsear el JSON de la columna 'data'
        const submissions = rows.map(row => {
            let parsedData;
            try {
                // 1. Parsear el JSON principal
                if (typeof row.data === 'string') {
                    parsedData = JSON.parse(row.data);
                } else {
                    parsedData = row.data; // Ya es un objeto
                }
            } catch (e) {
                console.warn(`❌ Error parseando JSON de fila ID ${row.id}: ${e.message}. Fila ignorada.`);
                return null; // Devolver null para filtrar esta fila
            }

            // 2. ¡IMPORTANTE! Manejar 'files' que puede ser string (formato antiguo) o array (formato nuevo)
            try {
                if (parsedData.files && typeof parsedData.files === 'string') {
                    // Es formato antiguo (string anidado), lo parseamos
                    parsedData.files = JSON.parse(parsedData.files);
                } else if (!parsedData.files) {
                    // Si no existe, lo inicializamos como array vacío
                    parsedData.files = [];
                }
                // Si ya es un array (formato nuevo), no hacemos nada.
            } catch (e) {
                console.warn(`⚠️ No se pudo parsear 'files' para submission ID ${row.id}, continuando...`);
                parsedData.files = []; // Poner un valor por defecto
            }

            return {
                id: row.id,
                ...parsedData,
                // Asegurarse de que la fecha de envío esté (si no, usar la de la DB)
                submission_date: parsedData.submission_date || row.created_at 
            };
        }).filter(row => row !== null); // Filtrar las filas que fallaron al parsear

        res.status(200).json(submissions);

    } catch (error) {
        console.error('❌ Error al obtener datos de la base de datos:', error);
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
    console.log(`PANEL ADMIN: http://0.0.0.0:${port}/`);
    console.log(`FORMULARIO: http://0.0.0.0:${port}/formulario`);
});
