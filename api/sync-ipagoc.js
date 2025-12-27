// api/sync-ipa.js - BẢO MẬT URL + AUTO TAG V2

export default async function handler(req, res) {
  // CRITICAL: CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('🔄 Sync API called:', new Date().toISOString());

  try {
    const { syncHours, botSync } = req.body || {};

    // 🔐 AUTH CHECK
    const cookie = req.headers.cookie || '';
    const hasAuthCookie = 
      cookie.includes('admin_token') || 
      cookie.includes('auth') ||
      botSync === true;
    
    if (!hasAuthCookie) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        code: 'NO_AUTH_COOKIE'
      });
    }

    console.log('✅ Auth passed');

    // 🔒 CONFIGURATION: Sử dụng Environment Variables
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER || 'abcxyznd';
    const GITHUB_REPO = process.env.GITHUB_REPO || 'vipapp';
    const APPTESTER_URL = process.env.APPTESTER_URL;
    const FILE_PATH = 'public/data/ipa.json';

    // Kiểm tra biến môi trường bắt buộc
    if (!GITHUB_TOKEN) {
      return res.status(500).json({ error: 'Server Error: GITHUB_TOKEN not configured' });
    }
    if (!APPTESTER_URL) {
      return res.status(500).json({ error: 'Server Error: APPTESTER_URL not configured' });
    }

    // 1. Fetch từ AppTesters (URL lấy từ Env)
    console.log('📦 Fetching from Source...');
    const response = await fetch(APPTESTER_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Source API returned ${response.status}`);
    }
    
    const jsonData = await response.json();
    const allAppTestersData = jsonData.apps || [];
    console.log(`✅ Found ${allAppTestersData.length} apps`);

    // 2. Filter by time range
    let filteredApps = allAppTestersData;
    let filterText = '';
    
    if (syncHours > 0) {
      const cutoffTime = new Date(Date.now() - syncHours * 60 * 60 * 1000);
      filteredApps = allAppTestersData.filter(app => {
        if (!app.versionDate) return false;
        try {
          const appDate = new Date(app.versionDate);
          return appDate >= cutoffTime;
        } catch {
          return false;
        }
      });
      filterText = `${syncHours}h`;
      console.log(`📅 Apps in last ${syncHours}h: ${filteredApps.length}`);
    } else {
      const today = new Date().toISOString().split('T')[0];
      filteredApps = allAppTestersData.filter(app => {
        return app.versionDate && app.versionDate.startsWith(today);
      });
      filterText = 'Today';
      console.log(`📅 Apps today: ${filteredApps.length}`);
    }

    // 3. Get current data from GitHub
    console.log('📄 Fetching from GitHub...');
    const getFileUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`;
    
    let currentData = [];
    let sha = null;

    try {
      const getResponse = await fetch(getFileUrl, {
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'KhoAppVIP'
        }
      });

      if (getResponse.ok) {
        const fileData = await getResponse.json();
        sha = fileData.sha;
        const content = Buffer.from(fileData.content, 'base64').toString('utf-8');
        currentData = JSON.parse(content);
        console.log(`✅ Current: ${currentData.length} apps`);
      }
    } catch (githubError) {
      console.error('❌ GitHub error:', githubError.message);
      return res.status(500).json({ 
        error: 'Failed to fetch from GitHub', 
        details: githubError.message 
      });
    }

    // 4. Phân loại apps hiện tại
    const manualApps = currentData.filter(app => app.source === 'manual');
    const existingAutoApps = currentData.filter(app => app.source === 'apptesters');
    const otherApps = currentData.filter(app => !app.source || 
      (app.source !== 'manual' && app.source !== 'apptesters'));
    
    console.log(`✋ Manual: ${manualApps.length} | 🤖 Auto: ${existingAutoApps.length}`);

    // 5. 🎯 LOGIC MỚI: GIỮ TẤT CẢ PHIÊN BẢN
    const newApps = [];
    const skippedApps = [];
    const keptOldVersions = [];

    filteredApps.forEach(app => {
      try {
        const convertedApp = {
          id: `ipa-${app.bundleID || app.name.replace(/\s+/g, '-').toLowerCase()}-${app.version}`,
          type: 'ipa',
          name: app.name,
          icon: app.iconURL || app.icon,
          desc: app.localizedDescription || 'Injected with Premium',
          tags: smartDetectTags(app), // V2 Logic
          badge: smartDetectBadge(app),
          fileLink: app.downloadURL || app.down,
          version: app.version,
          developer: app.developerName || 'khomodvip',
          date: app.versionDate,
          source: 'apptesters',
          bundleID: app.bundleID,
          lastSync: new Date().toISOString()
        };

        // 🔍 Kiểm tra trùng HOÀN TOÀN (tên + bundleID + version)
        const exactDuplicate = existingAutoApps.find(e => 
          e.name === convertedApp.name && 
          e.bundleID === convertedApp.bundleID &&
          e.version === convertedApp.version
        );

        if (exactDuplicate) {
          // ⏭️ BỎ QUA - Trùng hoàn toàn
          skippedApps.push(convertedApp);
          console.log(`⏭️ Skip (exact): ${app.name} v${app.version}`);
        } else {
          // ✨ THÊM MỚI - Chưa có hoặc phiên bản khác
          newApps.push(convertedApp);
          
          // Kiểm tra xem có phiên bản cũ của app này không
          const oldVersions = existingAutoApps.filter(e => 
            e.name === convertedApp.name && 
            e.bundleID === convertedApp.bundleID &&
            e.version !== convertedApp.version
          );
          
          if (oldVersions.length > 0) {
            console.log(`📦 New version: ${app.name} v${app.version} (keeping ${oldVersions.length} old version(s))`);
            keptOldVersions.push(...oldVersions);
          } else {
            console.log(`✨ Brand new: ${app.name} v${app.version}`);
          }
        }
      } catch (err) {
        console.error('⚠️ Convert error:', app.name, err.message);
      }
    });

    // 6. 🔄 MERGE: GIỮ TẤT CẢ + THÊM MỚI
    const allAutoApps = [...existingAutoApps, ...newApps];
    
    // Loại bỏ trùng lặp nếu có (dựa trên key)
    const uniqueApps = [];
    const seenKeys = new Set();
    
    allAutoApps.forEach(app => {
      const key = `${app.name}|${app.bundleID}|${app.version}`;
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueApps.push(app);
      }
    });
    
    // Sắp xếp: Mới nhất lên đầu
    uniqueApps.sort((a, b) => {
      const dateA = new Date(a.date || a.lastSync || 0);
      const dateB = new Date(b.date || b.lastSync || 0);
      return dateB - dateA;
    });

    manualApps.sort((a, b) => {
      const dateA = new Date(a.date || 0);
      const dateB = new Date(b.date || 0);
      return dateB - dateA;
    });

    const mergedData = [...uniqueApps, ...manualApps, ...otherApps];

    // 7. Upload to GitHub
    if (newApps.length > 0) {
      console.log('📤 Uploading...');
      
      const newContent = Buffer.from(JSON.stringify(mergedData, null, 2)).toString('base64');
      
      const updatePayload = {
        message: `Sync: +${newApps.length} new (kept all versions) - Auto Tag V2`,
        content: newContent,
        branch: 'main'
      };

      if (sha) updatePayload.sha = sha;

      const updateResponse = await fetch(getFileUrl, {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
          'User-Agent': 'KhoAppVIP'
        },
        body: JSON.stringify(updatePayload)
      });

      if (!updateResponse.ok) {
        throw new Error('Upload failed');
      }

      console.log('✅ Success!');
      
      return res.status(200).json({ 
        success: true,
        message: `Sync thành công: +${newApps.length} mới/phiên bản mới`,
        filterRange: filterText,
        stats: {
          new: newApps.length,
          kept: keptOldVersions.length,
          skipped: skippedApps.length,
          total: mergedData.length
        }
      });
    } else {
      return res.status(200).json({ 
        success: true,
        message: 'Không có app/phiên bản mới',
        filterRange: filterText,
        stats: {
          new: 0,
          kept: keptOldVersions.length,
          skipped: skippedApps.length,
          total: mergedData.length
        }
      });
    }

  } catch (error) {
    console.error('💥 ERROR:', error);
    return res.status(500).json({ 
      error: 'Internal server error', 
      details: error.message
    });
  }
}

