// server.js
const express = require('express');
const path = require('path');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const { spawn } = require('child_process');
// 1. Create Express app
const app = express();
app.use(cors());
// 2. Middleware
app.use(express.json()); // Parse JSON payloads
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded payloads
app.use(express.static(path.join(__dirname, 'frontend')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/libs', express.static(path.join(__dirname, 'frontend', 'public', 'libs')));
app.use(express.static(path.join(__dirname, 'frontend')));

// 3. File upload configuration
// Store uploaded videos in 'uploads/' folder


// 1. Set up custom disk storage
const storage = multer.diskStorage({
    destination: path.join(__dirname, 'uploads/'),
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname)); // keep extension
    }
});

const upload = multer({ storage });

// 2. Unified route
app.post('/upload', upload.single('video'), async (req, res) => {
    try {
        console.log("🎥 Uploaded file:", req.file);
        res.json({
            success: true,
            videoFilename: req.file?.filename,
        });
    } catch (err) {
        console.error("Upload failed:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

const upload2 = multer({ storage }); // reuse your existing multer config

app.post('/upload-hydra', upload2.single('video'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    try {
        const speedFactor = parseFloat(req.body.speedFactor) || 10; // from FormData
        const inPath = path.join(__dirname, 'uploads', req.file.filename);

        const outDir = path.join(__dirname, 'rendered');
        fs.mkdirSync(outDir, { recursive: true });
        const outName = `${Date.now()}-${path.basename(req.file.filename, path.extname(req.file.filename))}-normal.mp4`;
        const outPath = path.join(outDir, outName);

        // FFmpeg args: slow video only, ignore audio
        const ffmpegArgs = [
            '-y',
            '-i', inPath,
            '-filter:v', `setpts=${speedFactor / 2}*PTS`,
            '-an',                         // drop audio
            '-c:v', 'libx264',
            '-crf', '18',
            '-preset', 'fast',
            '-pix_fmt', 'yuv420p',
            outPath
        ];

        console.log(`Slowing down ${req.file.filename} by factor ${speedFactor} → ${outName} (audio ignored)`);

        await new Promise((resolve, reject) => {
            const ff = spawn('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
            ff.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
            ff.on('error', reject);
        });

        // Return the slowed-down MP4
        res.sendFile(outPath);

    } catch (err) {
        console.error('upload-hydra error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});



app.post('/render', async (req, res) => {
    try {
        res.json({ success: true, message: "Render started successfully." });
    }
    catch (err) {
        console.log(err);
        res.status(500).json({ success: false, message: "nuuuu :((" })
    }
})

// Endpoint to receive single raw frame uploads for a run
// Expects: POST /api/upload-frame?run=<runId>&name=frame-000001.jpg
app.post('/api/upload-frame', express.raw({ type: 'application/octet-stream', limit: '200mb' }), (req, res) => {
    try {
        const runId = req.query.run || 'default';
        const name = req.query.name;
        if (!name) return res.status(400).json({ success: false, error: 'missing name' });

        const outDir = path.join(__dirname, 'uploads', runId);
        fs.mkdirSync(outDir, { recursive: true });
        const outPath = path.join(outDir, name);
        fs.writeFile(outPath, req.body, (err) => {
            if (err) {
                console.error('Failed to write frame', outPath, err);
                return res.status(500).json({ success: false, error: err.message });
            }
            return res.json({ success: true, path: outPath });
        });
    } catch (err) {
        console.error('upload-frame error', err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// POST /api/speedup
app.post('/api/speedup', async (req, res) => {
    try {
        const { filename, factor } = req.body || {};
        if (!filename) {
            return res.status(400).json({ success: false, error: 'missing filename' });
        }

        const speed = parseFloat(factor) || 10;
        const inPath = path.join(__dirname, 'uploads', filename);
        if (!fs.existsSync(inPath)) {
            return res.status(400).json({ success: false, error: 'input not found' });
        }

        const outDir = path.join(__dirname, 'rendered');
        fs.mkdirSync(outDir, { recursive: true });
        const outName = `${Date.now()}-${path.basename(filename, path.extname(filename))}-sped.mp4`;
        const outAudioName = `${Date.now()}-${path.basename(filename, path.extname(filename))}.mp3`;
        const outAudioPath = path.join(outDir,outAudioName);
        const outPath = path.join(outDir, outName);

        const ratio = 1 / speed;
        console.log(`Speeding up ${filename} by ${speed}× using -itsscale ${ratio}`);

        const ffmpegArgs = [
            '-y',
            '-itsscale', String(ratio),
            '-i', inPath,
            '-c', 'copy',
            outPath
        ];

        await new Promise((resolve, reject) => {
            const p = spawn('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
            p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
            p.on('error', reject);
        });

        // Return JSON with URL to the rendered file (served from /rendered)
        const urlPath = `/rendered/${outName}`;
        console.log('api/speedup finished, output at', urlPath);
        return res.json({ success: true, url: urlPath, filename: outName });

    } catch (err) {
        console.error('api/speedup error', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = app;





// Endpoint to trigger encoding of uploaded frames for a run
// Expects: POST /api/encode?run=<runId>&fps=15
app.post('/api/speedup', async (req, res) => {
    try {
        const { filename, factor } = req.body || {};
        if (!filename) {
            return res.status(400).json({ success: false, error: 'missing filename' });
        }

        const speed = parseFloat(factor) || 10;
        const inPath = path.join(__dirname, 'uploads', filename);
        if (!fs.existsSync(inPath)) {
            return res.status(400).json({ success: false, error: 'input not found' });
        }

        const outDir = path.join(__dirname, 'rendered');
        fs.mkdirSync(outDir, { recursive: true });
        const outName = `${Date.now()}-${path.basename(filename, path.extname(filename))}-sped.mp4`;
        const outPath = path.join(outDir, outName);

        console.log(`Speeding up ${filename} by ${speed}× with smooth re-encoding`);

        // Video: setpts=PTS/speed for speed change
        // Audio: atempo supports 0.5-2× at a time; chain if needed
        const videoFilter = `setpts=${1 / speed}*PTS`;

        // Build audio filter
        let audioFilter = '';
        if (speed < 0.5 || speed > 2) {
            // chain atempo filters for factors outside 0.5–2
            let remaining = speed;
            const filters = [];
            while (remaining > 2) { filters.push('atempo=2'); remaining /= 2; }
            while (remaining < 0.5) { filters.push('atempo=0.5'); remaining /= 0.5; }
            filters.push(`atempo=${remaining}`);
            audioFilter = filters.join(',');
        } else {
            audioFilter = `atempo=${speed}`;
        }

        const ffmpegArgs = [
            '-y',
            '-i', inPath,
            '-filter_complex', `[0:v]${videoFilter}[v];[0:a]${audioFilter}[a]`,
            '-map', '[v]',
            '-map', '[a]',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '18',
            '-pix_fmt', 'yuv420p',
            outPath
        ];
        const ffmpegArgs2 = [
            '-i', inPath,

        ]
        await new Promise((resolve, reject) => {
            const p = spawn('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
            p.on('close', code => code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`)));
            p.on('error', reject);
        });

        const urlPath = `/rendered/${outName}`;
        console.log('api/speedup finished, output at', urlPath);
        return res.json({ success: true, url: urlPath, filename: outName });

    } catch (err) {
        console.error('api/speedup error', err);
        return res.status(500).json({ success: false, error: err.message });
    }
});


// 4. Serve static files (for rendered MP4s)
app.use('/rendered', express.static(path.join(__dirname, 'rendered')));

// 5. Health check endpoint
app.get('/', (req, res) => {
    res.send('Server is running!');
});

// 6. Start server
const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server listening at http://localhost:${PORT}`);
});
