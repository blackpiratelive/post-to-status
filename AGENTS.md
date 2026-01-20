# Repository Guidelines

## Project Structure & Module Organization
- `api/` contains serverless Node handlers (for example `create-post.js`, `upload-image.js`) that read/write content via the GitHub API.
- `public/` hosts static HTML pages and assets; Tailwind output is written to `public/styles/tailwind.css`.
- `public/styles/input.css` is the Tailwind entry file; a duplicate entry also exists at `styles/input.css`.
- Root configs live in `tailwind.config.js`, `postcss.config.js`, and `package.json`.

## Build, Test, and Development Commands
- `npm install` installs the Tailwind CLI dependency.
- `npm run build` compiles Tailwind from `public/styles/input.css` to `public/styles/tailwind.css`.
- For local preview, open `public/index.html` (or other `public/*.html`) in a browser after building CSS.

## Coding Style & Naming Conventions
- Follow the surrounding file style; API files use 4-space indentation and semicolons.
- Config files use 2-space indentation.
- Prefer single quotes in JS unless the existing block uses double quotes.
- Use `kebab-case` filenames for API endpoints and HTML pages.

## Testing Guidelines
- No automated test framework is configured.
- Do manual checks for UI and API flows (create post, update, upload image, guestbook) before shipping.

## Commit & Pull Request Guidelines
- Commit history favors short, lowercase subjects (e.g., "new page", "revert"). Keep subjects brief and imperative.
- PRs should include a short description, testing notes, and screenshots for UI changes in `public/`.

## Configuration & Secrets
- API handlers expect environment variables: `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_REPO_BRANCH`, `GITHUB_REPO_PATH`, `POST_PASSWORD`, and optional `GUESTBOOK_POST_PATH`.
- Store secrets in the deployment environment (for example Vercel), not in the repo.
