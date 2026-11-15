import { AssetClassId, AssetClassSpec, InstrumentCandidate, InvestorStyleId } from '../types/wealth';

export const MODEL_VERSION = 'NaeilAsset-GBM-Bootstrap-v1.0';
export const DATA_VERSION = '2026.Q4-Reference-Set';

export const ASSET_CLASS_ORDER: AssetClassId[] = [
  'cash',
  'bond',
  'equity_index',
  'gold',
  'quality_stock',
];

/**
 * 개발용 가정 기본 파라미터 (실시간 시세가 아니며 교육/시뮬레이션용 가정값)
 * Annual simple expected return, annual log volatility, fee, currency & FX assumptions
 */
export const DEFAULT_ASSET_SPECS: Record<AssetClassId, AssetClassSpec> = {
  cash: {
    id: 'cash',
    label: '현금성 자산',
    color: '#64748B',
    annualSimpleReturn: 0.032,
    annualLogVolatility: 0.008,
    annualFee: 0.001,
    dividendYield: 0.032,
    currency: 'KRW',
    fxExposed: false,
    annualFxReturn: 0,
    annualFxVolatility: 0,
    riskSummary: '원금 변동은 매우 작지만 물가상승률(인플레이션)에 의해 실질 구매력이 줄어들 수 있습니다.',
    sourceName: '개발용 가정 (단기 국고채·MMF 기준)',
    sourceUrl: 'https://www.bok.or.kr',
    asOfDate: '2026-10 기준 가정',
  },
  bond: {
    id: 'bond',
    label: '채권 (국채·우량채)',
    color: '#0EA5E9',
    annualSimpleReturn: 0.044,
    annualLogVolatility: 0.062,
    annualFee: 0.0012,
    dividendYield: 0.036,
    currency: 'KRW',
    fxExposed: false,
    annualFxReturn: 0,
    annualFxVolatility: 0,
    riskSummary: '금리 상승 시 채권 가격 하락(듀레이션 위험)과 발행자 신용위험에 노출되며, 이자율 자체가 총수익률은 아닙니다.',
    sourceName: '개발용 가정 (중기 국채·종합채권 성격)',
    sourceUrl: 'https://www.krx.co.kr',
    asOfDate: '2026-10 기준 가정',
  },
  equity_index: {
    id: 'equity_index',
    label: '국내외 분산 주가지수',
    color: '#1D4ED8',
    annualSimpleReturn: 0.078,
    annualLogVolatility: 0.165,
    annualFee: 0.0015,
    dividendYield: 0.021,
    currency: 'USD',
    fxExposed: true,
    annualFxReturn: 0.0,
    annualFxVolatility: 0.085,
    riskSummary: '장기 성장 잠재력이 있으나 경기 침체 시 -25%~-40%대 낙폭이 발생할 수 있고, 해외 비중은 환율 변동에 노출됩니다.',
    sourceName: '개발용 가정 (글로벌·국내 지수 혼합)',
    sourceUrl: 'https://www.investor.gov/introduction-investing/getting-started/asset-allocation',
    asOfDate: '2026-10 기준 가정',
  },
  gold: {
    id: 'gold',
    label: '금 (실물·현물형)',
    color: '#D97706',
    annualSimpleReturn: 0.048,
    annualLogVolatility: 0.15,
    annualFee: 0.0025,
    dividendYield: 0.0,
    currency: 'USD',
    fxExposed: true,
    annualFxReturn: 0.0,
    annualFxVolatility: 0.085,
    riskSummary: '배당·이자 현금흐름이 없으며 실질금리 및 달러 강세에 따라 장기 횡보 또는 큰 폭의 가격 변동이 나타납니다.',
    sourceName: '개발용 가정 (국제 금 현물 원화 환산)',
    sourceUrl: 'https://www.krx.co.kr',
    asOfDate: '2026-10 기준 가정',
  },
  quality_stock: {
    id: 'quality_stock',
    label: '개별 우량주 후보',
    color: '#4F46E5',
    annualSimpleReturn: 0.095,
    annualLogVolatility: 0.255,
    annualFee: 0.001,
    dividendYield: 0.018,
    currency: 'KRW',
    fxExposed: false,
    annualFxReturn: 0,
    annualFxVolatility: 0,
    riskSummary: '우량주라 하더라도 기업 실적 악화, 산업 재편, 경영 리스크로 인해 지수보다 훨씬 큰 영구적 원금 손실이 발생할 수 있습니다.',
    sourceName: '개발용 가정 (대형 우량 개별주 바스켓)',
    sourceUrl: 'https://www.krx.co.kr',
    asOfDate: '2026-10 기준 가정',
  },
};

