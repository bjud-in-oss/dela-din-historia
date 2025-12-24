
import fs from 'fs';
import path from 'path';

const redirectsContent = '/* /index.html 200';
const netlifyTomlContent = `[build]
  publish = "dist"
  command = "npm run build"

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200`;

// Säkerställ att public-mappen finns
if (!fs.existsSync('public')) {
  fs.mkdirSync('public');
}

try {
  fs.writeFileSync('public/_redirects', redirectsContent);
  console.log('✅ public/_redirects skapad.');
  
  fs.writeFileSync('netlify.toml', netlifyTomlContent);
  console.log('✅ netlify.toml skapad.');
} catch (err) {
  console.error('❌ Misslyckades med att skapa konfigurationsfiler:', err);
  process.exit(1);
}