// ==================== HELPER FUNCTIONS (NÂNG CẤP V2 - LOGIC TÊN APP) ====================

function smartDetectTags(app) {
  const name = (app.name || '').toLowerCase();
  const bundleID = (app.bundleID || '').toLowerCase();
  const desc = (app.localizedDescription || '').toLowerCase();
  
  // --- LỚP 1: KIỂM TRA TÊN APP (CHÍNH XÁC NHẤT) ---
  // Định nghĩa các từ khóa đặc trưng trong tên App để gán cứng thẻ Tag
  
  // 1. GAME
  const gameNames = [
    'minecraft', 'roblox', 'lien quan', 'liên quân', 'pubg', 'free fire', 'toc chien', 'tốc chiến', 
    'clash of clans', 'clash royale', 'genshin', 'honkai', 'play together', 'among us', 'zombie', 
    'plants vs', 'gta', 'grand theft auto', 'call of duty', 'codm', 'fifa', 'pes', 'dream league', 
    'asphalt', 'racing', 'mu online', 'audition', 'gunny', 'võ lâm', 'kiếm thế', 'brawl stars',
    'candy crush', 'subway surfers', 'temple run', 'talking tom', '8 ball', 'shadow fight', 
    'stickman', 'dragon ball', 'naruto', 'one piece', 'pokemon', 'hill climb', 'block blast',
    'parking', 'survival', 'arena', 'moba', 'rpg', 'shoot', 'sniper', 'war', 'battle', 'fight'
  ];
  if (gameNames.some(k => name.includes(k))) return ['game'];

  // 2. SOCIAL
  const socialNames = [
    'facebook', 'messenger', 'instagram', 'threads', 'twitter', 'tweet', 'x', 'tiktok', 'douyin',
    'zalo', 'telegram', 'whatsapp', 'viber', 'skype', 'discord', 'wechat', 'qq', 'snapchat', 
    'tinder', 'bumble', 'dating', 'hẹn hò', 'pinterest', 'reddit', 'tumblr', 'linkedin'
  ];
  if (socialNames.some(k => name.includes(k))) return ['Social'];

  // 3. PHOTO & VIDEO
  const photoNames = [
    'youtube', 'capcut', 'picsart', 'lightroom', 'photoshop', 'camera', 'b612', 'soda', 'ulike', 
    'snow', 'foodie', 'vsco', 'snapseed', 'facetune', 'faceapp', 'remini', 'canva', 'instagram layout',
    'kuji', 'dazz', 'nomo', 'wink', 'meitu', 'xingtu', 'epik', 'video', 'editor', 'photo', 'film', 
    'cinema', 'netflix', 'hbo', 'disney', 'vtv', 'fpt play', 'vieon', 'galaxy play', 'tv360'
  ];
  if (photoNames.some(k => name.includes(k))) return ['Photo/Video'];

  // 4. MUSIC
  const musicNames = [
    'spotify', 'zing mp3', 'naccuatui', 'nhaccuatui', 'soundcloud', 'apple music', 'shazam', 
    'deezer', 'tidal', 'amazon music', 'youtube music', 'piano', 'guitar', 'drum', 'dj', 'mixer', 'mp3'
  ];
  if (musicNames.some(k => name.includes(k))) return ['music'];

  // 5. PRODUCTIVITY
  const productivityNames = [
    'word', 'excel', 'powerpoint', 'office', 'docs', 'sheet', 'slide', 'pdf', 'scanner', 
    'zoom', 'teams', 'meet', 'classroom', 'duolingo', 'elsa', 'quizlet', 'dictionary', 
    'từ điển', 'dịch', 'translate', 'calculator', 'calendar', 'note', 'ghi chú', 'notion', 'goodnotes'
  ];
  if (productivityNames.some(k => name.includes(k))) return ['Productivity'];

  // 6. UTILITY
  const utilityNames = [
    'vpn', '1.1.1.1', 'adblock', 'wifi', 'speedtest', 'file', 'zip', 'rar', 'browser', 'chrome', 
    'firefox', 'coccoc', 'edge', 'safari', 'google', 'map', 'grab', 'be', 'gojek', 'shopee', 
    'lazada', 'tiki', 'banking', 'momo', 'zalopay', 'viettel', 'vina', 'mobi', '4g', 'esim'
  ];
  if (utilityNames.some(k => name.includes(k))) return ['Utility'];


  // --- LỚP 2: KIỂM TRA BUNDLE ID ---
  if (bundleID.includes('.game') || bundleID.includes('supercell') || bundleID.includes('garena') || bundleID.includes('riot')) {
    return ['Game'];
  }
  if (bundleID.includes('camera') || bundleID.includes('photo') || bundleID.includes('video')) {
    return ['Photo/Video'];
  }


  // --- LỚP 3: QUÉT MÔ TẢ (FALLBACK) ---
  const combinedText = `${name} ${desc}`;

  if (combinedText.includes('role-playing') || combinedText.includes('arcade') || 
      combinedText.includes('simulation') || combinedText.includes('strategy game')) {
    return ['Game'];
  }

  if (combinedText.includes('editing tool') || combinedText.includes('video editor') || 
      combinedText.includes('photo editor')) {
    return ['Photo/Video'];
  }

  return ['Utility'];
}

function smartDetectBadge(app) {
  const name = (app.name || '').toLowerCase();
  const desc = (app.localizedDescription || '').toLowerCase();
  const versionDate = app.versionDate;
  
  let isRecent = false;
  if (versionDate) {
    try {
      const appDate = new Date(versionDate);
      const now = new Date();
      const diffDays = Math.ceil((now - appDate) / (1000 * 60 * 60 * 24));
      isRecent = diffDays <= 7;
    } catch (e) {
      isRecent = false;
    }
  }
  
  if (isRecent) return 'new';
  
  const trendingKeywords = [
    'spotify', 'youtube', 'tiktok', 'instagram', 'facebook',
    'whatsapp', 'telegram', 'netflix', 'minecraft', 'roblox', 'gta'
  ];
  
  if (trendingKeywords.some(keyword => name.includes(keyword))) {
    return Math.random() > 0.5 ? 'trending' : 'top';
  }
  
  const premiumKeywords = ['premium', 'pro', 'plus', 'gold', 'vip', 'unlocked', 'mod'];
  if (premiumKeywords.some(keyword => desc.includes(keyword) || name.includes(keyword))) {
    return 'vip';
  }
  
  return null;
}
