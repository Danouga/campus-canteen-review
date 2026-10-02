import { createRepository } from './repository.js';
import { screenComment, filterVersion } from './content-filter.js';

const repo = createRepository();
const root = document.querySelector('#app');
const state = { data: null, campusId: 'campus-a', view: 'home', canteenId: null, shopId: null, query: '', modal: null, notice: '' };

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const dateLabel = (value) => value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const campus = () => state.data.campuses.find((item) => item.id === state.campusId);
const activeCanteens = () => state.data.canteens.filter((item) => item.status === 'active');
const activeShops = () => state.data.shops.filter((item) => item.status === 'active');
const canteensHere = () => activeCanteens().filter((item) => item.campusId === state.campusId);
const pendingCount = () => state.data.contributions.filter((item) => item.status === 'pending').length;

function icon(name, size = 20) {
  const paths = {
    arrow: '<path d="m5 12 14 0m-6-6 6 6-6 6"/>',
    chevron: '<path d="m9 18 6-6-6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15m6-12v15"/>',
    pin: '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bowl: '<path d="M3 11h18a9 9 0 0 1-18 0ZM8 21h8M8 7c0-2 2-2 2-4m4 4c0-2 2-2 2-4"/>',
    leaf: '<path d="M20 4C11 4 5 7 5 14a6 6 0 0 0 6 6c7 0 10-6 9-16Z"/><path d="M6 18c3-4 6-6 11-9"/>',
    spark: '<path d="m12 2 1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2Zm7 15 .5 2.5L22 20l-2.5.5L19 23l-.5-2.5L16 20l2.5-.5L19 17Z"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
    edit: '<path d="m14 5 5 5M4 20l4.5-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L4 20Z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3m-9 0 1 13h10l1-13M10 11v6m4-6v6"/>',
    close: '<path d="M5 5l14 14M19 5 5 19"/>',
    chat: '<path d="M20 11a8 8 0 0 1-8 8 9 9 0 0 1-4-.9L3 20l1.9-5A9 9 0 1 1 20 11Z"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 16-5-5L4 21"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}

function navButton(view, label) { return `<button class="nav-link ${state.view === view ? 'active' : ''}" data-view="${view}">${label}</button>`; }
function action(label, command, extra = '', style = '') { return `<button type="button" class="${style || 'text-action'}" data-action="${command}" ${extra}>${label}</button>`; }

function header() {
  return `<header class="site-header"><div class="header-inner">
    <button class="brand" data-view="home" aria-label="返回首页"><span class="brand-mark">${icon('bowl', 23)}</span><span>食间<span class="brand-dot">.</span><small>校园食堂指南</small></span></button>
    <nav class="main-nav" aria-label="主导航">${navButton('home', '发现食堂')}${navButton('contribute', '一起共建')}${navButton('future', '未来计划')}${navButton('admin', `管理预览${pendingCount() ? `<span class="nav-count">${pendingCount()}</span>` : ''}`)}</nav>
    <button class="header-cta" data-action="open-contribution" data-type="canteen">${icon('plus', 17)} 提交新发现</button>
  </div></header>`;
}

function footer() {
  return `<footer class="site-footer"><div class="footer-inner"><span class="footer-brand">食间<span>.</span></span><span>从空白开始，由每一个人慢慢补全。</span><span>当前为本地界面预览 · 暂未连接数据库</span></div></footer>`;
}

function campusTabs() {
  return `<div class="campus-tabs" role="tablist" aria-label="选择校区">${state.data.campuses.map((item, index) => `<button role="tab" aria-selected="${item.id === state.campusId}" class="campus-tab ${item.id === state.campusId ? 'selected' : ''}" data-campus="${item.id}"><span class="campus-number">0${index + 1}</span>${escapeHtml(item.name)}<span class="campus-tab-count">${activeCanteens().filter((canteen) => canteen.campusId === item.id).length} 个食堂</span></button>`).join('')}</div>`;
}

function home() {
  const filtered = canteensHere().filter((canteen) => `${canteen.name} ${canteen.location}`.toLowerCase().includes(state.query.toLowerCase()));
  const proposedCanteens = state.data.contributions.filter((item) => item.status === 'provisional' && item.type === 'canteen' && item.campusId === state.campusId);
  const totalShops = activeShops().length;
  return `<main>
    <section class="hero wrap"><div class="hero-copy"><span class="eyebrow"><span class="eyebrow-line"></span> A LITTLE GUIDE TO CAMPUS FOOD</span><h1>好味道，<br><em>一起慢慢发现。</em></h1><p>从两校区的食堂开始，记录每一家值得认识的店。资料可以由你补充，也会经过管理员确认。</p><div class="hero-actions"><button class="button primary" data-action="open-contribution" data-type="canteen">${icon('plus', 19)} 添加新发现</button><button class="button subtle" data-view="contribute">了解共建方式 ${icon('arrow', 18)}</button></div><div class="hero-metrics"><div><strong>02</strong><span>个校区</span></div><i></i><div><strong>${String(activeCanteens().length).padStart(2, '0')}</strong><span>个已收录食堂</span></div><i></i><div><strong>${String(totalShops).padStart(2, '0')}</strong><span>家已收录店铺</span></div></div></div><div class="hero-art" aria-hidden="true"><span class="art-ring ring-one"></span><span class="art-ring ring-two"></span><span class="art-orbit orbit-one"></span><span class="art-orbit orbit-two"></span><div class="plate"><div class="plate-inner"><span class="rice-grain grain-1"></span><span class="rice-grain grain-2"></span><span class="rice-grain grain-3"></span><span class="rice-grain grain-4"></span><span class="rice-grain grain-5"></span><span class="leaf-piece leaf-a"></span><span class="leaf-piece leaf-b"></span><span class="leaf-piece leaf-c"></span><span class="egg"></span><span class="carrot carrot-a"></span><span class="carrot carrot-b"></span><span class="carrot carrot-c"></span></div></div><div class="art-note"><span class="note-icon">${icon('spark', 18)}</span><span>下一家好店<br><b>也许由你发现</b></span></div></div></section>
    <section class="directory wrap" id="directory"><div class="section-top"><div><span class="section-kicker">EXPLORE THE CANTEENS</span><h2>从哪一间食堂开始？</h2><p>选择校区，看看已经收录的食堂；空白的地方，欢迎你来补上。</p></div><span class="section-deco">${icon('leaf', 26)}</span></div>${campusTabs()}<div class="directory-toolbar"><div class="search-box">${icon('search', 19)}<input id="search" aria-label="搜索食堂" placeholder="搜索食堂名称或位置" value="${escapeHtml(state.query)}" /></div><span class="toolbar-tip">${icon('shield', 16)} 共建信息先审核，再公开展示</span></div>
    <div class="canteen-grid">${filtered.length ? filtered.map(canteenCard).join('') : emptyCanteen()}</div>${proposedCanteens.length ? `<div class="home-proposals">${provisionalPanel(proposedCanteens)}</div>` : ''}</section>
    <section class="steps-section"><div class="wrap steps-inner"><div class="steps-intro"><span class="section-kicker">BUILD IT TOGETHER</span><h2>你的一次补充，<br>让下一餐更容易。</h2><p>不必一次写得很完整。店名、位置、菜单或者营业时间，任何一条真实信息都很有帮助。</p>${action(`看看如何共建 ${icon('arrow', 17)}`, 'go-contribute')}</div><div class="steps-list"><div class="step"><span>01</span><div><b>发现空白</b><p>在食堂或店铺页面点击加号。</p></div></div><div class="step"><span>02</span><div><b>提交信息</b><p>填写你知道的部分，留下来源说明。</p></div></div><div class="step"><span>03</span><div><b>管理员确认</b><p>审核后暂时展示，或直接收录。</p></div></div></div></div></section>
  </main>`;
}

function canteenCard(item) {
  const count = activeShops().filter((shop) => shop.canteenId === item.id).length;
  return `<button class="canteen-card" data-canteen="${item.id}"><span class="card-illustration">${icon('bowl', 42)}</span><span class="card-content"><span class="card-label">${escapeHtml(campus()?.name)} · 食堂</span><strong>${escapeHtml(item.name)}</strong><span class="card-meta">${icon('clock', 16)} ${escapeHtml(item.hours || '营业时间待补充')}</span><span class="card-meta">${icon('pin', 16)} ${escapeHtml(item.location || '位置待补充')}</span><span class="card-bottom"><span>${count} 家店铺</span><span class="circle-arrow">${icon('arrow', 18)}</span></span></span></button>`;
}

function emptyCanteen() {
  return `<div class="empty-canteen"><div class="empty-symbol">${icon('bowl', 40)}<span>${icon('plus', 20)}</span></div><span class="empty-kicker">A FRESH START</span><h3>${state.query ? '还没有找到这间食堂' : '这一页，等你写下第一笔。'}</h3><p>${state.query ? '换个关键词试试，或申请添加你知道的食堂。' : `${escapeHtml(campus()?.name)}还没有收录食堂。知道一间？花一分钟告诉我们。`}</p><button class="button outline" data-action="open-contribution" data-type="canteen">${icon('plus', 18)} 申请添加食堂</button></div>`;
}

function breadcrumb(parts) { return `<div class="breadcrumb"><button data-view="home">发现食堂</button>${parts.map((item) => ` ${icon('chevron', 14)} <span>${escapeHtml(item)}</span>`).join('')}</div>`; }

function canteenView() {
  const item = activeCanteens().find((entry) => entry.id === state.canteenId);
  if (!item) return missingView();
  const shops = activeShops().filter((shop) => shop.canteenId === item.id);
  const provisional = state.data.contributions.filter((entry) => entry.status === 'provisional' && entry.canteenId === item.id);
  return `<main class="wrap detail-page">${breadcrumb([campus()?.name || '', item.name])}<div class="detail-hero"><span class="detail-label">${escapeHtml(campus()?.name)} / CANTEEN</span><h1>${escapeHtml(item.name)}</h1><p>每一家店铺、每一道菜，都可以从这里开始被发现。</p><div class="detail-facts"><span>${icon('clock', 18)} ${escapeHtml(item.hours || '营业时间待补充')}</span><span>${icon('pin', 18)} ${escapeHtml(item.location || '位置待补充')}</span></div><button class="detail-edit" data-action="open-contribution" data-type="hours" data-canteen-id="${item.id}">${icon('plus', 16)} 补充营业时间</button></div>
    <div class="detail-section-head"><div><span class="section-kicker">SHOPS INSIDE</span><h2>这里的店铺 <span class="muted-count">${shops.length}</span></h2></div><button class="button small primary" data-action="open-contribution" data-type="shop" data-canteen-id="${item.id}">${icon('plus', 17)} 申请添加店铺</button></div>
    <div class="shop-grid">${shops.length ? shops.map(shopCard).join('') : `<div class="empty-shop"><span class="empty-icon">${icon('plus', 28)}</span><h3>还没有店铺被收录</h3><p>知道这里有哪些店？点击加号，帮大家补全食堂地图。</p><button class="button outline" data-action="open-contribution" data-type="shop" data-canteen-id="${item.id}">添加第一家店 ${icon('arrow', 17)}</button></div>`}</div>
    ${provisional.length ? provisionalPanel(provisional) : ''}</main>`;
}

function shopCard(item) {
  return `<button class="shop-card" data-shop="${item.id}"><span class="shop-card-art">${icon('bowl', 34)}</span><span class="shop-card-body"><span class="shop-category">${escapeHtml(item.category || '分类待补充')}</span><strong>${escapeHtml(item.name)}</strong><span>${icon('pin', 15)} ${escapeHtml(item.location || '位置待补充')}</span><span class="shop-card-link">查看详情 ${icon('arrow', 17)}</span></span></button>`;
}

function provisionalPanel(items) {
  return `<section class="provisional-panel"><div class="detail-section-head"><div><span class="section-kicker">UNDER REVIEW</span><h2>暂时展示中的共建信息</h2></div></div>${items.map((item) => `<article class="provisional-item"><span class="status-pill">待社区确认</span><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.detail || '暂无补充说明')}</p><small>由 ${escapeHtml(item.author)} 提交 · 展示至 ${dateLabel(item.expiresAt)}</small></article>`).join('')}</section>`;
}

