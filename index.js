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
        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
        console.log(`✅ Base de datos '${dbConfig.database}' verificada/creada`);
        
        // Usar la base de datos
        await connection.query(`USE \`${dbConfig.database}\``);
        
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

// RUTA PRINCIPAL: Servir el panel de admin
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin.html'));
});

// RUTA SECUNDARIA: Servir el formulario
app.get('/formulario', (req, res) => {
    res.sendFile(path.join(__dirname, 'formulario_vps.html'));
});

// --- RUTA DE ENVÍO DEL FORMULARIO ---
async function sendContactToSMS(name, phone) {
  try {
    const SMS_API_URL = process.env.SMS_API_URL || 'http://localhost:3000/contacts/add';
    
    const response = await fetch(SMS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone })
    });

    const data = await response.json();
    
    if (data.success) {
      console.log(`✅ Contacto enviado a SMS: ${name} - ${phone}`);
      return { success: true, data };
    } else {
      console.warn(`⚠️ No se pudo enviar contacto a SMS: ${data.error}`);
      return { success: false, error: data.error };
    }
  } catch (error) {
    console.error(`❌ Error enviando contacto a SMS:`, error.message);
    return { success: false, error: error.message };
  }
}

// API para ENVIAR el formulario
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

        // 🚀 INTEGRACIÓN: Enviar contacto a App SMS
        if (formData.nombre_completo && formData.telefono) {
          const smsResult = await sendContactToSMS(
            formData.nombre_completo, 
            formData.telefono
          );
          
          if (smsResult.success) {
            console.log('📱 Contacto sincronizado con SMS app');
          }
        }

        res.status(200).json({ message: 'Formulario enviado con éxito' });

    } catch (error) {
        console.error('❌ Error al guardar en la base de datos:', error);
        res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
});

// --- RUTA PARA OBTENER ENVÍOS (para el admin.html) ---
app.get('/api/get-submissions', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query('SELECT * FROM submissions ORDER BY created_at DESC');
        connection.release();

        // Procesar los datos para el frontend
        // El campo 'data' está almacenado como un string JSON en la BD
        const submissions = rows.map(row => {
            
            let parsedData;
            try {
                // --- INICIO DE LA CORRECCIÓN ---
                // Intentamos parsear el JSON de la fila
                if (typeof row.data === 'string') {
                    parsedData = JSON.parse(row.data);
                } else {
                    // Si ya es un objeto (mysql2 lo parseó), lo usamos
                    parsedData = row.data;
                }
                // --- FIN DE LA CORRECCIÓN ---

            } catch (e) {
                // SI FALLA: Es data corrupta. La logueamos y la saltamos.
                console.error(`❌ Error parseando JSON para submission ID ${row.id}:`, e.message);
                console.error(`❌ Data problemática:`, row.data);
                return null; // Retornamos null para filtrarlo después
            }

            // Parsear el campo 'files' anidado, que también es un string JSON
            try {
                if (parsedData.files && typeof parsedData.files === 'string') {
                    parsedData.files = JSON.parse(parsedData.files);
                }
            } catch (e) {
                console.warn(`⚠️ No se pudo parsear 'files' para submission ID ${row.id}, continuando...`);
                parsedData.files = []; // Poner un valor por defecto
            }

            return {
                id: row.id,
                created_at: row.created_at, // Este campo viene de la fila, no del JSON 'data'
                ...parsedData 
            };
        }).filter(Boolean); // <-- Este .filter(Boolean) elimina todas las filas 'null' que fallaron

        res.status(200).json(submissions);

    } catch (error) {
        console.error('❌ Error al obtener datos de la base de datos:', error);
        res.status(500).json({ message: 'Error interno del servidor', error: error.message });
    }
});


// Manejo de rutas no encontradas
app.use((req, res) => {
    res.status(4404).json({ message: 'Ruta no encontrada' });
});

// Iniciar el servidor en 0.0.0.0 para Docker
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Servidor iniciado en http://0.0.0.0:${port}`);
    console.log(`PANEL ADMIN: http://0.0.0.0:${port}/`);
    console.log(`FORMULARIO: http://0.0.0.0:${port}/formulario`);
});

