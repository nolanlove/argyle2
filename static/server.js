import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createServer } from 'http';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 8000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Mock API endpoints for local development
app.get('/api/auth/me', (req, res) => {
  res.json({
    success: true,
    user: {
      id: 'mock-user-id',
      email: 'mock@example.com',
      name: 'Mock User (Local Dev)'
    },
    message: 'Mock: User authenticated (local development mode)'
  });
});

app.get('/api/songs', (req, res) => {
  res.json([]);
});

app.post('/api/songs', (req, res) => {
  const { title, sequence } = req.body;
  res.status(201).json({ 
    id: Date.now(), 
    title,
    sequence,
    message: 'Mock: Song saved (local development mode)' 
  });
});

app.get('/api/songs/:id', (req, res) => {
  res.status(404).json({ error: 'Song not found (local development mode)' });
});

app.put('/api/songs/:id', (req, res) => {
  const { title, sequence } = req.body;
  res.json({ 
    id: req.params.id,
    title,
    sequence,
    message: 'Mock: Song updated (local development mode)' 
  });
});

app.delete('/api/songs/:id', (req, res) => {
  res.json({ message: 'Mock: Song deleted (local development mode)' });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    environment: 'development',
    message: 'Local development server running'
  });
});

// Serve index.html for all other routes
app.get('*', (req, res) => {
  try {
    const indexPath = join(__dirname, 'index.html');
    const html = readFileSync(indexPath, 'utf8');
    res.send(html);
  } catch (error) {
    res.status(404).send('File not found');
  }
});

// Start server
const server = createServer(app);

server.listen(PORT, () => {
  console.log(`🚀 Local development server running at http://localhost:${PORT}`);
  console.log(`📁 Serving static files from: ${__dirname}`);
  console.log(`🔧 Mock API endpoints available at /api/*`);
  console.log(`🌐 Open your browser to http://localhost:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
}); 