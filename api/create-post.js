const { Buffer } = require('buffer');

// Helper function to create a URL-friendly slug
function slugify(text) {
    if (!text) return 'untitled';
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(/[^\w\-]+/g, '') // Remove all non-word chars
        .replace(/\-\-+/g, '-') // Replace multiple - with single -
        .substring(0, 50); // Truncate to 50 chars
}

async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const {
        GITHUB_TOKEN,
        GITHUB_REPO_OWNER,
        GITHUB_REPO_NAME,
        GITHUB_REPO_PATH,
        GITHUB_REPO_BRANCH,
        POST_PASSWORD
    } = process.env;

    if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME || !GITHUB_REPO_PATH || !POST_PASSWORD || !GITHUB_REPO_BRANCH) {
        console.error("Server configuration error: Missing one or more required environment variables.");
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    const { title, content, password, client_iso_date, sha, path } = req.body;

    if (!content || !password) {
        return res.status(400).json({ error: 'Content and password are required.' });
    }

    if (password !== POST_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized: Invalid password.' });
    }

    try {
        let filePath = path;
        let fileSha = sha;

        // If no SHA is provided, either create new file OR fetch it if path exists
        if (!fileSha) {
            if (filePath) {
                // Try to fetch existing file to get sha
                const checkUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}?ref=${GITHUB_REPO_BRANCH}`;
                const checkRes = await fetch(checkUrl, {
                    headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' }
                });

                if (checkRes.ok) {
                    const checkData = await checkRes.json();
                    fileSha = checkData.sha;
                }
            }

            // If still no sha after fetch, it’s a new file → generate filename
            if (!fileSha) {
                const date = (client_iso_date || new Date().toISOString()).split('T')[0];
                const slug = slugify(title);
                const filename = `${date}-${slug}.md`;
                filePath = `${GITHUB_REPO_PATH}/${filename}`;
            }
        }

        const postContent = `---\ntitle: "${title || ''}"\ndate: "${new Date(client_iso_date || Date.now()).toISOString()}"\n---\n\n${content}`;
        const encodedContent = Buffer.from(postContent).toString('base64');
        const postUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}`;

        const payload = {
            message: fileSha ? `feat: update post '${title || 'untitled'}'` : `feat: add new post '${title || 'untitled'}'`,
            content: encodedContent,
            branch: GITHUB_REPO_BRANCH,
        };

        if (fileSha) {
            payload.sha = fileSha;
        }

        const postResponse = await fetch(postUrl, {
            method: 'PUT',
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' },
            body: JSON.stringify(payload),
        });

        const postResult = await postResponse.json();

        if (postResponse.status === 409) {
            throw new Error("Conflict: The post has been changed on GitHub since you started editing. Please cancel, refresh the post list, and try again.");
        }

        if (!postResponse.ok) {
            throw new Error(postResult.message || 'Failed to create or update post on GitHub.');
        }

        const message = fileSha ? 'File updated successfully!' : 'File created successfully!';
        return res.status(fileSha ? 200 : 201).json({
            message: message,
            path: postResult.content.html_url
        });

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}

module.exports = handler;