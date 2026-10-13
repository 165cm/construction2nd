// Default crop configurations (coordinates based on 1661 x 2267 full page resolution)

export const DEFAULT_CROPS = {
  1: { page: 5, filename: 'q1_diagram.png', x: 200, y: 390, w: 480, h: 260, label: '問1 回路図' },
  4: { page: 5, filename: 'q4_diagram.png', x: 200, y: 1260, w: 480, h: 280, label: '問4 交流回路図' },
  5: { page: 5, filename: 'q5_diagram.png', x: 180, y: 1680, w: 500, h: 350, label: '問5 三相回路図' },
  6: { page: 6, filename: 'q6_diagram.png', x: 200, y: 380, w: 480, h: 270, label: '問6 電圧降下回路図' },
  7: { page: 6, filename: 'q7_diagram.png', x: 200, y: 950, w: 480, h: 300, label: '問7 単相3線回路図' },
  9: { page: 6, filename: 'q9_diagram.png', x: 200, y: 1720, w: 480, h: 300, label: '問9 幹線回路図' },
  10: { page: 7, filename: 'q10_choices.png', x: 680, y: 230, w: 800, h: 340, label: '問10 選択肢図(分岐回路)' },
  16: { page: 8, filename: 'q16_photo.png', x: 200, y: 180, w: 480, h: 400, label: '問16 材料写真' },
  17: { page: 8, filename: 'q17_photo.png', x: 200, y: 640, w: 480, h: 360, label: '問17 材料写真' },
  18: { page: 8, filename: 'q18_photo.png', x: 200, y: 1040, w: 480, h: 350, label: '問18 工具写真' },
  27: { page: 10, filename: 'q27_choices.png', x: 680, y: 600, w: 800, h: 250, label: '問27 選択肢図(クランプ)' },
  'floor_plan': { page: 15, filename: 'floor_plan.png', x: 200, y: 100, w: 1300, h: 1400, label: '配線図: 平面図' },
  'panel_schedule': { page: 15, filename: 'panel_schedule.png', x: 200, y: 1500, w: 1300, h: 700, label: '配線図: 分電盤結線図' },
};
