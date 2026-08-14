# 迭代15 · 侧滑抽屉/详情头部 全域排查清单

复现样本：成都眸视科技有限公司（P0 · 3 个意图标签 · 状态"已约见"）。用户真机截图两次复现头部叠压穿透；开发环境常规截图不复现。

## 一、根因结论

| # | 根因 | 判定 | 处置 |
|---|---|---|---|
| **R0** | **模板全局样式 `.flex { min-height: 0 }`（vite 模板自定义默认）× SheetContent 为 `flex flex-col` 固定高容器：当抽屉内容总高超过视口时，SheetHeader 以默认 `flex-shrink:1 + min-height:0` 被压缩至 16px（实测），其内部标题/徽章/元信息行被压扁为 0 高互相叠压穿透** | **真根因（量化实证）** | **公共层根治：SheetHeader 加 `flex-none` 禁止参与收缩（sheet.tsx，所有 Sheet 受益）** |
| R1 | SheetTitle 内 inline/align-middle 混排：企业名与徽章同一行盒，真机字体回退/行高差异下折行行盒与后续兄弟行基线交叠 | **主因（真实布局）** | Header 重构为纯块级 Flex 文档流，废除 inline 混排 |
| R2 | SheetContent 开启 transform 滑入动画（slide-in-from-right），移动端滚动截屏工具在动画/合成帧上拼接 fixed 容器，产生多行重复叠印伪影（用户截图带"停止滚动"浮层，为滚动截屏场景） | **叠加因（截屏伪影）** | 移动端(<sm)禁用 transform 动画改纯 fade 200ms，桌面保留滑入 |
| R3 | 移动端 Safari 字体自动放大（text-size-adjust）导致行盒计算与桌面不一致 | 预防性 | html 全局收敛 -webkit-text-size-adjust: 100% |
| R4 | Tab 栏与 Header 同容器且用 -mb-px 负边距压线 | 次要 | Tab 栏与 SheetHeader 解耦为独立块级行，固定在头部下方，overflow-x-auto 防窄屏挤压 |

## 二、重构后 Header 结构（硬性约束落地）

```
SheetContent (flex flex-col，容器自适应高度)
 ├─ SheetHeader (flex flex-col gap-1.5，无固定高度)
 │   ├─ 行1 SheetTitle：企业名（block · break-words 可折行）
 │   ├─ 行2 徽章行：Tier + 状态 + 意图标签（flex flex-wrap 自动换行）
 │   └─ 行3 元信息行：楼层/房间/行业/性质/EID（leading-relaxed break-words）
 ├─ Tab 栏（独立块级行 · 与 Header 解耦 · border-b · overflow-x-auto · 按钮 whitespace-nowrap flex-none）
 └─ Tab 内容区
```

无 absolute / 无负 margin（Tab 激活下划线 -mb-px 仅作用于按钮自身 border，不影响兄弟流）/ 无 inline 混排。

## 三、全域同源组件排查

| 组件 | 类型 | 排查结果 | 处置 |
|---|---|---|---|
| EntityDrawer（企业360） | Sheet 右滑抽屉 | 叠压主现场：SheetTitle inline 混排 + Tab 同容器 | **已重构**（块级分行 + Tab 解耦） |
| ExplainSheet（七问弹层） | Sheet 右滑抽屉 | SheetTitle 用 flex+icon 混排，长企业名折行风险同源 | **已同规格加固**（块级分行） |
| sheet.tsx（公共组件） | Radix Sheet 封装 | SheetContent transform 滑入动画为截屏伪影源 | **移动端改纯 fade**（公共层根治，所有 Sheet 受益） |
| IntelParseDialog（AI解析） | 自绘 fixed 全屏对话框 | 头部为单行 flex（标题+关闭钮），无混排，无叠压路径 | 无需修改 |
| IntelBatchDialog（批量解析） | 自绘 fixed 全屏对话框 | 同上 | 无需修改 |
| AiPanel（AI 助手侧栏） | 自绘 fixed 侧栏 | 头部单行 flex，无混排 | 无需修改 |
| Rules.tsx 影响预览弹窗 | 自绘 fixed 居中弹窗 | 头部单行 flex；无 transform 动画 | 无需修改 |
| dialog.tsx（公共 Dialog） | Radix Dialog 封装 | DialogContent 为 **grid** 布局（非 flex），grid 行默认 `min-height:auto` 不收缩，DialogHeader 无压缩隐患 | 无需修改（结构性免疫） |
| ScreenLayout 移动端抽屉导航 | 自绘 fixed 左滑抽屉 | 有 translateX 动画（200ms 一次性入场），导航项均块级行，无叠压路径；截屏伪影风险低（非长内容滚动区） | 保留观察 |
| ResourceAdmin 表单卡 | 页面内 grid 表单 | 块级 grid，无叠压路径 | 无需修改 |

## 四、边界场景回归清单

| 场景 | 验证方式 | 结果 |
|---|---|---|
| 量化叠压检测（修复前） | JS 量测：headerH=16px，徽章行 h=0，Tab top=24 < 标题 bottom=41，重叠 2 处 | 复现成功 |
| 量化叠压检测（修复后） | JS 量测：headerH=92px，四行 top/bottom 严格递增（16-41 / 47-69 / 75-92 / 100-132），重叠 0 处 | **通过** |
| 长企业名（≥15字）+ 3 意图标签 | 眸视科技/中科维讯 桌面+375px 截图 | 分行正常，无叠压 |
| 多标签折行（P0+已约见+3意图） | 375px 窄视口 | flex-wrap 自动换行 |
| Tab 栏窄屏挤压 | 375px（决策/信号流/证据/历史/为什么 5 项） | overflow-x-auto 横滑，无换行叠压 |
| 双主题 | ?theme=light / dark 截图 | 正常 |
| 大屏模式（font-size 118%） | B 键启停后打开抽屉 | 容器自适应高度，正常 |
| 路演模式（深色锁定） | 打开抽屉 | 正常 |
| 移动端滚动截屏伪影 | SheetContent 移动端已无 transform 动画（根源消除） | 待用户真机复核 |

回归测试：vitest 全量通过；生产构建通过。