function shopView() {
  const item = activeShops().find((entry) => entry.id === state.shopId);
  if (!item) return missingView();
  const canteen = activeCanteens().find((entry) => entry.id === item.canteenId);
  const comments = state.data.comments.filter((entry) => entry.shopId === item.id);
  const provisional = state.data.contributions.filter((entry) => entry.status === 'provisional' && entry.shopId === item.id);
  const visibleDishes = item.dishes.filter((entry) => entry.status !== 'archived');
  const visiblePhotos = item.photos.filter((entry) => entry.status !== 'archived');
  return `<main class="wrap detail-page">${breadcrumb([canteen?.name || '食堂', item.name])}<div class="shop-detail-head"><div><span class="detail-label">${escapeHtml(canteen?.name || '')} / SHOP</span><h1>${escapeHtml(item.name)}</h1><p>${escapeHtml(item.category || '分类待补充')} · ${escapeHtml(item.location || '位置待补充')}</p><div class="detail-facts"><span>${icon('clock', 18)} 食堂 ${escapeHtml(canteen?.hours || '营业时间待补充')}</span><span>${icon('spark', 18)} ${escapeHtml(item.lateHours || '店铺延时关门信息待补充')}</span></div></div><div class="shop-detail-art">${icon('bowl', 70)}</div></div>
    <div class="detail-columns"><div><section class="detail-block"><div class="block-head"><div><span class="section-kicker">ON THE MENU</span><h2>菜品与价格</h2></div><button class="mini-add" data-action="open-contribution" data-type="dish" data-shop-id="${item.id}" data-canteen-id="${canteen?.id}">${icon('plus', 17)} 补充菜品</button></div>${visibleDishes.length ? `<div class="dish-list">${visibleDishes.map((dish) => `<div><span><b>${escapeHtml(dish.name)}</b><small>${escapeHtml(dish.note || '')}</small></span><strong>${dish.price ? `¥${escapeHtml(dish.price)}` : '价格待补充'}</strong></div>`).join('')}</div>` : blankField('还没有菜品信息', '你可以补充菜品名称与参考价格。', 'dish', item.id, canteen?.id)}</section>
    <section class="detail-block"><div class="block-head"><div><span class="section-kicker">FROM THE COMMUNITY</span><h2>评论</h2></div><span class="small-note">演示身份 · 本地保存</span></div><form id="comment-form" class="comment-form"><input name="author" maxlength="30" required placeholder="你的昵称（仅供本地预览）" aria-label="昵称" /><textarea name="body" maxlength="500" required placeholder="写下你对这家店的印象…" aria-label="评论内容"></textarea><div><small>提交前会经过演示屏蔽词筛选（${filterVersion}）</small><button class="button small primary" type="submit">发布评论</button></div></form>${comments.length ? comments.map((entry) => `<article class="comment"><span class="avatar">${escapeHtml(entry.author.slice(0, 1))}</span><div><b>${escapeHtml(entry.author)}</b><time>${dateLabel(entry.createdAt)}</time><p>${escapeHtml(entry.body)}</p></div></article>`).join('') : '<p class="quiet-empty">这里还没有评论，欢迎留下第一条。</p>'}</section></div>
    <aside><section class="aside-card"><span class="section-kicker">ABOUT THIS SHOP</span><h3>一起把信息补全</h3><p>如果位置、分类或营业时间有变化，可以提交补充申请。</p><button class="button outline full" data-action="open-contribution" data-type="shop-info" data-shop-id="${item.id}" data-canteen-id="${canteen?.id}">${icon('plus', 17)} 补充店铺信息</button></section><section class="aside-card photo-card"><div class="block-head"><h3>店铺图片</h3><button class="mini-add" data-action="open-contribution" data-type="photo" data-shop-id="${item.id}" data-canteen-id="${canteen?.id}">${icon('plus', 17)}</button></div>${visiblePhotos.length ? visiblePhotos.map((photo) => `<img class="shop-photo" src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.caption)}" />`).join('') : `<div class="photo-empty">${icon('image', 32)}<span>暂无图片<br>欢迎补充</span></div>`}</section></aside></div>${provisional.length ? provisionalPanel(provisional) : ''}</main>`;
}

