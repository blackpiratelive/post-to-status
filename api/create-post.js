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

    const { title, content, password, client_iso_date, sha, path, tags: rawTags, lastmod } = req.body;

    if (!content || !password) {
        return res.status(400).json({ error: 'Content and password are required.' });
    }

    if (password !== POST_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized: Invalid password.' });
    }

    try {
        let filePath = path;
        let postDateISO; // This will hold the final date string for the frontmatter

        // If 'path' is not provided, this is a new post.
        if (!filePath) {
            // **NEW LOGIC FOR GMT+5:30 TIMEZONE**
            // For new posts, we explicitly calculate the date and time in IST.
            const now = new Date();
            // The offset for IST (GMT+5:30) is 330 minutes.
            const istOffsetMilliseconds = 330 * 60 * 1000;
            // Create a new Date object representing the time in IST.
            const istDate = new Date(now.getTime() + istOffsetMilliseconds);

            // Extract date parts from the new IST Date object using UTC methods.
            const year = istDate.getUTCFullYear();
            const month = String(istDate.getUTCMonth() + 1).padStart(2, '0');
            const day = String(istDate.getUTCDate()).padStart(2, '0');
            const hours = String(istDate.getUTCHours()).padStart(2, '0');
            const minutes = String(istDate.getUTCMinutes()).padStart(2, '0');
            const seconds = String(istDate.getUTCSeconds()).padStart(2, '0');

            const dateForFilename = `${year}-${month}-${day}`;
            // Manually construct the ISO string with the correct +05:30 offset.
            postDateISO = `${dateForFilename}T${hours}:${minutes}:${seconds}+05:30`;

            const slug = slugify(title);
            const unique_suffix = Date.now().toString().slice(-6); 
            const filename = `${dateForFilename}-${slug}-${unique_suffix}.md`;
            filePath = `${GITHUB_REPO_PATH}/${filename}`;
        } else {
            // For updates, we preserve the original date sent from the client.
            postDateISO = new Date(client_iso_date).toISOString();
        }

        const tags = Array.isArray(rawTags)
            ? rawTags
            : typeof rawTags === 'string'
                ? rawTags.split(',')
                : [];
        const cleanTags = tags
            .map(tag => String(tag).trim())
            .filter(Boolean);
        const tagsLine = cleanTags.length
            ? `tags: [${cleanTags.map(tag => JSON.stringify(tag)).join(', ')}]\n`
            : '';
        const lastModDate = lastmod ? new Date(lastmod) : new Date();
        const lastmodISO = Number.isNaN(lastModDate.getTime())
            ? new Date().toISOString()
            : lastModDate.toISOString();
        const postContent = `---\ntitle: "${title || ''}"\n${tagsLine}date: "${postDateISO}"\nlastmod: "${lastmodISO}"\n---\n\n${content}`;
        const encodedContent = Buffer.from(postContent).toString('base64');
        const postUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}`;

        const payload = {
            message: sha ? `feat: update post '${title || 'untitled'}'` : `feat: add new post '${title || 'untitled'}'`,
            content: encodedContent,
            branch: GITHUB_REPO_BRANCH,
        };

        if (sha) {
            payload.sha = sha;
        }

        const postResponse = await fetch(postUrl, {
            method: 'PUT',
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', },
            body: JSON.stringify(payload),
        });

        const postResult = await postResponse.json();

        if (!postResponse.ok) {
            if (postResponse.status === 422 && postResult.message.includes("sha wasn't supplied")) {
                 throw new Error("Filename conflict. The post title may be too similar to an existing post. Please try a different title.");
            }
            if (postResponse.status === 409) {
                 throw new Error("Conflict: This post has been updated on GitHub since you started editing. Please cancel and refresh.");
            }
            throw new Error(postResult.message || 'Failed to create or update post on GitHub.');
        }
        
        const message = sha ? 'File updated successfully!' : 'File created successfully!';
        return res.status(sha ? 200 : 201).json({ 
            message: message,
            path: postResult.content.html_url 
        });

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}

module.exports = handler;
