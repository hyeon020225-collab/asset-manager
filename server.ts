import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

app.get('/api/ai/status', (_req, res) => {
  const available = Boolean(getAiClient());
  res.json({
    available,
    model: available ? 'gemini-4-hydrogen' : null,
  });
});

app.post('/api/ai/extract-cashflow', async (req, res) => {
  const ai = getAiClient();
  if (!ai) {
    res.status(503).json({
      error: 'AI_NOT_CONFIGURED',
      message: '서버에 AI 키가 설정되어 있지 않아 규칙 기반 추출로 전환합니다.',
    });
    return;
  }

  const text = typeof req.body?.text === 'string' ? req.body.text.slice(0, 1500) : '';
  if (!text.trim()) {
    res.status(400).json({ error: 'EMPTY_INPUT', message: '분석할 문장을 입력해 주세요.' });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `다음 청년 사용자의 재무 설명에서 한국 원화 기준 숫자와 나이 정보를 추출하세요. 언급되지 않은 항목은 null 또는 생략하고, 절대로 없는 숫자를 지어내지 마세요.\n\n사용자 설명:\n${text}`,
      config: {
        systemInstruction:
          '당신은 한국 청년의 현금흐름 입력 도우미입니다. 입력에 명시된 금액만 원화 정수(예: 300만원 -> 3000000)로 추출하고, 빠진 필수 정보는 친절한 질문으로 정리하세요.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            currentAge: { type: Type.INTEGER, nullable: true },
            monthlyNetIncome: { type: Type.NUMBER, nullable: true },
            housingExpense: { type: Type.NUMBER, nullable: true },
            foodExpense: { type: Type.NUMBER, nullable: true },
            discretionaryExpense: { type: Type.NUMBER, nullable: true },
            cashAndDeposits: { type: Type.NUMBER, nullable: true },
            lockedAssets: { type: Type.NUMBER, nullable: true },
            nearTermGoalCash: { type: Type.NUMBER, nullable: true },
            notes: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
            missingQuestions: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim());
    res.json({
      sourceMode: 'gemini_ai',
      ...parsed,
    });
  } catch (err) {
    res.status(500).json({
      error: 'AI_EXTRACT_FAILED',
      message: err instanceof Error ? err.message : 'AI 추출 호출에 실패했습니다.',
    });
  }
});

app.post('/api/ai/explain', async (req, res) => {
  const ai = getAiClient();
  if (!ai) {
    res.status(503).json({
      error: 'AI_NOT_CONFIGURED',
      message: '서버에 AI 키가 설정되어 있지 않아 규칙 기반 설명을 사용합니다.',
    });
    return;
  }

  const summaryPayload = req.body?.payload;
  if (!summaryPayload || typeof summaryPayload !== 'object') {
    res.status(400).json({ error: 'INVALID_PAYLOAD', message: '전달할 계산 요약이 필요합니다.' });
    return;
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `아래는 검증된 금융 계산 엔진이 산출한 JSON 결과입니다. 이 숫자들을 단 하나도 변경하거나 새로운 수익률을 지어내지 말고, 청년 사용자가 이해하기 쉽게 추천 이유, 위험 감당 포인트, 하락 시나리오 해석을 4~5문장으로 설명하세요.\n\n계산 결과 JSON:\n${JSON.stringify(summaryPayload, null, 2)}`,
      config: {
        systemInstruction:
          '당신은 내일의 자산 서비스의 금융교육 설명 도우미입니다. 제공된 JSON에 없는 숫자를 절대 만들지 말고, 확정 수익이나 손실 상한을 보장하는 표현을 금지합니다.',
      },
    });

    res.json({
      sourceMode: 'gemini_ai',
      explanation: (response.text ?? '').trim(),
    });
  } catch (err) {
    res.status(500).json({
      error: 'AI_EXPLAIN_FAILED',
      message: err instanceof Error ? err.message : 'AI 설명 생성에 실패했습니다.',
    });
  }
});

async function startServer() {
  const port = Number(process.env.PORT ?? 3000);
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`내일의 자산 server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
