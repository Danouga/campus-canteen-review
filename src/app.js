import { createRepository } from './repository.js';
import { screenComment, filterVersion } from './content-filter.js';
import { sanitizeRichHtml, plainTextFromRichHtml } from './rich-text.js';

const repo = createRepository();
const root = document.querySelector('#app');
const state = { data: null, campusId: 'campus-a', view: 'home', canteenId: null, shopId: null, postId: null, query: '', modal: null, notice: '', storageMode: 'local' };

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const dateLabel = (value) => value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const campus = () => state.data.campuses.find((item) => item.id === state.campusId);
const activeCanteens = () => state.data.canteens.filter((item) => item.status === 'active');
const activeShops = () => state.data.shops.filter((item) => item.status === 'active');
const canteensHere = () => activeCanteens().filter((item) => item.campusId === state.campusId);
const pendingCount = () => state.data.contributions.filter((item) => item.status === 'pending').length;
const postPreview = (post) => String(post.body || '').slice(0, 105);
const postMarkup = (post) => post.contentHtml ? sanitizeRichHtml(post.contentHtml) : `<p>${escapeHtml(post.body || '').replace(/\n/g, '<br>')}</p>${post.photo ? `<img src="${escapeHtml(post.photo)}" alt="帖子图片" />` : ''}`;
const storageName = () => state.storageMode === 'mysql' ? '本机 MySQL 预览库' : '当前浏览器';

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
    <nav class="main-nav" aria-label="主导航">${navButton('home', '首页')}${navButton('directory', '食堂展示')}${navButton('posts', '美食贴')}${navButton('contribute', '一起共建')}${navButton('future', '未来计划')}${navButton('admin', `管理预览${pendingCount() ? `<span class="nav-count">${pendingCount()}</span>` : ''}`)}</nav>
    <button class="header-cta" data-view="rules">${icon('shield', 17)} 网站评价规则</button>
  </div></header>`;
}

function footer() {
  return `<footer class="site-footer"><div class="footer-inner"><span class="footer-brand">食间<span>.</span></span><span>从空白开始，由每一个人慢慢补全。</span><span>当前为本地预览 · 数据保存在${storageName()}</span></div></footer>`;
}

function campusTabs() {
  return `<div class="campus-tabs" role="tablist" aria-label="选择校区">${state.data.campuses.map((item, index) => `<button role="tab" aria-selected="${item.id === state.campusId}" class="campus-tab ${item.id === state.campusId ? 'selected' : ''}" data-campus="${item.id}"><span class="campus-number">0${index + 1}</span>${escapeHtml(item.name)}<span class="campus-tab-count">${activeCanteens().filter((canteen) => canteen.campusId === item.id).length} 个食堂</span></button>`).join('')}</div>`;
}

function home() {
  const totalShops = activeShops().length;
  return `<main>
    <section class="hero wrap"><div class="hero-copy"><span class="eyebrow"><span class="eyebrow-line"></span> A LITTLE GUIDE TO CAMPUS FOOD</span><h1>好味道，<br><em>一起慢慢发现。</em></h1><p>从两校区的食堂开始，记录每一家值得认识的店。资料可以由你补充，也会经过管理员确认。</p><div class="hero-actions"><button class="button primary" data-view="directory">${icon('bowl', 19)} 浏览食堂</button><button class="button subtle" data-action="scroll-how">了解共建方式 ${icon('arrow', 18)}</button></div><div class="hero-metrics"><div><strong>02</strong><span>个校区</span></div><i></i><div><strong>${String(activeCanteens().length).padStart(2, '0')}</strong><span>个已收录食堂</span></div><i></i><div><strong>${String(totalShops).padStart(2, '0')}</strong><span>家已收录店铺</span></div></div></div><div class="hero-art" aria-hidden="true"><span class="art-ring ring-one"></span><span class="art-ring ring-two"></span><span class="art-orbit orbit-one"></span><span class="art-orbit orbit-two"></span><div class="plate"><div class="plate-inner"><span class="rice-grain grain-1"></span><span class="rice-grain grain-2"></span><span class="rice-grain grain-3"></span><span class="rice-grain grain-4"></span><span class="rice-grain grain-5"></span><span class="leaf-piece leaf-a"></span><span class="leaf-piece leaf-b"></span><span class="leaf-piece leaf-c"></span><span class="egg"></span><span class="carrot carrot-a"></span><span class="carrot carrot-b"></span><span class="carrot carrot-c"></span></div></div><div class="art-note"><span class="note-icon">${icon('spark', 18)}</span><span>下一家好店<br><b>也许由你发现</b></span></div></div></section>
    <section class="directory-teaser wrap"><div><span class="section-kicker">EXPLORE THE CANTEENS</span><h2>两校区食堂，单独逛一逛。</h2><p>按校区浏览已收录食堂，也可以为还空着的位置申请补充。</p></div><button class="button outline" data-view="directory">进入食堂展示 ${icon('arrow', 18)}</button></section>
    <section class="steps-section" id="how-it-works"><div class="wrap steps-inner"><div class="steps-intro"><span class="section-kicker">BUILD IT TOGETHER</span><h2>你的一次补充，<br>让下一餐更容易。</h2><p>不必一次写得很完整。店名、位置、菜单或者营业时间，任何一条真实信息都很有帮助。</p>${action(`一起共建 ${icon('arrow', 17)}`, 'go-contribute')}</div><div class="steps-list"><div class="step"><span>01</span><div><b>选择目标</b><p>选好校区、食堂和店铺，确认信息加在哪里。</p></div></div><div class="step"><span>02</span><div><b>提交信息</b><p>填写你知道的部分，图片可用于菜品展示。</p></div></div><div class="step"><span>03</span><div><b>管理员确认</b><p>审核后暂时展示，或直接收录。</p></div></div></div></div></section>
  </main>`;
}

function directoryView() {
  const filtered = canteensHere().filter((canteen) => `${canteen.name} ${canteen.location}`.toLowerCase().includes(state.query.toLowerCase()));
  const proposed = state.data.contributions.filter((item) => item.status === 'provisional' && item.type === 'canteen' && item.campusId === state.campusId);
  return `<main><section class="directory wrap"><div class="section-top"><div><span class="section-kicker">EXPLORE THE CANTEENS</span><h1>食堂展示</h1><p>选择校区，看看已经收录的食堂。每个校区都可以继续添加。</p></div><span class="section-deco">${icon('leaf', 26)}</span></div>${campusTabs()}<div class="directory-toolbar"><div class="search-box">${icon('search', 19)}<input id="search" aria-label="搜索食堂" placeholder="搜索食堂名称或位置" value="${escapeHtml(state.query)}" /></div><span class="toolbar-tip">${icon('shield', 16)} 共建信息先审核，再公开展示</span></div><div class="canteen-grid">${filtered.length ? filtered.map(canteenCard).join('') + addCanteenCard() : emptyCanteen()}</div>${proposed.length ? `<div class="home-proposals">${provisionalPanel(proposed)}</div>` : ''}</section></main>`;
}

function addCanteenCard() { return `<button class="canteen-card add-canteen-card" data-action="open-contribution" data-type="canteen">${icon('plus', 31)}<strong>添加食堂</strong><span>知道一间还未收录的食堂？<br>从这里申请补充。</span></button>`; }

function canteenCard(item) {
  const count = activeShops().filter((shop) => shop.canteenId === item.id).length;
  const photos = canteenPhotos(item);
  const cover = photos.length ? photos[[...item.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % photos.length] : null;
  return `<button class="canteen-card" data-canteen="${item.id}"><span class="card-illustration">${cover ? `<img src="${escapeHtml(cover.url)}" alt="${escapeHtml(item.name)}照片" />` : icon('bowl', 42)}</span><span class="card-content"><span class="card-label">${escapeHtml(campus()?.name)} · 食堂</span><strong>${escapeHtml(item.name)}</strong><span class="card-meta">${icon('clock', 16)} ${escapeHtml(item.hours || '营业时间待补充')}</span><span class="card-meta">${icon('pin', 16)} ${escapeHtml(item.location || '位置待补充')}</span><span class="card-bottom"><span>${count} 家店铺</span><span class="circle-arrow">${icon('arrow', 18)}</span></span></span></button>`;
}

function canteenPhotos(item) { return (item.photos || []).filter((photo) => photo.status !== 'archived'); }

function emptyCanteen() {
  return `<div class="empty-canteen"><div class="empty-symbol">${icon('bowl', 40)}<span>${icon('plus', 20)}</span></div><span class="empty-kicker">A FRESH START</span><h3>${state.query ? '还没有找到这间食堂' : '这一页，等你写下第一笔。'}</h3><p>${state.query ? '换个关键词试试，或申请添加你知道的食堂。' : `${escapeHtml(campus()?.name)}还没有收录食堂。知道一间？花一分钟告诉我们。`}</p><button class="button outline" data-action="open-contribution" data-type="canteen">${icon('plus', 18)} 申请添加食堂</button></div>`;
}

function breadcrumb(parts) { return `<div class="breadcrumb"><button data-view="directory">食堂展示</button>${parts.map((item) => ` ${icon('chevron', 14)} <span>${escapeHtml(item)}</span>`).join('')}</div>`; }

function canteenView() {
  const item = activeCanteens().find((entry) => entry.id === state.canteenId);
  if (!item) return missingView();
  const shops = activeShops().filter((shop) => shop.canteenId === item.id);
  const provisional = state.data.contributions.filter((entry) => entry.status === 'provisional' && entry.canteenId === item.id);
  const photos = canteenPhotos(item);
  return `<main class="wrap detail-page">${breadcrumb([campus()?.name || '', item.name])}<div class="detail-hero canteen-detail-head"><div><span class="detail-label">${escapeHtml(campus()?.name)} / CANTEEN</span><h1><button class="title-edit" data-action="open-contribution" data-type="field-update" data-target-kind="canteen" data-field="name" data-canteen-id="${item.id}">${escapeHtml(item.name)} <span>✎</span></button></h1><p>每一家店铺、每一道菜，都可以从这里开始被发现。</p><div class="detail-facts"><button class="fact-edit" data-action="open-contribution" data-type="field-update" data-target-kind="canteen" data-field="hours" data-canteen-id="${item.id}">${icon('clock', 18)} ${escapeHtml(item.hours || '营业时间待补充')} ${icon('edit', 13)}</button><button class="fact-edit" data-action="open-contribution" data-type="field-update" data-target-kind="canteen" data-field="location" data-canteen-id="${item.id}">${icon('pin', 18)} ${escapeHtml(item.location || '位置待补充')} ${icon('edit', 13)}</button></div></div><button class="canteen-detail-art" data-action="open-gallery" data-kind="canteen" data-id="${item.id}" aria-label="查看${escapeHtml(item.name)}的照片">${photos.length ? `<img src="${escapeHtml(photos[0].url)}" alt="${escapeHtml(item.name)}照片" />` : `<span>${icon('image', 42)}<small>添加食堂照片</small></span>`}</button></div>
    <div class="detail-section-head"><div><span class="section-kicker">SHOPS INSIDE</span><h2>这里的店铺 <span class="muted-count">${shops.length}</span></h2></div><button class="button small primary" data-action="open-contribution" data-type="shop" data-canteen-id="${item.id}">${icon('plus', 17)} 申请添加店铺</button></div>
    <div class="shop-grid">${shops.length ? shops.map(shopCard).join('') : `<div class="empty-shop"><span class="empty-icon">${icon('plus', 28)}</span><h3>还没有店铺被收录</h3><p>知道这里有哪些店？点击加号，帮大家补全食堂地图。</p><button class="button outline" data-action="open-contribution" data-type="shop" data-canteen-id="${item.id}">添加第一家店 ${icon('arrow', 17)}</button></div>`}</div>
    ${provisional.length ? provisionalPanel(provisional) : ''}</main>`;
}

function shopCard(item) {
  const cover = coverForShop(item);
  return `<button class="shop-card" data-shop="${item.id}"><span class="shop-card-art">${cover ? `<img src="${escapeHtml(cover.url)}" alt="${escapeHtml(cover.caption)}" />` : icon('bowl', 34)}</span><span class="shop-card-body"><span class="shop-category">${escapeHtml(item.category || '分类待补充')}</span><strong>${escapeHtml(item.name)}</strong><span>${icon('pin', 15)} ${escapeHtml(item.location || '位置待补充')}</span><span class="shop-card-link">查看详情 ${icon('arrow', 17)}</span></span></button>`;
}

function shopImages(shop) {
  const dishes = (shop.dishes || []).filter((dish) => dish.status !== 'archived');
  return [...dishes.filter((dish) => dish.photo).map((dish) => ({ url: dish.photo, caption: dish.name })), ...(shop.photos || []).filter((photo) => photo.status !== 'archived').map((photo) => ({ url: photo.url, caption: dishes.find((dish) => dish.id === photo.dishId)?.name || photo.caption || shop.name }))];
}
function coverForShop(shop) {
  const images = shopImages(shop);
  if (!images.length) return null;
  const hash = [...shop.id].reduce((value, character) => value + character.charCodeAt(0), 0);
  return images[hash % images.length];
}
function portraitForShop(shop) {
  const storefront = shop.photos?.find((photo) => photo.status !== 'archived' && photo.photoKind === 'storefront');
  return storefront ? { url: storefront.url, caption: '店铺门面' } : coverForShop(shop);
}

function provisionalPanel(items) {
  return `<section class="provisional-panel"><div class="detail-section-head"><div><span class="section-kicker">UNDER REVIEW</span><h2>暂时展示中的共建信息</h2></div></div>${items.map((item) => `<article class="provisional-item"><span class="status-pill">待社区确认</span><strong>${escapeHtml(item.title)}</strong>${item.photo ? `<img class="provisional-photo" src="${escapeHtml(item.photo)}" alt="${escapeHtml(item.title)}" />` : ''}${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ''}<small>由 ${escapeHtml(item.author)} 提交 · 展示至 ${dateLabel(item.expiresAt)}</small></article>`).join('')}</section>`;
}

function shopView() {
  const item = activeShops().find((entry) => entry.id === state.shopId);
  if (!item) return missingView();
  const canteen = activeCanteens().find((entry) => entry.id === item.canteenId);
  const comments = state.data.comments.filter((entry) => entry.shopId === item.id);
  const relatedPosts = (state.data.posts || []).filter((entry) => entry.shopId === item.id);
  const provisional = state.data.contributions.filter((entry) => entry.status === 'provisional' && entry.shopId === item.id);
  const visibleDishes = item.dishes.filter((entry) => entry.status !== 'archived');
  const visiblePhotos = shopImages(item);
  const cover = portraitForShop(item);
  return `<main class="wrap detail-page">${breadcrumb([canteen?.name || '食堂', item.name])}<div class="shop-detail-head"><div><span class="detail-label">${escapeHtml(canteen?.name || '')} / SHOP</span><h1><button class="title-edit" data-action="open-contribution" data-type="field-update" data-target-kind="shop" data-field="name" data-canteen-id="${canteen?.id}" data-shop-id="${item.id}">${escapeHtml(item.name)} <span>✎</span></button></h1><p class="inline-edit-fields"><button data-action="open-contribution" data-type="field-update" data-target-kind="shop" data-field="category" data-canteen-id="${canteen?.id}" data-shop-id="${item.id}">${escapeHtml(item.category || '分类待补充')} ✎</button><span>·</span><button data-action="open-contribution" data-type="field-update" data-target-kind="shop" data-field="location" data-canteen-id="${canteen?.id}" data-shop-id="${item.id}">${escapeHtml(item.location || '位置待补充')} ✎</button></p><div class="detail-facts"><span>${icon('clock', 18)} 食堂 ${escapeHtml(canteen?.hours || '营业时间待补充')}</span><button class="fact-edit" data-action="open-contribution" data-type="field-update" data-target-kind="shop" data-field="lateHours" data-canteen-id="${canteen?.id}" data-shop-id="${item.id}">${icon('spark', 18)} ${escapeHtml(item.lateHours || '店铺延时关门信息待补充')} ${icon('edit', 13)}</button></div></div><button class="shop-detail-art" data-action="open-gallery" data-kind="shop" data-id="${item.id}" aria-label="查看${escapeHtml(item.name)}的图片">${cover ? `<img src="${escapeHtml(cover.url)}" alt="${escapeHtml(cover.caption)}" />` : icon('image', 54)}</button></div>
    <div class="detail-columns"><div><section class="detail-block"><div class="block-head"><div><span class="section-kicker">ON THE MENU</span><h2>菜品与价格</h2></div><button class="mini-add" data-action="open-contribution" data-type="dish" data-shop-id="${item.id}" data-canteen-id="${canteen?.id}">${icon('plus', 17)} 补充菜品</button></div>${visibleDishes.length ? `<div class="dish-list">${visibleDishes.map((dish) => `<div>${dish.photo ? `<button class="dish-thumb-button" data-action="open-gallery" data-kind="dish" data-id="${dish.id}" data-shop-id="${item.id}"><img class="dish-thumb" src="${escapeHtml(dish.photo)}" alt="${escapeHtml(dish.name)}" /></button>` : ''}<span><button class="dish-field-edit" data-action="open-contribution" data-type="field-update" data-target-kind="dish" data-field="name" data-dish-id="${dish.id}" data-shop-id="${item.id}" data-canteen-id="${canteen?.id}"><b>${escapeHtml(dish.name)}</b></button><button class="dish-field-edit note" data-action="open-contribution" data-type="field-update" data-target-kind="dish" data-field="note" data-dish-id="${dish.id}" data-shop-id="${item.id}" data-canteen-id="${canteen?.id}">${escapeHtml(dish.note || '补充说明')}</button></span><button class="dish-price-edit" data-action="open-contribution" data-type="field-update" data-target-kind="dish" data-field="price" data-dish-id="${dish.id}" data-shop-id="${item.id}" data-canteen-id="${canteen?.id}">${dish.price ? `¥${escapeHtml(dish.price)}` : '价格待补充'}</button><button class="dish-edit" data-action="open-contribution" data-type="field-update" data-target-kind="dish" data-dish-id="${dish.id}" data-shop-id="${item.id}" data-canteen-id="${canteen?.id}" aria-label="修改${escapeHtml(dish.name)}">${icon('edit', 16)}</button></div>`).join('')}</div>` : blankField('还没有菜品信息', '你可以补充菜品名称或口味与参考价格。', 'dish', item.id, canteen?.id)}</section>
    <section class="detail-block"><div class="block-head"><div><span class="section-kicker">FROM THE COMMUNITY</span><h2>评论</h2></div><span class="small-note">演示身份 · ${storageName()}</span></div><form id="comment-form" class="comment-form"><input name="author" maxlength="30" required placeholder="你的昵称（仅供本地预览）" aria-label="昵称" /><textarea name="body" maxlength="500" required placeholder="写下你对这家店的印象…" aria-label="评论内容"></textarea><div><small>提交前会经过演示屏蔽词筛选（${filterVersion}）</small><button class="button small primary" type="submit">发布评论</button></div></form>${comments.length ? comments.map((entry) => `<article class="comment"><span class="avatar">${escapeHtml(entry.author.slice(0, 1))}</span><div><b>${escapeHtml(entry.author)}</b><time>${dateLabel(entry.createdAt)}</time><p>${escapeHtml(entry.body)}</p></div></article>`).join('') : '<p class="quiet-empty">这里还没有评论，欢迎留下第一条。</p>'}</section></div>
    <aside><section class="aside-card"><span class="section-kicker">ABOUT THIS SHOP</span><h3>一起把信息补全</h3><p>如果位置、分类或营业时间有变化，可以提交补充申请。</p><button class="button outline full" data-action="open-contribution" data-type="field-update" data-target-kind="shop" data-shop-id="${item.id}" data-canteen-id="${canteen?.id}">${icon('plus', 17)} 修改一项或多项</button></section><section class="aside-card photo-card"><div class="block-head"><h3>店铺与菜品图片</h3><button class="mini-add" data-action="open-gallery" data-kind="shop" data-id="${item.id}">查看全部 ${visiblePhotos.length}</button></div><button class="photo-preview" data-action="open-gallery" data-kind="shop" data-id="${item.id}">${visiblePhotos.length ? visiblePhotos.slice(0, 3).map((photo) => `<img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.caption)}" />`).join('') : `<span>${icon('image', 30)} 暂无图片，点击补充</span>`}</button></section><section class="aside-card related-posts-card"><div class="block-head"><h3>相关美食贴</h3><button class="mini-add" data-action="open-post">${icon('plus', 17)} 发帖</button></div>${relatedPosts.length ? relatedPosts.slice(0, 3).map((post) => `<button class="related-post" data-post="${post.id}"><b>${escapeHtml(post.title)}</b><small>${escapeHtml(post.author)} · ${dateLabel(post.createdAt)}</small></button>`).join('') : '<p class="related-empty">还没有关联帖子，欢迎分享这家店。</p>'}</section></aside></div>${provisional.length ? provisionalPanel(provisional) : ''}</main>`;
}

function blankField(title, description, type, shopId, canteenId) { return `<div class="blank-field"><span class="blank-field-icon">${icon('plus', 22)}</span><strong>${title}</strong><p>${description}</p><button class="text-action" data-action="open-contribution" data-type="${type}" data-shop-id="${shopId}" data-canteen-id="${canteenId}">申请补充 ${icon('arrow', 17)}</button></div>`; }
function missingView() { return `<main class="wrap missing-view"><h1>这条资料暂时找不到</h1><p>它可能已下架，或者页面需要刷新。</p><button class="button primary" data-view="home">返回首页</button></main>`; }

function contributeView() {
  return `<main class="wrap content-page"><div class="page-intro"><span class="section-kicker">A SHARED LITTLE GUIDE</span><h1>从你知道的<br><em>一点点开始。</em></h1><p>食堂和店铺信息不需要由一个人写完。你提交的内容会先交给管理员审核，再决定是否暂示或收录。</p></div><div class="contribute-grid"><button class="contribute-tile" data-action="open-contribution" data-type="canteen"><span class="tile-icon green">${icon('bowl', 26)}</span><strong>添加食堂</strong><p>补上一个校区里尚未收录的食堂。</p><span>开始填写 ${icon('arrow', 17)}</span></button><button class="contribute-tile" data-action="open-contribution" data-type="shop"><span class="tile-icon peach">${icon('pin', 26)}</span><strong>添加店铺</strong><p>告诉大家这家店在哪里、叫什么。</p><span>开始填写 ${icon('arrow', 17)}</span></button><button class="contribute-tile" data-action="open-contribution" data-type="dish"><span class="tile-icon cream">${icon('leaf', 26)}</span><strong>补充菜品</strong><p>菜名和参考价格，让选择更轻松。</p><span>开始填写 ${icon('arrow', 17)}</span></button><button class="contribute-tile" data-action="open-contribution" data-type="hours"><span class="tile-icon blue">${icon('clock', 26)}</span><strong>更新营业时间</strong><p>食堂时间有变化，就来更新它。</p><span>开始填写 ${icon('arrow', 17)}</span></button></div><div class="process-banner"><span>${icon('shield', 22)}</span><div><b>每条共建都会先经过管理员确认</b><p>管理员可让信息暂示 24 小时，或核实后直接固定。当前预览数据保存在${storageName()}。</p></div></div></main>`;
}

function rulesView() {
  return `<main class="wrap content-page rules-page"><div class="page-intro"><span class="section-kicker">COMMUNITY GUIDE</span><h1>网站评价规则</h1><p>用真实、具体的信息帮助同学选择下一餐。本站不设置打分。以下说明区分当前预览功能与后续计划。</p></div><div class="rules-grid"><section><span>01</span><h2>评论与美食贴</h2><p>围绕实际用餐经历表达观点，尽量写清菜品、时间和体验；请勿发布辱骂、广告、隐私信息或未经核实的指控。当前支持店铺评论和美食贴发布，提交时使用演示屏蔽词筛选。</p></section><section><span>02</span><h2>图片与共建</h2><p>请上传自己有权使用的清晰图片。菜品图片关联菜名；店铺门面图片可单独提交。共建申请由管理员审核，可直接收录或暂示 24 小时；管理员可修改或下架资料。</p></section><section><span>03</span><h2>推荐与态度</h2><p>推荐票、赞同、反对、收藏和隐藏阈值仍在规划中，当前页面不展示虚构的票数或排名。正式启用前会明确每日基础票、额外票和同店投票上限。</p></section><section><span>04</span><h2>身份与处理</h2><p>当前是本地预览，昵称不代表已验证身份，内容保存在${storageName()}。学校登录接入后，再开放正式的用户互动与申诉流程。</p></section></div></main>`;
}

function postsView() {
  const posts = state.data.posts || [];
  return `<main class="wrap content-page"><div class="page-intro"><span class="section-kicker">FOOD STORIES</span><h1>美食贴</h1><p>选一家已收录的店铺，分享你的一餐。当前内容保存在${storageName()}。</p><button class="button primary" data-action="open-post">${icon('plus', 18)} 发美食贴</button></div><div class="posts-grid">${posts.length ? posts.map((post) => { const shop = activeShops().find((entry) => entry.id === post.shopId); return `<article class="post-card">${post.photo ? `<img src="${escapeHtml(post.photo)}" alt="${escapeHtml(post.title)}" />` : ''}<div><span class="section-kicker">${escapeHtml(shop?.name || '店铺')}</span><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(postPreview(post))}${post.body?.length > 105 ? '…' : ''}</p><small>${escapeHtml(post.author)} · ${dateLabel(post.createdAt)}</small><button class="text-action" data-post="${post.id}">阅读详情 ${icon('arrow', 17)}</button></div></article>`; }).join('') : `<div class="empty-canteen"><span class="empty-kicker">FIRST STORY</span><h3>还没有美食贴</h3><p>发一篇帖子，分享你最近发现的味道。</p><button class="button outline" data-action="open-post">写第一篇 ${icon('arrow', 17)}</button></div>`}</div></main>`;
}

function postDetailView() {
  const post = (state.data.posts || []).find((entry) => entry.id === state.postId);
  if (!post) return missingView();
  const shop = activeShops().find((entry) => entry.id === post.shopId);
  const canteen = activeCanteens().find((entry) => entry.id === shop?.canteenId);
  return `<main class="wrap post-detail-page"><div class="breadcrumb"><button data-view="posts">美食贴</button>${icon('chevron', 14)}<span>${escapeHtml(post.title)}</span></div><article class="post-detail"><span class="section-kicker">FOOD STORIES</span><h1>${escapeHtml(post.title)}</h1><div class="post-byline"><span class="avatar">${escapeHtml(post.author.slice(0, 1))}</span><span>${escapeHtml(post.author)}<small>${dateLabel(post.createdAt)}</small></span></div><div class="rich-content">${postMarkup(post)}</div><div class="post-associated"><span>${icon('pin', 18)} ${escapeHtml(canteen?.name || '食堂')} · ${escapeHtml(shop?.name || '店铺')}</span>${shop ? `<button class="text-action" data-shop="${shop.id}">查看店铺 ${icon('arrow', 16)}</button>` : ''}</div></article></main>`;
}

function postModal() {
  const shops = activeShops();
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal post-editor-modal" role="dialog" aria-modal="true" aria-label="发美食贴" data-stop><div class="modal-head"><div><span class="section-kicker">FOOD STORIES</span><h2>发美食贴</h2><p>选好店铺，再分享你的发现。</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div>${shops.length ? `<form id="post-form" class="modal-form"><label>关联店铺<select name="shopId" required><option value="">请选择店铺</option>${shops.map((shop) => `<option value="${shop.id}" ${shop.id === state.shopId ? 'selected' : ''}>${escapeHtml(activeCanteens().find((canteen) => canteen.id === shop.canteenId)?.name || '')} · ${escapeHtml(shop.name)}</option>`).join('')}</select></label><label>标题<input name="title" maxlength="80" required placeholder="这餐有什么值得分享？" /></label><div class="rich-editor-wrap"><span class="editor-label">正文</span><div class="editor-toolbar" role="toolbar" aria-label="文字格式"><button type="button" data-action="format-editor" data-command="bold" aria-label="加粗"><b>B</b></button><button type="button" data-action="format-editor" data-command="italic" aria-label="斜体"><i>I</i></button><button type="button" data-action="format-editor" data-command="underline" aria-label="下划线"><u>U</u></button><button type="button" data-action="format-editor" data-command="heading" aria-label="小标题">H2</button><button type="button" data-action="format-editor" data-command="list" aria-label="无序列表">☷</button><label class="editor-image-control">${icon('image', 17)} 添加图片<input id="post-inline-image" type="file" accept="image/png,image/jpeg,image/webp" /></label></div><div id="post-editor" class="rich-editor" contenteditable="true" role="textbox" aria-label="帖子正文" aria-multiline="true" data-placeholder="写下味道、感受或你的发现…"></div><small>支持加粗、斜体、小标题、列表和正文插图；最多 3 张，每张小于 900KB。</small></div><label>昵称<input name="author" maxlength="30" required placeholder="仅供本地预览" /></label><div class="form-notice">${icon('shield', 17)} 帖子经过演示屏蔽词筛选，内容保存在${storageName()}。</div><button class="button primary full" type="submit">发布美食贴</button></form>` : `<div class="post-empty-note">还没有已收录店铺。先到「一起共建」申请添加店铺，管理员确认后即可关联发帖。</div>`}</div></div>`;
}

