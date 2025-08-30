const { Buffer } = require('buffer');

// Helper function to create a URL-friendly slug
function slugify(text) {
    if (!text) return 'untitled';
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .substring(0, 50);
}

async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_REPO_BRANCH, POST_PASSWORD } = process.env;

    const { password, imageData, imageName, imagePath: userImagePath } = req.body;

    if (!password || !POST_PASSWORD || password !== POST_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized: Invalid password.' });
    }

    if (!imageData || !imageName || !userImagePath) {
        return res.status(400).json({ error: 'Image data, name, and path are required.' });
    }

    try {
        const cleanUserPath = userImagePath.replace(/^\/|\/$/g, '');
        const base64Data = imageData.split(';base64,').pop();
        const imageExtension = imageName.split('.').pop();
        const uniqueImageName = `${Date.now()}-${slugify(imageName.replace(`.${imageExtension}`, ''))}.${imageExtension}`;
        const githubUploadPath = `${cleanUserPath}/${uniqueImageName}`;

        const imageUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${githubUploadPath}`;

        const imageUploadResponse = await fetch(imageUrl, {
            method: 'PUT',
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' },
            body: JSON.stringify({
                message: `feat: add image ${uniqueImageName}`,
                content: base64Data,
                branch: GITHUB_REPO_BRANCH,
            }),
        });

        const imageUploadResult = await imageUploadResponse.json();
        if (!imageUploadResponse.ok) {
            throw new Error(`Failed to upload image: ${imageUploadResult.message}`);
        }

        return res.status(201).json({ 
            message: 'Image uploaded successfully!',
            uniqueImageName: uniqueImageName 
        });

    } catch (error) {
        console.error('Image upload error:', error);
        return res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}

module.exports = handler;
