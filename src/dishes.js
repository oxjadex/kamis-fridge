export const DISHES = [
  {
    id: "kimchi-jjigae", name: "김치찌개 백반", cat: "찌개", out: "kimchi",
    items: [["napa", 150], ["chili-powder", 4], ["garlic", 4], ["pork-shoulder", 70], ["onion", 30], ["scallion", 15], ["cheongyang", 5], ["rice", 90]],
    extra: ["두부", "기본 양념"],
    alt: { "pork-shoulder": ["pork-neck", "import-pork-belly", "pork-belly"] },
    note: "김치는 배추 · 고춧가루 · 마늘로 환산"
  },
  {
    id: "doenjang-jjigae", name: "된장찌개 백반", cat: "찌개",
    items: [["zucchini", 70], ["potato", 60], ["onion", 30], ["enoki", 40], ["cheongyang", 5], ["scallion", 10], ["rice", 90]],
    extra: ["두부", "된장"],
    alt: { enoki: ["king-oyster", "oyster-mushroom"], zucchini: ["napa", "radish"] }
  },
  {
    id: "jeyuk", name: "제육볶음 백반", cat: "고기",
    items: [["pork-shoulder", 150], ["onion", 60], ["cabbage", 40], ["carrot", 20], ["scallion", 20], ["chili-powder", 5], ["garlic", 6], ["rice", 90]],
    extra: ["고추장", "기본 양념"],
    alt: { "pork-shoulder": ["pork-neck", "import-pork-belly"], cabbage: ["napa", "zucchini"] }
  },
  {
    id: "samgyeopsal", name: "삼겹살 200g 구이", cat: "고기", out: "samgyeopsal",
    items: [["pork-belly", 200], ["lettuce", 60], ["perilla", 10], ["garlic", 20], ["cheongyang", 10], ["scallion", 20]],
    extra: ["쌈장"],
    alt: { "pork-belly": ["import-pork-belly", "pork-neck"], lettuce: ["perilla", "cabbage"] }
  },
  {
    id: "dakbokkeum", name: "닭볶음탕", cat: "고기",
    items: [["chicken", 250], ["potato", 100], ["carrot", 40], ["onion", 60], ["scallion", 20], ["chili-powder", 6], ["garlic", 8], ["cheongyang", 5]],
    extra: ["고추장", "간장"],
    alt: { potato: ["sweet-potato", "radish"] }
  },
  {
    id: "samgyetang", name: "삼계탕", cat: "고기", out: "samgyetang",
    items: [["chicken", 400], ["sticky-rice", 40], ["garlic", 15], ["scallion", 10]],
    extra: ["인삼", "대추"],
    alt: {}
  },
  {
    id: "bulgogi", name: "소불고기 백반", cat: "고기",
    items: [["beef-round", 150], ["onion", 50], ["carrot", 20], ["scallion", 15], ["king-oyster", 40], ["garlic", 5], ["rice", 90]],
    extra: ["간장", "설탕"],
    alt: { "beef-round": ["import-beef-rib", "pork-shoulder"], "king-oyster": ["oyster-mushroom", "enoki"] }
  },
  {
    id: "bibimbap", name: "비빔밥", cat: "밥", out: "bibimbap",
    items: [["rice", 90], ["spinach", 40], ["carrot", 25], ["zucchini", 40], ["beef-round", 30], ["egg30", 50]],
    extra: ["콩나물", "고추장", "참기름"],
    alt: { spinach: ["lettuce", "perilla"], "beef-round": ["pork-shoulder"] }
  },
  {
    id: "gimbap", name: "김밥 1줄", cat: "밥", out: "gimbap",
    items: [["rice", 80], ["gim", 2.3], ["egg30", 30], ["spinach", 30], ["carrot", 20]],
    extra: ["단무지", "햄", "어묵"],
    alt: { spinach: ["cucumber", "perilla"] }
  },
  {
    id: "curry", name: "카레라이스", cat: "밥",
    items: [["pork-shoulder", 60], ["potato", 80], ["carrot", 40], ["onion", 70], ["rice", 90]],
    extra: ["카레 가루"],
    alt: { "pork-shoulder": ["chicken", "import-pork-belly"], potato: ["sweet-potato"] }
  },
  {
    id: "egg-fried-rice", name: "계란볶음밥", cat: "밥",
    items: [["rice", 90], ["egg30", 100], ["scallion", 25], ["carrot", 20], ["onion", 30]],
    extra: ["식용유", "간장"],
    alt: { carrot: ["paprika", "zucchini"] }
  },
  {
    id: "mackerel", name: "고등어구이 백반", cat: "생선",
    items: [["mackerel", 150], ["rice", 90]],
    extra: ["소금"],
    alt: { mackerel: ["spanish-mackerel", "hairtail", "pollock"] }
  },
  {
    id: "galchi-jorim", name: "갈치조림 백반", cat: "생선",
    items: [["hairtail", 200], ["radish", 120], ["onion", 30], ["scallion", 10], ["cheongyang", 5], ["chili-powder", 5], ["garlic", 5], ["rice", 90]],
    extra: ["간장"],
    alt: { hairtail: ["mackerel", "pollock"], radish: ["potato"] }
  },
  {
    id: "squid", name: "오징어볶음 백반", cat: "생선",
    items: [["squid", 150], ["onion", 50], ["cabbage", 50], ["carrot", 20], ["scallion", 15], ["chili-powder", 6], ["garlic", 6], ["cheongyang", 5], ["rice", 90]],
    extra: ["고추장"],
    alt: { squid: ["shrimp", "mussel"], cabbage: ["napa", "zucchini"] }
  },
  {
    id: "miyeokguk", name: "소고기 미역국 백반", cat: "국",
    items: [["beef-brisket", 50], ["garlic", 5], ["rice", 90]],
    extra: ["미역", "국간장"],
    alt: { "beef-brisket": ["mussel", "clam"] }
  },
  {
    id: "rolled-egg", name: "계란말이 (반찬)", cat: "반찬",
    items: [["egg30", 160], ["scallion", 10], ["carrot", 15]],
    extra: ["식용유"],
    alt: {}
  },
  {
    id: "spinach-namul", name: "시금치나물 (반찬)", cat: "반찬",
    items: [["spinach", 100], ["garlic", 3]],
    extra: ["참기름", "깨"],
    alt: { spinach: ["perilla", "dropwort"] }
  },
  {
    id: "potato-jorim", name: "감자조림 (반찬)", cat: "반찬",
    items: [["potato", 150], ["onion", 20], ["carrot", 15]],
    extra: ["간장", "물엿"],
    alt: { potato: ["sweet-potato", "radish"] }
  },
  {
    id: "geotjeori", name: "배추겉절이 (반찬)", cat: "반찬",
    items: [["napa", 300], ["chili-powder", 10], ["garlic", 8], ["jjokpa", 20]],
    extra: ["액젓", "설탕"],
    alt: { napa: ["baby-napa", "young-napa", "lettuce"] }
  },
  {
    id: "kimjang", name: "김장 (4인 가족, 배추 20포기)", cat: "김장", serves: 1,
    items: [["napa", 48000], ["radish", 15000], ["chili-powder", 1860], ["garlic", 1200], ["scallion", 2000], ["jjokpa", 2400], ["ginger", 120], ["dropwort", 2000]],
    extra: ["갓", "굴", "멸치액젓", "새우젓", "천일염"],
    alt: {},
    note: "재료량은 4인 가족 김장 레시피 기준 추정. 갓 · 굴 · 젓갈 · 소금은 KAMIS 소매가 조사 품목이 아니라 빠져요"
  }
];

export const CATS = ["찌개", "고기", "밥", "생선", "국", "반찬", "김장"];