function blankField(title, description, type, shopId, canteenId) { return `<div class="blank-field"><span class="blank-field-icon">${icon('plus', 22)}</span><strong>${title}</strong><p>${description}</p><button class="text-action" data-action="open-contribution" data-type="${type}" data-shop-id="${shopId}" data-canteen-id="${canteenId}">申请补充 ${icon('arrow', 17)}</button></div>`; }
function missingView() { return `<main class="wrap missing-view"><h1>这条资料暂时找不到</h1><p>它可能已下架，或者页面需要刷新。</p><button class="button primary" data-view="home">返回首页</button></main>`; }

function contributeView() {
  return `<main class="wrap content-page"><div class="page-intro"><span class="section-kicker">A SHARED LITTLE GUIDE</span><h1>从你知道的<br><em>一点点开始。</em></h1><p>食堂和店铺信息不需要由一个人写完。你提交的内容会先交给管理员审核，再决定是否暂示或收录。</p></div><div class="contribute-grid"><button class="contribute-tile" data-action="open-contribution" data-type="canteen"><span class="tile-icon green">${icon('bowl', 26)}</span><strong>添加食堂</strong><p>补上一个校区里尚未收录的食堂。</p><span>开始填写 ${icon('arrow', 17)}</span></button><button class="contribute-tile" data-action="open-contribution" data-type="shop"><span class="tile-icon peach">${icon('pin', 26)}</span><strong>添加店铺</strong><p>告诉大家这家店在哪里、叫什么。</p><span>开始填写 ${icon('arrow', 17)}</span></button><button class="contribute-tile" data-action="open-contribution" data-type="dish"><span class="tile-icon cream">${icon('leaf', 26)}</span><strong>补充菜品</strong><p>菜名和参考价格，让选择更轻松。</p><span>开始填写 ${icon('arrow', 17)}</span></button><button class="contribute-tile" data-action="open-contribution" data-type="hours"><span class="tile-icon blue">${icon('clock', 26)}</span><strong>更新营业时间</strong><p>食堂时间有变化，就来更新它。</p><span>开始填写 ${icon('arrow', 17)}</span></button></div><div class="process-banner"><span>${icon('shield', 22)}</span><div><b>每条共建都会先经过管理员确认</b><p>管理员可让信息暂示 24 小时，或核实后直接固定。当前预览数据保存在你的浏览器中。</p></div></div></main>`;
}

