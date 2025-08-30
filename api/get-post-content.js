// This function needs several environment variables set in your Vercel project:
// 1. GITHUB_TOKEN: A GitHub Personal Access Token with `repo` scope.
// 2. GITHUB_REPO_OWNER: The owner of the target repository.
// 3. GITHUB_REPO_NAME: The name of the target repository.
// 4. GITHUB_REPO_BRANCH: The name of the branch to read from.

// Helper to decode Base64
function fromBase64(str) {
    return Buffer.from(str, 'base64').toString('utf8');
}

// Helper to parse frontmatter and content
function parseFrontmatter(content) {
    const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---\n/);
    if (!frontmatterMatch) {
        return { title: '', content: content };
    }
    
    const frontmatter = frontmatterMatch[1];
    const body = content.substring(frontmatterMatch[0].length);
    
    const titleMatch = frontmatter.match(/title:\s*"(.*?)"/);
    const title = titleMatch ? titleMatch[1] : '';
    
    return { title, content: body };
}

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const {
        GITHUB_TOKEN,
        GITHUB_REPO_OWNER,
        GITHUB_REPO_NAME,
        GITHUB_REPO_BRANCH
    } = process.env;

    const { path } = req.query;

    if (!path) {
        return res.status(400).json({ error: 'File path is required.' });
    }

    if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME || !GITHUB_REPO_BRANCH) {
        console.error("Server configuration error: Missing GitHub environment variables.");
        return res.status(500).json({ error: 'Server configuration error.' });
    }
    
    try {
        const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${path}?ref=${GITHUB_REPO_BRANCH}`;

        const githubResponse = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        if (!githubResponse.ok) {
            const errorData = await githubResponse.json();
            return res.status(githubResponse.status).json({ error: `Failed to fetch file content: ${errorData.message}` });
        }

        const fileData = await githubResponse.json();
        const decodedContent = fromBase64(fileData.content);
        const { title, content } = parseFrontmatter(decodedContent);

        return res.status(200).json({
            title,
            content,
            sha: fileData.sha,
            path: fileData.path
        });

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
};
