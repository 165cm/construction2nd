// 収録年度・過去問マスターリスト
export const EXAM_LIST = [
  {
    id: 'r8_1',
    name: '令和8年度 上期',
    badge: '令8上',
    year: '令和8年',
    season: '上期',
    examDate: '2026年5月実施',
    questionCount: 50,
    isFree: true,
    pageDir: '/pages',
    floorPlanPage: 15
  },
  {
    id: 'r6_2',
    name: '令和6年度 下期',
    badge: '令6下',
    year: '令和6年',
    season: '下期',
    examDate: '2024年10月27日実施',
    questionCount: 50,
    isFree: true,
    pageDir: '/pages/r6_2',
    floorPlanPage: 15
  },
  {
    id: 'r6_1',
    name: '令和6年度 上期',
    badge: '令6上',
    year: '令和6年',
    season: '上期',
    examDate: '2024年5月26日実施',
    questionCount: 50,
    isFree: true,
    pageDir: '/pages/r6_1',
    floorPlanPage: 15
  }
];

export const DEFAULT_EXAM_ID = 'r8_1';