function adminView() {
  const pending = state.data.contributions.filter((item) => item.status === 'pending');
  const provisional = state.data.contributions.filter((item) => item.status === 'provisional');
  const archived = state.data.canteens.filter((item) => item.status === 'archived').map((item) => ({ ...item, kind: 'canteen' }))
    .concat(state.data.shops.filter((item) => item.status === 'archived').map((item) => ({ ...item, kind: 'shop' })));
  return `<main class="wrap admin-page"><div class="admin-top"><div><span class="section-kicker">LOCAL ADMIN PREVIEW</span><h1>管理工作台</h1><p>这是无权限保护的本地演示界面，正式上线前必须接入管理员身份验证。</p></div><span class="preview-tag">仅供本地预览</span></div><div class="admin-stats"><div><strong>${pending.length}</strong><span>待审核申请</span></div><div><strong>${provisional.length}</strong><span>暂示中</span></div><div><strong>${activeCanteens().length}</strong><span>已收录食堂</span></div><div><strong>${activeShops().length}</strong><span>已收录店铺</span></div></div>
  <section class="admin-section"><div class="admin-section-head"><div><h2>共建申请</h2><p>审核后选择暂示 24 小时、直接固定或驳回。</p></div></div>${pending.length ? pending.map(reviewCard).join('') : `<div class="admin-empty">${icon('check', 25)} 当前没有待审核申请</div>`}</section>
  ${provisional.length ? `<section class="admin-section"><div class="admin-section-head"><div><h2>暂示中的资料</h2><p>到期会自动停止展示；管理员可提前固定或撤销。</p></div></div>${provisional.map((item) => `<div class="manage-row"><span class="status-pill">暂示中</span><span><b>${escapeHtml(item.title)}</b><small>至 ${dateLabel(item.expiresAt)}</small></span><button class="mini-add" data-action="revoke-provisional" data-id="${item.id}">撤销</button><button class="mini-add" data-action="fix-provisional" data-id="${item.id}">固定收录</button></div>`).join('')}</section>` : ''}
  <section class="admin-section"><div class="admin-section-head"><div><h2>直接维护资料</h2><p>管理员可以补充、修改或下架资料。下架不会抹掉本地审核记录。</p></div><div class="head-actions"><button class="button small outline" data-action="edit-campus">编辑校区</button><button class="button small outline" data-action="edit-canteen">添加食堂</button><button class="button small primary" data-action="edit-shop">添加店铺</button></div></div><div class="manage-columns"><div><h3>食堂</h3>${activeCanteens().length ? activeCanteens().map((item) => `<div class="manage-row"><span class="manage-icon">${icon('bowl', 20)}</span><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(state.data.campuses.find((campus) => campus.id === item.campusId)?.name || '')} · ${escapeHtml(item.hours || '时间待补充')}</small></span><button aria-label="编辑${escapeHtml(item.name)}" data-action="edit-canteen" data-id="${item.id}">${icon('edit', 17)}</button><button aria-label="下架${escapeHtml(item.name)}" data-action="remove-canteen" data-id="${item.id}">${icon('trash', 17)}</button></div>`).join('') : '<p class="admin-list-empty">还没有食堂。</p>'}</div><div><h3>店铺</h3>${activeShops().length ? activeShops().map((item) => `<div class="manage-row"><span class="manage-icon">${icon('leaf', 20)}</span><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(activeCanteens().find((canteen) => canteen.id === item.canteenId)?.name || '')}</small></span><button aria-label="管理${escapeHtml(item.name)}的菜品和图片" data-action="manage-shop-content" data-id="${item.id}">${icon('image', 17)}</button><button aria-label="编辑${escapeHtml(item.name)}" data-action="edit-shop" data-id="${item.id}">${icon('edit', 17)}</button><button aria-label="下架${escapeHtml(item.name)}" data-action="remove-shop" data-id="${item.id}">${icon('trash', 17)}</button></div>`).join('') : '<p class="admin-list-empty">还没有店铺。</p>'}</div></div></section>
  ${archived.length ? `<section class="admin-section"><div class="admin-section-head"><div><h2>已下架资料</h2><p>可恢复误操作下架的食堂或店铺。</p></div></div>${archived.map((item) => `<div class="manage-row"><span class="status-pill">已下架</span><span><b>${escapeHtml(item.name)}</b><small>${item.kind === 'canteen' ? '食堂' : '店铺'}</small></span><button class="mini-add" data-action="restore-entry" data-kind="${item.kind}" data-id="${item.id}">恢复</button></div>`).join('')}</section>` : ''}
  <div class="admin-bottom"><span>本地预览数据存于此浏览器；清空操作不可恢复。</span><button class="quiet-button" data-action="reset-preview">清空本地预览数据</button></div></main>`;
}