function adminView() {
  const pending = state.data.contributions.filter((item) => item.status === 'pending');
  const provisional = state.data.contributions.filter((item) => item.status === 'provisional');
  const archived = state.data.canteens.filter((item) => item.status === 'archived').map((item) => ({ ...item, kind: 'canteen' }))
    .concat(state.data.shops.filter((item) => item.status === 'archived').map((item) => ({ ...item, kind: 'shop' })));
  return `<main class="wrap admin-page"><div class="admin-top"><div><span class="section-kicker">LOCAL ADMIN PREVIEW</span><h1>管理工作台</h1><p>这是无权限保护的本地演示界面，正式上线前必须接入管理员身份验证。</p></div><span class="preview-tag">仅供本地预览</span></div><div class="admin-stats"><div><strong>${pending.length}</strong><span>待审核申请</span></div><div><strong>${provisional.length}</strong><span>暂示中</span></div><div><strong>${activeCanteens().length}</strong><span>已收录食堂</span></div><div><strong>${activeShops().length}</strong><span>已收录店铺</span></div></div>
  <section class="admin-section"><div class="admin-section-head"><div><h2>共建申请</h2><p>审核后选择暂示 24 小时、直接固定或驳回。</p></div></div>${pending.length ? pending.map(reviewCard).join('') : `<div class="admin-empty">${icon('check', 25)} 当前没有待审核申请</div>`}</section>
  ${provisional.length ? `<section class="admin-section"><div class="admin-section-head"><div><h2>暂示中的资料</h2><p>到期会自动停止展示；管理员可提前固定或撤销。</p></div></div>${provisional.map((item) => `<div class="manage-row"><span class="status-pill">暂示中</span><span><b>${escapeHtml(item.title)}</b><small>至 ${dateLabel(item.expiresAt)}</small></span><button class="mini-add" data-action="revoke-provisional" data-id="${item.id}">撤销</button><button class="mini-add" data-action="fix-provisional" data-id="${item.id}">固定收录</button></div>`).join('')}</section>` : ''}
  <section class="admin-section"><div class="admin-section-head"><div><h2>直接维护资料</h2><p>管理员可以补充、修改或下架资料。下架不会抹掉本地审核记录。</p></div><div class="head-actions"><button class="button small outline" data-action="edit-campus">编辑校区</button><button class="button small outline" data-action="edit-canteen">添加食堂</button><button class="button small primary" data-action="edit-shop">添加店铺</button></div></div><div class="manage-columns"><div><h3>食堂</h3>${activeCanteens().length ? activeCanteens().map((item) => `<div class="manage-row"><span class="manage-icon">${icon('bowl', 20)}</span><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(state.data.campuses.find((campus) => campus.id === item.campusId)?.name || '')} · ${escapeHtml(item.hours || '时间待补充')}</small></span><button aria-label="管理${escapeHtml(item.name)}照片" data-action="manage-canteen-photos" data-id="${item.id}">${icon('image', 17)}</button><button aria-label="编辑${escapeHtml(item.name)}" data-action="edit-canteen" data-id="${item.id}">${icon('edit', 17)}</button><button aria-label="下架${escapeHtml(item.name)}" data-action="remove-canteen" data-id="${item.id}">${icon('trash', 17)}</button></div>`).join('') : '<p class="admin-list-empty">还没有食堂。</p>'}</div><div><h3>店铺</h3>${activeShops().length ? activeShops().map((item) => `<div class="manage-row"><span class="manage-icon">${icon('leaf', 20)}</span><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(activeCanteens().find((canteen) => canteen.id === item.canteenId)?.name || '')}</small></span><button aria-label="管理${escapeHtml(item.name)}的菜品和图片" data-action="manage-shop-content" data-id="${item.id}">${icon('image', 17)}</button><button aria-label="编辑${escapeHtml(item.name)}" data-action="edit-shop" data-id="${item.id}">${icon('edit', 17)}</button><button aria-label="下架${escapeHtml(item.name)}" data-action="remove-shop" data-id="${item.id}">${icon('trash', 17)}</button></div>`).join('') : '<p class="admin-list-empty">还没有店铺。</p>'}</div></div></section>
  ${archived.length ? `<section class="admin-section"><div class="admin-section-head"><div><h2>已下架资料</h2><p>可恢复误操作下架的食堂或店铺。</p></div></div>${archived.map((item) => `<div class="manage-row"><span class="status-pill">已下架</span><span><b>${escapeHtml(item.name)}</b><small>${item.kind === 'canteen' ? '食堂' : '店铺'}</small></span><button class="mini-add" data-action="restore-entry" data-kind="${item.kind}" data-id="${item.id}">恢复</button></div>`).join('')}</section>` : ''}
  <div class="admin-bottom"><span>预览数据存于${storageName()}；清空操作不可恢复。</span><button class="quiet-button" data-action="reset-preview">清空本地预览数据</button></div></main>`;
}

