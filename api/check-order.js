// api/check-order.js
import { readData, writeData } from '../utils/data-handler.js';

export default async function handler(req, res) {
    // 1. Chỉ chấp nhận POST
    if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

    const { content, test_mode } = req.body; 
    
    if (!content || content.length < 4) {
        return res.status(400).json({ status: 'error', message: 'Mã giao dịch không hợp lệ' });
    }

    // const SEPAY_API_TOKEN = process.env.SEPAY_API_TOKEN;
    const API_BANK = process.env.API_BANK;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_OWNER = process.env.GITHUB_OWNER || 'abcxyznd'; 
    const GITHUB_REPO = process.env.GITHUB_REPO || 'vipapp';
    const FILE_PATH = 'public/data/keys.json';

    // 🧪 TEST MODE: Bỏ qua check bank khi test
    const isTestMode = test_mode === true;

    try {
        // --- BƯỚC 1: KIỂM TRA GIAO DỊCH VỚI THUEAPIBANK ---
        let matchingTrans = null;
        let amount = 0;

        if (!isTestMode) {
            // Production mode: Check bank API
            const apibankUrl = API_BANK;
            const bankRes = await fetch(apibankUrl);
            if (!bankRes.ok) throw new Error(`API Bank Error: ${bankRes.statusText}`);
            const bankData = await bankRes.json();
            if (!bankData.transactions || bankData.transactions.length === 0) {
                return res.status(200).json({ status: 'pending', message: 'Chưa có giao dịch nào' });
            }
            // Tìm giao dịch chứa mã code (content)
            matchingTrans = bankData.transactions.find(t => {
                const transContent = (t.description || t.noidung || t.content || '').toUpperCase();
                return transContent.includes(content.toUpperCase());
            });
            if (!matchingTrans) {
                return res.status(200).json({ status: 'pending', message: 'Chưa tìm thấy tiền' });
            }
            amount = parseFloat(matchingTrans.amount || matchingTrans.sotien || matchingTrans.money || 0);
        } else {
            // Test mode: Giả lập giao dịch với số tiền mặc định
            console.log('🧪 TEST MODE: Skipping bank check');
            amount = 39000; // Mặc định gói 1 tháng cho test
            matchingTrans = { id: `test_${Date.now()}` };
        }

        // --- BƯỚC 2: CẤU HÌNH GÓI CƯỚC (Logic chuẩn /create [days] [uses]) ---
        let days = 0;   // 0 = Không giới hạn thời gian
        let uses = 0;   // 0 = Không giới hạn lượt dùng
        let packageName = '';
        if (amount >= 199000) { 
            packageName = 'VIP 1 Năm'; days = 366; uses = 0;
        } else if (amount >= 149000) { 
            packageName = 'VIP 6 Tháng'; days = 181; uses = 0;
        } else if (amount >= 39000) { 
            packageName = 'VIP 1 Tháng'; days = 31; uses = 0;
        } else if (amount >= 19000) { 
            packageName = 'VIP 1 Tuần'; days = 8; uses = 0;
        } else if (amount >= 5000) { 
            packageName = 'Gói Lẻ'; days = 0; uses = 20; // Không giới hạn ngày, 10 lượt
        } else if (amount >= 4999000) { 
            packageName = 'Vĩnh Viễn'; days = 0; uses = 0;
        } else {
            return res.status(200).json({ status: 'error', message: 'Số tiền không khớp gói nào' });
        }

        // --- BƯỚC 3: LẤY FILE KEYS ---
        let keysDB = await readData('data/keys.json');

        // Kiểm tra trùng lặp (CHỈ khi KHÔNG test mode)
        if (!isTestMode) {
            const existingKey = keysDB.find(k => k.transaction_code === content || k.transaction_id === matchingTrans.id);
            if (existingKey) {
                return res.status(200).json({ status: 'success', key: existingKey.key, package: existingKey.package });
            }
        } else {
            console.log('🧪 TEST MODE: Skipping duplicate check, will create new key');
        }

        // --- BƯỚC 4: TẠO KEY MỚI (ĐÚNG FORMAT CỦA verify.js) ---
        function generateKey() {
            const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
            const part = () => Array.from({length:4}, () => chars[Math.floor(Math.random() * chars.length)]).join('');
            return `${part()}-${part()}-${part()}-${part()}`; // XXXX-XXXX-XXXX-XXXX
        }
        
        const newKeyStr = generateKey();
        const now = new Date();

        // Tính ngày hết hạn (expiresAt)
        let expiresAt = null;
        if (days > 0) {
            const expiryDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
            expiresAt = expiryDate.toISOString();
        }

        // Cấu trúc Key chuẩn (CamelCase khớp với file keys.json của bạn)
        const newKeyEntry = {
            id: `key_${Math.floor(Date.now() / 1000)}_${Math.floor(Math.random() * 10000)}`,
            key: newKeyStr,
            createdAt: now.toISOString(),
            expiresAt: expiresAt, // null nếu không giới hạn
            maxUses: uses > 0 ? uses : null, // null nếu không giới hạn
            currentUses: 0,
            active: true,
            createdBy: 'auto_payment',
            transaction_code: content, // Lưu lại để đối chiếu
            transaction_id: matchingTrans.id,
            package: packageName,
            notes: `${days > 0 ? days + ' days' : '∞ days'}, ${uses > 0 ? uses + ' uses' : '∞ uses'}`
        };

        // Thêm key mới vào đầu danh sách
        keysDB.unshift(newKeyEntry);

        // --- BƯỚC 5: LƯU LẠI ---
        await writeData('data/keys.json', keysDB);

        // --- BƯỚC 6: TRẢ KẾT QUẢ ---
        return res.status(200).json({ 
            status: 'success', 
            key: newKeyStr, 
            package: packageName 
        });

    } catch (error) {
        console.error("System Error:", error);
        return res.status(500).json({ error: 'Lỗi hệ thống: ' + error.message });
    }
}