function reviewCard(item) {
  const labels = { canteen: '新增食堂', shop: '新增店铺', dish: '补充菜品', hours: '营业时间', photo: '店铺图片', 'shop-info': '店铺信息' };
  return `<article class="review-card"><div><span class="review-type">${labels[item.type] || '资料'}</span><span class="review-date">${dateLabel(item.submittedAt)}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail || '无补充说明')}</p><small>提交人：${escapeHtml(item.author)} · ${escapeHtml(state.data.campuses.find((campus) => campus.id === item.campusId)?.name || '')}</small><div class="review-actions"><button class="button tiny outline" data-action="review" data-decision="rejected" data-id="${item.id}">驳回</button><button class="button tiny outline" data-action="review" data-decision="provisional" data-id="${item.id}">暂示 24 小时</button><button class="button tiny primary" data-action="review" data-decision="fixed" data-id="${item.id}">直接固定</button></div></article>`;
}

function futureView() {
  return `<main class="wrap content-page future-page"><div class="page-intro"><span class="section-kicker">WHAT COMES NEXT</span><h1>还有一些<br><em>值得期待的想法。</em></h1><p>先把两校区的食堂资料慢慢补齐，之后再按实际需要决定下一步。</p></div><div class="future-grid"><div><span class="future-no">01</span><span class="future-icon">${icon('map', 26)}</span><h2>三维食堂</h2><p>在空间里找店，也许还能留下属于那个位置的告示牌。</p><span class="future-status">规划中</span></div><div><span class="future-no">02</span><span class="future-icon">${icon('spark', 26)}</span><h2>AI 推荐</h2><p>理解你的偏好，帮你在熟悉的校园里发现新味道。</p><span class="future-status">规划中</span></div><div><span class="future-no">03</span><span class="future-icon">${icon('chat', 26)}</span><h2>微信小程序</h2><p>在手机上更顺手地查看食堂、提交信息。</p><span class="future-status">规划中</span></div><div><span class="future-no">04</span><span class="future-icon">${icon('leaf', 26)}</span><h2>赞助合作</h2><p>若将来开放合作，赞助内容会与自然推荐清楚区分。</p><span class="future-status">规划中</span></div></div></main>`;
}

