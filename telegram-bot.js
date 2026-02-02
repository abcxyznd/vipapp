// telegram-bot.js - Telegram Bot integrated with Express server
import TelegramBot from 'node-telegram-bot-api';
import fetch from 'node-fetch';

export function initTelegramBot() {
  const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
  const ADMIN_IDS = process.env.TELEGRAM_ADMIN_IDS?.split(',').map(id => parseInt(id.trim())) || [];
  const API_URL = process.env.API_URL || 'https://cheatlibrary.xyz';

  if (!BOT_TOKEN) {
    console.log('⚠️  TELEGRAM_BOT_TOKEN not found, bot disabled');
    return null;
  }

  const bot = new TelegramBot(BOT_TOKEN, { polling: true });

  // Check if user is admin
  function isAdmin(userId) {
    return ADMIN_IDS.includes(userId);
  }

  // Main menu with inline keyboard
  function getMainMenu(userId) {
    const buttons = [
      [{ text: '🔍 Tra Cứu Đơn Hàng', callback_data: 'lookup_order' }]
    ];
    
    // Add admin button only for admins
    if (isAdmin(userId)) {
      buttons[0].push({ text: '👨‍💼 Lệnh Admin', callback_data: 'admin_menu' });
    }
    
    return {
      reply_markup: {
        inline_keyboard: buttons
      }
    };
  }

  // Admin menu
  function getAdminMenu() {
    return {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '📝 Tạo Key Mới', callback_data: 'create_key' },
            { text: '📋 Danh Sách Keys', callback_data: 'list_keys' }
          ],
          [
            { text: '🗑️ Xóa Key', callback_data: 'delete_key' },
            { text: '📊 Thống Kê', callback_data: 'stats' }
          ],
          [
            { text: '❓ Hướng Dẫn', callback_data: 'help' }
          ],
          [
            { text: '🔙 Quay Lại', callback_data: 'back_main' }
          ]
        ]
      }
    };
  }

  // Support buttons for lookup
  function getSupportButtons(userId) {
    return {
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔙 Quay Lại', callback_data: 'back_main' },
            { text: '❓ Cần Hỗ Trợ?', url: 'https://t.me/nguyenduc666' }
          ]
        ]
      }
    };
  }

  // Start command
  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    const welcomeMsg = isAdmin(userId)
      ? '👋 Xin chào Admin!\n\n🔑 Bot quản lý Key Download VIP\n\nChọn chức năng bên dưới:'
      : '👋 Chào mừng!\n\n🔍 Bạn có thể tra cứu đơn hàng đã thanh toán bằng nút bên dưới.';

    bot.sendMessage(chatId, welcomeMsg, {
      ...getMainMenu(userId),
      reply_markup: {
        ...getMainMenu(userId).reply_markup,
        remove_keyboard: true
      }
    });
  });

  // Lookup order command - searches both VIP keys and VPN data
  bot.onText(/\/tracuu (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const transactionCode = match[1].trim().toUpperCase();

    bot.sendMessage(chatId, '⏳ Đang tra cứu...');

    try {
      // Search in keys.json (VIP keys)
      const keysResponse = await fetch(`${API_URL}/api/keys/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramSecret: BOT_TOKEN })
      });

      const keysData = await keysResponse.json();
      
      if (keysData.success) {
        const foundKey = keysData.keys.find(k => k.transaction_code === transactionCode);

        if (foundKey) {
          const status = foundKey.active ? '✅ Đang hoạt động' : '❌ Đã hết hạn';
          const expires = foundKey.expiresAt 
            ? new Date(foundKey.expiresAt).toLocaleDateString('vi-VN', { 
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
            : '∞ Vĩnh viễn';
          const uses = foundKey.maxUses 
            ? `${foundKey.currentUses}/${foundKey.maxUses} lượt`
            : '∞ Không giới hạn';
          const packageName = foundKey.package || 'Không xác định';
          
          const message = 
            `🎫 **Thông Tin Đơn Hàng VIP Key**\n\n` +
            `📦 Gói: **${packageName}**\n` +
            `🔑 Key: \`${foundKey.key}\`\n` +
            `${status}\n\n` +
            `⏰ Hạn sử dụng: ${expires}\n` +
            `👥 Đã dùng: ${uses}\n` +
            `📅 Ngày mua: ${new Date(foundKey.createdAt).toLocaleDateString('vi-VN', { 
              year: 'numeric', month: 'long', day: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}\n\n` +
            `💡 *Lưu ý: Copy key bằng cách chạm vào mã key*`;

          bot.sendMessage(chatId, message, { 
            parse_mode: 'Markdown',
            ...getSupportButtons(userId)
          });
          return;
        }
      }

      // Search in vpn_data.json
      const vpnResponse = await fetch(`${API_URL}/data/vpn_data.json`);
      const vpnData = await vpnResponse.json();
      
      if (Array.isArray(vpnData)) {
        const foundVPN = vpnData.find(v => v.owner_content === transactionCode);

        if (foundVPN) {
          const status = foundVPN.status === 'sold' ? '✅ Đã kích hoạt' : '⏳ Chưa kích hoạt';
          const soldDate = foundVPN.sold_at 
            ? new Date(foundVPN.sold_at).toLocaleDateString('vi-VN', { 
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
            : 'N/A';
          const expireDate = foundVPN.expire_at 
            ? new Date(foundVPN.expire_at).toLocaleDateString('vi-VN', { 
                year: 'numeric', month: 'long', day: 'numeric',
                hour: '2-digit', minute: '2-digit'
              })
            : 'N/A';
          
          const message = 
            `🌐 **Thông Tin Đơn Hàng VPN**\n\n` +
            `${status}\n\n` +
            `🆔 IP: \`${foundVPN.ip}\`\n` +
            `📱 IPv6: \`${foundVPN.ipv6}\`\n` +
            `📅 Ngày mua: ${soldDate}\n` +
            `⏰ Ngày hết hạn: ${expireDate}\n\n` +
            `🔗 Cấu hình:\n\`${foundVPN.conf}\`\n\n` +
            `💡 *Lưu ý: Copy cấu hình bằng cách chạm vào đoạn mã*`;

          bot.sendMessage(chatId, message, { 
            parse_mode: 'Markdown',
            ...getSupportButtons(userId)
          });
          return;
        }
      }

      // Not found in both databases
      bot.sendMessage(
        chatId,
        '❌ **Không tìm thấy đơn hàng!**\n\n' +
        '📝 Vui lòng kiểm tra lại mã giao dịch.\n\n' +
        '💡 Mã giao dịch là **nội dung chuyển khoản** khi bạn thanh toán.\n\n' +
        '🔍 Hệ thống đã tìm kiếm trong:\n' +
        '• VIP Key (Ký tự tải IPA)\n' +
        '• VPN (Cấu hình WireGuard)',
        { 
          parse_mode: 'Markdown',
          ...getSupportButtons(userId)
        }
      );

    } catch (error) {
      console.error('Error looking up order:', error);
      bot.sendMessage(chatId, '❌ Không thể kết nối đến hệ thống!', getSupportButtons(userId));
    }
  });

  // Create key command
  bot.onText(/\/create(?: (\d+))?(?: (\d+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdmin(userId)) {
      bot.sendMessage(chatId, '❌ Bạn không có quyền sử dụng lệnh này!');
      return;
    }

    const days = match[1] ? parseInt(match[1]) : null;
    const maxUses = match[2] ? parseInt(match[2]) : null;

    try {
      const response = await fetch(`${API_URL}/api/keys/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramSecret: BOT_TOKEN,
          duration: days,
          maxUses: maxUses,
          notes: `Created by ${msg.from.username || msg.from.first_name}`
        })
      });

      const data = await response.json();

      if (data.success) {
        const daysText = days ? `${days} ngày` : '∞';
        const usesText = maxUses ? `${maxUses} lượt` : '∞';
        
        bot.sendMessage(
          chatId,
          `✅ Tạo key thành công!\n\n` +
          `🔑 Key: \`${data.key}\`\n` +
          `⏰ Thời hạn: ${daysText}\n` +
          `👥 Giới hạn: ${usesText}\n` +
          `📅 Tạo lúc: ${new Date(data.createdAt).toLocaleString('vi-VN')}`,
          { parse_mode: 'Markdown', ...getAdminMenu() }
        );
      } else {
        bot.sendMessage(chatId, `❌ Lỗi: ${data.error}`, getAdminMenu());
      }
    } catch (error) {
      console.error('Error creating key:', error);
      bot.sendMessage(chatId, '❌ Không thể kết nối đến API!', getAdminMenu());
    }
  });

  // List keys command
  bot.onText(/\/list/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdmin(userId)) {
      bot.sendMessage(chatId, '❌ Bạn không có quyền sử dụng lệnh này!');
      return;
    }

    try {
      const response = await fetch(`${API_URL}/api/keys/list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ telegramSecret: BOT_TOKEN })
      });

      const data = await response.json();

      if (data.success) {
        if (data.keys.length === 0) {
          bot.sendMessage(chatId, '📋 Không có key nào!', getAdminMenu());
          return;
        }

        let message = `📋 Danh sách Keys (${data.keys.length}):\n\n`;
        
        data.keys.slice(0, 10).forEach((key, index) => {
          const status = key.active ? '✅' : '❌';
          const expires = key.expiresAt 
            ? new Date(key.expiresAt).toLocaleDateString('vi-VN')
            : '∞';
          const uses = key.maxUses ? `${key.currentUses}/${key.maxUses}` : '∞';
          
          message += `${index + 1}. ${status} \`${key.key}\`\n`;
          message += `   ⏰ ${expires} | 👥 ${uses}\n\n`;
        });

        if (data.keys.length > 10) {
          message += `\n... và ${data.keys.length - 10} key khác`;
        }

        bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...getAdminMenu() });
      } else {
        bot.sendMessage(chatId, `❌ Lỗi: ${data.error}`, getAdminMenu());
      }
    } catch (error) {
      console.error('Error listing keys:', error);
      bot.sendMessage(chatId, '❌ Không thể kết nối đến API!', getAdminMenu());
    }
  });

  // Delete key command
  bot.onText(/\/delete (.+)/, async (msg, match) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (!isAdmin(userId)) {
      bot.sendMessage(chatId, '❌ Bạn không có quyền sử dụng lệnh này!');
      return;
    }

    const keyToDelete = match[1].trim();

    try {
      const response = await fetch(`${API_URL}/api/keys/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramSecret: BOT_TOKEN,
          key: keyToDelete
        })
      });

      const data = await response.json();

      if (data.success) {
        bot.sendMessage(
          chatId,
          `✅ Đã xóa key: \`${keyToDelete}\``,
          { parse_mode: 'Markdown', ...getAdminMenu() }
        );
      } else {
        bot.sendMessage(chatId, `❌ Lỗi: ${data.error}`, getAdminMenu());
      }
    } catch (error) {
      console.error('Error deleting key:', error);
      bot.sendMessage(chatId, '❌ Không thể kết nối đến API!', getAdminMenu());
    }
  });

  // Handle callback queries (inline button clicks)
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const userId = query.from.id;
    const data = query.data;

    // Answer callback query first
    bot.answerCallbackQuery(query.id);

    // Main menu navigation
    if (data === 'back_main') {
      const welcomeMsg = isAdmin(userId)
        ? '👋 Xin chào Admin!\n\n🔑 Bot quản lý Key Download VIP\n\nChọn chức năng bên dưới:'
        : '👋 Chào mừng!\n\n🔍 Bạn có thể tra cứu đơn hàng đã thanh toán bằng nút bên dưới.';
      
      bot.editMessageText(welcomeMsg, {
        chat_id: chatId,
        message_id: query.message.message_id,
        ...getMainMenu(userId)
      });
      return;
    }

    // Lookup order
    if (data === 'lookup_order') {
      bot.sendMessage(
        chatId,
        '🔍 **Tra Cứu Đơn Hàng**\n\n' +
        'Để tra cứu đơn hàng đã mua, vui lòng gửi:\n' +
        '`/tracuu MÃ_GIAO_DỊCH`\n\n' +
        '📝 Ví dụ: `/tracuu D8BBNX`\n\n' +
        '🔍 Hệ thống sẽ tìm kiếm trong:\n' +
        '• **VIP Key** (Ký tự tải IPA)\n' +
        '• **VPN** (Cấu hình WireGuard)\n\n' +
        '💡 *Mã giao dịch là nội dung chuyển khoản khi bạn thanh toán.*',
        { parse_mode: 'Markdown', ...getSupportButtons(userId) }
      );
      return;
    }

    // Admin menu
    if (data === 'admin_menu') {
      if (!isAdmin(userId)) {
        bot.answerCallbackQuery(query.id, { text: '❌ Bạn không có quyền!', show_alert: true });
        return;
      }

      bot.editMessageText(
        '👨‍💼 **Menu Admin**\n\nChọn chức năng quản lý:',
        {
          chat_id: chatId,
          message_id: query.message.message_id,
          parse_mode: 'Markdown',
          ...getAdminMenu()
        }
      );
      return;
    }

    // Admin-only actions
    if (!isAdmin(userId)) {
      bot.answerCallbackQuery(query.id, { text: '❌ Bạn không có quyền!', show_alert: true });
      return;
    }

    if (data === 'create_key') {
      bot.sendMessage(
        chatId,
        '📝 **Tạo Key Mới**\n\n' +
        'Sử dụng lệnh: `/create [days] [uses]`\n\n' +
        'Ví dụ:\n' +
        '• `/create` - Key vĩnh viễn, không giới hạn\n' +
        '• `/create 7` - Key 7 ngày, không giới hạn lượt\n' +
        '• `/create 30 100` - Key 30 ngày, tối đa 100 lượt',
        { parse_mode: 'Markdown', ...getAdminMenu() }
      );
    } else if (data === 'list_keys') {
      bot.sendMessage(chatId, '⏳ Đang tải danh sách keys...');
      
      try {
        const response = await fetch(`${API_URL}/api/keys/list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegramSecret: BOT_TOKEN })
        });

        const result = await response.json();

        if (result.success) {
          if (result.keys.length === 0) {
            bot.sendMessage(chatId, '📋 Không có key nào!', getAdminMenu());
            return;
          }

          let message = `📋 Danh sách Keys (${result.keys.length}):\n\n`;
          
          result.keys.slice(0, 10).forEach((key, index) => {
            const status = key.active ? '✅' : '❌';
            const expires = key.expiresAt 
              ? new Date(key.expiresAt).toLocaleDateString('vi-VN')
              : '∞';
            const uses = key.maxUses ? `${key.currentUses}/${key.maxUses}` : '∞';
            
            message += `${index + 1}. ${status} \`${key.key}\`\n`;
            message += `   ⏰ ${expires} | 👥 ${uses}\n\n`;
          });

          if (result.keys.length > 10) {
            message += `\n... và ${result.keys.length - 10} key khác`;
          }

          bot.sendMessage(chatId, message, { parse_mode: 'Markdown', ...getAdminMenu() });
        } else {
          bot.sendMessage(chatId, `❌ Lỗi: ${result.error}`, getAdminMenu());
        }
      } catch (error) {
        console.error('Error listing keys:', error);
        bot.sendMessage(chatId, '❌ Không thể kết nối đến API!', getAdminMenu());
      }
    } else if (data === 'delete_key') {
      bot.sendMessage(
        chatId,
        '🗑️ **Xóa Key**\n\n' +
        'Sử dụng lệnh: `/delete <key>`\n\n' +
        'Ví dụ:\n' +
        '`/delete ABCD-1234-EFGH-5678`',
        { parse_mode: 'Markdown', ...getAdminMenu() }
      );
    } else if (data === 'stats') {
      try {
        const response = await fetch(`${API_URL}/api/keys/list`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ telegramSecret: BOT_TOKEN })
        });

        const result = await response.json();

        if (result.success) {
          const total = result.keys.length;
          const active = result.keys.filter(k => k.active).length;
          const expired = total - active;
          const totalUses = result.keys.reduce((sum, k) => sum + (k.currentUses || 0), 0);
          
          bot.sendMessage(
            chatId,
            '📊 **Thống Kê**\n\n' +
            `📦 Tổng số key: **${total}**\n` +
            `✅ Đang hoạt động: **${active}**\n` +
            `❌ Đã hết hạn: **${expired}**\n` +
            `👥 Tổng lượt dùng: **${totalUses}**`,
            { parse_mode: 'Markdown', ...getAdminMenu() }
          );
        } else {
          bot.sendMessage(chatId, '❌ Không thể lấy thống kê!', getAdminMenu());
        }
      } catch (error) {
        console.error('Error getting stats:', error);
        bot.sendMessage(chatId, '❌ Không thể kết nối đến API!', getAdminMenu());
      }
    } else if (data === 'help') {
      bot.sendMessage(
        chatId,
        '❓ **Hướng Dẫn Sử Dụng**\n\n' +
        '**Lệnh cơ bản:**\n' +
        '• `/start` - Khởi động bot\n' +
        '• `/tracuu <mã>` - Tra cứu đơn hàng (VIP Key/VPN)\n\n' +
        '**Lệnh Admin:**\n' +
        '• `/create [days] [uses]` - Tạo key mới\n' +
        '• `/list` - Xem danh sách keys\n' +
        '• `/delete <key>` - Xóa key\n\n' +
        '💡 *Mã giao dịch là nội dung chuyển khoản khi thanh toán.*',
        { parse_mode: 'Markdown', ...getAdminMenu() }
      );
    }
  });

  // Error handling
  bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error.code, error.message);
  });

  console.log('✅ Telegram Bot started!');
  return bot;
}
