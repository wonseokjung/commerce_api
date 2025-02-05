import express, { Request, Response, Application } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import crypto from 'crypto';
import moment from 'moment';
import CryptoJS from 'crypto-js';

dotenv.config();

const app: Application = express();
const port = process.env.PORT || 4000;

app.use(cors({
  origin: ['http://localhost:3000', 'https://opct.ai'],
  credentials: true
}));
app.use(express.json());

// 쿠팡 API 관련 설정
const DOMAIN = 'https://api-gateway.coupang.com';
const PATHS = {
  SEARCH: '/v2/providers/affiliate_open_api/apis/openapi/products/search',
  CATEGORIES: '/v2/providers/affiliate_open_api/apis/openapi/products/bestcategories',
  GOLDBOX: '/v2/providers/affiliate_open_api/apis/openapi/products/goldbox'
};

// HMAC 서명 생성 함수 (공식 예제 기반)
const generateHmac = (method: string, url: string, secretKey: string, accessKey: string) => {
  const parts = url.split(/\?/);
  const [path, query = ''] = parts;

  const datetime = moment.utc().format('YYMMDD[T]HHmmss[Z]');
  const message = datetime + method + path + query;

  console.log('Message components:', {
    datetime,
    method,
    path,
    query
  });
  console.log('Final message:', message);

  const signature = crypto
    .createHmac('sha256', secretKey)
    .update(message)
    .digest('hex');

  return {
    authorization: `CEA algorithm=HmacSHA256, access-key=${accessKey}, signed-date=${datetime}, signature=${signature}`,
    datetime
  };
};

interface SearchQuery {
  keyword: string;
  page?: number;
  size?: number;
}

interface ReviewQuery {
  productId: string;
}

// 쿠팡 API 설정
const COUPANG_API_BASE = 'https://api-gateway.coupang.com/v2/providers/affiliate_open_api/apis/openapi/v1';
const ACCESS_KEY = process.env.REACT_APP_COUPANG_ACCESS_KEY;
const SECRET_KEY = process.env.REACT_APP_COUPANG_SECRET_KEY;

const generateApiHeader = (method: string, url: string, timestamp: string) => {
  const message = `${method}\n${url}\n${timestamp}\n${SECRET_KEY}`;
  const hmac = CryptoJS.HmacSHA256(message, SECRET_KEY || '');
  const hash = CryptoJS.enc.Base64.stringify(hmac);

  return {
    'Authorization': `HMAC-SHA256 AccessKey=${ACCESS_KEY}, SignatureMethod=HmacSHA256, Timestamp=${timestamp}, Signature=${hash}`,
    'Content-Type': 'application/json',
  };
};

// 상품 검색 API
app.get('/api/products/search', async (req, res) => {
  try {
    const { keyword } = req.query;
    const timestamp = Date.now().toString();
    const baseUrl = `${COUPANG_API_BASE}/products/search`;
    const queryString = `keyword=${encodeURIComponent(keyword as string)}&limit=20&subId=opctstore`;
    const url = `${baseUrl}?${queryString}`;
    
    const headers = generateApiHeader('GET', url, timestamp);
    const response = await axios.get(url, { headers });
    
    res.json(response.data);
  } catch (error) {
    console.error('쿠팡 API 에러:', error);
    res.status(500).json({ error: '쿠팡 API 호출 중 에러가 발생했습니다.' });
  }
});

// 딥링크 생성 API
app.post('/api/deeplink', async (req, res) => {
  try {
    const { productUrl } = req.body;
    const timestamp = Date.now().toString();
    const url = `${COUPANG_API_BASE}/deeplink`;
    
    const headers = generateApiHeader('POST', url, timestamp);
    const response = await axios.post(url, {
      coupangUrls: [productUrl],
      subId: 'opctstore'
    }, { headers });
    
    res.json(response.data);
  } catch (error) {
    console.error('딥링크 생성 중 에러:', error);
    res.status(500).json({ error: '딥링크 생성 중 에러가 발생했습니다.' });
  }
});

// AI 추천 API
app.post('/api/recommendations/ai', async (req: Request, res: Response) => {
  try {
    const { preferences } = req.body;
    const timestamp = Date.now().toString();
    
    const recommendedKeywords: string[] = [];
    
    if (preferences.category === '운동용품') {
      recommendedKeywords.push('요가매트', '아령', '폼롤러');
    } else if (preferences.category === '건강식품') {
      recommendedKeywords.push('프로틴', '비타민', '오메가3');
    } else if (preferences.category === '운동복') {
      recommendedKeywords.push('기능성티셔츠', '레깅스', '운동화');
    }
    
    const recommendations = [];
    for (const keyword of recommendedKeywords) {
      const baseUrl = `${COUPANG_API_BASE}/products/search`;
      const queryString = `keyword=${encodeURIComponent(keyword)}&limit=3&subId=opctstore`;
      const url = `${baseUrl}?${queryString}`;
      
      const headers = generateApiHeader('GET', url, timestamp);
      const response = await axios.get(url, { headers });
      
      if (response.data.data && response.data.data.products) {
        recommendations.push(...response.data.data.products);
      }
    }
    
    res.json({ recommendations });
  } catch (error) {
    console.error('AI 추천 API 에러:', error);
    res.status(500).json({ error: 'AI 추천 중 에러가 발생했습니다.' });
  }
});

