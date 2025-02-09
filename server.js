import express from 'express';
import cors from 'cors';
import axios from 'axios';
import CryptoJS from 'crypto-js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
const SECRET_KEY = process.env.COUPANG_SECRET_KEY;

function generateHmac(method, url, secretKey, accessKey) {
  // URL에서 path와 query 분리
  const parts = url.split(/\?/);
  const [path, query = ''] = parts;

  // UTC 시간 형식 YYMMDDTHHMMSSZ
  const now = new Date();
  const year = now.getUTCFullYear().toString().slice(2);
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const hours = String(now.getUTCHours()).padStart(2, '0');
  const minutes = String(now.getUTCMinutes()).padStart(2, '0');
  const seconds = String(now.getUTCSeconds()).padStart(2, '0');
  const datetime = `${year}${month}${day}T${hours}${minutes}${seconds}Z`;

  // 메시지 생성
  const message = datetime + method + path + query;

  console.log('Datetime:', datetime);
  console.log('Message:', message);

  // HMAC-SHA256 서명 생성
  const signature = CryptoJS.HmacSHA256(message, secretKey).toString(CryptoJS.enc.Hex);

  // Authorization 헤더 생성
  return `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`;
}

app.post('/api/coupang/search', async (req, res) => {
  try {
    const { keyword } = req.body;
    const baseUrl = '/v2/providers/affiliate_open_api/apis/openapi/v1/products/search';
    const queryString = `keyword=${encodeURIComponent(keyword)}&limit=10&subId=opct`;
    const url = `${baseUrl}?${queryString}`;
    
    const authorization = generateHmac('GET', url, SECRET_KEY, ACCESS_KEY);

    console.log('Request URL:', `https://api-gateway.coupang.com${url}`);
    console.log('Authorization:', authorization);

    const response = await axios.get(`https://api-gateway.coupang.com${url}`, {
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json'
      }
    });

    console.log('Response:', response.data);
    res.json(response.data);
  } catch (error) {
    console.error('쿠팡 API 오류 상세:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    res.status(500).json({ 
      error: '쿠팡 API 요청 실패',
      details: error.response?.data || error.message
    });
  }
});

app.post('/api/coupang/deeplink', async (req, res) => {
  try {
    const { url } = req.body;
    const baseUrl = '/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink';
    const authorization = generateHmac('POST', baseUrl, SECRET_KEY, ACCESS_KEY);

    const response = await axios.post(`https://api-gateway.coupang.com${baseUrl}`, {
      coupangUrls: [url]
    }, {
      headers: {
        'Authorization': authorization,
        'Content-Type': 'application/json'
      }
    });

    res.json(response.data);
  } catch (error) {
    console.error('딥링크 생성 오류:', error);
    res.status(500).json({ error: '딥링크 생성 실패' });
  }
});

app.listen(PORT, () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
}); 