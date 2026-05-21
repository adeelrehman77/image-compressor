const express = require('express');
const path = require('path');

const distDir = path.join(__dirname, '../dist');
const PORT = process.env.PORT || 3000;

const app = express();
app.use(
    express.static(distDir, {
        setHeaders(res, filePath) {
            if (filePath.endsWith('.js')) {
                res.setHeader('Content-Type', 'application/javascript; charset=UTF-8');
            }
        },
    })
);

app.get('*', (req, res, next) => {
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Production preview → http://localhost:${PORT}`);
});
