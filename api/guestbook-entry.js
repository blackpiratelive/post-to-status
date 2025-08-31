const { Buffer } = require('buffer');

async function handler(req, res) {
    if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const {
        GITHUB_TOKEN, GITHUB_REPO_OWNER, GITHUB_REPO_NAME, GITHUB_REPO_BRANCH
    } = process.env;

    const GUESTBOOK_POST_PATH = process.env.GUESTBOOK_POST_PATH || 'content/guestbook';
    const GUESTBOOK_IMAGE_PATH = process.env.GUESTBOOK_IMAGE_PATH || 'assets/guestbook-images';

    if (!GITHUB_TOKEN || !GITHUB_REPO_OWNER || !GITHUB_REPO_NAME || !GITHUB_REPO_BRANCH) {
        console.error("Server configuration error: Missing required GitHub environment variables.");
        return res.status(500).json({ error: 'Server configuration error.' });
    }

    const { name, website, content, verification, num1, num2, imageData, imageName } = req.body;

    if (!content) {
        return res.status(400).json({ error: 'Content is required.' });
    }
    
    // **THE FIX:** More robust server-side verification to prevent crashes.
    // It now checks that all required numbers are present before calculating the answer.
    if (typeof num1 !== 'number' || typeof num2 !== 'number' || !verification) {
        return res.status(400).json({ error: 'Verification data is missing.' });
    }
    const expectedAnswer = num1 + num2;
    if (parseInt(verification, 10) !== expectedAnswer) {
        return res.status(400).json({ error: 'Incorrect answer to the verification question.' });
    }

    try {
        let finalContent = content;
        
        if (imageData && imageName) {
            const base64Data = imageData.split(';base64,').pop();
            const imageExtension = imageName.split('.').pop();
            const uniqueImageName = `${Date.now()}-guest.${imageExtension}`;
            const githubUploadPath = `${GUESTBOOK_IMAGE_PATH.replace(/^\/|\/$/g, '')}/${uniqueImageName}`;
            const imageUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${githubUploadPath}`;

            const imageUploadResponse = await fetch(imageUrl, {
                method: 'PUT',
                headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' },
                body: JSON.stringify({ message: `feat: add guestbook image ${uniqueImageName}`, content: base64Data, branch: GITHUB_REPO_BRANCH }),
            });
            const imageUploadResult = await imageUploadResponse.json();
            if (!imageUploadResponse.ok) throw new Error(`Failed to upload image: ${imageUploadResult.message}`);
            
            const finalShortcode = `{{< img src="/${GUESTBOOK_IMAGE_PATH.replace(/^\/|\/$/g, '')}/${uniqueImageName}" >}}`;
            finalContent = `${finalShortcode}\n\n${content}`;
        }
        
        const now = new Date();
        const istOffsetMilliseconds = 330 * 60 * 1000;
        const istDate = new Date(now.getTime() + istOffsetMilliseconds);
        const postDateISO = istDate.toISOString().replace(/\.\d{3}Z$/, '+05:30');
        const dateForFilename = postDateISO.split('T')[0];
        const unique_suffix = Date.now().toString().slice(-6);
        const filename = `${dateForFilename}-guestbook-${unique_suffix}.md`;
        const filePath = `${GUESTBOOK_POST_PATH}/${filename}`;
        
        let frontmatter = `date: "${postDateISO}"\ntags: [guestbook]\n`;
        if (name) frontmatter += `name: "${name}"\n`;
        if (website) frontmatter += `website: "${website}"\n`;

        const postContent = `---\n${frontmatter}---\n\n${finalContent}`;
        const encodedContent = Buffer.from(postContent).toString('base64');
        const postUrl = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/contents/${filePath}`;

        const postResponse = await fetch(postUrl, {
            method: 'PUT',
            headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Accept': 'application/vnd.github.v3+json' },
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

