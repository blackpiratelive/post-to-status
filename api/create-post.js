// This function needs several environment variables set in your Vercel project:
// 1. GITHUB_TOKEN: A GitHub Personal Access Token with `repo` scope.
// 2. GITHUB_REPO_OWNER: The owner of the target repository (e.g., your GitHub username).
// 3. GITHUB_REPO_NAME: The name of the target repository.
// 4. GITHUB_REPO_PATH: The folder path to push files to (e.g., 'posts' or 'src/content'). No leading/trailing slashes.
// 5. POST_PASSWORD: The secret password to authorize posts.

// Helper function to convert string to Base64
function toBase64(str) {
    return Buffer.from(str).toString('base64');
}

// Helper function to create a URL-friendly slug
function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-') // Replace spaces with -
        .replace(/[^\w\-]+/g, '') // Remove all non-word chars
        .replace(/\-\-+/g, '-') // Replace multiple - with single -
        .substring(0, 50); // Truncate to 50 chars
}

export default async function handler(req, res) {
    // 1. Only allow POST requests
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const {
        GITHUB_TOKEN,
        GITHUB_REPO_OWNER,
        GITHUB_REPO_NAME,
        GITHUB_REPO_PATH,
        POST_PASSWORD
    } = process.env;

    // 2. Check for missing environment variables
    if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME || !GITHUB_REPO_PATH || !POST_PASSWORD) {
        console.error("Missing one or more required environment variables.");
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    const { title, content, password } = req.body;

    // 3. Basic validation
    if (!title || !content || !password) {
        return res.status(400).json({ error: 'Title, content, and password are required.' });
    }

    // 4. Authentication
    if (password !== POST_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized: Invalid password.' });
    }

    try {
        // 5. Prepare file content and path
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const slug = slugify(title);
        const filename = `${date}-${slug}.md`;
        const filePath = `${GITHUB_REPO_PATH}/${filename}`;
        
        const fileContent = `---\ntitle: "${title}"\ndate: "${new Date().toISOString()}"\n---\n\n${content}`;
        const encodedContent = toBase64(fileContent);

        // 6. Construct the GitHub API request
        const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}`;

        const githubResponse = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message: `feat: add new post '${title}'`,
                content: encodedContent,
                committer: {
                    name: 'Vercel Post Bot',
                    email: 'bot@vercel.com',
                },
            }),
        });

        const githubData = await githubResponse.json();

        // 7. Handle GitHub API response
        if (!githubResponse.ok) {
            // Provide a more specific error if the file already exists or other issues
            const errorMessage = githubData.message || 'Failed to create file on GitHub.';
             console.error('GitHub API Error:', githubData);
            return res.status(githubResponse.status).json({ error: errorMessage });
        }

        // 8. Send success response
        return res.status(201).json({ 
            message: 'File created successfully!',
            path: githubData.content.html_url 
        });

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return res.status(500).json({ error: 'An internal server error occurred.' });
    }
}
