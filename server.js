const express = require('express');
const fetch = require('node-fetch'); 
const path = require('path'); 
const { createClient } = require('@supabase/supabase-js'); // เรียกใช้ Supabase

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(__dirname)); 

// ==========================================
// 1. ใส่รหัส Supabase ของคุณตรงนี้
// ==========================================
const SUPABASE_URL = 'https://edvwrxuatrswgljygxhn.supabase.co/'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVkdndyeHVhdHJzd2dsanlneGhuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2Mjg2NTIsImV4cCI6MjEwNzIwNDY1Mn0.e4O8IJ5UWqUv8MoIRH0NlBZz9gwiVeuHu2uhtHelzYM';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================
// 2. ใส่รหัส LINE ของคุณตรงนี้
// ==========================================
const LINE_CONFIG = {
    channelId: "2011960123",
    channelSecret: "1cff003b296d4b0adcfd9d2edd1b9cac",
    redirectUri: "http://localhost:3000/auth/line/callback" // หากเอาเว็บขึ้น Render แล้ว ค่อยมาเปลี่ยนลิงก์นี้
};

// ==========================================
// 3. ระบบฐานข้อมูล (เชื่อมต่อ Supabase ถาวร)
// ==========================================
// ตอนหน้าเว็บขอข้อมูลออเดอร์ (แอดมินเปิดหน้า 6 / ลูกค้าเปิดเข้ามาใหม่)
app.get('/api/orders', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('orders')
            .select('data')
            .order('created_at', { ascending: false }); // ดึงข้อมูลล่าสุดขึ้นก่อน

        if (error) throw error;
        // ส่งออเดอร์กลับไปที่หน้าเว็บ
        const orders = data.map(row => row.data);
        res.json(orders);
    } catch (error) {
        console.error('Fetch Orders Error:', error);
        res.status(500).json([]);
    }
});

// ตอนที่มีคนกดส่งออเดอร์ หรือ แอดมินกดเซฟสถานะ
app.post('/api/orders', async (req, res) => {
    try {
        const ordersArray = req.body; 
        
        // แปลงข้อมูลให้ตรงกับตารางในตู้เซฟ Supabase
        const supabaseRecords = ordersArray.map(order => ({
            id: order.id,
            customer_name: order.customerName,
            model: order.model,
            color: order.color,
            status: order.status,
            data: order 
        }));

        // บันทึกลง Supabase (ถ้าออเดอร์ซ้ำจะใช้วิธีอัปเดตข้อมูลทับของเดิม)
        const { error } = await supabase
            .from('orders')
            .upsert(supabaseRecords, { onConflict: 'id' });

        if (error) throw error;
        res.json({ success: true });
    } catch (error) {
        console.error('Save Orders Error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==========================================
// 4. ระบบล็อกอิน LINE
// ==========================================
app.get('/auth/line/login', (req, res) => {
    const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize?response_type=code&client_id=${LINE_CONFIG.channelId}&redirect_uri=${encodeURIComponent(LINE_CONFIG.redirectUri)}&state=12345abcde&scope=profile%20openid%20email`;
    res.redirect(lineAuthUrl);
});

app.get('/auth/line/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send('LINE Login Failed: No code provided.');

    try {
        const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: LINE_CONFIG.redirectUri,
                client_id: LINE_CONFIG.channelId,
                client_secret: LINE_CONFIG.channelSecret
            })
        });
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) throw new Error('Failed to get access token');

        const profileRes = await fetch('https://api.line.me/v2/profile', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        const profileData = await profileRes.json();

        const lineUser = {
            role: 'customer',
            name: profileData.displayName,
            userId: profileData.userId,
            picture: profileData.pictureUrl
        };

        res.send(`
            <html>
            <body style="background:#0f0f0f; color:#D4AF37; font-family:sans-serif; text-align:center; padding-top:100px;">
                <h2>เชื่อมต่อบัญชี LINE ของคุณเรียบร้อยแล้ว!</h2>
                <script>
                    localStorage.setItem('acha_current_user', JSON.stringify(${JSON.stringify(lineUser)}));
                    window.location.href = '/';
                </script>
            </body>
            </html>
        `);
    } catch (error) {
        res.status(500).send('LINE Login Error: ' + error.message);
    }
});

// ==========================================
// 5. แสดงผลหน้าเว็บตัวเต็ม (index.html)
// ==========================================
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// เปิดเซิร์ฟเวอร์
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});