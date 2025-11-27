import express from 'express';
import mysql from 'mysql2/promise';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 80;

// Configuración de multer para subida de archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB límite
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Configuración de la base de datos
const dbConfig = {
  host: process.env.MYSQLHOST || 'localhost',
  user: process.env.MYSQLUSER || 'root',
  password: process.env.MYSQLPASSWORD || '',
  database: process.env.MYSQLDATABASE || 'plataforma',
  port: process.env.MYSQLPORT || 3306
};

let db;

// Conectar a la base de datos
async function connectDB() {
  try {
    db = await mysql.createConnection(dbConfig);
    console.log('✅ Conectado a MySQL');
    
    // Verificar/Crear base de datos y tabla
    await db.execute(`
      CREATE TABLE IF NOT EXISTS submissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre_completo VARCHAR(255),
        email VARCHAR(255),
        telefono VARCHAR(50),
        mensaje TEXT,
        archivo VARCHAR(500),
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla submissions verificada/creada');
    
  } catch (error) {
    console.error('❌ Error conectando a MySQL:', error);
    process.exit(1);
  }
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Rutas para servir HTML
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/formulario', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'formulario.html'));
});

// API para obtener todas las submissions - NUEVA RUTA
app.get('/api/get-submissions', async (req, res) => {
  try {
    const [rows] = await db.execute('SELECT * FROM submissions ORDER BY id DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// API para eliminar submission - NUEVA RUTA
app.delete('/api/submissions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await db.execute('DELETE FROM submissions WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting submission:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// API para enviar formulario
app.post('/api/submit', upload.single('archivo'), async (req, res) => {
  try {
    const { nombre, email, telefono, mensaje } = req.body;
    const archivo = req.file ? req.file.filename : null;

    const [result] = await db.execute(
      'INSERT INTO submissions (nombre_completo, email, telefono, mensaje, archivo) VALUES (?, ?, ?, ?, ?)',
      [nombre, email, telefono, mensaje, archivo]
    );

    res.json({
      success: true,
      message: 'Formulario enviado correctamente',
      id: result.insertId
    });

  } catch (error) {
    console.error('Error guardando submission:', error);
    res.status(500).json({
      success: false,
      message: 'Error al guardar el formulario'
    });
  }
});

// Ruta para obtener submission específica
app.get('/api/submissions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute('SELECT * FROM submissions WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Submission no encontrada' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Iniciar servidor
async function startServer() {
  await connectDB();
  
  app.listen(PORT, '0.0.0.0', () => {
    console.log('\n=================================');
    console.log('🚀 Servicio iniciado correctamente');
    console.log(`📍 URL: http://0.0.0.0:${PORT}`);
    console.log('=================================\n');
    console.log(`📋 Formulario: http://0.0.0.0:${PORT}/formulario`);
    console.log(`👨‍💼 Admin: http://0.0.0.0:${PORT}/`);
    console.log('=================================\n');
  });
}

// Manejo de errores no capturados
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  process.exit(1);
});

startServer();