function reviewCard(item) {
  const labels = { canteen: '新增食堂', shop: '新增店铺', dish: '补充菜品或口味', hours: '营业时间', photo: '店铺图片', 'canteen-photo': '食堂照片', 'shop-info': '店铺信息', 'field-update': '资料修改' };
  const canteen = state.data.canteens.find((entry) => entry.id === item.canteenId);
  const shop = state.data.shops.find((entry) => entry.id === item.shopId);
  const dish = shop?.dishes.find((entry) => entry.id === item.dishId);
  const path = [state.data.campuses.find((entry) => entry.id === item.campusId)?.name, canteen?.name || (item.type === 'canteen' ? '新食堂' : ''), shop?.name || (item.type === 'shop' ? '新店铺' : ''), dish?.name].filter(Boolean).join(' › ');
  const changes = item.type === 'field-update' ? Object.entries(item.changes || {}).map(([field, value]) => `<div class="review-change"><b>${escapeHtml(changeFields[item.targetKind]?.find(([key]) => key === field)?.[1] || field)}</b><span>${escapeHtml(value)}</span></div>`).join('') : '';
  return `<article class="review-card"><div><span class="review-type">${labels[item.type] || '资料'}${item.type === 'photo' ? ` · ${item.photoKind === 'storefront' ? '店铺门面' : '菜品照片'}` : ''}</span><span class="review-date">${dateLabel(item.submittedAt)}</span></div><h3>${escapeHtml(item.title)}</h3><div class="review-path">${icon('pin', 15)} ${escapeHtml(path)}</div>${changes}${item.photo ? `<img class="review-photo" src="${escapeHtml(item.photo)}" alt="${escapeHtml(item.title)}" />` : ''}${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ''}<small>提交人：${escapeHtml(item.author)}</small><div class="review-actions"><button class="button tiny outline" data-action="review" data-decision="rejected" data-id="${item.id}">驳回</button><button class="button tiny outline" data-action="review" data-decision="provisional" data-id="${item.id}">暂示 24 小时</button><button class="button tiny primary" data-action="review" data-decision="fixed" data-id="${item.id}">直接固定</button></div></article>`;
}

