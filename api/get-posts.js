// This function needs several environment variables set in your Vercel project:
// 1. GITHUB_TOKEN: A GitHub Personal Access Token with `repo` scope.
// 2. GITHUB_REPO_OWNER: The owner of the target repository.
// 3. GITHUB_REPO_NAME: The name of the target repository.
// 4. GITHUB_REPO_PATH: The folder path to fetch files from.
// 5. GITHUB_REPO_BRANCH: The name of the branch to read from.

module.exports = async (req, res) => {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const {
        GITHUB_TOKEN,
        GITHUB_REPO_OWNER,
        GITHUB_REPO_NAME,
        GITHUB_REPO_PATH,
        GITHUB_REPO_BRANCH
    } = process.env;

    if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME || !GITHUB_REPO_PATH || !GITHUB_REPO_BRANCH) {
        console.error("Server configuration error: Missing GitHub environment variables.");
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    try {
        const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${GITHUB_REPO_PATH}?ref=${GITHUB_REPO_BRANCH}`;

        const githubResponse = await fetch(url, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
            },
        });

        if (!githubResponse.ok) {
            // If the directory doesn't exist, GitHub returns a 404. Treat this as an empty list.
            if (githubResponse.status === 404) {
                return res.status(200).json({ posts: [] });
            }
            const errorData = await githubResponse.json();
            return res.status(githubResponse.status).json({ error: `Failed to fetch from GitHub: ${errorData.message}` });
        }

        const allFiles = await githubResponse.json();
        
        // Filter out non-markdown files (like subdirectories)
        const posts = allFiles
            .filter(item => item.type === 'file' && item.name.endsWith('.md'))
            .map(post => ({
                name: post.name,
                path: post.path,
                url: post.html_url
            }));

        // The entire list is returned; sorting and pagination are now handled on the client.
        return res.status(200).json({ posts });

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

