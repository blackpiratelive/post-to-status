const { Buffer } = require('buffer');

async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const {
        GITHUB_TOKEN,
        GITHUB_REPO_OWNER,
        GITHUB_REPO_NAME,
        GITHUB_REPO_BRANCH
    } = process.env;

    // --- PATH CONFIGURATION ---
    // The physical path (from repo root) where images will be uploaded.
    const GUESTBOOK_UPLOAD_PATH = 'assets/img';
    // The path Hugo uses in the shortcode to serve the image.
    const GUESTBOOK_SHORTCODE_PATH = '/img';
    // The path for the guestbook markdown files.
    const GUESTBOOK_POST_PATH = process.env.GUESTBOOK_POST_PATH || 'content/guestbook';


    if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME || !GITHUB_REPO_BRANCH) {
        console.error("Server configuration error: Missing required GitHub environment variables.");
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    const { content, verification, imageData, imageName, name, website, num1, num2 } = req.body;

    if (!content) {
        return res.status(400).json({ error: 'Content is required.' });
    }
    
    // Dynamic bot verification
    if (num1 === undefined || num2 === undefined) {
        return res.status(400).json({ error: 'Verification numbers were not provided.' });
    }
    const expectedAnswer = num1 + num2;
    if (!verification || parseInt(verification, 10) !== expectedAnswer) {
        return res.status(400).json({ error: 'Incorrect answer to the verification question.' });
    }

    try {
        let finalContent = content;
        
        // Handle optional image upload
        if (imageData && imageName) {
            const base64Data = imageData.split(';base64,').pop();
            const imageExtension = imageName.split('.').pop();
            const uniqueImageName = `${Date.now()}-guest.${imageExtension}`;
            
            // Use the hardcoded physical upload path
            const githubUploadPath = `${GUESTBOOK_UPLOAD_PATH}/${uniqueImageName}`;
            const imageUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${githubUploadPath}`;

            const imageUploadResponse = await fetch(imageUrl, {
                method: 'PUT',
                headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json', },
                body: JSON.stringify({ message: `feat: add guestbook image ${uniqueImageName}`, content: base64Data, branch: GITHUB_REPO_BRANCH }),
            });

            const imageUploadResult = await imageUploadResponse.json();
            if (!imageUploadResponse.ok) throw new Error(`Failed to upload image: ${imageUploadResult.message}`);

            // **THE FIX:** Use the separate shortcode path for the markdown content
            const finalShortcode = `{{< img src="${GUESTBOOK_SHORTCODE_PATH}/${uniqueImageName}" >}}`;
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

        // Build frontmatter, only including name and website if they exist
        let frontmatter = `date: "${postDateISO}"\ntags: [guestbook]`;
        if (name) {
            frontmatter += `\nname: "${name.replace(/"/g, '\\"')}"`;
        }
        if (website) {
            frontmatter += `\nwebsite: "${website}"`;
        }

        const postContent = `---\n${frontmatter}\n---\n\n${finalContent}`;
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
