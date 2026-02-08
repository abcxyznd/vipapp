z
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect if running on Vercel or Fly.io
const IS_VERCEL = process.env.VERCEL === '1';
const IS_FLYIO = process.env.FLY_APP_NAME !== undefined;

// Root directory
const ROOT_DIR = path.join(__dirname, '..');

/**
 * Get absolute path to data file
 * @param {string} relativePath - e.g., 'data/keys.json' or 'pages/data/cert.json'
 * @returns {string} Absolute path
 */
export function getDataPath(relativePath) {
  // On Fly.io, use /data volume mount
  if (IS_FLYIO) {
    // Convert 'data/keys.json' -> '/data/keys.json'
    // Convert 'pages/data/cert.json' -> '/data/cert.json'
    const fileName = relativePath.split('/').pop();
    return path.join('/data', fileName);
  }
  
  // On Vercel or local, use public folder
  return path.join(ROOT_DIR, 'public', relativePath);
}

/**
 * Read JSON data from file or GitHub
 * @param {string} relativePath - e.g., 'data/keys.json'
 * @returns {Promise<Array>} Parsed JSON data
 */
export async function readData(relativePath) {
  const filePath = getDataPath(relativePath);
  
  // On Fly.io with volume, read from local file
  if (IS_FLYIO) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`File ${filePath} not found, returning empty array`);
        return [];
      }
      throw error;
    }
  }
  
  // On Vercel, use GitHub API (original logic)
  return await readFromGitHub(relativePath);
}

/**
 * Write JSON data to file or GitHub
 * @param {string} relativePath - e.g., 'data/keys.json'
 * @param {Array|Object} data - Data to write
 */
export async function writeData(relativePath, data) {
  const filePath = getDataPath(relativePath);
  
  // On Fly.io with volume, write to local file
  if (IS_FLYIO) {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`✅ Wrote data to ${filePath}`);
    
    // Also push to GitHub for backup/sync
    try {
      await writeToGitHub(relativePath, data);
    } catch (error) {
      console.warn(`⚠️ Failed to sync to GitHub: ${error.message}`);
      // Don't throw - local file is already saved
    }
    return;
  }
  
  // On Vercel, use GitHub API (original logic)
  await writeToGitHub(relativePath, data);
}

/**
 * Read from GitHub (Vercel fallback)
 */
async function readFromGitHub(relativePath) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_OWNER = process.env.GITHUB_OWNER || 'nddev15';
  const GITHUB_REPO = process.env.GITHUB_REPO || 'vipapp';
  
  if (!GITHUB_TOKEN) {
    console.warn('No GITHUB_TOKEN, returning empty data');
    return [];
  }
  
  const filePath = `public/${relativePath}`;
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      }
    });
    
    if (!response.ok) {
      if (response.status === 404) return [];
      throw new Error(`GitHub API error: ${response.statusText}`);
    }
    
    const fileData = await response.json();
    const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Error reading from GitHub: ${error.message}`);
    return [];
  }
}

/**
 * Write to GitHub (Vercel fallback)
 */
async function writeToGitHub(relativePath, data) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  const GITHUB_OWNER = process.env.GITHUB_OWNER || 'nddev15';
  const GITHUB_REPO = process.env.GITHUB_REPO || 'vipapp';
  
  if (!GITHUB_TOKEN) {
    throw new Error('GITHUB_TOKEN is required for Vercel deployment');
  }
  
  const filePath = `public/${relativePath}`;
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
  
  // Get current SHA
  let sha = null;
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
      }
    });
    if (response.ok) {
      const fileData = await response.json();
      sha = fileData.sha;
    }
  } catch (error) {
    // File doesn't exist, sha will be null
  }
  
  // Write file
  const content = Buffer.from(JSON.stringify(data, null, 2)).toString('base64');
  const payload = {
    message: `Update ${filePath}`,
    content,
    ...(sha && { sha })
  };
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  });
  
  if (!response.ok) {
    throw new Error(`Failed to write to GitHub: ${response.statusText}`);
  }
  
  console.log(`✅ Wrote data to GitHub: ${filePath}`);
}