/**
 * 5x5 자산군 간 월간 수익률 상관계수 행렬 (대칭 양정치 행렬)
 * Order: [cash, bond, equity_index, gold, quality_stock]
 */
export const DEFAULT_CORRELATION_MATRIX: number[][] = [
  [1.00, 0.15, 0.02, 0.04, 0.00], // cash
  [0.15, 1.00, 0.12, 0.20, 0.10], // bond
  [0.02, 0.12, 1.00, 0.10, 0.78], // equity_index
  [0.04, 0.20, 0.10, 1.00, 0.06], // gold
  [0.00, 0.10, 0.78, 0.06, 1.00], // quality_stock
];

/**
 * 개발용 시작 비교 비중 (정답이 아닌 비교용 기준점)
 */
export const BASE_PROFILE_WEIGHTS: Record<'conservative' | 'moderate' | 'aggressive', Record<AssetClassId, number>> = {
  conservative: {
    cash: 0.35,
    bond: 0.40,
    equity_index: 0.15,
    gold: 0.10,
    quality_stock: 0.0,
  },
  moderate: {
    cash: 0.15,
    bond: 0.30,
    equity_index: 0.40,
    gold: 0.10,
    quality_stock: 0.05,
  },
  aggressive: {
    cash: 0.05,
    bond: 0.15,
    equity_index: 0.60,
    gold: 0.10,
    quality_stock: 0.10,
  },
};

export interface InvestorStyleMeta {
  id: InvestorStyleId;
  name: string;
  badgeInitials: string;
  tagline: string;
  corePrinciple: string;
  implementedRules: string[];
  unreplicatedParts: string[];
  sourceTitle: string;
  sourceUrl: string;
  rebalanceLabel: string;
}

