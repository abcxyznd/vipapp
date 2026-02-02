// api/keys/list.js - Lấy danh sách tất cả keys (cho Telegram Bot)
import { readData } from '../../utils/data-handler.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Allow GET for testing
  if (req.method === 'GET') {
    return res.status(200).json({ 
      message: 'List Keys API',
      method: 'POST',
      endpoint: '/api/keys/list',
      body: {
        telegramSecret: 'TELEGRAM_BOT_TOKEN'
      },
      note: 'This endpoint requires POST request with valid Telegram Bot token'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { telegramSecret } = req.body;
    
    // Xác thực Telegram Bot
    if (telegramSecret !== process.env.TELEGRAM_BOT_TOKEN) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid Telegram secret'
      });
    }

    // Get keys
    const keys = await readData('data/keys.json');
    
    if (!keys || keys.length === 0) {
      return res.status(200).json({ 
        keys: [],
        message: 'No keys found'
      });
    }

    // Tính toán thống kê
    const stats = {
      total: keys.length,
      active: keys.filter(k => k.active).length,
      inactive: keys.filter(k => !k.active).length,
      expired: keys.filter(k => k.expiresAt && new Date(k.expiresAt) < new Date()).length,
      totalUses: keys.reduce((sum, k) => sum + (k.currentUses || 0), 0)
    };

    return res.status(200).json({ 
      success: true,
      keys: keys,
      stats: stats
    });

  } catch (error) {
    console.error('List keys error:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}
