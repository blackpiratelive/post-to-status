// This function needs several environment variables set in your Vercel project:
// ... (same as before)

function toBase64(str) {
    return Buffer.from(str).toString('base64');
}

function slugify(text) {
    if (!text) return '';
    return text.toString().toLowerCase().trim()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-]+/g, '')
        .replace(/\-\-+/g, '-')
        .substring(0, 50);
}

module.exports = async (req, res) => {
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
        console.error("Missing one or more required environment variables.");
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
        const isUpdate = sha && path;
        const postDate = client_iso_date ? new Date(client_iso_date) : new Date();
        const dateForFilename = postDate.toISOString().split('T')[0];
        
        let finalTitle = title;
        let slug;

        if (!finalTitle) {
            // Generate title/slug from content if title is missing
            finalTitle = content.split(/\s+/).slice(0, 5).join(' ') + '...';
            slug = slugify(finalTitle) || Date.now().toString();
        } else {
            slug = slugify(finalTitle);
        }

        const filename = `${dateForFilename}-${slug}.md`;
        const filePath = isUpdate ? path : `${GITHUB_REPO_PATH}/${filename}`;
        
        const fileContent = `---\ntitle: "${finalTitle}"\ndate: "${postDate.toISOString()}"\n---\n\n${content}`;
        const encodedContent = toBase64(fileContent);

        const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}`;

        const commitMessage = isUpdate ?
            `feat: update post '${finalTitle}'` :
            `feat: add new post '${finalTitle}'`;
            
        const body = {
            message: commitMessage,
            content: encodedContent,
            branch: GITHUB_REPO_BRANCH,
            committer: { name: 'Vercel Post Bot', email: 'bot@vercel.com' },
        };

        if (isUpdate) {
            body.sha = sha;
        }

        const githubResponse = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        const githubData = await githubResponse.json();

        if (!githubResponse.ok) {
            return res.status(githubResponse.status).json({ error: githubData.message || 'Failed to commit file to GitHub.' });
        }
        
        const responseMessage = isUpdate ? 'File updated successfully!' : 'File created successfully!';
        return res.status(isUpdate ? 200 : 201).json({ 
            message: responseMessage,
            path: githubData.content.html_url 
        });

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

