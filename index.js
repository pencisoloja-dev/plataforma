import express from 'express';
import mysql from 'mysql2/promise';
import multer from 'multer';
import path from 'path';
import cors from 'cors';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 80;

// Configuración básica
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Crear directorio uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Directorio uploads creado');
}

// Configuración de Multer
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

const upload = multer({ storage });

// Configuración de Base de Datos
const dbConfig = {
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'taxapp',
  port: process.env.MYSQLPORT || 3306
};

// Pool de conexiones
let pool;

async function initDatabase() {
  try {
    // Crear pool de conexión
    pool = mysql.createPool(dbConfig);
    
    // Verificar conexión
    const connection = await pool.getConnection();
    console.log('✅ Conectado a MySQL');
    
    // Crear tabla si no existe
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS submissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        data JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla submissions verificada');
    
    connection.release();
  } catch (error) {
    console.error('❌ Error con la base de datos:', error.message);
    process.exit(1);
  }
}

// Middleware para servir archivos estáticos
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Rutas de páginas
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/formulario', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'formulario.html'));
});

// API: Enviar formulario
app.post('/api/submit-form', upload.array('files'), async (req, res) => {
  try {
    console.log('📥 Recibiendo envío de formulario');
    
    if (!req.body.formData) {
      return res.status(400).json({ 
        success: false, 
        message: 'Datos del formulario faltantes' 
      });
    }

    const formData = JSON.parse(req.body.formData);
    const files = req.files || [];

    // Preparar datos para guardar
    const submissionData = {
      ...formData,
      files: files.map(file => ({
        originalName: file.originalname,
        filename: file.filename,
        url: `/uploads/${file.filename}`
      })),
      submitted_at: new Date().toISOString(),
      ip: req.ip
    };

    // Guardar en base de datos
    const connection = await pool.getConnection();
    await connection.execute(
      'INSERT INTO submissions (data) VALUES (?)',
      [JSON.stringify(submissionData)]
    );
    connection.release();

    console.log('✅ Formulario guardado exitosamente');
    
    res.json({ 
      success: true, 
      message: 'Formulario enviado correctamente',
      submissionId: submissionData.submission_id
    });

  } catch (error) {
    console.error('❌ Error al procesar formulario:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor',
      error: error.message 
    });
  }
});

// API: Obtener todos los envíos
app.get('/api/submissions', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    const [rows] = await connection.execute(`
      SELECT id, data, created_at 
      FROM submissions 
      ORDER BY created_at DESC
    `);
    connection.release();

    const submissions = rows.map(row => ({
      id: row.id,
      ...JSON.parse(row.data),
      created_at: row.created_at
    }));

    res.json({ success: true, data: submissions });
    
  } catch (error) {
    console.error('❌ Error obteniendo submissions:', error);
    res.status(500).json({ success: false, message: 'Error al obtener datos' });
  }
});

// Iniciar servidor
async function startServer() {
  await initDatabase();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor ejecutándose en http://0.0.0.0:${PORT}`);
    console.log(`📋 Formulario: http://0.0.0.0:${PORT}/formulario`);
    console.log(`⚙️  Admin: http://0.0.0.0:${PORT}/`);
  });
}

startServer().catch(console.error);
