const { Buffer } = require('buffer');

// A simple question for the bot verification
const VERIFICATION_QUESTION = "What is 5 plus 3?";
const VERIFICATION_ANSWER = "8";

async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Environment variables are still needed for GitHub access
    const {
        GITHUB_TOKEN,
        GITHUB_REPO_OWNER,
        GITHUB_REPO_NAME,
        GITHUB_REPO_BRANCH
    } = process.env;

    // These variables should point to a specific subfolder for guestbook entries
    const GUESTBOOK_POST_PATH = process.env.GUESTBOOK_POST_PATH || 'content/guestbook';
    const GUESTBOOK_IMAGE_PATH = process.env.GUESTBOOK_IMAGE_PATH || 'assets/guestbook-images';

    if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME || !GITHUB_REPO_BRANCH) {
        console.error("Server configuration error: Missing required GitHub environment variables.");
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    const { content, verification, imageData, imageName } = req.body;

    if (!content) {
        return res.status(400).json({ error: 'Content is required.' });
    }
    
    // Simple bot verification
    if (!verification || verification.trim() !== VERIFICATION_ANSWER) {
        return res.status(400).json({ error: 'Incorrect answer to the verification question.' });
    }

    try {
        let finalContent = content;
        
        // Handle optional image upload
        if (imageData && imageName) {
            const base64Data = imageData.split(';base64,').pop();
            const imageExtension = imageName.split('.').pop();
            const uniqueImageName = `${Date.now()}-guest.${imageExtension}`;
            
            const githubUploadPath = `${GUESTBOOK_IMAGE_PATH.replace(/^\/|\/$/g, '')}/${uniqueImageName}`;
            const imageUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${githubUploadPath}`;

            const imageUploadResponse = await fetch(imageUrl, {
                method: 'PUT',
                headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', },
                body: JSON.stringify({ message: `feat: add guestbook image ${uniqueImageName}`, content: base64Data, branch: GITHUB_REPO_BRANCH }),
            });

            const imageUploadResult = await imageUploadResponse.json();
            if (!imageUploadResponse.ok) throw new Error(`Failed to upload image: ${imageUploadResult.message}`);

            // Use a default, hardcoded shortcode structure
            const finalShortcode = `{{< img src="/${GUESTBOOK_IMAGE_PATH.replace(/^\/|\/$/g, '')}/${uniqueImageName}" >}}`;
            finalContent = `${finalShortcode}\n\n${content}`;
        }
        
        // Create the markdown post file
        const now = new Date();
        const istOffsetMilliseconds = 330 * 60 * 1000;
        const istDate = new Date(now.getTime() + istOffsetMilliseconds);
        const postDateISO = istDate.toISOString().replace(/\.\d{3}Z$/, '+05:30');
        const dateForFilename = postDateISO.split('T')[0];
        const unique_suffix = Date.now().toString().slice(-6); 
        const filename = `${dateForFilename}-guestbook-${unique_suffix}.md`;
        const filePath = `${GUESTBOOK_POST_PATH}/${filename}`;

        const postContent = `---\ndate: "${postDateISO}"\ntags: [guestbook]\n---\n\n${finalContent}`;
        const encodedContent = Buffer.from(postContent).toString('base64');
        const postUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}`;

        const postResponse = await fetch(postUrl, {
            method: 'PUT',
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', },
            body: JSON.stringify({ message: `feat: new guestbook entry`, content: encodedContent, branch: GITHUB_REPO_BRANCH }),
        });

        const postResult = await postResponse.json();
        if (!postResponse.ok) throw new Error(postResult.message || 'Failed to create guestbook entry.');
        
        return res.status(201).json({ message: 'Thank you! Your entry has been submitted.' });

    } catch (error) {
        console.error('An unexpected error occurred:', error);
        return res.status(500).json({ error: error.message || 'An internal server error occurred.' });
    }
}

module.exports = handler;
