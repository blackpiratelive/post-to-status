let selectedTags = [];
let currentView = 'markdown';
let currentEditingSha = null;
let currentEditingFilename = null;
let currentDateISO = null;

// Tag buttons
document.querySelectorAll('.tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const tag = btn.dataset.tag;
        btn.classList.toggle('active');
        
        if (selectedTags.includes(tag)) {
            selectedTags = selectedTags.filter(t => t !== tag);
        } else {
            selectedTags.push(tag);
        }
        
        if (currentView === 'plaintext') {
            updatePlainTextView();
        }
    });
});

// View toggle
document.querySelectorAll('.toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentView = btn.dataset.view;
        updateContentView();
    });
});

// Get current date in browser timezone
function getCurrentDateISO() {
    const now = new Date();
    const offset = -now.getTimezoneOffset();
    const offsetHours = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const offsetMins = String(Math.abs(offset) % 60).padStart(2, '0');
    const offsetSign = offset >= 0 ? '+' : '-';
    
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetMins}`;
}

// Generate filename
function generateFilename() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day}-${hours}-${minutes}-${seconds}.md`;
}

// Build frontmatter
function buildFrontmatter(isNew = true) {
    const lastmod = getCurrentDateISO();
    const date = isNew ? lastmod : (currentDateISO || lastmod);
    
    let frontmatter = '---
';
    frontmatter += `date: ${date}
`;
    frontmatter += `lastmod: ${lastmod}
`;
    
    if (selectedTags.length > 0) {
        frontmatter += `tags: [${selectedTags.join(', ')}]
`;
    }
    
    frontmatter += '---

';
    return frontmatter;
}

