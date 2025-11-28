require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const cors = require('cors');
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
    console.log('✅ Directorio uploads creado');
}

// Configuración de Base de Datos
const dbConfig = {
    host: process.env.MYSQLHOST || 'localhost',
    user: process.env.MYSQLUSER || 'root',
    password: process.env.MYSQLPASSWORD || '',
    database: process.env.MYSQLDATABASE || 'taxapp',
    port: process.env.MYSQLPORT || 3306
};

console.log('🔧 Configuración DB:', {
    host: dbConfig.host,
    user: dbConfig.user,
    database: dbConfig.database,
    port: dbConfig.port
});

// Crear pool de conexiones
const pool = mysql.createPool(dbConfig);

// ✅ CONFIGURACIÓN OPTIMIZADA DE MULTER PARA MÚLTIPLES ARCHIVOS
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const userId = req.body.userId || 'unknown';
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const safeName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        cb(null, `${userId}-${uniqueSuffix}-${safeName}`);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB límite
        files: 20 // Máximo 20 archivos por campo
    },
    fileFilter: (req, file, cb) => {
        // Permitir imágenes y PDFs
        if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten imágenes y archivos PDF'), false);
        }
    }
});

// ✅ CONFIGURACIÓN DE MÚLTIPLES CAMPOS DE ARCHIVO
const multiUpload = upload.fields([
    { name: 'files_declarantes', maxCount: 10 },
    { name: 'files_dependientes', maxCount: 10 },
    { name: 'files_w2', maxCount: 5 },
    { name: 'files_ingresos', maxCount: 10 },
    { name: 'files_deducciones', maxCount: 10 }
]);

// Inicializar Base de Datos
async function initDatabase() {
    try {
        const initPool = mysql.createPool({
            host: dbConfig.host,
            user: dbConfig.user,
            password: dbConfig.password,
            port: dbConfig.port
        });

        const connection = await initPool.getConnection();
        
        await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database}`);
        console.log(`✅ Base de datos '${dbConfig.database}' verificada/creada`);
        
        await connection.query(`USE ${dbConfig.database}`);
        
        await connection.query(`
            CREATE TABLE IF NOT EXISTS submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id VARCHAR(255) NOT NULL,
                form_data JSON NOT NULL,
                files_data JSON NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ Tabla submissions verificada/creada');
        
        connection.release();
        await initPool.end();
        
        const testConnection = await pool.getConnection();
        console.log('✅ Conexión a MySQL exitosa');
        testConnection.release();
        
    } catch (err) {
        console.error('❌ Error inicializando base de datos:', err.message);
        process.exit(1);
    }
}

// Servir archivos estáticos
app.use('/uploads', express.static(uploadsDir));
app.use(express.static(path.join(__dirname, 'public')));

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        database: 'connected'
    });
});

// ✅✅✅ RUTAS CORREGIDAS - ADMIN EN RAÍZ COMO TU ORIGINAL
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin_nuevo.html'));
});

