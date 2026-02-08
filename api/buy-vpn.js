import fetch from 'node-fetch'; // Dùng thư viện có sẵn trong package.json gốc
import { readData, writeData } from '../utils/data-handler.js';

// CẤU HÌNH
const API_BANK = process.env.API_BANK;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; 
// const SEPAY_API_TOKEN = process.env.SEPAY_API_TOKEN; 
const REPO_OWNER = "nddev15";
const REPO_NAME = "vipapp";
const DATA_PATH = "public/data/vpn_data.json";

export default async function handler(req, res) {
    // 1. Cấu hình CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { content, plan_days } = req.body; 
    // Hàm làm sạch chuỗi: Viết hoa + Xóa hết dấu cách/ký tự lạ
    const cleanStr = (str) => str ? str.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    const cleanContent = cleanStr(content);
    console.log(`👉 Check mã: "${content}" (Clean: ${cleanContent})`);
    if (!content) return res.status(400).json({ status: 'error', message: 'Thiếu mã giao dịch' });

    try {
        // --- 2. ĐỌC KHO HÀNG ---
        let vpnList = await readData('data/vpn_data.json');
        
        if (!vpnList || vpnList.length === 0) {
            return res.status(500).json({ status: 'error', message: 'Kho hàng trống' });
        }

        // --- 3. CHECK ĐÃ MUA (Chống trùng lặp) ---
        const existing = vpnList.find(k => cleanStr(k.owner_content) === cleanContent);
        if (existing) {
            return res.status(200).json({
                status: 'success', message: 'Đã mua rồi',
                data: { qr_image: existing.qr_image, conf_text: existing.conf, expire: existing.expire_at }
            });
        }

        // --- 4. CHECK THUEAPIBANK ---
        // Endpoint mẫu lấy từ apibankexample.txt
        const apibankUrl = API_BANK;
        const bankRes = await fetch(apibankUrl);
        if (!bankRes.ok) return res.status(200).json({ status: 'pending', message: 'Lỗi kết nối API Bank' });
        const bankData = await bankRes.json();
        const transactions = bankData.transactions || [];
        // Tìm giao dịch khớp mã (Bỏ qua dấu cách)
        const matching = transactions.find(t => {
            const transContent = (t.description || t.noidung || t.content || '').toUpperCase();
            return transContent.includes(content.toUpperCase());
        });
        if (!matching) {
            return res.status(200).json({ status: 'pending', message: 'Chưa nhận được tiền' });
        }
        console.log(`💰 Đã nhận tiền: ${matching.amount || matching.sotien || matching.money}`);

        // --- 5. XUẤT KHO & GHI LẠI GITHUB (Dùng fetch) ---
        const keyIndex = vpnList.findIndex(k => k.status === 'available');
        if (keyIndex === -1) return res.status(500).json({ status: 'error', message: 'Hết hàng tạm thời' });

        const soldKey = vpnList[keyIndex];
        const now = new Date();
        const expireDate = new Date();
        expireDate.setDate(now.getDate() + (parseInt(plan_days) || 30));

        vpnList[keyIndex] = {
            ...soldKey,
            status: 'sold',
            owner_content: content.toUpperCase(),
            sold_at: now.toISOString(),
            expire_at: expireDate.toISOString()
        };

        // Update file
        await writeData('data/vpn_data.json', vpnList);

        return res.status(200).json({
            status: 'success',
            data: {
                qr_image: soldKey.qr_image,
                conf_text: soldKey.conf,
                expire: expireDate.toISOString()
            }
        });

    } catch (error) {
        console.error("Fatal Error:", error);
        return res.status(500).json({ status: 'error', message: error.message });
    }
}