// AI 쇼핑 어시스턴트 엔드포인트
app.post('/api/shopping-assistant', async (req: Request, res: Response) => {
  try {
    const { messages } = req.body;
    const lastMessage = messages[messages.length - 1].content;

    // 기본 응답 메시지
    let responseMessage = "죄송합니다. 말씀하신 내용을 정확히 이해하지 못했어요. 찾으시는 제품이나 원하시는 가격대를 알려주시면 도와드리겠습니다.";
    let shouldSearchProducts = false;
    let searchKeyword = "";

    // 사용자 메시지 분석
    const message = lastMessage.toLowerCase();
    if (message.includes("추천") || message.includes("찾아") || message.includes("보여줘")) {
      shouldSearchProducts = true;
      // 검색 키워드 추출 로직
      const keywords = message.split(" ").filter((word: string) => 
        !["추천", "해줘", "찾아", "보여줘", "주세요"].includes(word)
      );
      searchKeyword = keywords.join(" ");
      responseMessage = `네, ${searchKeyword} 관련 제품들을 찾아보겠습니다.`;
    }

    let products = [];
    
    // 제품 검색이 필요한 경우
    if (shouldSearchProducts && searchKeyword) {
      const searchParams = new URLSearchParams({
        keyword: searchKeyword,
        limit: '10',
        subId: 'opctstore'
      });

      const URL = `${PATHS.SEARCH}?${searchParams}`;
      const { authorization } = generateHmac('GET', URL, process.env.COUPANG_SECRET_KEY!, process.env.COUPANG_ACCESS_KEY!);
      
      const searchResponse = await axios.get(DOMAIN + URL, {
        headers: {
          'Authorization': authorization,
          'Content-Type': 'application/json'
        }
      });

      if (searchResponse.data?.data?.productData) {
        products = searchResponse.data.data.productData.map((product: any) => ({
          productId: product.productId,
          productName: product.productName,
          productPrice: parseInt(product.productPrice) || 0,
          productImage: product.productImage,
          productUrl: product.productUrl,
          isRocket: product.isRocket || false,
          isFreeShipping: product.isFreeShipping || false
        }));
      }
    }

    res.json({
      message: responseMessage,
      products: products
    });
  } catch (error: any) {
    console.error('쇼핑 어시스턴트 에러:', error);
    res.status(500).json({
      error: '처리 중 오류가 발생했습니다.',
      details: error.response?.data || error.message
    });
  }
});

// 리뷰 데이터 가져오기
app.get('/api/products/:productId/reviews', async (req: Request<ReviewQuery>, res: Response) => {
    try {
        const { productId } = req.params;
        const ACCESS_KEY = process.env.COUPANG_ACCESS_KEY;
        const SECRET_KEY = process.env.COUPANG_SECRET_KEY;

        if (!ACCESS_KEY || !SECRET_KEY) {
            throw new Error('API 키가 설정되지 않았습니다.');
        }

        const URL = `${PATHS.SEARCH}/${productId}/reviews`;
        const { authorization } = generateHmac('GET', URL, SECRET_KEY, ACCESS_KEY);
        
        const response = await axios.get(DOMAIN + URL, {
            headers: {
                'Authorization': authorization,
                'Content-Type': 'application/json'
            }
        });

        res.json(response.data);
    } catch (error: any) {
        console.error('리뷰 조회 중 에러:', error);
        res.status(500).json({
            error: '리뷰 조회 중 오류가 발생했습니다.',
            details: error.response?.data || error.message
        });
    }
});

// 가격 추적 설정
interface PriceAlert {
    productId: string;
    userId: string;
    targetPrice: number;
}

const priceAlerts = new Map<string, PriceAlert[]>();

app.post('/api/price-alerts', async (req: Request, res: Response) => {
    try {
        const { productId, userId, targetPrice } = req.body;
        
        if (!priceAlerts.has(productId)) {
            priceAlerts.set(productId, []);
        }
        
        priceAlerts.get(productId)?.push({
            productId,
            userId,
            targetPrice
        });

        res.json({
            message: '가격 알림이 설정되었습니다.',
            data: { productId, targetPrice }
        });
    } catch (error: any) {
        console.error('가격 알림 설정 중 에러:', error);
        res.status(500).json({
            error: '가격 알림 설정 중 오류가 발생했습니다.',
            details: error.message
        });
    }
});

// 가격 알림 조회
app.get('/api/price-alerts/:userId', async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const userAlerts: PriceAlert[] = [];
        
        priceAlerts.forEach((alerts) => {
            const userAlert = alerts.find(alert => alert.userId === userId);
            if (userAlert) {
                userAlerts.push(userAlert);
            }
        });

        res.json(userAlerts);
    } catch (error: any) {
        console.error('가격 알림 조회 중 에러:', error);
        res.status(500).json({
            error: '가격 알림 조회 중 오류가 발생했습니다.',
            details: error.message
        });
    }
});

app.listen(port, () => {
  console.log(`서버가 http://localhost:${port} 에서 실행 중입니다.`);
}); 