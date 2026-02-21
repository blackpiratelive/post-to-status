const createPostHandler = require('./create-post');
const uploadImageHandler = require('./upload-image');

// ---------------------------------------------------------------------------
// Helpers to call existing handlers without an HTTP round-trip.
// We build lightweight mock req/res objects that capture the status & body.
// ---------------------------------------------------------------------------

function mockRes() {
    const res = {
        _status: 200,
        _body: null,
        _headers: {},
        status(code) { res._status = code; return res; },
        json(body) { res._body = body; return res; },
        setHeader(k, v) { res._headers[k] = v; return res; },
        text(body) { res._body = body; return res; },
    };
    return res;
}

function mockReq(method, body, query) {
    return { method, body: body || {}, query: query || {} };
}

// ---------------------------------------------------------------------------
// Main handler – single endpoint for the Android app
// ---------------------------------------------------------------------------

async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { POST_PASSWORD } = process.env;

    const {
        password,
        title,
        content,
        tags,
        imageData,
        imageName,
        imagePath,
        shortcodeTemplate,
    } = req.body;

    // --- Validation ---
    if (!password || !content) {
        return res.status(400).json({ error: 'password and content are required.' });
    }
    if (!POST_PASSWORD || password !== POST_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized: Invalid password.' });
    }

    try {
        let finalContent = content;

        // --- Step 1: Upload image (optional) ---
        if (imageData && imageName) {
            const uploadRes = mockRes();
            const uploadReq = mockReq('POST', {
                password,
                imageData,
                imageName,
                imagePath: imagePath || 'assets/img',
            });

            await uploadImageHandler(uploadReq, uploadRes);

            if (uploadRes._status >= 400) {
                const errMsg = uploadRes._body?.error || 'Image upload failed.';
                return res.status(uploadRes._status).json({ error: errMsg });
            }

            const uniqueImageName = uploadRes._body?.uniqueImageName;
            if (uniqueImageName) {
                const template = shortcodeTemplate || '{{< img src="/img/IMAGE_NAME" >}}';
                const shortcode = template.replace('IMAGE_NAME', uniqueImageName);
                finalContent = `${shortcode}\n\n${content}`;
            }
        }

        // --- Step 2: Create the post ---
        const createRes = mockRes();
        const createReq = mockReq('POST', {
            password,
            title: title || '',
            content: finalContent,
            tags: tags || [],
            client_iso_date: new Date().toISOString(),
        });

        await createPostHandler(createReq, createRes);

        if (createRes._status >= 400) {
            const errMsg = createRes._body?.error || 'Post creation failed.';
            return res.status(createRes._status).json({ error: errMsg });
        }

        return res.status(201).json({
            message: createRes._body?.message || 'Post created successfully!',
            path: createRes._body?.path,
        });

    } catch (error) {
        console.error('quick-post error:', error);
        return res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}

module.exports = handler;