function contributionModal() {
  const context = state.modal;
  const type = context.type;
  const labels = { canteen: '申请添加食堂', shop: '申请添加店铺', dish: '申请补充菜品', hours: '申请更新营业时间', photo: '申请补充图片', 'shop-info': '申请补充店铺信息' };
  const titleLabels = { canteen: '食堂名称', shop: '店铺名称', dish: '菜品名称', hours: '时间说明标题', photo: '图片说明', 'shop-info': '信息标题' };
  const selectedCampusId = context.campusId || state.campusId;
  const candidates = activeCanteens().filter((item) => item.campusId === selectedCampusId);
  const shops = activeShops().filter((item) => candidates.some((canteen) => canteen.id === item.canteenId));
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-label="${labels[type]}" data-stop><div class="modal-head"><div><span class="section-kicker">ADD A LITTLE DETAIL</span><h2>${labels[type]}</h2><p>只填写你确定的信息，管理员会先审核。</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><form id="contribution-form" class="modal-form"><input type="hidden" name="type" value="${type}" />
    <label>校区<select name="campusId" id="contrib-campus" required>${state.data.campuses.map((item) => `<option value="${item.id}" ${item.id === selectedCampusId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>
    ${type !== 'canteen' ? `<label>所属食堂<select name="canteenId" id="contrib-canteen" required><option value="">请选择食堂</option>${candidates.map((item) => `<option value="${item.id}" ${item.id === context.canteenId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}
    ${['dish', 'photo', 'shop-info'].includes(type) ? `<label>所属店铺<select name="shopId" required><option value="">请选择店铺</option>${shops.map((item) => `<option value="${item.id}" ${item.id === context.shopId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}
    <label>${titleLabels[type]}<input name="title" maxlength="120" required placeholder="${type === 'hours' ? '如：周一至周日营业时间' : `请输入${titleLabels[type]}`}" /></label>
    ${type === 'shop' ? `<label>店铺分类（选填）<input name="category" maxlength="40" placeholder="如：面食、轻食、饮品" /></label>` : ''}
    ${type === 'dish' ? `<label>参考价格（选填）<input name="price" inputmode="decimal" maxlength="20" placeholder="如：12.00" /></label>` : ''}
    ${type === 'shop-info' ? `<label>补充哪一项<select name="field"><option value="location">位置</option><option value="category">分类</option><option value="lateHours">延时关门时间</option></select></label>` : ''}
    ${type === 'photo' ? `<label>选择图片（本地预览，建议小于 900KB）<input name="photoFile" type="file" accept="image/png,image/jpeg,image/webp" required /></label>` : ''}
    <label>${type === 'hours' ? '营业时间' : type === 'shop' ? '位置与补充说明' : '详细说明'}<textarea name="detail" maxlength="600" ${type === 'hours' || type === 'shop-info' ? 'required' : ''} placeholder="${type === 'hours' ? '如：周一至周五 07:00–20:00；周末 08:00–19:00' : '写下位置、来源或你知道的其他信息…'}"></textarea></label>
    <label>提交人昵称<input name="author" maxlength="30" required placeholder="仅供本地演示，正式版将关联登录账号" /></label><div class="form-notice">${icon('shield', 17)} 申请先进入管理员队列。图片仅供本地预览，不会上传到服务器。</div><button class="button primary full" type="submit">提交申请 ${icon('arrow', 18)}</button></form></div></div>`;
}

function editModal() {
  const context = state.modal;
  const data = state.data;
  if (context.kind === 'campus') return `<div class="modal-backdrop" data-action="close-modal"><div class="modal narrow" role="dialog" aria-modal="true" aria-label="编辑校区" data-stop><div class="modal-head"><h2>编辑校区名称</h2><button class="icon-button" data-action="close-modal">${icon('close', 20)}</button></div><form id="edit-form" class="modal-form"><input type="hidden" name="kind" value="campus" />${data.campuses.map((item) => `<label>${escapeHtml(item.name)}<input name="${item.id}" value="${escapeHtml(item.name)}" required maxlength="40" /></label>`).join('')}<button class="button primary full" type="submit">保存校区名称</button></form></div></div>`;
  const isCanteen = context.kind === 'canteen';
  const item = context.id && (isCanteen ? data.canteens : data.shops).find((entry) => entry.id === context.id);
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal narrow" role="dialog" aria-modal="true" aria-label="${isCanteen ? '编辑食堂' : '编辑店铺'}" data-stop><div class="modal-head"><div><span class="section-kicker">ADMIN EDIT</span><h2>${item ? '编辑' : '添加'}${isCanteen ? '食堂' : '店铺'}</h2></div><button class="icon-button" data-action="close-modal">${icon('close', 20)}</button></div><form id="edit-form" class="modal-form"><input type="hidden" name="kind" value="${context.kind}" /><input type="hidden" name="entryId" value="${item?.id || ''}" />${isCanteen ? `<label>校区<select name="campusId" required>${data.campuses.map((campusItem) => `<option value="${campusItem.id}" ${campusItem.id === (item?.campusId || state.campusId) ? 'selected' : ''}>${escapeHtml(campusItem.name)}</option>`).join('')}</select></label>` : `<label>所属食堂<select name="canteenId" required><option value="">请选择食堂</option>${activeCanteens().map((canteen) => `<option value="${canteen.id}" ${canteen.id === item?.canteenId ? 'selected' : ''}>${escapeHtml(canteen.name)}</option>`).join('')}</select></label>`}<label>名称<input name="name" value="${escapeHtml(item?.name || '')}" required maxlength="60" /></label><label>位置<input name="location" value="${escapeHtml(item?.location || '')}" maxlength="120" placeholder="可留空，之后由共建补充" /></label>${isCanteen ? `<label>营业时间<input name="hours" value="${escapeHtml(item?.hours || '')}" maxlength="120" placeholder="如：每日 07:00–20:00" /></label>` : `<label>分类<input name="category" value="${escapeHtml(item?.category || '')}" maxlength="40" /></label><label>延时关门说明<input name="lateHours" value="${escapeHtml(item?.lateHours || '')}" maxlength="120" /></label>`}<button class="button primary full" type="submit">保存资料</button></form></div></div>`;
}

function decisionModal() {
  const context = state.modal;
  const item = state.data.contributions.find((entry) => entry.id === context.id);
  const labels = { fixed: '直接固定', provisional: '暂示 24 小时', rejected: '驳回' };
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal narrow" role="dialog" aria-modal="true" aria-label="审核共建申请" data-stop><div class="modal-head"><div><span class="section-kicker">REVIEW CONTRIBUTION</span><h2>${labels[context.decision]}申请</h2><p>${escapeHtml(item?.title || '')}</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><form id="review-form" class="modal-form"><label>审核说明（选填）<textarea name="note" maxlength="200" placeholder="写下审核依据，方便之后查阅"></textarea></label><div class="form-notice">${icon('shield', 17)} 此操作会更新本地预览数据。</div><button class="button primary full" type="submit">确认${labels[context.decision]}</button></form></div></div>`;
}

function confirmModal() {
  const context = state.modal;
  const reset = context.action === 'reset-preview';
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal narrow" role="dialog" aria-modal="true" aria-label="确认操作" data-stop><div class="modal-head"><div><span class="section-kicker">PLEASE CONFIRM</span><h2>${reset ? '清空本地数据？' : '下架这条资料？'}</h2><p>${reset ? '这会清空浏览器内的全部演示资料，无法撤销。' : '下架后资料不再公开展示，已有记录仍保留。'}</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><div class="confirm-actions"><button class="button outline" data-action="close-modal">取消</button><button class="button primary" data-action="confirm-operation">确认${reset ? '清空' : '下架'}</button></div></div></div>`;
}

function shopContentModal() {
  const context = state.modal;
  const shop = state.data.shops.find((entry) => entry.id === context.shopId);
  if (!shop) return '';
  if (context.kind === 'shop-content') {
    const dishes = shop.dishes.filter((entry) => entry.status !== 'archived');
    const photos = shop.photos.filter((entry) => entry.status !== 'archived');
    return `<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-label="管理菜品和图片" data-stop><div class="modal-head"><div><span class="section-kicker">ADMIN CONTENT</span><h2>${escapeHtml(shop.name)} · 菜品与图片</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><div class="content-admin-section"><div class="block-head"><h3>菜品</h3><button class="mini-add" data-action="edit-dish" data-shop-id="${shop.id}">${icon('plus', 16)} 添加菜品</button></div>${dishes.length ? dishes.map((entry) => `<div class="manage-row"><span><b>${escapeHtml(entry.name)}</b><small>${entry.price ? `¥${escapeHtml(entry.price)}` : '价格待补充'}</small></span><button data-action="edit-dish" data-shop-id="${shop.id}" data-id="${entry.id}" aria-label="编辑${escapeHtml(entry.name)}">${icon('edit', 17)}</button><button data-action="remove-content" data-kind="dish" data-shop-id="${shop.id}" data-id="${entry.id}" aria-label="下架${escapeHtml(entry.name)}">${icon('trash', 17)}</button></div>`).join('') : '<p class="admin-list-empty">还没有菜品。</p>'}</div><div class="content-admin-section"><div class="block-head"><h3>图片</h3><button class="mini-add" data-action="edit-photo" data-shop-id="${shop.id}">${icon('plus', 16)} 添加图片</button></div>${photos.length ? photos.map((entry) => `<div class="manage-row"><span><b>${escapeHtml(entry.caption)}</b><small>本地预览图片</small></span><button data-action="edit-photo" data-shop-id="${shop.id}" data-id="${entry.id}" aria-label="编辑图片">${icon('edit', 17)}</button><button data-action="remove-content" data-kind="photo" data-shop-id="${shop.id}" data-id="${entry.id}" aria-label="下架图片">${icon('trash', 17)}</button></div>`).join('') : '<p class="admin-list-empty">还没有图片。</p>'}</div></div></div>`;
  }
  const isDish = context.kind === 'dish-editor';
  const item = context.id && (isDish ? shop.dishes : shop.photos).find((entry) => entry.id === context.id);
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal narrow" role="dialog" aria-modal="true" aria-label="${isDish ? '编辑菜品' : '编辑图片'}" data-stop><div class="modal-head"><div><span class="section-kicker">ADMIN EDIT</span><h2>${item ? '编辑' : '添加'}${isDish ? '菜品' : '图片'}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><form id="shop-content-form" class="modal-form"><input type="hidden" name="contentKind" value="${isDish ? 'dish' : 'photo'}"/><input type="hidden" name="shopId" value="${shop.id}"/><input type="hidden" name="entryId" value="${item?.id || ''}"/>${isDish ? `<label>菜品名称<input name="name" maxlength="60" required value="${escapeHtml(item?.name || '')}"/></label><label>参考价格<input name="price" maxlength="20" value="${escapeHtml(item?.price || '')}" placeholder="如 12.00"/></label><label>说明<textarea name="note" maxlength="200">${escapeHtml(item?.note || '')}</textarea></label>` : `<label>图片说明<input name="caption" maxlength="80" required value="${escapeHtml(item?.caption || '')}"/></label><label>选择图片${item ? '（不选择则保留原图）' : ''}<input name="photoFile" type="file" accept="image/png,image/jpeg,image/webp" ${item ? '' : 'required'}/></label>`}<button class="button primary full" type="submit">保存${isDish ? '菜品' : '图片'}</button></form></div></div>`;
}

function modal() {
  if (!state.modal) return '';
  if (state.modal.kind === 'contribution') return contributionModal();
  if (state.modal.kind === 'review') return decisionModal();
  if (state.modal.kind === 'confirm') return confirmModal();
  if (['shop-content', 'dish-editor', 'photo-editor'].includes(state.modal.kind)) return shopContentModal();
  return editModal();
}

function render() {
  root.innerHTML = `${header()}${state.notice ? `<div class="toast" role="status">${escapeHtml(state.notice)}<button data-action="dismiss-notice" aria-label="关闭提示">${icon('close', 15)}</button></div>` : ''}${state.view === 'home' ? home() : state.view === 'canteen' ? canteenView() : state.view === 'shop' ? shopView() : state.view === 'contribute' ? contributeView() : state.view === 'admin' ? adminView() : futureView()}${footer()}${modal()}`;
  document.body.classList.toggle('modal-open', Boolean(state.modal));
}

async function refresh() {
  await repo.expireProvisional();
  state.data = await repo.snapshot();
  render();
}

function showNotice(message) { state.notice = message; render(); window.setTimeout(() => { if (state.notice === message) { state.notice = ''; render(); } }, 4200); }
function go(view) { state.view = view; state.modal = null; state.query = ''; window.scrollTo({ top: 0, behavior: 'smooth' }); render(); }

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], [data-view], [data-campus], [data-canteen], [data-shop]');
  if (!target) return;
  if (target.matches('[data-stop]')) return;
  if (target.dataset.view) { go(target.dataset.view); return; }
  if (target.dataset.campus) { state.campusId = target.dataset.campus; state.query = ''; render(); return; }
  if (target.dataset.canteen) { state.canteenId = target.dataset.canteen; go('canteen'); return; }
  if (target.dataset.shop) { state.shopId = target.dataset.shop; go('shop'); return; }
  const command = target.dataset.action;
  if (command === 'close-modal') { if (event.target.closest('[data-stop]') && target.classList.contains('modal-backdrop')) return; state.modal = null; render(); return; }
  if (command === 'dismiss-notice') { state.notice = ''; render(); return; }
  if (command === 'go-contribute') { go('contribute'); return; }
  if (command === 'open-contribution') { state.modal = { kind: 'contribution', type: target.dataset.type, campusId: state.campusId, canteenId: target.dataset.canteenId || null, shopId: target.dataset.shopId || null }; render(); return; }
  if (command === 'edit-campus') { state.modal = { kind: 'campus' }; render(); return; }
  if (command === 'edit-canteen' || command === 'edit-shop') { state.modal = { kind: command === 'edit-canteen' ? 'canteen' : 'shop', id: target.dataset.id || null }; render(); return; }
  if (command === 'manage-shop-content') { state.modal = { kind: 'shop-content', shopId: target.dataset.id }; render(); return; }
  if (command === 'edit-dish' || command === 'edit-photo') { state.modal = { kind: command === 'edit-dish' ? 'dish-editor' : 'photo-editor', shopId: target.dataset.shopId, id: target.dataset.id || null }; render(); return; }
  if (command === 'review') { state.modal = { kind: 'review', id: target.dataset.id, decision: target.dataset.decision }; render(); return; }
  if (command === 'remove-canteen' || command === 'remove-shop' || command === 'remove-content' || command === 'reset-preview') { state.modal = { kind: 'confirm', action: command, id: target.dataset.id, shopId: target.dataset.shopId, contentKind: target.dataset.kind }; render(); return; }
  try {
    if (command === 'restore-entry') { await repo.restoreEntry(target.dataset.kind, target.dataset.id); await refresh(); showNotice('资料已恢复。'); return; }
    if (command === 'fix-provisional') { await repo.fixProvisional(target.dataset.id); await refresh(); showNotice('已固定收录。'); return; }
    if (command === 'revoke-provisional') { await repo.revokeProvisional(target.dataset.id); await refresh(); showNotice('暂示已撤销。'); return; }
    if (command === 'confirm-operation') {
      const operation = state.modal;
      if (operation.action === 'reset-preview') {
        await repo.resetPreview(); state.campusId = 'campus-a'; state.view = 'home'; state.modal = null; await refresh(); showNotice('本地预览数据已清空。');
      } else if (operation.action === 'remove-content') {
        await repo.removeShopContent(operation.contentKind, operation.shopId, operation.id);
        state.modal = { kind: 'shop-content', shopId: operation.shopId }; await refresh(); showNotice('资料已下架。');
      } else {
        await repo.removeEntry(operation.action === 'remove-shop' ? 'shop' : 'canteen', operation.id);
        state.modal = null; await refresh(); showNotice('资料已下架。');
      }
    }
  } catch (error) { showNotice(error.message || '操作失败，请重试。'); }
});

root.addEventListener('input', (event) => {
  if (event.target.id === 'search') {
    state.query = event.target.value;
    const grid = root.querySelector('.canteen-grid');
    if (grid) {
      const filtered = canteensHere().filter((canteen) => `${canteen.name} ${canteen.location}`.toLowerCase().includes(state.query.toLowerCase()));
      grid.innerHTML = filtered.length ? filtered.map(canteenCard).join('') : emptyCanteen();
    }
  }
});

root.addEventListener('change', (event) => {
  if (!['contrib-campus', 'contrib-canteen'].includes(event.target.id)) return;
  const form = event.target.closest('form');
  const campusId = form.querySelector('#contrib-campus')?.value;
  const canteenSelect = form.querySelector('#contrib-canteen');
  if (!canteenSelect) return;
  if (event.target.id === 'contrib-campus') {
    const canteens = activeCanteens().filter((item) => item.campusId === campusId);
    canteenSelect.innerHTML = '<option value="">请选择食堂</option>' + canteens.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  }
  const shopSelect = form.querySelector('[name="shopId"]');
  if (shopSelect) {
    const shops = activeShops().filter((item) => item.canteenId === canteenSelect.value);
    shopSelect.innerHTML = '<option value="">请选择店铺</option>' + shops.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  }
});

root.addEventListener('submit', async (event) => {
  if (!['contribution-form', 'edit-form', 'comment-form', 'review-form', 'shop-content-form'].includes(event.target.id)) return;
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.id === 'contribution-form') {
      if (values.photoFile instanceof File && values.photoFile.size) {
        if (values.photoFile.size > 900_000) throw new Error('本地预览图片请小于 900KB。');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(values.photoFile.type)) throw new Error('请上传 JPG、PNG 或 WebP 图片。');
        values.photo = await fileAsDataUrl(values.photoFile);
      }
      delete values.photoFile;
      await repo.submitContribution(values);
      state.modal = null; await refresh(); showNotice('申请已提交，等待管理员审核。'); return;
    }
    if (form.id === 'edit-form') {
      if (values.kind === 'campus') {
        for (const item of state.data.campuses) await repo.saveCampus(item.id, values[item.id]);
      } else if (values.kind === 'canteen') await repo.saveCanteen({ ...values, id: values.entryId });
      else await repo.saveShop({ ...values, id: values.entryId });
      state.modal = null; await refresh(); showNotice('资料已保存。'); return;
    }
    if (form.id === 'review-form') {
      await repo.reviewContribution(state.modal.id, state.modal.decision, values.note);
      state.modal = null; await refresh(); showNotice('审核结果已保存到本地预览。'); return;
    }
    if (form.id === 'shop-content-form') {
      const shopId = values.shopId;
      if (values.contentKind === 'dish') await repo.saveDish({ ...values, id: values.entryId });
      else {
        if (values.photoFile instanceof File && values.photoFile.size) {
          if (values.photoFile.size > 900_000) throw new Error('本地预览图片请小于 900KB。');
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(values.photoFile.type)) throw new Error('请上传 JPG、PNG 或 WebP 图片。');
          values.photo = await fileAsDataUrl(values.photoFile);
        }
        await repo.savePhoto({ ...values, id: values.entryId });
      }
      state.modal = { kind: 'shop-content', shopId }; await refresh(); showNotice('店铺资料已保存。'); return;
    }
    const screening = screenComment(values.body);
    if (!screening.allowed) throw new Error(screening.reason);
    await repo.addComment(state.shopId, values.author, values.body);
    await refresh(); showNotice('评论已保存在本地预览。');
  } catch (error) { showNotice(error.message || '提交失败，请重试。'); }
});

function fileAsDataUrl(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('图片读取失败。')); reader.readAsDataURL(file); }); }

refresh().catch((error) => { root.innerHTML = `<main class="wrap missing-view"><h1>页面暂时无法加载</h1><p>${escapeHtml(error.message)}</p></main>`; });

window.setInterval(async () => {
  try {
    if (await repo.expireProvisional()) {
      state.data = await repo.snapshot();
      render();
    }
  } catch { /* The next user action will retry loading preview data. */ }
}, 60_000);
