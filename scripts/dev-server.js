const express = require('express');
const path = require('path');

const app = express();
const publicDir = path.join(__dirname, '../public');
const PORT = process.env.PORT || 3000;

app.use(
    express.static(publicDir, {
        setHeaders(res, filePath) {
            if (filePath.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
            }
        },
    })
);

app.get('*', (req, res, next) => {
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Dev server → http://localhost:${PORT}`);
    console.log('Edit files in public/ — run npm run build:css after CSS changes.');
});
