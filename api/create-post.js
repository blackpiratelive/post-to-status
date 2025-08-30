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

    const { title, content, password, client_iso_date, sha, path, imageData, imageName, imagePath: userImagePath, imageShortcodeTemplate } = req.body;

    if (!content || !password) {
        return res.status(400).json({ error: 'Content and password are required.' });
    }

    if (password !== POST_PASSWORD) {
        return res.status(401).json({ error: 'Unauthorized: Invalid password.' });
    }

    try {
        let finalContent = content;
        let postSha = sha; // Use a mutable variable for the sha.
        
        // Step 1: Handle image upload if an image is provided
        if (imageData && imageName) {
            if (!userImagePath || !imageShortcodeTemplate) {
                return res.status(400).json({ error: 'Image Path and Shortcode Template are required when uploading an image.' });
            }

            const cleanUserPath = userImagePath.replace(/^\/|\/$/g, '');
            const base64Data = imageData.split(';base64,').pop();
            const imageExtension = imageName.split('.').pop();
            const uniqueImageName = `${Date.now()}-${slugify(imageName.replace(`.${imageExtension}`, ''))}.${imageExtension}`;
            
            const githubUploadPath = `${cleanUserPath}/${uniqueImageName}`;
            const imageUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${githubUploadPath}`;

            const imageUploadResponse = await fetch(imageUrl, {
                method: 'PUT',
                headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', },
                body: JSON.stringify({ message: `feat: add image ${uniqueImageName}`, content: base64Data, branch: GITHUB_REPO_BRANCH, }),
            });

            const imageUploadResult = await imageUploadResponse.json();
            if (!imageUploadResponse.ok) {
                throw new Error(`Failed to upload image: ${imageUploadResult.message}`);
            }

            // **NEW LOGIC:** If we are updating a post (postSha exists) AND we just uploaded an image,
            // the original post's SHA is now stale. We must wait and refetch it.
            if (postSha) {
                console.log('Image uploaded during an update. Waiting and refetching post SHA to avoid conflict.');
                
                // Wait 5 seconds as requested to allow for GitHub API replication.
                await new Promise(resolve => setTimeout(resolve, 5000));

                const refetchUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${path}?ref=${GITHUB_REPO_BRANCH}`;
                
                const refetchResponse = await fetch(refetchUrl, {
                    headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' },
                });

                const refetchResult = await refetchResponse.json();

                if (!refetchResponse.ok) {
                    throw new Error(`Failed to refetch post metadata after image upload: ${refetchResult.message}. The file may have been moved or deleted.`);
                }
                
                console.log(`Successfully refetched SHA. Old: ${postSha}, New: ${refetchResult.sha}`);
                postSha = refetchResult.sha; // Update our SHA variable to the latest version.
            }

            const finalShortcode = imageShortcodeTemplate.replace('IMAGE_NAME', uniqueImageName);
            finalContent = `${finalShortcode}\n\n${content}`;
        }
        
        // Step 2: Create or update the markdown post file
        const date = (client_iso_date || new Date().toISOString()).split('T')[0];
        const slug = slugify(title);
        const filename = `${date}-${slug}.md`;
        let filePath = path;
        
        if (!filePath) {
             filePath = `${GITHUB_REPO_PATH}/${filename}`;
        }

        const postContent = `---\ntitle: "${title || ''}"\ndate: "${new Date(client_iso_date).toISOString()}"\n---\n\n${finalContent}`;
        const encodedContent = Buffer.from(postContent).toString('base64');
        const postUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}`;

        const payload = {
            message: postSha ? `feat: update post '${title || 'untitled'}'` : `feat: add new post '${title || 'untitled'}'`,
            content: encodedContent,
            branch: GITHUB_REPO_BRANCH,
        };

        if (postSha) {
            payload.sha = postSha; // Use the potentially updated SHA
        }

        const postResponse = await fetch(postUrl, {
            method: 'PUT',
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', },
            body: JSON.stringify(payload),
        });

        const postResult = await postResponse.json();

        if (postResponse.status === 409) {
            throw new Error("Conflict: The post has been changed on GitHub since you started editing. Please cancel, refresh the post list, and try again.");
        }

        if (!postResponse.ok) {
            throw new Error(postResult.message || 'Failed to create or update post on GitHub.');
        }
        
        const message = postSha ? 'File updated successfully!' : 'File created successfully!';
        return res.status(postSha ? 200 : 201).json({ 
            message: message,
            path: postResult.content.html_url 
        });

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}

module.exports = handler;

