const express = require('express');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'public', 'img', 'productos');
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

module.exports = function (app) {
  fs.mkdirSync(DIR, { recursive: true });

  // Lista de imágenes disponibles
  app.get('/api/admin/imagenes', (req, res) => {
    const archivos = fs.readdirSync(DIR)
      .filter(f => /\.(jpe?g|png|webp)$/i.test(f))
      .sort();
    res.json(archivos);
  });

  // Subir una imagen (el cuerpo es la imagen en bruto)
  app.post('/api/admin/imagenes',
    express.raw({ type: 'image/*', limit: '8mb' }),
    (req, res) => {
      const tipo = (req.headers['content-type'] || '').split(';')[0];
      const ext = EXT[tipo];
      if (!ext || !Buffer.isBuffer(req.body) || !req.body.length) {
        return res.status(400).json({ error: 'Imagen inválida (usa JPG, PNG o WEBP)' });
      }
      const base = String(req.query.nombre || 'producto')
        .replace(/\.[^.]+$/, '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'producto';
      const archivo = `${base}-${Date.now().toString(36)}.${ext}`;
      fs.writeFileSync(path.join(DIR, archivo), req.body);
      res.status(201).json({ archivo });
    });
};
