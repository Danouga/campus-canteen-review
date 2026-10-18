# 消息中心：已准备的发布输入（2026-10-18）

职责：Codex 已完成工具核查、打包和测试。WorkBuddy 仅执行以下部署及上线验收，不承担代码或发布方案研究。

## 固定输入

- 发布目录：`D:\code\食堂评价\.deploy\release-JMiIY2`
- 清单：该目录 `release-manifest.json`；消息中心六文件同时符合 `.workbuddy/message-center-release.json`。
- 目标 appId：`wbapp_mkles2WxzoQkUIOuWS1250`
- 原 sandboxId：`6c1cfd6082b34593887da1e6ca3e3b2d`
- 原部署 conversationId：`2110008461911973888`
- 地址：`https://shijian-canteen.app.workbuddy.host/`
- 启动：`node scripts/deploy-start.mjs`
- 安装：`npm install --omit=dev --ignore-scripts`

## Codex 核查结论与证据边界

核查对象为本机 `D:\WorkBuddy\resources\app.asar` 的 `main/server.js` 和 `main/runtime-handlers.js`，没有修改 WorkBuddy 安装代码、内部部署记录或认证配置，也没有直接调用私有云端接口。

1. `findDeployApplication` 在目录没有历史时，读取工作区 `.workbuddy/applications.yaml`，选择匹配 `preferredAppId` 的应用。桥接工作区现有清单包含原 appId；发布包中也只提供该应用的标准清单。工具最终将选择的 appId 传入 `deploySite`。
2. `findDeployDestination` 对明确 appId 调用 `findDeployRecordByAppId`，从已有记录中选择原沙箱，不只按目录定位。因此“换目录必然新建应用”不适用于这个已绑定清单、显式指定已有 appId 的情形。
3. `deployApplication` 有原记录时调用 `connectReusedSandbox`；连接失败会拒绝新建回退。部署执行仍须验证实际返回身份。
4. `installAndStartApp` 在 `/workspace` 使用 `tar -xzf` 覆盖解压，没有先清空工作目录。未随包发送的原 `.env.local`、JSON 和媒体文件不会被这条解压命令删除。
5. `deploy-start.mjs` 在导入服务器之前验证原鉴权/邮件配置、管理员、业务状态与媒体文件，缺失则退出，不初始化空库、不恢复种子、不生成凭据。

隔离 VM 验证记录：`.workbuddy/deployment-source-verification.json`。其中执行的是读取出的原选择函数，以核对过的本地应用元数据作为替身；不等于云端部署验证。另已实际运行本机 tar 对临时假配置/假数据做覆盖解压，原文件保持不变。

## 已完成的本地工作

- 白名单打包：不含 `.env.local`、备份、缓存、`.git`、本地数据、种子、媒体、文档或测试。
- 每次创建全新目录，不删除旧目录，不移动工作区文件。
- `node tests/deployment-package.mjs`：排除敏感文件、模板非空密钥拦截、已有输出保留、模拟覆盖后配置/数据保留、空环境/缺少配置/缺少媒体拒绝启动。
- 实际 tar 临时文件测试通过；`npm run check`、消息中心测试、`git diff --check` 通过。

## WorkBuddy 执行步骤

按标准 `workbuddy_sites_deploy` 调用：action=`deploy`，directory=上述固定目录，appId=上述原 appId，language=`node`，port=`4173`，appName=`食间 · 校园食堂共建网站`，domainPrefix=`shijian-canteen`，installCmd/startCmd=上述值。已有发布授权按任务书执行，不把此文档单独当授权来源。

禁止改用原工作区整目录上传，禁止新建应用、重建沙箱、上传密钥或种子、删除/重置数据、修改密码、发真实邮件、操作用户真实消息或票、修改业务代码或 Git。工具失败时只报告具体错误，不自行切换方案。

部署后核对：地址和沙箱身份、首页/API 存活、线上 JS/CSS/Repository 哈希、后端已加载消息 API；只读比较数据规模（允许真实用户自然变化，不把数量相等当完整性证明）。用户登录后的消息写入流程已有本地隔离测试，线上不代用户标已读。报告区分实际验收与未验收项。

## 执行结果

2026-10-18 WorkBuddy 任务 `8b74ffe1-0c5f-4835-93d9-b3f6dba7694e` 已回传部署成功：实际返回原 sandboxId 与原链接，使用本计划的干净目录和启动命令。该路径已有一次真实部署记录，不应再沿用“换目录必然新建应用”的旧判断；后续仍须核对明确 appId、应用清单、原历史及返回身份。

Codex 独立只读复核：首页与 `/api/status` 均 200，文件存储 connected=true；线上四个公开运行文件哈希与发布包一致，证据见 `.workbuddy/message-center-live-verification.json`。登录后的实际用户写入交互未代为验收；其本地隔离测试已通过。WorkBuddy 回报数据规模保持一致，这不等同于逐条完整性校验。

原配置仍留在原沙箱，未迁移到平台环境变量。原沙箱灾备和平台级密钥配置是后续独立事项。