app.get('/formulario', (req, res) => {
    res.sendFile(path.join(__dirname, 'formulario_nuevo.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'admin_nuevo.html'));
});

// ✅✅✅ RUTA OPTIMIZADA PARA MÚLTIPLES ARCHIVOS
app.post('/api/submit-form', multiUpload, async (req, res) => {
    console.log('📨 Recibiendo envío de formulario con múltiples archivos...');
    
    try {
        if (!req.body.formData) {
            console.error('❌ Error: formData no encontrado en el cuerpo');
            return res.status(400).json({ 
                success: false,
                message: 'Datos de formulario faltantes',
                error: 'No se encontró formData en la solicitud'
            });
        }

        const formData = JSON.parse(req.body.formData);
        const userId = formData.ssn_itin || 'user-' + Date.now();

        console.log(`📝 Procesando envío para usuario: ${userId}`);
        
        // ✅ PROCESAR ARCHIVOS MÚLTIPLES
        const allFiles = [];
        const fileCategories = [
            'files_declarantes',
            'files_dependientes', 
            'files_w2',
            'files_ingresos',
            'files_deducciones'
        ];

        fileCategories.forEach(category => {
            if (req.files && req.files[category]) {
                console.log(`📁 ${category}: ${req.files[category].length} archivos`);
                req.files[category].forEach(file => {
                    allFiles.push({
                        category: category,
                        originalName: file.originalname,
                        filename: file.filename,
                        url: `/uploads/${file.filename}`,
                        size: file.size,
                        mimetype: file.mimetype
                    });
                });
            }
        });

        console.log(`📊 Total de archivos recibidos: ${allFiles.length}`);

        // Guardar en base de datos
        const connection = await pool.getConnection();
        await connection.query(
            'INSERT INTO submissions (user_id, form_data, files_data) VALUES (?, ?, ?)',
            [userId, JSON.stringify(formData), JSON.stringify(allFiles)]
        );
        connection.release();

        console.log('✅ Formulario guardado exitosamente en la base de datos');

        res.status(200).json({ 
            success: true,
            message: 'Formulario enviado con éxito',
            submissionId: userId,
            filesCount: allFiles.length
        });

    } catch (error) {
        console.error('❌ Error al procesar el formulario:', error);
        
        // Limpiar archivos subidos en caso de error
        if (req.files) {
            Object.values(req.files).flat().forEach(file => {
                const filePath = path.join(uploadsDir, file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }
        
        res.status(500).json({ 
            success: false,
            message: 'Error interno del servidor',
            error: error.message
        });
    }
});

// ✅ API PARA OBTENER ENVÍOS
app.get('/api/get-submissions', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.query(`
            SELECT * FROM submissions 
            ORDER BY created_at DESC
        `);
        connection.release();

        console.log(`📋 Envíos encontrados: ${rows.length}`);

        const submissions = rows.map(row => {
            try {
                const formData = typeof row.form_data === 'string' 
                    ? JSON.parse(row.form_data) 
                    : row.form_data;
                
                const filesData = typeof row.files_data === 'string'
                    ? JSON.parse(row.files_data)
                    : row.files_data;

                return {
                    id: row.id,
                    user_id: row.user_id,
                    ...formData,
                    files: filesData || [],
                    total_files: Array.isArray(filesData) ? filesData.length : 0,
                    submission_date: formData.submission_date || row.created_at,
                    created_at: row.created_at
                };
            } catch (parseError) {
                console.warn(`⚠️ Error parseando fila ID ${row.id}:`, parseError.message);
                return null;
            }
        }).filter(row => row !== null);

        res.status(200).json({
            success: true,
            count: submissions.length,
            submissions: submissions
        });

    } catch (error) {
        console.error('❌ Error al obtener envíos:', error);
        res.status(500).json({ 
            success: false,
            message: 'Error al cargar los envíos',
            error: error.message
        });
    }
});

// ✅ RUTA PARA ELIMINAR ENVÍO
app.delete('/api/submissions/:id', async (req, res) => {
    try {
        const submissionId = req.params.id;
        const connection = await pool.getConnection();
        
        const [rows] = await connection.query(
            'SELECT files_data FROM submissions WHERE id = ?',
            [submissionId]
        );
        
        if (rows.length === 0) {
            return res.status(404).json({ success: false, message: 'Envío no encontrado' });
        }

        // Eliminar archivos físicos
        const filesData = JSON.parse(rows[0].files_data);
        if (Array.isArray(filesData)) {
            filesData.forEach(file => {
                const filePath = path.join(uploadsDir, file.filename);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            });
        }

        await connection.query('DELETE FROM submissions WHERE id = ?', [submissionId]);
        connection.release();

        res.status(200).json({ 
            success: true, 
            message: 'Envío eliminado correctamente'
        });

    } catch (error) {
        console.error('❌ Error eliminando envío:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error al eliminar el envío',
            error: error.message
        });
    }
});

// Manejo de rutas no encontradas
app.use('*', (req, res) => {
    res.status(404).json({ 
        success: false,
        message: 'Ruta no encontrada' 
    });
});

// Manejo global de errores
app.use((error, req, res, next) => {
    console.error('🔥 Error global:', error);
    
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                message: 'Archivo demasiado grande',
                error: 'El tamaño máximo permitido es 10MB por archivo'
            });
        }
    }
    
    res.status(500).json({ 
        success: false,
        message: 'Error interno del servidor',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Error interno'
    });
});

// Inicializar e iniciar servidor
async function startServer() {
    await initDatabase();
    
    app.listen(port, '0.0.0.0', () => {
        console.log(`\n🚀 Servidor iniciado en puerto: ${port}`);
        console.log(`👨‍💼 ADMIN: http://0.0.0.0:${port}/`);
        console.log(`📋 FORMULARIO: http://0.0.0.0:${port}/formulario`);
        console.log(`❤️ HEALTH: http://0.0.0.0:${port}/health`);
    });
}

startServer().catch(console.error);