// Update content view
function updateContentView() {
    const textarea = document.getElementById('content');
    const currentContent = textarea.value;
    
    if (currentView === 'plaintext') {
        updatePlainTextView();
    } else {
        const parts = currentContent.split('---
');
        if (parts.length >= 3 && currentContent.startsWith('---
')) {
            textarea.value = parts.slice(2).join('---
').trim();
        }
    }
}

// Update plain text view
function updatePlainTextView() {
    const textarea = document.getElementById('content');
    let content = textarea.value;
    
    const parts = content.split('---
');
    if (parts.length >= 3 && content.startsWith('---
')) {
        content = parts.slice(2).join('---
').trim();
    }
    
    const frontmatter = buildFrontmatter(!currentEditingFilename);
    textarea.value = frontmatter + content;
}

// Parse frontmatter
function parseFrontmatter(content) {
    const parts = content.split('---
');
    if (parts.length >= 3 && content.startsWith('---
')) {
        const frontmatterText = parts[1];
        const bodyContent = parts.slice(2).join('---
').trim();
        
        const dateMatch = frontmatterText.match(/date:s*(.+)/);
        const tagsMatch = frontmatterText.match(/tags:s*[(.+)]/);
        
        if (dateMatch) {
            currentDateISO = dateMatch[1].trim();
        }
        
        if (tagsMatch) {
            const tags = tagsMatch[1].split(',').map(t => t.trim());
            selectedTags = tags;
            updateTagButtons();
        }
        
        return bodyContent;
    }
    return content;
}

// Update tag buttons
function updateTagButtons() {
    document.querySelectorAll('.tag-btn').forEach(btn => {
        if (selectedTags.includes(btn.dataset.tag)) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

// Show status
function showStatus(message, type = 'success') {
    const statusDiv = document.getElementById('statusMessage');
    statusDiv.className = `status-message ${type}`;
    statusDiv.textContent = message;
    setTimeout(() => {
        statusDiv.textContent = '';
        statusDiv.className = '';
    }, 5000);
}

// Image upload
document.getElementById('uploadImageBtn').addEventListener('click', async () => {
    const password = document.getElementById('password').value;
    const imageFile = document.getElementById('imageFile').files[0];
    const imagePath = document.getElementById('imagePath').value;

    if (!password) {
        showStatus('enter password', 'error');
        return;
    }

    if (!imageFile) {
        showStatus('select an image', 'error');
        return;
    }

    if (!imagePath) {
        showStatus('specify image path', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        const base64Data = e.target.result.split(',')[1];
        
        try {
            const response = await fetch('/api/upload-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    password,
                    imageData: base64Data,
                    imageName: imageFile.name,
                    imagePath
                })
            });

            const data = await response.json();
            
            if (response.ok) {
                showStatus(`uploaded: ${data.filename}`, 'success');
                
                const previewDiv = document.getElementById('imagePreview');
                previewDiv.innerHTML = `
                    <img src="${e.target.result}" alt="preview">
                    <p>{{< img src="${data.filename}" >}}</p>
                `;
            } else {
                showStatus(data.error || 'upload failed', 'error');
            }
        } catch (error) {
            showStatus('upload error: ' + error.message, 'error');
        }
    };
    
    reader.readAsDataURL(imageFile);
});

// Create/Update post
document.getElementById('createPostBtn').addEventListener('click', async () => {
    const password = document.getElementById('password').value;
    let content = document.getElementById('content').value.trim();

    if (!password) {
        showStatus('enter password', 'error');
        return;
    }

    if (!content) {
        showStatus('enter content', 'error');
        return;
    }

    // Build full content with frontmatter
    if (currentView === 'markdown') {
        const frontmatter = buildFrontmatter(!currentEditingFilename);
        content = frontmatter + content;
    }

    const filename = currentEditingFilename || generateFilename();

    try {
        const response = await fetch('/api/create-post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                password,
                content,
                filename,
                sha: currentEditingSha
            })
        });

        const data = await response.json();
        
        if (response.ok) {
            showStatus(data.message || 'post saved', 'success');
            clearForm();
            loadPosts();
        } else {
            showStatus(data.error || 'save failed', 'error');
        }
    } catch (error) {
        showStatus('error: ' + error.message, 'error');
    }
});

// Clear form
document.getElementById('clearBtn').addEventListener('click', clearForm);

function clearForm() {
    document.getElementById('content').value = '';
    selectedTags = [];
    updateTagButtons();
    currentEditingSha = null;
    currentEditingFilename = null;
    currentDateISO = null;
    document.getElementById('imageFile').value = '';
    document.getElementById('imagePreview').innerHTML = '';
    
    document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-view="markdown"]').classList.add('active');
    currentView = 'markdown';
}

// Load posts
async function loadPosts() {
    try {
        const response = await fetch('/api/get-posts');
        const data = await response.json();
        
        if (response.ok && data.files) {
            const postsDiv = document.getElementById('postsList');
            postsDiv.innerHTML = '';
            
            data.files.forEach(file => {
                const postDiv = document.createElement('div');
                postDiv.className = 'post-item';
                postDiv.textContent = file.name;
                postDiv.addEventListener('click', () => loadPost(file.path));
                postsDiv.appendChild(postDiv);
            });
        }
    } catch (error) {
        showStatus('error loading posts: ' + error.message, 'error');
    }
}

// Load specific post
async function loadPost(path) {
    try {
        const response = await fetch(`/api/get-post-content?path=${encodeURIComponent(path)}`);
        const data = await response.json();
        
        if (response.ok) {
            currentEditingSha = data.sha;
            currentEditingFilename = path.split('/').pop();
            
            const bodyContent = parseFrontmatter(data.content);
            document.getElementById('content').value = bodyContent;
            
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('[data-view="markdown"]').classList.add('active');
            currentView = 'markdown';
            
            showStatus('post loaded', 'success');
            window.scrollTo(0, 0);
        }
    } catch (error) {
        showStatus('error loading post: ' + error.message, 'error');
    }
}

// Refresh posts
document.getElementById('refreshPostsBtn').addEventListener('click', loadPosts);

// Load posts on page load
loadPosts();