function futureView() {
  return `<main class="wrap content-page future-page"><div class="page-intro"><span class="section-kicker">WHAT COMES NEXT</span><h1>还有一些<br><em>值得期待的想法。</em></h1><p>先把两校区的食堂资料慢慢补齐，之后再按实际需要决定下一步。</p></div><div class="future-grid"><div><span class="future-no">01</span><span class="future-icon">${icon('map', 26)}</span><h2>三维食堂</h2><p>在空间里找店，也许还能留下属于那个位置的告示牌。</p><span class="future-status">规划中</span></div><div><span class="future-no">02</span><span class="future-icon">${icon('spark', 26)}</span><h2>AI 推荐</h2><p>理解你的偏好，帮你在熟悉的校园里发现新味道。</p><span class="future-status">规划中</span></div><div><span class="future-no">03</span><span class="future-icon">${icon('chat', 26)}</span><h2>微信小程序</h2><p>在手机上更顺手地查看食堂、提交信息。</p><span class="future-status">规划中</span></div><div><span class="future-no">04</span><span class="future-icon">${icon('leaf', 26)}</span><h2>赞助合作</h2><p>若将来开放合作，赞助内容会与自然推荐清楚区分。</p><span class="future-status">规划中</span></div></div></main>`;
}

const changeFields = {
  canteen: [['name', '食堂名称'], ['location', '食堂位置'], ['hours', '营业时间']],
  shop: [['name', '店铺名称'], ['location', '店铺位置'], ['category', '分类'], ['lateHours', '延时关门时间']],
  dish: [['name', '名称或口味'], ['price', '参考价格'], ['note', '补充说明']],
};

