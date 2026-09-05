import fs from 'node:fs'
import path from 'node:path'

const repo = process.env.TARGET_REPO

if (!repo) {
  throw new Error('TARGET_REPO is required')
}

const env = process.env

const required = [
  'PROJECT_KEY',
  'PACKAGE_NAME',
  'MANIFEST_NAME',
  'DESCRIPTION',
  'MP_WEIXIN_APPID',
  'NAVIGATION_TITLE',
  'COPYRIGHT_TEXT',
  'CONTACT_PHONE_TEXT',
  'CONTACT_QR_SRC',
  'PRICE_FALLBACK_TITLE',
  'API_BASE_URL',
  'MINI_APP_NAME'
]

for (const key of required) {
  if (env[key] == null || env[key] === '') {
    throw new Error(`${key} is required in profile`)
  }
}

function filePath(relativePath) {
  return path.join(repo, relativePath)
}

function read(relativePath) {
  return fs.readFileSync(filePath(relativePath), 'utf8')
}

function writeIfChanged(relativePath, content) {
  const target = filePath(relativePath)
  const previous = fs.readFileSync(target, 'utf8')
  if (previous !== content) {
    fs.writeFileSync(target, content)
    console.log(`updated ${relativePath}`)
  }
}

function replaceText(relativePath, replacements) {
  let content = read(relativePath)
  for (const [pattern, replacement] of replacements) {
    pattern.lastIndex = 0
    const found = pattern.test(content)
    pattern.lastIndex = 0
    if (!found) {
      throw new Error(`pattern not found in ${relativePath}: ${pattern}`)
    }
    const next = content.replace(pattern, replacement)
    content = next
  }
  writeIfChanged(relativePath, content)
}

function utsString(value) {
  return `'${String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
}

function updatePackageJson() {
  replaceText('package.json', [
    [/("name"\s*:\s*)"[^"]*"/, `$1"${env.PACKAGE_NAME}"`]
  ])
}

function updateProjectConfig() {
  replaceText('project.config.json', [
    [/("appid"\s*:\s*)"[^"]*"/, `$1"${env.MP_WEIXIN_APPID}"`]
  ])
}

function updateManifest() {
  replaceText('src/manifest.json', [
    [/("name"\s*:\s*)"[^"]*"/, `$1"${env.MANIFEST_NAME}"`],
    [/("description"\s*:\s*)"[^"]*"/, `$1"${env.DESCRIPTION}"`],
    [/("mp-weixin"\s*:\s*\{[\s\S]*?"appid"\s*:\s*)"[^"]*"/, `$1"${env.MP_WEIXIN_APPID}"`]
  ])
}

function updatePagesJson() {
  let content = read('src/pages.json')
  content = content.replace(
    /("globalStyle"\s*:\s*\{[\s\S]*?"navigationBarTitleText"\s*:\s*)"[^"]*"/,
    `$1"${env.NAVIGATION_TITLE}"`
  )

  const requiredRoutes = [
    {
      path: 'pages/policies/user',
      block: [
        '\t\t{',
        '\t\t\t"path": "pages/policies/user",',
        '\t\t\t"style": {',
        '\t\t\t\t"navigationBarTitleText": "用户协议"',
        '\t\t\t}',
        '\t\t}'
      ].join('\n')
    },
    {
      path: 'pages/policies/privacy',
      block: [
        '\t\t{',
        '\t\t\t"path": "pages/policies/privacy",',
        '\t\t\t"style": {',
        '\t\t\t\t"navigationBarTitleText": "隐私政策"',
        '\t\t\t}',
        '\t\t}'
      ].join('\n')
    }
  ]

  for (const route of requiredRoutes) {
    if (content.includes(`"path": "${route.path}"`)) continue
    const insertPattern = /\n\t\],\n\t"globalStyle"/
    if (!insertPattern.test(content)) {
      throw new Error('pattern not found in src/pages.json: pages array closing marker')
    }
    content = content.replace(insertPattern, `,\n${route.block}\n\t],\n\t"globalStyle"`)
  }

  writeIfChanged('src/pages.json', content)
}

function updateConfig() {
  // config.uts 按小程序版本自动分流（release→线上，其余→测试），VITE_API_BASE 本地联调优先；
  // 这里只替换 release 分支的线上域名兜底值
  replaceText('src/utils/config.uts', [
    [/(=== 'release' \? )'[^']*'/, `$1${utsString(env.API_BASE_URL)}`]
  ])
}

function updateHttp() {
  const appCode = env.APP_CODE || ''
  const appCodeLine = appCode === '' ? '' : `    'X-App-Code': ${utsString(appCode)},\n`
  const block = `const finalHeader: Record<string, string> = {\n    'Content-Type': 'application/json',\n${appCodeLine}    ...header,\n  }`
  replaceText('src/utils/http.uts', [
    [/const finalHeader: Record<string, string> = \{[\s\S]*?\n  \}/, block]
  ])
}

function updateLegal() {
  replaceText('src/utils/legal.uts', [
    [/export const MINI_APP_NAME = '[^']*'/, `export const MINI_APP_NAME = ${utsString(env.MINI_APP_NAME)}`]
  ])
}

function updateContactPage(relativePath) {
  // 注入合同（ServiceContact 组件 data() 兜底默认值，勿改字段名与 `字段: '...' as string` 写法）：
  //   qrSrc: '...'      客服二维码
  //   phone: '...'      联系电话
  //   coopPhone: '...'  商务合作电话（可选 CONTACT_COOP_TEXT，非空才替换）
  // 运行时 /api/page-config 下发的 contact_info 配置会覆盖这些兜底默认值。
  const coopText = env.CONTACT_COOP_TEXT || ''
  replaceText(relativePath, [
    [/qrSrc: '[^']*'/, `qrSrc: ${utsString(env.CONTACT_QR_SRC)}`],
    [/phone: '[^']*'/, `phone: ${utsString(env.CONTACT_PHONE_TEXT)}`]
  ])
  if (coopText !== '') {
    replaceText(relativePath, [
      [/coopPhone: '[^']*'/, `coopPhone: ${utsString(coopText)}`]
    ])
  }
}

function updateAppFooter() {
  // 全项唯一 Copyright 注入点：由 src/components/AppFooter/AppFooter.uvue 的 default props 集中提供。
  // 6 个使用页（favorites / demoDetail / priceList / index / priceHomePage / targetPhotoDetail）不再含硬编码文本。
  replaceText('src/components/AppFooter/AppFooter.uvue', [
    [/default: 'Copyright 2025 [^']+'/, `default: '${env.COPYRIGHT_TEXT}'`]
  ])
}

function updatePriceList() {
  replaceText('src/pages/priceList/index.uvue', [
    [/(shopName \? `\$\{shopName\}价目表` : ')[^']*(')/, `$1${env.PRICE_FALLBACK_TITLE}$2`]
  ])
}

updatePackageJson()
updateProjectConfig()
updateManifest()
updatePagesJson()
updateConfig()
updateHttp()
updateLegal()
updateAppFooter()
// 首页与价目表页（priceHomePage）的服务保障/联系我们区块均已抽为 ServiceContact 组件，
// 注入合同统一落在组件上（二维码 src + 联系电话一处替换）
updateContactPage('src/components/ServiceContact/ServiceContact.uvue')
updatePriceList()