export const INVESTOR_STYLES: Record<InvestorStyleId, InvestorStyleMeta> = {
  balanced_core: {
    id: 'balanced_core',
    name: '기본 분산형',
    badgeInitials: 'BC',
    tagline: '자산군 분산과 정기 리밸런싱 중심의 표준 배분 모형',
    corePrinciple: '특정 기업이나 거시 전망에 베팅하지 않고, 현금·채권·글로벌 지수·금을 균형 배분합니다.',
    implementedRules: [
      '위험 성향별 자산군 목표 비중을 분기마다 정기 리밸런싱(거래비용 0.05% 반영)',
      '개별 주식 비중을 최소(0~10%)로 제한하고 분산 지수 ETF를 우선 배치',
    ],
    unreplicatedParts: [
      '개인별 세제 혜택 계좌(ISA·연금저축) 과세이연 효과는 별도 세후 계산 제외',
    ],
    sourceTitle: 'SEC Investor.gov — Asset Allocation & Diversification',
    sourceUrl: 'https://www.investor.gov/introduction-investing/getting-started/asset-allocation',
    rebalanceLabel: '분기별 정기 리밸런싱',
  },
  buffett: {
    id: 'buffett',
    name: '워런 버핏 원칙 참고형',
    badgeInitials: 'WB',
    tagline: '사업의 질·합리적 가격·낮은 회전율 장기 보유를 구현한 모형',
    corePrinciple: '지속 가능한 경쟁우위(해자), 높은 자기자본이익률(ROE), 낮은 부채의 우량 기업과 인덱스 결합 및 장기 보유 원칙을 참고합니다.',
    implementedRules: [
      '후보 선정: 영업현금흐름 흑자, 낮은 부채비율, 높은 ROE 기준 우량주 및 저비용 S&P500 지수 우선',
      '회전율 최소화: 연간 리밸런싱으로 불필요한 매매 회전율과 거래비용 축소',
      '여유 현금성 자산 10% 이상 유지(위험 한도 초과 시 집중도 자동 축소)',
    ],
    unreplicatedParts: [
      '버크셔 해서웨이의 비상장 자회사 인수, 보험 플로트(Float) 무이자 레버리지, 경영권 개입은 재현 불가',
      '실제 버크셔 보유종목·공식 수익률을 복제한 포트폴리오가 아닙니다',
    ],
    sourceTitle: 'Berkshire Hathaway — Owner’s Manual',
    sourceUrl: 'https://www.berkshirehathaway.com/owners.html',
    rebalanceLabel: '연간 저회전 리밸런싱',
  },
  lynch: {
    id: 'lynch',
    name: '피터 린치 원칙 참고형',
    badgeInitials: 'PL',
    tagline: '이해 가능한 성장 기업 조사와 가격(PEG) 균형을 참고한 모형',
    corePrinciple: '단순히 익숙한 브랜드가 아니라, 수익 구조가 투명하고 이익 성장률 대비 밸류에이션이 과도하지 않은 성장·중형주 후보를 탐색하는 원칙을 반영합니다.',
    implementedRules: [
      '후보 선정: 사업 이해도, 부채 대비 현금 여력, 이익 성장성 대비 가격 균형 필터 적용',
      '주식·성장 자산군 비중을 기본형 대비 상향하되, 사용자 손실 감당 한도 내에서 자동 캡 적용',
      '반기 리밸런싱으로 과열/과소 비중 점검',
    ],
    unreplicatedParts: [
      '현장 탐방·기업 IR 분석·개별 종목 적정 주가 직접 추정 및 수백 개 종목 분산 운용은 재현 불가',
      '과거 마젤란 펀드의 개인 실적을 미래 기대수익률에 가산하지 않습니다',
    ],
    sourceTitle: 'Fidelity — Style & Capitalization / 5-Step Research Guide',
    sourceUrl: 'https://www.fidelity.com/viewpoints/active-investor/trading-guide-managing-investment-risks-and-opportunities',
    rebalanceLabel: '반기별 성장·가격 점검 리밸런싱',
  },
  druckenmiller: {
    id: 'druckenmiller',
    name: '스탠리 드러켄밀러 원칙 참고형',
    badgeInitials: 'SD',
    tagline: '단순화한 자산 배분 모형 — 거시·추세 신호 기반 유연한 비중 조절',
    corePrinciple: '시장 국면(직전 6개월 추세·변동성 신호)에 따라 위험자산과 안전자산(현금·채권·금) 비중을 유연하게 조절합니다.',
    implementedRules: [
      '미래 정보 미사용(Zero Look-Ahead): 반드시 t-1 시점까지 관측된 6개월 누적 추세 신호만 사용',
      '하락 추세 또는 고변동 경보 시 주식 비중을 낮추고 현금·채권·금 비중으로 대피(최대 변동 폭은 사용자 성향 한도 준수)',
      '단순화한 자산 배분 모형: 차입(레버리지)·공매도·파생상품 배제',
    ],
    unreplicatedParts: [
      '거시경제 중앙은행 유동성 분석, 통화·선물 공매도 및 레버리지 집중 베팅은 이번 버전에 포함되지 않습니다',
      '거시지표 실시간 크롤링 없이 시뮬레이션 경로 내 직전 가격 추세 신호만 사용합니다',
    ],
    sourceTitle: 'Morgan Stanley — Hard Lessons Interview with Stan Druckenmiller',
    sourceUrl: 'https://www.morganstanley.com/insights/videos/hard-lessons/duquesne-stan-druckenmiller-iliana-bouzali',
    rebalanceLabel: '신호 기반 동적 리밸런싱 (차입 없음)',
  },
};

export const QUALITY_STOCK_CRITERIA: string[] = [
  '최근 3개년 영업이익 및 영업활동현금흐름 흑자 지속 여부',
  '부채비율 100% 이하 또는 순차입금 관리 수준',
  '자기자본이익률(ROE)과 배당·주주환원 일관성',
  '산업 내 시장 지위 및 사업 모델의 이해 가능성 (지속적 모니터링 필수)',
];

