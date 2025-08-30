// This function needs several environment variables set in your Vercel project:
// 1. GITHUB_TOKEN: A GitHub Personal Access Token with `repo` scope.
// 2. GITHUB_REPO_OWNER: The owner of the target repository (e.g., your GitHub username).
// 3. GITHUB_REPO_NAME: The name of the target repository.
// 4. GITHUB_REPO_PATH: The folder path to fetch files from (e.g., 'posts').
// 5. GITHUB_REPO_BRANCH: The name of the branch to read from (e.g., 'main' or 'master').

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
            if (githubResponse.status === 404) {
                return res.status(200).json({ posts: [], totalPages: 0, currentPage: 1 });
            }
            const errorData = await githubResponse.json();
            console.error('GitHub API Error:', errorData.message);
            return res.status(githubResponse.status).json({ error: `Failed to fetch from GitHub: ${errorData.message}` });
        }

        const allFiles = await githubResponse.json();
        
        const sortedPosts = allFiles
            .filter(item => item.type === 'file' && item.name.endsWith('.md'))
            .sort((a, b) => b.name.localeCompare(a.name));

        const page = parseInt(req.query.page, 10) || 1;
        const perPage = 20;
        const totalPosts = sortedPosts.length;
        const totalPages = Math.ceil(totalPosts / perPage);
        const start = (page - 1) * perPage;
        const end = start + perPage;
        
        const paginatedPosts = sortedPosts.slice(start, end);

        return res.status(200).json({
            posts: paginatedPosts.map(post => ({
                name: post.name,
                path: post.path,
                url: post.html_url
            })),
            totalPages,
            currentPage: page
        });

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
};