function contributionModalV2() {
  const context = state.modal;
  const type = context.type === 'hours' || context.type === 'shop-info' ? 'field-update' : context.type;
  const targetKind = context.targetKind || (context.type === 'hours' ? 'canteen' : context.type === 'shop-info' ? 'shop' : '');
  const selectedCampusId = context.campusId || state.campusId;
  const canteens = activeCanteens().filter((item) => item.campusId === selectedCampusId);
  const canteenId = canteens.some((item) => item.id === context.canteenId) ? context.canteenId : '';
  const shops = activeShops().filter((item) => item.canteenId === canteenId);
  const shopId = shops.some((item) => item.id === context.shopId) ? context.shopId : '';
  const dishes = activeShops().find((item) => item.id === shopId)?.dishes.filter((item) => item.status !== 'archived') || [];
  const needsCanteen = type !== 'canteen';
  const needsShop = type === 'dish' || type === 'photo' || (type === 'field-update' && targetKind !== 'canteen');
  const needsDish = type === 'field-update' && targetKind === 'dish';
  const heading = type === 'canteen' ? '添加食堂' : type === 'shop' ? '添加店铺' : type === 'dish' ? '补充菜品或口味' : type === 'photo' ? '添加店铺图片' : type === 'canteen-photo' ? '添加食堂照片' : '修改资料';
  const targetNames = [state.data.campuses.find((item) => item.id === selectedCampusId)?.name, canteens.find((item) => item.id === canteenId)?.name, shops.find((item) => item.id === shopId)?.name, needsDish ? dishes.find((item) => item.id === context.dishId)?.name : ''].filter(Boolean);
  const choices = type === 'field-update' ? `<div class="choice-intro"><b>选择要修改的条目</b><span>可以只提交一项，也可以勾选多项。</span></div><div class="field-choice-list">${changeFields[targetKind].map(([field, label]) => `<div class="field-choice ${context.field === field ? 'selected' : ''}"><label class="choice-toggle"><input type="checkbox" data-change-field="${field}" ${context.field === field ? 'checked' : ''} /><span>${label}</span></label><div class="choice-input ${context.field === field ? '' : 'is-hidden'}"><input name="change_${field}" maxlength="${field === 'note' ? 200 : 120}" placeholder="填写新的${label}" ${context.field === field ? 'required' : ''} /></div></div>`).join('')}</div>` : '';
  const content = type === 'field-update' ? choices
    : type === 'canteen' ? '<label>食堂名称<input name="title" maxlength="60" required placeholder="先告诉我们食堂叫什么" /></label><label>位置（选填）<input name="detail" maxlength="120" placeholder="只知道名字也可以提交" /></label><label>营业时间（选填）<input name="hours" maxlength="120" placeholder="如：每天 07:00–20:00" /></label>'
    : type === 'shop' ? '<label>店铺名称<input name="title" maxlength="60" required placeholder="先告诉我们店铺叫什么" /></label><label>位置（选填）<input name="detail" maxlength="120" placeholder="如：食堂二楼东侧" /></label><label>分类（选填）<input name="category" maxlength="40" placeholder="如：面食、饮品" /></label>'
    : type === 'dish' ? '<label>菜品名称或口味<input name="title" maxlength="60" required placeholder="如：招牌牛肉面、番茄口味" /></label><label>参考价格（选填）<input name="price" maxlength="20" placeholder="如：12.00" /></label><label>补充说明（选填）<textarea name="detail" maxlength="200" placeholder="分量、食材或其他有用信息"></textarea></label><label>菜品照片（选填）<input name="photoFile" type="file" accept="image/png,image/jpeg,image/webp" /></label>'
    : type === 'photo' ? `<label>图片类型<select name="photoKind" id="contrib-photo-kind"><option value="storefront">店铺门面</option><option value="dish">菜品照片</option></select></label><label id="contrib-dish-wrap" class="is-hidden">对应菜品<select name="dishId" id="contrib-dish"><option value="">请选择菜品</option>${dishes.map((dish) => `<option value="${dish.id}">${escapeHtml(dish.name)}</option>`).join('')}</select></label><p class="field-hint" id="dish-hint">门面照片无需关联菜品。</p><label>选择图片<input name="photoFile" type="file" accept="image/png,image/jpeg,image/webp" required /></label>`
    : '<label>食堂照片<input name="photoFile" type="file" accept="image/png,image/jpeg,image/webp" required /></label>';
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal contribution-sheet" role="dialog" aria-modal="true" aria-label="${heading}" data-stop><div class="modal-head"><div><span class="section-kicker">BUILD IT TOGETHER</span><h2>${heading}</h2><p>选好位置，只填写你想补充的部分。</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><form id="contribution-form" class="modal-form"><input type="hidden" name="type" value="${type}" />${targetKind ? `<input type="hidden" name="targetKind" value="${targetKind}" />` : ''}
    <div class="contribution-target"><b>提交到这里</b><span id="contribution-target-text">${escapeHtml(targetNames.join(' › ') || '请选择校区和目标')}</span></div>
    <div class="target-selectors"><label>校区<select name="campusId" id="contrib-campus" required>${state.data.campuses.map((item) => `<option value="${item.id}" ${item.id === selectedCampusId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>
    ${needsCanteen ? `<label>食堂<select name="canteenId" id="contrib-canteen" required><option value="">请选择食堂</option>${canteens.map((item) => `<option value="${item.id}" ${item.id === canteenId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}
    ${needsShop ? `<label>店铺<select name="shopId" id="contrib-shop" required><option value="">请选择店铺</option>${shops.map((item) => `<option value="${item.id}" ${item.id === shopId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}
    ${needsDish ? `<label>菜品或口味<select name="dishId" id="contrib-target-dish" required><option value="">请选择菜品或口味</option>${dishes.map((item) => `<option value="${item.id}" ${item.id === context.dishId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}</div>
    ${content}<label>提交人昵称<input name="author" maxlength="30" required placeholder="正式版将关联登录账号" /></label><div class="form-notice">${icon('shield', 17)} 修改条目和目标位置会一起交给管理员审核。</div><button class="button primary full" type="submit">提交申请 ${icon('arrow', 18)}</button></form></div></div>`;
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
  const canteen = state.data.canteens.find((entry) => entry.id === item?.canteenId);
  const shop = state.data.shops.find((entry) => entry.id === item?.shopId);
  const path = [state.data.campuses.find((entry) => entry.id === item?.campusId)?.name, canteen?.name, shop?.name, shop?.dishes.find((entry) => entry.id === item?.dishId)?.name].filter(Boolean).join(' › ');
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal narrow" role="dialog" aria-modal="true" aria-label="审核共建申请" data-stop><div class="modal-head"><div><span class="section-kicker">REVIEW CONTRIBUTION</span><h2>${labels[context.decision]}申请</h2><p>${escapeHtml(item?.title || '')}</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><div class="review-path">${icon('pin', 15)} ${escapeHtml(path)}</div>${item?.photo ? `<img class="review-photo review-photo-modal" src="${escapeHtml(item.photo)}" alt="${escapeHtml(item.title)}" />` : ''}<form id="review-form" class="modal-form"><label>审核说明（选填）<textarea name="note" maxlength="200" placeholder="写下审核依据，方便之后查阅"></textarea></label><div class="form-notice">${icon('shield', 17)} 此操作会更新本地预览数据。</div><button class="button primary full" type="submit">确认${labels[context.decision]}</button></form></div></div>`;
}

function confirmModal() {
  const context = state.modal;
  const reset = context.action === 'reset-preview';
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal narrow" role="dialog" aria-modal="true" aria-label="确认操作" data-stop><div class="modal-head"><div><span class="section-kicker">PLEASE CONFIRM</span><h2>${reset ? '清空本地数据？' : '下架这条资料？'}</h2><p>${reset ? '这会清空${storageName()}内的全部演示资料，无法撤销。' : '下架后资料不再公开展示，已有记录仍保留。'}</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><div class="confirm-actions"><button class="button outline" data-action="close-modal">取消</button><button class="button primary" data-action="confirm-operation">确认${reset ? '清空' : '下架'}</button></div></div></div>`;
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
  const photoKind = item?.photoKind || (item?.dishId ? 'dish' : 'storefront');
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal narrow" role="dialog" aria-modal="true" aria-label="${isDish ? '编辑菜品' : '编辑图片'}" data-stop><div class="modal-head"><div><span class="section-kicker">ADMIN EDIT</span><h2>${item ? '编辑' : '添加'}${isDish ? '菜品' : '图片'}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><form id="shop-content-form" class="modal-form"><input type="hidden" name="contentKind" value="${isDish ? 'dish' : 'photo'}"/><input type="hidden" name="shopId" value="${shop.id}"/><input type="hidden" name="entryId" value="${item?.id || ''}"/>${isDish ? `<label>菜品名称<input name="name" maxlength="60" required value="${escapeHtml(item?.name || '')}"/></label><label>参考价格<input name="price" maxlength="20" value="${escapeHtml(item?.price || '')}" placeholder="如 12.00"/></label><label>说明<textarea name="note" maxlength="200">${escapeHtml(item?.note || '')}</textarea></label><label>菜品照片（选填）<input name="photoFile" type="file" accept="image/png,image/jpeg,image/webp" /></label>` : `<label>图片类型<select name="photoKind" id="admin-photo-kind"><option value="storefront" ${photoKind === 'storefront' ? 'selected' : ''}>店铺门面</option><option value="dish" ${photoKind === 'dish' ? 'selected' : ''}>菜品照片</option></select></label><label id="admin-dish-wrap" class="${photoKind === 'dish' ? '' : 'is-hidden'}">对应菜品<select name="dishId" ${photoKind === 'dish' ? 'required' : ''}><option value="">请选择菜品</option>${shop.dishes.filter((dish) => dish.status !== 'archived').map((dish) => `<option value="${dish.id}" ${dish.id === item?.dishId ? 'selected' : ''}>${escapeHtml(dish.name)}</option>`).join('')}</select></label><p class="field-hint">门面图片无需关联菜品；菜品图片的说明自动取菜品名。</p><label>选择图片${item ? '（不选择则保留原图）' : ''}<input name="photoFile" type="file" accept="image/png,image/jpeg,image/webp" ${item ? '' : 'required'}/></label>`}<button class="button primary full" type="submit">保存${isDish ? '菜品' : '图片'}</button></form></div></div>`;
}

function modal() {
  if (!state.modal) return '';
  if (state.modal.kind === 'post') return postModal();
  if (state.modal.kind === 'contribution') return contributionModalV2();
  if (state.modal.kind === 'gallery') return galleryModal();
  if (state.modal.kind === 'canteen-photos') return canteenPhotosModal();
  if (state.modal.kind === 'review') return decisionModal();
  if (state.modal.kind === 'confirm') return confirmModal();
  if (['shop-content', 'dish-editor', 'photo-editor'].includes(state.modal.kind)) return shopContentModal();
  return editModal();
}

function galleryModal() {
  const { entityKind, id, shopId } = state.modal;
  const canteen = entityKind === 'canteen' ? activeCanteens().find((item) => item.id === id) : null;
  const shop = entityKind === 'canteen' ? null : activeShops().find((item) => item.id === (shopId || id));
  const dish = entityKind === 'dish' ? shop?.dishes.find((item) => item.id === id) : null;
  const images = canteen ? canteenPhotos(canteen) : dish ? shopImages(shop).filter((photo) => photo.caption === dish.name) : shop ? shopImages(shop) : [];
  const canteenId = canteen?.id || shop?.canteenId || '';
  const addType = canteen ? 'canteen-photo' : 'photo';
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal gallery-modal" role="dialog" aria-modal="true" aria-label="图片展示" data-stop><div class="modal-head"><div><span class="section-kicker">PHOTO GALLERY</span><h2>${escapeHtml(canteen?.name || dish?.name || shop?.name || '图片')} · 图片</h2><p>共 ${images.length} 张，点击窗口外空白处或右上角关闭。</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><div class="gallery-grid">${images.map((photo) => `<figure><img src="${escapeHtml(photo.url)}" alt="${escapeHtml(photo.caption)}" /><figcaption>${escapeHtml(photo.caption)}</figcaption></figure>`).join('')}<button class="gallery-add" data-action="open-contribution" data-type="${addType}" data-canteen-id="${canteenId}" data-shop-id="${shop?.id || ''}">${icon('plus', 30)}<b>添加图片</b><small>申请后由管理员审核</small></button></div></div></div>`;
}

function canteenPhotosModal() {
  const canteen = activeCanteens().find((item) => item.id === state.modal.id);
  if (!canteen) return '';
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-label="管理食堂照片" data-stop><div class="modal-head"><div><span class="section-kicker">ADMIN PHOTOS</span><h2>${escapeHtml(canteen.name)} · 照片</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><div class="admin-photo-list">${canteenPhotos(canteen).map((photo) => `<div class="manage-row"><img src="${escapeHtml(photo.url)}" alt="食堂照片" /><span><b>食堂照片</b></span><button data-action="remove-canteen-photo" data-id="${photo.id}" data-canteen-id="${canteen.id}" aria-label="下架照片">${icon('trash', 17)}</button></div>`).join('') || '<p class="admin-list-empty">还没有照片。</p>'}</div><form id="canteen-photo-form" class="modal-form"><input type="hidden" name="canteenId" value="${canteen.id}" /><label>添加食堂照片<input name="photoFile" type="file" accept="image/png,image/jpeg,image/webp" required /></label><button class="button primary full" type="submit">保存照片</button></form></div></div>`;
}

function render() {
  root.innerHTML = `${header()}${state.notice ? `<div class="toast" role="status">${escapeHtml(state.notice)}<button data-action="dismiss-notice" aria-label="关闭提示">${icon('close', 15)}</button></div>` : ''}${state.view === 'home' ? home() : state.view === 'directory' ? directoryView() : state.view === 'posts' ? postsView() : state.view === 'post-detail' ? postDetailView() : state.view === 'rules' ? rulesView() : state.view === 'canteen' ? canteenView() : state.view === 'shop' ? shopView() : state.view === 'contribute' ? contributeView() : state.view === 'admin' ? adminView() : futureView()}${footer()}${modal()}`;
  document.body.classList.toggle('modal-open', Boolean(state.modal));
}

async function refresh() {
  state.storageMode = await repo.mode();
  await repo.expireProvisional();
  state.data = await repo.snapshot();
  render();
}

function showNotice(message) {
  state.notice = message;
  root.querySelector('.toast')?.remove();
  root.insertAdjacentHTML('afterbegin', `<div class="toast" role="status">${escapeHtml(message)}<button data-action="dismiss-notice" aria-label="关闭提示">${icon('close', 15)}</button></div>`);
  window.setTimeout(() => { if (state.notice === message) { state.notice = ''; root.querySelector('.toast')?.remove(); } }, 4200);
}
function go(view) { state.view = view; state.modal = null; state.query = ''; window.scrollTo({ top: 0, behavior: 'smooth' }); render(); }

root.addEventListener('mousedown', (event) => { if (event.target.closest('[data-action="format-editor"]')) event.preventDefault(); });

root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action], [data-view], [data-campus], [data-canteen], [data-shop], [data-post]');
  if (!target) return;
  if (target.matches('[data-stop]')) return;
  if (target.dataset.view) { go(target.dataset.view); return; }
  if (target.dataset.campus) { state.campusId = target.dataset.campus; state.query = ''; render(); return; }
  if (target.dataset.canteen) { state.canteenId = target.dataset.canteen; go('canteen'); return; }
  if (target.dataset.shop) { state.shopId = target.dataset.shop; go('shop'); return; }
  if (target.dataset.post) { state.postId = target.dataset.post; go('post-detail'); return; }
  const command = target.dataset.action;
  if (command === 'close-modal') { if (event.target.closest('[data-stop]') && target.classList.contains('modal-backdrop')) return; state.modal = null; render(); return; }
  if (command === 'dismiss-notice') { state.notice = ''; root.querySelector('.toast')?.remove(); return; }
  if (command === 'go-contribute') { go('contribute'); return; }
  if (command === 'scroll-how') { document.querySelector('#how-it-works')?.scrollIntoView({ behavior: 'smooth' }); return; }
  if (command === 'open-post') { state.modal = { kind: 'post' }; render(); return; }
  if (command === 'format-editor') {
    const editor = root.querySelector('#post-editor');
    editor?.focus();
    const commands = { heading: ['formatBlock', 'h2'], list: ['insertUnorderedList', null] };
    const [name, value] = commands[target.dataset.command] || [target.dataset.command, null];
    document.execCommand(name, false, value);
    return;
  }
  if (command === 'open-contribution') { const targetCanteen = state.data.canteens.find((entry) => entry.id === target.dataset.canteenId); state.modal = { kind: 'contribution', type: target.dataset.type, targetKind: target.dataset.targetKind || null, field: target.dataset.field || null, campusId: targetCanteen?.campusId || state.campusId, canteenId: target.dataset.canteenId || null, shopId: target.dataset.shopId || null, dishId: target.dataset.dishId || null }; try { render(); } catch (error) { state.modal = null; showNotice(error.message || '表单暂时无法打开。'); } return; }
  if (command === 'open-gallery') { state.modal = { kind: 'gallery', entityKind: target.dataset.kind, id: target.dataset.id, shopId: target.dataset.shopId }; render(); return; }
  if (command === 'manage-canteen-photos') { state.modal = { kind: 'canteen-photos', id: target.dataset.id }; render(); return; }
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
    if (command === 'remove-canteen-photo') { await repo.removeCanteenPhoto(target.dataset.canteenId, target.dataset.id); state.modal = { kind: 'canteen-photos', id: target.dataset.canteenId }; await refresh(); showNotice('照片已下架。'); return; }
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
      grid.innerHTML = filtered.length ? filtered.map(canteenCard).join('') + addCanteenCard() : emptyCanteen();
    }
  }
});

root.addEventListener('change', async (event) => {
  if (event.target.matches('[data-change-field]')) {
    const choice = event.target.closest('.field-choice');
    const input = choice.querySelector('.choice-input input');
    choice.classList.toggle('selected', event.target.checked);
    choice.querySelector('.choice-input').classList.toggle('is-hidden', !event.target.checked);
    input.required = event.target.checked;
    if (event.target.checked) input.focus();
    return;
  }
  if (event.target.id === 'post-inline-image') {
    const file = event.target.files?.[0];
    const editor = root.querySelector('#post-editor');
    const hint = root.querySelector('.rich-editor-wrap>small');
    try {
      if (!file) return;
      if (file.size > 900_000) throw new Error('每张图片请小于 900KB。');
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请上传 JPG、PNG 或 WebP 图片。');
      if (editor.querySelectorAll('img').length >= 3) throw new Error('每篇最多添加 3 张图片。');
      const url = await fileAsDataUrl(file);
      editor.insertAdjacentHTML('beforeend', `<p><img src="${url}" alt="帖子图片" /></p>`);
      hint.textContent = '图片已添加到正文末尾，可继续编辑文字。';
      event.target.value = '';
      editor.focus();
    } catch (error) { hint.textContent = error.message; }
    return;
  }
  if (event.target.id === 'admin-photo-kind') {
    const form = event.target.closest('form');
    const dish = form.querySelector('[name="dishId"]');
    const isDish = event.target.value === 'dish';
    form.querySelector('#admin-dish-wrap').classList.toggle('is-hidden', !isDish);
    dish.required = isDish;
    if (!isDish) dish.value = '';
    return;
  }
  if (!['contrib-campus', 'contrib-canteen', 'contrib-shop', 'contrib-target-dish', 'contrib-photo-kind'].includes(event.target.id)) return;
  const form = event.target.closest('form');
  const campusId = form.querySelector('#contrib-campus')?.value;
  const canteenSelect = form.querySelector('#contrib-canteen');
  if (event.target.id === 'contrib-campus' && canteenSelect) {
    const canteens = activeCanteens().filter((item) => item.campusId === campusId);
    canteenSelect.innerHTML = '<option value="">请选择食堂</option>' + canteens.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  }
  const shopSelect = form.querySelector('#contrib-shop');
  if (shopSelect && ['contrib-campus', 'contrib-canteen'].includes(event.target.id)) {
    const shops = activeShops().filter((item) => item.canteenId === canteenSelect.value);
    shopSelect.innerHTML = '<option value="">请选择店铺</option>' + shops.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  }
  const targetDishSelect = form.querySelector('#contrib-target-dish');
  if (targetDishSelect && event.target.id !== 'contrib-target-dish') {
    const dishes = activeShops().find((shop) => shop.id === shopSelect?.value)?.dishes.filter((dish) => dish.status !== 'archived') || [];
    targetDishSelect.innerHTML = '<option value="">请选择菜品或口味</option>' + dishes.map((dish) => `<option value="${dish.id}">${escapeHtml(dish.name)}</option>`).join('');
  }
  const dishSelect = form.querySelector('#contrib-dish');
  if (dishSelect) {
    const dishes = activeShops().find((shop) => shop.id === shopSelect?.value)?.dishes.filter((dish) => dish.status !== 'archived') || [];
    if (event.target.id !== 'contrib-photo-kind') dishSelect.innerHTML = '<option value="">请选择菜品</option>' + dishes.map((dish) => `<option value="${dish.id}">${escapeHtml(dish.name)}</option>`).join('');
    const isDish = form.querySelector('#contrib-photo-kind').value === 'dish';
    form.querySelector('#contrib-dish-wrap').classList.toggle('is-hidden', !isDish);
    dishSelect.required = isDish;
    if (!isDish) dishSelect.value = '';
    form.querySelector('#dish-hint').textContent = isDish ? (dishes.length ? '菜品照片的说明直接使用菜品名称。' : '这家店还没有菜品，请先申请补充菜品。') : '门面照片无需关联菜品，图片说明为「店铺门面」。';
  }
  const names = [form.querySelector('#contrib-campus')?.selectedOptions[0]?.textContent, canteenSelect?.value ? canteenSelect.selectedOptions[0]?.textContent : '', shopSelect?.value ? shopSelect.selectedOptions[0]?.textContent : '', targetDishSelect?.value ? targetDishSelect.selectedOptions[0]?.textContent : ''].filter(Boolean);
  form.querySelector('#contribution-target-text').textContent = names.join(' › ');
});

root.addEventListener('submit', async (event) => {
  if (!['contribution-form', 'edit-form', 'comment-form', 'review-form', 'shop-content-form', 'post-form', 'canteen-photo-form'].includes(event.target.id)) return;
  event.preventDefault();
  const form = event.target;
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    if (form.id === 'contribution-form' || form.id === 'post-form') {
      if (values.photoFile instanceof File && values.photoFile.size) {
        if (values.photoFile.size > 900_000) throw new Error('本地预览图片请小于 900KB。');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(values.photoFile.type)) throw new Error('请上传 JPG、PNG 或 WebP 图片。');
        values.photo = await fileAsDataUrl(values.photoFile);
      }
      delete values.photoFile;
      if (form.id === 'post-form') {
        const editor = form.querySelector('#post-editor');
        values.contentHtml = sanitizeRichHtml(editor.innerHTML);
        values.body = plainTextFromRichHtml(values.contentHtml);
        if (!values.body || values.body.length > 5000) throw new Error('正文需填写，且不超过 5000 字。');
        const screening = screenComment(`${values.title} ${values.body}`);
        if (!screening.allowed) throw new Error(screening.reason);
        await repo.submitPost(values); state.modal = null; state.view = 'posts'; await refresh(); showNotice('美食贴已保存到${storageName()}。'); return;
      }
      if (values.type === 'field-update') {
        values.changes = Object.fromEntries([...form.querySelectorAll('[data-change-field]:checked')].map((box) => [box.dataset.changeField, values[`change_${box.dataset.changeField}`]]));
        if (!Object.keys(values.changes).length) throw new Error('请至少选择并填写一项修改。');
        for (const field of Object.keys(values.changes)) delete values[`change_${field}`];
      }
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
    if (form.id === 'canteen-photo-form') {
      const file = values.photoFile;
      if (!file || !file.size) throw new Error('请选择图片。');
      if (file.size > 900_000 || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('请上传小于 900KB 的 JPG、PNG 或 WebP 图片。');
      await repo.saveCanteenPhoto({ canteenId: values.canteenId, photo: await fileAsDataUrl(file) });
      state.modal = { kind: 'canteen-photos', id: values.canteenId }; await refresh(); showNotice('食堂照片已保存。'); return;
    }
    if (form.id === 'review-form') {
      await repo.reviewContribution(state.modal.id, state.modal.decision, values.note);
      state.modal = null; await refresh(); showNotice('审核结果已保存到本地预览。'); return;
    }
    if (form.id === 'shop-content-form') {
      const shopId = values.shopId;
      if (values.photoFile instanceof File && values.photoFile.size) {
          if (values.photoFile.size > 900_000) throw new Error('本地预览图片请小于 900KB。');
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(values.photoFile.type)) throw new Error('请上传 JPG、PNG 或 WebP 图片。');
          values.photo = await fileAsDataUrl(values.photoFile);
      }
      delete values.photoFile;
      if (values.contentKind === 'dish') await repo.saveDish({ ...values, id: values.entryId });
      else await repo.savePhoto({ ...values, id: values.entryId });
      state.modal = { kind: 'shop-content', shopId }; await refresh(); showNotice('店铺资料已保存。'); return;
    }
    const screening = screenComment(values.body);
    if (!screening.allowed) throw new Error(screening.reason);
    await repo.addComment(state.shopId, values.author, values.body);
    await refresh(); showNotice('评论已保存到${storageName()}。');
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









