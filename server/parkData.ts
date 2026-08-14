/* 园区主数据种子（L0 名录，源自楼层索引实景采录 2026-07）。
   仅静态事实字段 + 演示口径信号；评分/分级/排序一律由规则引擎计算，禁止在此硬编码分数。 */

export interface SeedSignal {
  t: string;
  tier: 1 | 2;
  d: string;
}

export interface SeedEntity {
  eid: string;
  name: string;
  floor: string;
  room: string;
  ind: string;
  nature: string;
  cross?: boolean;
  tierRole?: "operator" | "support";
  hiringBase: "高" | "中高" | "中" | "低" | "无";
  note?: string;
  referralPath?: "A" | "B" | "C" | "D";
  entryPoint?: string;
  signals: SeedSignal[];
  /** 名录期人工基准分（作为规则引擎 baseScore 输入之一，可被富集数据修正） */
  baseScore: number;
}

export const PARK_SEED: SeedEntity[] = [
  { eid: "E703", name: "成都眸视科技有限公司", floor: "7F", room: "703-713", ind: "AI", nature: "民企", hiringBase: "高", baseScore: 88, note: "计算机视觉，规模招聘", referralPath: "B", entryPoint: "算法团队规模化 + 实习生转化", signals: [{ t: "独占6间/扩租", tier: 1, d: "2026-06-30" }, { t: "批量招聘(CV/算法)", tier: 2, d: "2026-07-18" }] },
  { eid: "E106", name: "四川中科维讯智能科技有限公司", floor: "1F/8F", room: "106/803", ind: "AI", nature: "民企", cross: true, hiringBase: "高", baseScore: 84, note: "跨楼层=扩张信号", referralPath: "B", entryPoint: "技术批量 + 高管猎聘", signals: [{ t: "跨楼层扩张", tier: 1, d: "2026-07-12" }, { t: "招聘高管(算法负责人)", tier: 1, d: "2026-07-20" }] },
  { eid: "E1301", name: "北京富通东方科技有限公司", floor: "13F", room: "1301-1304", ind: "软件", nature: "民企/上市系", hiringBase: "高", baseScore: 81, note: "信息安全，区域中心", referralPath: "B", entryPoint: "安全工程师 + 本地团队组建", signals: [{ t: "异地设点(独占4间)", tier: 1, d: "2026-06-15" }, { t: "安全工程师招聘", tier: 2, d: "2026-07-11" }] },
  { eid: "E515", name: "成都智汇广联科技有限公司", floor: "5F/10F", room: "1001-1007", ind: "软件", nature: "民企", cross: true, hiringBase: "高", baseScore: 80, note: "跨楼层规模信号强", referralPath: "B", entryPoint: "研发招聘 + 信软实习管道", signals: [{ t: "跨楼层扩张", tier: 1, d: "2026-05-22" }, { t: "研发批量招聘", tier: 2, d: "2026-07-10" }] },
  { eid: "E411", name: "成都成电金盘健康数据技术有限公司", floor: "4F", room: "411", ind: "AI", nature: "民企", hiringBase: "高", baseScore: 79, note: "健康高敏感数据·成电系", referralPath: "A", entryPoint: "数据人才 + 校企认同", signals: [{ t: "数据/算法招聘", tier: 2, d: "2026-07-08" }] },
  { eid: "E1210", name: "成都众信至诚软件开发有限公司", floor: "12F", room: "1210/1212/1214", ind: "软件", nature: "民企", hiringBase: "高", baseScore: 78, note: "信软学院管道高度对口", referralPath: "B", entryPoint: "程序员批量供给 + 实习转化", signals: [{ t: "软件开发批量招聘", tier: 2, d: "2026-07-15" }] },
  { eid: "E805", name: "成都茂扬电子科技股份有限公司", floor: "8F", room: "805", ind: "其他", nature: "民企(股份)", hiringBase: "高", baseScore: 77, note: "资本化，高管需求", referralPath: "B", entryPoint: "高管猎聘 + 技术扩编", signals: [{ t: "股改完成", tier: 1, d: "2026-05-30" }, { t: "招聘职业经理人", tier: 1, d: "2026-07-05" }] },
  { eid: "E509", name: "成都芯莱电子科技有限公司", floor: "5F", room: "509", ind: "芯片", nature: "民企", hiringBase: "中高", baseScore: 72, note: "微电子对口", referralPath: "B", signals: [{ t: "IC设计人才招聘", tier: 2, d: "2026-07-02" }] },
  { eid: "E1306", name: "中国移动通信集团四川有限公司成都分公司", floor: "13F", room: "1306", ind: "通信", nature: "央企", hiringBase: "中", baseScore: 71, note: "关键基础设施·校招大户", referralPath: "A", signals: [{ t: "校招合作", tier: 2, d: "2026-06-10" }] },
  { eid: "E1314", name: "成都智芯测控科技有限公司", floor: "13F", room: "1314/1315", ind: "检测", nature: "民企", hiringBase: "中高", baseScore: 70, note: "工业/国防相邻", referralPath: "B", signals: [{ t: "嵌入式/测控招聘", tier: 2, d: "2026-06-28" }] },
  { eid: "E412", name: "成都盛纲人工智能研究院", floor: "4F", room: "412-415", ind: "AI", nature: "研究机构", hiringBase: "中高", baseScore: 69, note: "技术共建/实习基地", referralPath: "A", signals: [{ t: "研究型AI人才", tier: 2, d: "2026-06-20" }] },
  { eid: "E1311", name: "四川省中认信安技术服务有限公司", floor: "13F", room: "1311/1313", ind: "检测", nature: "认证机构", hiringBase: "中", baseScore: 69, note: "信息安全·进政府渠道", referralPath: "B", signals: [] },
  { eid: "E1009", name: "赛尔网络有限公司四川分公司", floor: "10F", room: "1009-1015", ind: "通信", nature: "国资(CERNET)", hiringBase: "中", baseScore: 68, note: "教育网骨干", referralPath: "A", signals: [] },
  { eid: "E111", name: "成都北斗天线工程技术有限公司", floor: "1F", room: "111", ind: "通信", nature: "民企", hiringBase: "中", baseScore: 67, note: "导航/国防相邻", referralPath: "B", signals: [{ t: "射频工程师招聘", tier: 2, d: "2026-07-01" }] },
  { eid: "E102", name: "电子科技大学(深圳)高等研究院", floor: "1F", room: "102", ind: "教育", nature: "科研院所", hiringBase: "中", baseScore: 67, note: "生态锚点·校企", referralPath: "A", signals: [] },
  { eid: "E604", name: "成都鑫泽智创信息科技有限公司", floor: "6F", room: "604", ind: "软件", nature: "民企", hiringBase: "中", baseScore: 66, referralPath: "B", signals: [{ t: "研发招聘", tier: 2, d: "2026-06-25" }] },
  { eid: "E115", name: "交通银行股份有限公司四川省分行", floor: "1F", room: "115", ind: "金融", nature: "国有银行", hiringBase: "中", baseScore: 66, note: "高敏感数据·风控决策", referralPath: "A", signals: [{ t: "金融科技校招", tier: 2, d: "2026-06-12" }] },
  { eid: "E712", name: "成都中科云集信息技术有限公司", floor: "7F", room: "712", ind: "软件", nature: "民企", hiringBase: "中", baseScore: 65, note: "中科系", referralPath: "B", signals: [{ t: "云研发招聘", tier: 2, d: "2026-06-18" }] },
  { eid: "E504", name: "成都云创新科技有限公司", floor: "5F", room: "504", ind: "软件", nature: "民企", hiringBase: "中", baseScore: 64, referralPath: "B", signals: [] },
  { eid: "E804", name: "四川百事泰能源科技有限公司", floor: "8F", room: "804", ind: "新能源", nature: "民企", hiringBase: "中", baseScore: 64, note: "关键行业-能源", referralPath: "B", signals: [] },
  { eid: "E615", name: "成都中实视讯科技有限公司", floor: "6F", room: "615", ind: "通信", nature: "民企", hiringBase: "中", baseScore: 63, note: "音视频", referralPath: "B", signals: [] },
  { eid: "E811", name: "四川思创远卓律师事务所", floor: "8F", room: "811", ind: "企服", nature: "律所", hiringBase: "低", baseScore: 61, note: "合规伙伴", referralPath: "D", signals: [] },
  { eid: "E605", name: "成都新型显示行业协会", floor: "6F", room: "605", ind: "其他", nature: "协会", hiringBase: "低", baseScore: 60, note: "一对多渠道", referralPath: "C", signals: [] },
  { eid: "E1107", name: "四川财源天下企业管理咨询服务有限公司", floor: "11F", room: "1107/1109", ind: "企服", nature: "民企", hiringBase: "低", baseScore: 60, note: "竞合/分包", referralPath: "D", signals: [] },
  { eid: "E1310", name: "四川亚和企业咨询管理有限公司", floor: "13F", room: "1310/1312", ind: "企服", nature: "民企", hiringBase: "低", baseScore: 60, note: "竞合/分包", referralPath: "D", signals: [] },
  { eid: "E9B", name: "新闻出版总署融合出版实验室分室", floor: "9F", room: "—", ind: "教育", nature: "事业单位", hiringBase: "低", baseScore: 60, note: "政府侧场景", referralPath: "A", signals: [] },
  { eid: "E510", name: "博库菁英(成都)信息技术有限公司", floor: "5F", room: "510", ind: "软件", nature: "民企", hiringBase: "中", baseScore: 55, signals: [] },
  { eid: "E511", name: "成都创联互动信息技术有限公司", floor: "5F", room: "511", ind: "软件", nature: "民企", hiringBase: "中", baseScore: 54, signals: [] },
  { eid: "E607", name: "成都大佳赢信息技术有限公司", floor: "6F", room: "607", ind: "软件", nature: "民企", hiringBase: "中", baseScore: 53, signals: [] },
  { eid: "E701", name: "成都垠际信息技术有限公司", floor: "7F", room: "701", ind: "软件", nature: "民企", hiringBase: "中", baseScore: 53, signals: [] },
  { eid: "E1205", name: "四川绮梦云数字科技有限公司", floor: "12F", room: "1205", ind: "软件", nature: "民企", hiringBase: "中", baseScore: 52, signals: [] },
  { eid: "E114", name: "成都锦途教育信息咨询有限公司", floor: "1F/5F", room: "114/501-507", ind: "教育", nature: "民企", cross: true, hiringBase: "中", baseScore: 52, note: "跨楼层", signals: [] },
  { eid: "E810", name: "四川好思享教育科技有限公司", floor: "8F", room: "810/812/814", ind: "教育", nature: "民企", hiringBase: "中", baseScore: 51, note: "多房间", signals: [] },
  { eid: "E809", name: "四川卓越致诚教育管理有限公司", floor: "8F", room: "809", ind: "教育", nature: "民企", hiringBase: "中", baseScore: 50, signals: [] },
  { eid: "E201", name: "成都市科园职业技能培训学校有限公司", floor: "2F", room: "201-215", ind: "教育", nature: "民办教育", hiringBase: "中", baseScore: 49, note: "职培·可作培训供给伙伴", signals: [] },
  { eid: "E506", name: "成都一厘教育科技有限公司", floor: "5F", room: "506", ind: "教育", nature: "民企", hiringBase: "低", baseScore: 48, signals: [] },
  { eid: "E609", name: "成都嘉德诺得教育咨询有限公司", floor: "6F", room: "609/611", ind: "教育", nature: "民企", hiringBase: "低", baseScore: 47, signals: [] },
  { eid: "E304", name: "成都点睛专利代理事务所(普通合伙)", floor: "3F", room: "304", ind: "企服", nature: "合伙", hiringBase: "低", baseScore: 44, note: "知产·转介网络", referralPath: "D", signals: [] },
  { eid: "E9A", name: "成都电子科大出版社有限责任公司", floor: "9F", room: "—", ind: "其他", nature: "校办", hiringBase: "低", baseScore: 43, note: "电子科大系", referralPath: "A", signals: [] },
  { eid: "E1110", name: "成都虹盛汇泉专利代理有限公司", floor: "11F", room: "1110", ind: "企服", nature: "民企", hiringBase: "低", baseScore: 43, note: "知产·转介网络", referralPath: "D", signals: [] },
  { eid: "E303", name: "成都中浚电子科技有限公司", floor: "3F", room: "303", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 42, signals: [] },
  { eid: "E1101", name: "电子元件与材料杂志社", floor: "11F", room: "1101", ind: "其他", nature: "事业单位", hiringBase: "低", baseScore: 42, note: "学术期刊", signals: [] },
  { eid: "E409", name: "四川神网光泰科技有限公司", floor: "4F", room: "409", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 41, signals: [] },
  { eid: "E801", name: "成都华讯美光科技有限公司", floor: "8F", room: "801", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 41, signals: [] },
  { eid: "E610", name: "成都北英电子技术有限公司", floor: "6F", room: "610/612", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 41, signals: [] },
  { eid: "E806", name: "成都承电高维科技有限责任公司", floor: "8F", room: "806", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 40, signals: [] },
  { eid: "E1108", name: "成都川天铖工程技术有限公司", floor: "11F", room: "1108", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 40, note: "待核验(牌面遮挡)", signals: [] },
  { eid: "E305", name: "四川众星领航科技发展有限公司", floor: "3F", room: "305", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 38, signals: [] },
  { eid: "E513", name: "成都英思腾科技有限公司", floor: "5F", room: "513", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 38, signals: [] },
  { eid: "E603", name: "成都市海意橙丰科技有限责任公司", floor: "6F", room: "603", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 38, signals: [] },
  { eid: "E802", name: "成都市创时博宏科技有限公司", floor: "8F", room: "802", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 38, signals: [] },
  { eid: "E1102", name: "四川鸣鸿科技有限公司", floor: "11F", room: "1102/1104/1106", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 38, signals: [] },
  { eid: "E1201", name: "回响星辰(成都)科技有限责任公司", floor: "12F", room: "1201/1204/1206", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 38, signals: [] },
  { eid: "E307", name: "成都吉纬科技有限公司", floor: "3F", room: "307/309", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 37, signals: [] },
  { eid: "E601", name: "成都众志建华科技有限公司", floor: "6F", room: "601", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 37, signals: [] },
  { eid: "E602", name: "成都捷众科技有限公司", floor: "6F", room: "602", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 37, signals: [] },
  { eid: "E606", name: "成都峻之川科技有限公司", floor: "6F", room: "606", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 37, signals: [] },
  { eid: "E813", name: "四川智王科技有限公司", floor: "8F", room: "813/815", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 37, signals: [] },
  { eid: "E1105", name: "成都仁创新维科技有限公司", floor: "11F", room: "1105", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 37, signals: [] },
  { eid: "E1111", name: "成都市金明星科技有限公司", floor: "11F", room: "1111", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 37, signals: [] },
  { eid: "E302", name: "成都劳人心理咨询有限公司", floor: "3F", room: "302", ind: "企服", nature: "民企", hiringBase: "低", baseScore: 36, note: "EAP可并入HR菜单", referralPath: "D", signals: [] },
  { eid: "E715", name: "成都种慧创智科技服务有限公司", floor: "7F", room: "715", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 36, signals: [] },
  { eid: "E1113", name: "四川臻炉科技有限公司", floor: "11F", room: "1113", ind: "其他", nature: "民企", hiringBase: "低", baseScore: 36, signals: [] },
  { eid: "E9C", name: "数字出版分社", floor: "9F", room: "—", ind: "其他", nature: "出版", hiringBase: "低", baseScore: 32, signals: [] },
  { eid: "E401", name: "电子科大科技园股份有限公司", floor: "4F", room: "401-407", ind: "园区", nature: "国资/校企", tierRole: "operator", hiringBase: "中", baseScore: 0, note: "园区运营方(锚点)", referralPath: "A", entryPoint: "园区人才数字化平台（方向一锚点客户）", signals: [] },
  { eid: "E112", name: "概念验证中心", floor: "1F", room: "112", ind: "园区", nature: "配套", tierRole: "support", hiringBase: "低", baseScore: 0, note: "科技转化平台", signals: [] },
  { eid: "E104", name: "蓝色工坊(学生实习实训中心)", floor: "1F", room: "104/107", ind: "教育", nature: "实训", tierRole: "support", hiringBase: "低", baseScore: 0, note: "实训供给转化场景", signals: [] },
  { eid: "E101", name: "共享路演室", floor: "1F", room: "101/103", ind: "园区", nature: "配套", tierRole: "support", hiringBase: "低", baseScore: 0, note: "公共空间", signals: [] },
  { eid: "E105", name: "监控室/物业服务中心", floor: "1F", room: "105", ind: "园区", nature: "物业", tierRole: "support", hiringBase: "低", baseScore: 0, note: "配套", signals: [] },
];
