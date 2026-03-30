console.log('Server file loading...');
import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  // Gemini Transcription
  app.post('/api/transcribe', async (req, res) => {
    try {
      const { fileBase64, mimeType } = req.body;
      if (!fileBase64 || !mimeType) {
        return res.status(400).json({ error: 'Missing file data' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: 'Gemini API key not configured' });
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
          {
            parts: [
              { text: 'Transcribe all text from this file. Preserve formatting reasonably. If no text is detected, return "No text detected."' },
              { inlineData: { data: fileBase64, mimeType } }
            ]
          }
        ]
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error('Transcription error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Background Removal (Mocked)
  app.post('/api/remove-bg', async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body;
      if (!imageBase64) {
        return res.status(400).json({ error: 'Missing image data' });
      }

      const apiKey = process.env.WITHOUT_BG_API_KEY;
      if (!apiKey) {
        return res.json({ imageBase64, mimeType: mimeType || 'image/png' });
      }

      const response = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_base64: imageBase64,
          size: 'auto',
          format: 'png',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `remove.bg failed with status ${response.status}`);
      }

      const imageBuffer = await response.arrayBuffer();
      const resultBase64 = Buffer.from(imageBuffer).toString('base64');
      res.json({
        imageBase64: resultBase64,
        mimeType: 'image/png',
      });
    } catch (error: any) {
      console.error('Remove bg error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
