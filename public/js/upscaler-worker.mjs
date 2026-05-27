/* global self */
/**
 * Real-ESRGAN tile inference via ONNX Runtime Web (runs off main thread).
 */
const TILE = 128;
const SCALE = 4;

let ort = null;
let session = null;

async function loadOrt(ortModuleUrl, wasmPath) {
    if (ort) return ort;
    ort = await import(ortModuleUrl);
    ort.env.wasm.wasmPaths = wasmPath;
    ort.env.wasm.numThreads = 1;
    ort.env.logLevel = 'error';
    return ort;
}

function rgbaToChwTensor(pixels, w, h) {
    const tensor = new Float32Array(3 * w * h);
    const plane = w * h;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const idx = y * w + x;
            tensor[idx] = pixels[i] / 255;
            tensor[plane + idx] = pixels[i + 1] / 255;
            tensor[plane * 2 + idx] = pixels[i + 2] / 255;
        }
    }
    return tensor;
}

function chwToRgba(chw, w, h) {
    const out = new Uint8ClampedArray(w * h * 4);
    const plane = w * h;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const idx = y * w + x;
            const o = idx * 4;
            out[o] = Math.max(0, Math.min(255, Math.round(chw[idx] * 255)));
            out[o + 1] = Math.max(0, Math.min(255, Math.round(chw[plane + idx] * 255)));
            out[o + 2] = Math.max(0, Math.min(255, Math.round(chw[plane * 2 + idx] * 255)));
            out[o + 3] = 255;
        }
    }
    return out;
}

async function runTile(pixels, inW, inH) {
    const inputName = session.inputNames[0];
    const outputName = session.outputNames[0];
    const chw = rgbaToChwTensor(pixels, inW, inH);
    const inputTensor = new ort.Tensor('float32', chw, [1, 3, inH, inW]);
    const results = await session.run({ [inputName]: inputTensor });
    const output = results[outputName];
    const outH = inH * SCALE;
    const outW = inW * SCALE;
    const rgba = chwToRgba(output.data, outW, outH);
    return { rgba, outW, outH };
}

self.onmessage = async (e) => {
    const msg = e.data;
    try {
        if (msg.type === 'init') {
            await loadOrt(msg.ortModuleUrl, msg.wasmPath);
            session = await ort.InferenceSession.create(msg.modelBuffer);
            self.postMessage({ type: 'model-ready' });
            return;
        }

        if (msg.type === 'run-tile') {
            const { tileIndex, totalTiles, pixels, inW, inH } = msg;
            const { rgba, outW, outH } = await runTile(new Uint8ClampedArray(pixels), inW, inH);
            self.postMessage(
                {
                    type: 'tile-complete',
                    tileIndex,
                    totalTiles,
                    outW,
                    outH,
                    inW,
                    inH,
                    rgba: rgba.buffer,
                },
                [rgba.buffer]
            );
            return;
        }
    } catch (err) {
        self.postMessage({
            type: 'error',
            message: err?.message || String(err),
            tileIndex: msg.tileIndex,
        });
    }
};