/**
 * 실제 상품·종목 참고 후보 (공식 자료 기반 메타데이터. 미확인/실시간 수치는 '미확인' 명시)
 */
export const INSTRUMENT_CANDIDATES: InstrumentCandidate[] = [
  {
    id: 'krx_cd_mmf',
    assetClass: 'cash',
    name: 'KODEX CD금리액티브(합성) / CMA·정기예금',
    ticker: '459580.KS (참고)',
    market: 'KRX / 은행권',
    isVirtualModelAsset: false,
    role: '비상자금·대기 자금 보관 및 포트폴리오 변동성 완충',
    selectionReason: '단기 금리 추종 구조로 가격 변동이 극히 낮아 유동성 확보에 유리합니다.',
    keyRisks: ['기준금리 인하 시 기대 이자율 하락', '물가상승률보다 낮을 경우 실질 구매력 감소', '합성 ETF의 거래상대방 위험'],
    currency: 'KRW',
    fxHedged: null,
    expenseRatioLabel: '연 0.02% (KODEX CD금리액티브 기준 공시, 예금 0%)',
    expenseRatioNumeric: 0.0002,
    asOfDate: '2026-10 공식 문서 기준(실시간 시세 미연동)',
    officialSourceName: '삼성자산운용 / KRX 정보데이터시스템',
    officialSourceUrl: 'https://www.samsungfund.com',
    supportedStyles: ['balanced_core', 'buffett', 'lynch', 'druckenmiller'],
  },
  {
    id: 'krx_bond_10y',
    assetClass: 'bond',
    name: 'KODEX 국고채10년액티브 / TIGER 중장기국채 참고',
    ticker: '365780.KS / 302190.KS',
    market: 'KRX',
    isVirtualModelAsset: false,
    role: '주식 하락기 방어 및 포트폴리오 내 현금흐름 완충',
    selectionReason: '신용위험이 낮은 대한민국 국채 중심으로 장기 금리 하락 시 자본차익 가능성이 있습니다.',
    keyRisks: ['시장 금리 상승 시 채권 가격 하락(듀레이션 위험)', '현재 표면금리가 총수익률을 보장하지 않음'],
    currency: 'KRW',
    fxHedged: null,
    expenseRatioLabel: '연 0.05%~0.09% 수준(세부 종목별 운용사 공시 확인 필요)',
    expenseRatioNumeric: 0.0007,
    asOfDate: '2026-10 공식 공시 기준',
    officialSourceName: '한국거래소(KRX) ETF 공시',
    officialSourceUrl: 'https://www.krx.co.kr',
    supportedStyles: ['balanced_core', 'buffett', 'druckenmiller'],
  },
  {
    id: 'us_sp500_etf',
    assetClass: 'equity_index',
    name: 'TIGER 미국S&P500 / Vanguard S&P 500 ETF (VOO)',
    ticker: '360750.KS / VOO',
    market: 'KRX / NYSE Arca',
    isVirtualModelAsset: false,
    role: '장기 자산 성장을 위한 핵심 글로벌 분산 주가지수',
    selectionReason: '미국 대형주 500개 기업에 저비용으로 분산 투자하여 개별 기업 리스크를 줄입니다.',
    keyRisks: ['원/달러 환율 변동(환노출형 기준)', '경기 침체 시 -30% 이상 하락 가능', '미국 기술주 비중 집중 위험'],
    currency: 'USD',
    fxHedged: false,
    expenseRatioLabel: '국내 0.07% / 미국 VOO 0.03% (공식 보수 외 매매·환전 비용 별도)',
    expenseRatioNumeric: 0.0007,
    asOfDate: '2026-10 운용사 공시 기준',
    officialSourceName: '미래에셋자산운용 / Vanguard',
    officialSourceUrl: 'https://investor.vanguard.com/investment-products/etfs/profile/voo',
    overlapNote: 'S&P500 지수 ETF와 미국 대형 개별주(예: Apple, Microsoft 등)를 함께 보유하면 동일 기업에 중복 노출됩니다.',
    supportedStyles: ['balanced_core', 'buffett', 'lynch', 'druckenmiller'],
  },
  {
    id: 'kr_kospi200_etf',
    assetClass: 'equity_index',
    name: 'KODEX 200 / 국내 대표 주가지수 ETF',
    ticker: '069500.KS',
    market: 'KRX',
    isVirtualModelAsset: false,
    role: '환위험 없는 국내 대형주 분산 투자',
    selectionReason: '원화로 직접 투자해 환율 변동을 피하면서 국내 대표 산업에 분산 투자합니다.',
    keyRisks: ['특정 수출·반도체 업종 편중 위험', '국내 경기 및 지정학적 변동성'],
    currency: 'KRW',
    fxHedged: null,
    expenseRatioLabel: '연 0.15% (운용사 공식 공시 기준)',
    expenseRatioNumeric: 0.0015,
    asOfDate: '2026-10 운용사 공시 기준',
    officialSourceName: '삼성자산운용 KODEX',
    officialSourceUrl: 'https://www.samsungfund.com',
    overlapNote: 'KODEX 200과 삼성전자 등 국내 대형 개별주를 동시 보유 시 비중이 이중 합산됩니다.',
    supportedStyles: ['balanced_core', 'lynch'],
  },
  {
    id: 'krx_gold_spot',
    assetClass: 'gold',
    name: 'ACE KRX금현물 / SPDR Gold MiniShares (GLDM)',
    ticker: '411060.KS / GLDM',
    market: 'KRX / NYSE Arca',
    isVirtualModelAsset: false,
    role: '인플레이션·통화가치 하락 및 금융 불안에 대한 분산 헤지',
    selectionReason: '주식·채권과 낮은 상관관계를 가져 극단적 시장 충격 시 분산 효과를 제공합니다.',
    keyRisks: ['이자·배당 수익이 전혀 없음', '국제 금값 및 원/달러 환율 동시 변동'],
    currency: 'USD',
    fxHedged: false,
    expenseRatioLabel: '국내 0.50% (ACE KRX금현물) / 미국 GLDM 0.10%',
    expenseRatioNumeric: 0.005,
    asOfDate: '2026-10 운용사 공시 기준',
    officialSourceName: '한국투자신탁운용 / State Street',
    officialSourceUrl: 'https://www.krx.co.kr',
    supportedStyles: ['balanced_core', 'druckenmiller'],
  },
  {
    id: 'quality_basket_kr_us',
    assetClass: 'quality_stock',
    name: '우량주 선별 후보군 (가상 시뮬레이션 바스켓 · 예시 종목 참고)',
    ticker: '005930.KS / BRK.B / MSFT (참고 예시)',
    market: 'KRX / NYSE / NASDAQ',
    isVirtualModelAsset: true,
    role: '투자자 스타일(버핏·린치)의 기업 질·성장성 원칙을 체험하는 시뮬레이션용 자산군',
    selectionReason: '실제 종목 매수 추천이 아닌, 우량주 편입 시 변동성·집중도·중복 노출 변화를 학습하기 위한 모형 자산입니다.',
    keyRisks: ['개별 기업 실적 급락·규제·산업 변화에 따른 원금 손실 위험', 'ETF 보유 종목과 중복 노출 가능', '현재 실시간 주가·밸류에이션 미확인'],
    currency: 'KRW',
    fxHedged: null,
    expenseRatioLabel: '미확인 (개별주 운용보수 없음 · 매매수수료 및 환전비용 발생)',
    expenseRatioNumeric: 0.001,
    asOfDate: '실시간 시세 미연동 (교육용 가상 모형 자산)',
    officialSourceName: '금융감독원 전자공시(DART) / SEC EDGAR 확인 필요',
    officialSourceUrl: 'https://dart.fss.or.kr',
    qualityCriteria: QUALITY_STOCK_CRITERIA,
    overlapNote: 'S&P500 또는 KOSPI200 ETF를 이미 보유한 상태에서 대표 대형주를 추가하면 해당 기업 비중이 과도하게 커질 수 있습니다.',
    supportedStyles: ['buffett', 'lynch', 'druckenmiller'],
  },
];
