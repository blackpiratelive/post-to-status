const { Buffer } = require('buffer');

async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_REPO_BRANCH } = process.env;
    const { path } = req.query;

    if (!path) {
        return res.status(400).json({ error: 'File path is required.' });
    }

    try {
        const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${path}?ref=${GITHUB_REPO_BRANCH}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
            },
            // Add cache-busting option
            cache: 'no-cache',
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to fetch file content.');
        }

        const content = Buffer.from(data.content, 'base64').toString('utf-8');

        res.status(200).json({
            content: content,
            sha: data.sha,
        });

    } catch (error) {
        console.error('Error fetching post content:', error);
        res.status(500).json({ error: error.message });
    }
}

module.exports = handler;

