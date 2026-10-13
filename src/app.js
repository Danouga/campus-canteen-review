import { createRepository, demoUsers, canReview, recommendationLedger, recommendationSummary } from './repository.js';
import { screenComment, filterVersion } from './content-filter.js';
import { sanitizeRichHtml, plainTextFromRichHtml } from './rich-text.js';
import { imageAsDataUrl } from './image-compression.js';

const repo = createRepository();
const root = document.querySelector('#app');
const savedActorId = localStorage.getItem('canteen-guide-demo-actor');
const state = { user: null, authOpen: false, authNotice: '', authMode: 'login', authDraft: { email: '', name: '', password: '', confirmPassword: '', code: '', challengeId: '', sentEmail: '', sentPurpose: '', resendAt: 0 }, authBusy: false, data: null, actorId: demoUsers.some((user) => user.id === savedActorId) ? savedActorId : 'demo-author', campusId: 'campus-a', view: 'home', canteenId: null, shopId: null, dishId: null, postId: null, postFilters: { campusId: '', canteenId: '', shopId: '', sort: 'newest' }, moderationFilters: { kind: 'all', status: 'all', sort: 'newest', query: '', limit: 12 }, profileLedgerLimit: { rewards: 20, votes: 20 }, query: '', modal: null, lightbox: null, commentSort: 'newest', adminCanteenId: null, profileOpen: false, profileTab: 'overview', notice: '', storageMode: 'local' };

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const thumbnailUrl = (url, width = 320) => /^\/api\/media\/[a-f0-9]{64}$/.test(url || '') ? `${url}?w=${width}` : url;
const thumbImg = (url, alt, width = 320, eager = false) => `<img src="${escapeHtml(thumbnailUrl(url, width))}" alt="${escapeHtml(alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="async" ${eager ? 'fetchpriority="high"' : ''} />`;
const dateLabel = (value) => value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
const fullDateLabel = (value) => value ? new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '时间未记录';
const campus = () => state.data.campuses.find((item) => item.id === state.campusId);
const activeCanteens = () => state.data.canteens.filter((item) => item.status === 'active');
const activeShops = () => state.data.shops.filter((item) => item.status === 'active');
const canteensHere = () => activeCanteens().filter((item) => item.campusId === state.campusId);
const pendingCount = () => state.data.contributions.filter((item) => item.status === 'pending').length;
const actor = () => state.storageMode === 'mysql' ? state.user : demoUsers.find((user) => user.id === state.actorId);
const unreadCount = () => state.data.contributions.filter((item) => item.ownerId === state.actorId && item.status !== 'pending' && !item.notificationReadAt).length;
const postPreview = (post) => String(post.body || '').slice(0, 105);
const postMarkup = (post) => post.contentHtml ? sanitizeRichHtml(post.contentHtml) : `<p>${escapeHtml(post.body || '').replace(/\n/g, '<br>')}</p>${post.photo ? `<img src="${escapeHtml(post.photo)}" alt="帖子图片" loading="lazy" decoding="async" />` : ''}`;
const storageName = () => state.storageMode === 'mysql' ? 'MySQL 预览库' : '当前浏览器';
const uploaderName = (ownerId, fallback) => state.data.publicUserNames?.[ownerId] || demoUsers.find((user) => user.id === ownerId)?.name || fallback || '上传者未记录';
function reactionInfo(kind, targetId) {
  const ownerId = kind === 'comment' ? state.data.comments.find((item) => item.id === targetId)?.ownerId : kind === 'post' ? state.data.posts.find((item) => item.id === targetId)?.ownerId : kind === 'contribution' ? state.data.contributions.find((item) => item.id === targetId)?.ownerId : state.data.shops.flatMap((shop) => shop.tagRecords || []).find((item) => item.id === targetId)?.ownerId;
  const latestByActor = new Map();
  for (const entry of state.data.reactions || []) if (entry.targetKind === kind && entry.targetId === targetId && entry.actorId && entry.actorId !== ownerId) latestByActor.set(entry.actorId, entry.stance);
  const votes = [...latestByActor.values()];
  return { agree: votes.filter((stance) => stance === 'agree').length, disagree: votes.filter((stance) => stance === 'disagree').length, mine: latestByActor.get(state.actorId) };
}
function reactionButtons(kind, item) {
  const counts = reactionInfo(kind, item.id);
  const own = item.ownerId === state.actorId;
  return `<div class="reaction-actions" aria-label="赞同与反对"><button type="button" data-action="react" data-kind="${kind}" data-id="${item.id}" data-stance="agree" class="${counts.mine === 'agree' ? 'selected' : ''}" ${own ? 'disabled title="不能给自己的内容表态"' : ''} aria-pressed="${counts.mine === 'agree'}">${icon('heart', 16)} 赞同 ${counts.agree}</button><button type="button" data-action="react" data-kind="${kind}" data-id="${item.id}" data-stance="disagree" class="${counts.mine === 'disagree' ? 'selected disagree' : ''}" ${own ? 'disabled title="不能给自己的内容表态"' : ''} aria-pressed="${counts.mine === 'disagree'}">${icon('brokenHeart', 16)} 反对 ${counts.disagree}</button></div>`;
}
function photoOpenButton(photo, fallback = '') {
  const category = photo.photoKind === 'canteen' ? '食堂照片' : photo.photoKind === 'storefront' ? '店铺门面' : photo.photoKind === 'dish' || photo.dishId ? `菜品照片${photo.caption ? ` · ${photo.caption}` : ''}` : photo.caption || fallback || '图片';
  return `<button class="gallery-photo-open" type="button" data-action="open-lightbox" data-full-url="${escapeHtml(photo.url)}" data-caption="${escapeHtml(photo.caption || fallback)}" data-category="${escapeHtml(category)}" data-description="${escapeHtml(photo.description || '')}" data-owner-id="${escapeHtml(photo.ownerId || '')}" data-uploader="${escapeHtml(photo.author || '')}" aria-label="放大查看${escapeHtml(photo.caption || fallback)}">${thumbImg(photo.url, photo.caption || fallback)}</button>`;
}
const contributionPhoto = (item) => ({ url: item.photo, caption: item.title, photoKind: item.type === 'canteen-photo' ? 'canteen' : item.type === 'dish' ? 'dish' : item.photoKind, description: item.photoDescription || '', ownerId: item.ownerId, author: item.author });
const photoDescriptionField = (value = '') => `<label>图片描述（选填）<textarea name="photoDescription" maxlength="200" placeholder="一句话介绍这张图片，或写下你想说的话">${escapeHtml(value)}</textarea></label>`;

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
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
    brokenHeart: '<path d="M12 5.8 10.9 4.6a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0-7.8-7.8L12 5.8Z"/><path d="m12 5.8-2 4.3 3 2.1-2 4.2"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.spark}</svg>`;
}

function navButton(view, label) { return `<button class="nav-link ${state.view === view || view === 'posts' && state.view === 'shop-posts' ? 'active' : ''}" data-view="${view}">${label}</button>`; }
function action(label, command, extra = '', style = '') { return `<button type="button" class="${style || 'text-action'}" data-action="${command}" ${extra}>${label}</button>`; }

function header() {
  return `<header class="site-header"><div class="header-inner">
    <button class="brand" data-view="home" aria-label="返回首页"><span class="brand-mark">${icon('bowl', 23)}</span><span>食间<span class="brand-dot">.</span><small>校园食堂指南</small></span></button>
    <nav class="main-nav" aria-label="主导航">${navButton('home', '首页')}${navButton('directory', '食堂展示')}${navButton('ranking', '推荐榜')}${navButton('posts', '美食贴')}${navButton('contribute', '一起共建')}${navButton('future', '未来计划')}${canReview(actor()) ? navButton('admin', `${actor()?.role === 'reviewer' ? '审核工作台' : '管理预览'}${pendingCount() ? `<span class="nav-count">${pendingCount()}</span>` : ''}`) : ''}</nav>
    <button class="profile-trigger" data-action="toggle-profile" aria-label="用户信息${unreadCount() ? `，${unreadCount()} 条未读消息` : ''}" aria-expanded="${state.profileOpen || state.authOpen}"><span class="profile-trigger-avatar">${escapeHtml(actor()?.name?.slice(0, 1) || '用')}</span><span>${escapeHtml(actor()?.name || (state.storageMode === 'mysql' ? '登录' : '用户'))}</span>${unreadCount() ? `<span class="nav-count">${unreadCount()}</span>` : ''}</button>
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
    <section class="home-ranking wrap"><div class="detail-section-head"><div><span class="section-kicker">THIS WEEK'S PICKS</span><h2>本周大家推荐的店铺</h2></div><button class="button outline small" data-view="ranking">查看完整榜单 ${icon('arrow', 16)}</button></div><div class="home-ranking-list">${rankingRows(3)}</div></section>
    <section class="steps-section" id="how-it-works"><div class="wrap steps-inner"><div class="steps-intro"><span class="section-kicker">BUILD IT TOGETHER</span><h2>你的一次补充，<br>让下一餐更容易。</h2><p>不必一次写得很完整。店名、位置、菜单或者营业时间，任何一条真实信息都很有帮助。</p>${action(`一起共建 ${icon('arrow', 17)}`, 'go-contribute')}</div><div class="steps-list"><div class="step"><span>01</span><div><b>选择目标</b><p>选好校区、食堂和店铺，确认信息加在哪里。</p></div></div><div class="step"><span>02</span><div><b>提交信息</b><p>填写你知道的部分，图片可用于菜品展示。</p></div></div><div class="step"><span>03</span><div><b>管理员确认</b><p>审核后暂时展示，或直接收录。</p></div></div></div></div></section>
  </main>`;
}

function directoryView() {
  const filtered = canteensHere().filter((canteen) => `${canteen.name} ${canteen.location}`.toLowerCase().includes(state.query.toLowerCase()));
  const proposed = state.data.contributions.filter((item) => item.status === 'provisional' && item.type === 'canteen' && item.campusId === state.campusId);
  return `<main><section class="directory wrap"><div class="section-top"><div><span class="section-kicker">EXPLORE THE CANTEENS</span><h1>食堂展示</h1><p>选择校区，看看已经收录的食堂。每个校区都可以继续添加。</p></div><span class="section-deco">${icon('leaf', 26)}</span></div>${campusTabs()}<div class="directory-toolbar"><div class="search-box">${icon('search', 19)}<input id="search" aria-label="搜索食堂" placeholder="搜索食堂名称或位置" value="${escapeHtml(state.query)}" /></div><span class="toolbar-tip">${icon('shield', 16)} 共建信息先审核，再公开展示</span></div><div class="canteen-grid">${filtered.length ? filtered.map(canteenCard).join('') + addCanteenCard() : emptyCanteen()}</div>${proposed.length ? `<div class="home-proposals">${provisionalPanel(proposed)}</div>` : ''}</section></main>`;
}

function weeklyRanking() {
  const summary = recommendationSummary(state.data, state.actorId);
  const counts = new Map();
  if (state.data.weeklyVoteCounts) for (const item of state.data.weeklyVoteCounts) counts.set(item.shopId, item.count);
  else for (const vote of summary.weeklyVotes) counts.set(vote.shopId, (counts.get(vote.shopId) || 0) + 1);
  return activeShops().map((shop) => ({ shop, count: counts.get(shop.id) || 0, canteen: activeCanteens().find((item) => item.id === shop.canteenId) })).sort((a, b) => b.count - a.count || a.shop.name.localeCompare(b.shop.name, 'zh-CN'));
}
function rankingRows(limit = Infinity) {
  return weeklyRanking().slice(0, limit).map(({ shop, count, canteen }, index) => `<button class="ranking-row" data-shop="${shop.id}"><span class="ranking-number">${String(index + 1).padStart(2, '0')}</span><span class="ranking-shop"><b>${escapeHtml(shop.name)}</b><small>${escapeHtml(canteen?.name || '食堂')}</small></span><strong>${count} 票</strong>${icon('arrow', 17)}</button>`).join('') || '<p class="quiet-empty">还没有收录店铺。</p>';
}
function rankingView() {
  const summary = recommendationSummary(state.data, state.actorId);
  return `<main class="wrap content-page ranking-page"><div class="page-intro"><span class="section-kicker">THIS WEEK'S PICKS</span><h1>本周推荐榜</h1><p>每周一 00:00（北京时间）开启新榜。本周从 ${summary.week} 开始，历史投票仍保留在记录中。</p></div><div class="ranking-layout"><section class="ranking-list"><div class="block-head"><h2>店铺排行</h2><span class="small-note">按本周推荐票排序</span></div>${rankingRows()}</section><aside class="ranking-wallet"><span class="section-kicker">MY VOTES</span><h2>我的推荐票</h2><strong>${summary.available}</strong><p>今日基础票 ${summary.baseRemaining} 张 · 额外票 ${summary.bonus} 张</p><small>同一家店铺每天最多可投 3 张。额外票可以跨天、跨周保留。</small></aside></div></main>`;
}

function addCanteenCard() { return `<button class="canteen-card add-canteen-card" data-action="open-contribution" data-type="canteen">${icon('plus', 31)}<strong>添加食堂</strong><span>知道一间还未收录的食堂？<br>从这里申请补充。</span></button>`; }

function canteenCard(item) {
  const count = activeShops().filter((shop) => shop.canteenId === item.id).length;
  const photos = canteenPhotos(item);
  const cover = photos.length ? photos[[...item.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % photos.length] : null;
  return `<button class="canteen-card" data-canteen="${item.id}"><span class="card-illustration">${cover ? `<img src="${escapeHtml(thumbnailUrl(cover.url, 640))}" alt="${escapeHtml(item.name)}照片" />` : icon('bowl', 42)}</span><span class="card-content"><span class="card-label">${escapeHtml(campus()?.name)} · 食堂</span><strong>${escapeHtml(item.name)}</strong><span class="card-meta">${icon('clock', 16)} ${escapeHtml(item.hours || '营业时间待补充')}</span><span class="card-meta">${icon('pin', 16)} ${escapeHtml(item.location || '位置待补充')}</span><span class="card-bottom"><span>${count} 家店铺</span><span class="circle-arrow">${icon('arrow', 18)}</span></span></span></button>`;
}

function canteenPhotos(item) { return (item.photos || []).filter((photo) => photo.status !== 'archived').map((photo) => ({ ...photo, photoKind: 'canteen' })); }

function emptyCanteen() {
  return `<div class="empty-canteen"><div class="empty-symbol">${icon('bowl', 40)}<span>${icon('plus', 20)}</span></div><span class="empty-kicker">A FRESH START</span><h3>${state.query ? '还没有找到这间食堂' : '这一页，等你写下第一笔。'}</h3><p>${state.query ? '换个关键词试试，或申请添加你知道的食堂。' : `${escapeHtml(campus()?.name)}还没有收录食堂。知道一间？花一分钟告诉我们。`}</p><button class="button outline" data-action="open-contribution" data-type="canteen">${icon('plus', 18)} 申请添加食堂</button></div>`;
}

function breadcrumb({ campusId, canteen, shop, current }) {
  const campusName = state.data.campuses.find((item) => item.id === campusId)?.name || '校区';
  return `<div class="breadcrumb"><button data-view="directory">食堂展示</button>${icon('chevron', 14)}<button data-campus="${escapeHtml(campusId)}" data-view="directory">${escapeHtml(campusName)}</button>${canteen ? `${icon('chevron', 14)}${shop ? `<button data-canteen="${canteen.id}">${escapeHtml(canteen.name)}</button>` : `<span>${escapeHtml(canteen.name)}</span>`}` : ''}${shop ? `${icon('chevron', 14)}${current ? `<button data-shop="${shop.id}">${escapeHtml(shop.name)}</button>` : `<span>${escapeHtml(shop.name)}</span>`}` : ''}${current ? `${icon('chevron', 14)}<span>${escapeHtml(current)}</span>` : ''}</div>`;
}

function canteenView() {
  const item = activeCanteens().find((entry) => entry.id === state.canteenId);
  if (!item) return missingView();
  const shops = activeShops().filter((shop) => shop.canteenId === item.id);
  const provisional = state.data.contributions.filter((entry) => entry.status === 'provisional' && entry.canteenId === item.id);
  const fixed = state.data.contributions.filter((entry) => entry.status === 'fixed' && entry.canteenId === item.id);
  const photos = canteenPhotos(item);
  return `<main class="wrap detail-page">${breadcrumb({ campusId: item.campusId, canteen: item })}<div class="detail-hero canteen-detail-head"><div><span class="detail-label">${escapeHtml(campus()?.name)} / CANTEEN</span><h1><button class="title-edit" data-action="open-contribution" data-type="field-update" data-target-kind="canteen" data-field="name" data-canteen-id="${item.id}">${escapeHtml(item.name)} <span>✎</span></button></h1><p>每一家店铺、每一道菜，都可以从这里开始被发现。</p><div class="detail-facts"><button class="fact-edit" data-action="open-contribution" data-type="field-update" data-target-kind="canteen" data-field="hours" data-canteen-id="${item.id}">${icon('clock', 18)} ${escapeHtml(item.hours || '营业时间待补充')} <span class="edit-mark" aria-hidden="true">✎</span></button><button class="fact-edit" data-action="open-contribution" data-type="field-update" data-target-kind="canteen" data-field="location" data-canteen-id="${item.id}">${icon('pin', 18)} ${escapeHtml(item.location || '位置待补充')} <span class="edit-mark" aria-hidden="true">✎</span></button></div></div><button class="canteen-detail-art" data-action="open-gallery" data-kind="canteen" data-id="${item.id}" aria-label="查看${escapeHtml(item.name)}的照片">${photos.length ? `<img src="${escapeHtml(thumbnailUrl(photos[0].url, 640))}" alt="${escapeHtml(item.name)}照片" />` : `<span>${icon('image', 42)}<small>添加食堂照片</small></span>`}</button></div>
    <div class="detail-section-head"><div><span class="section-kicker">SHOPS INSIDE</span><h2>这里的店铺 <span class="muted-count">${shops.length}</span></h2></div><button class="button small primary" data-action="open-contribution" data-type="shop" data-canteen-id="${item.id}">${icon('plus', 17)} 申请添加店铺</button></div>
    <div class="shop-grid">${shops.length ? shops.map(shopCard).join('') : `<div class="empty-shop"><span class="empty-icon">${icon('plus', 28)}</span><h3>还没有店铺被收录</h3><p>知道这里有哪些店？点击加号，帮大家补全食堂地图。</p><button class="button outline" data-action="open-contribution" data-type="shop" data-canteen-id="${item.id}">添加第一家店 ${icon('arrow', 17)}</button></div>`}</div>
    ${provisional.length ? provisionalPanel(provisional) : ''}${fixedPanel(fixed)}</main>`;
}

function shopTags(item) { const raw = item.tags !== undefined ? item.tags : item.category; return (Array.isArray(raw) ? raw : String(raw || '').split(/[,，、]+/)).map((tag) => String(tag).trim()).filter(Boolean); }
const statusLabels = { open: '正常营业', temporarily_closed: '暂示闭店', available: '可售', unlisted: '下架' };
function currentStatus(item, kind) { return item.availability || (kind === 'shop' ? 'open' : 'available'); }
function proposedStatus(kind, id) { return state.data.contributions.find((item) => item.type === 'status-update' && item.status === 'provisional' && item.targetKind === kind && (kind === 'shop' ? item.shopId === id : item.dishId === id)); }
function statusBadge(item, kind) { const request = proposedStatus(kind, item.id); const value = request?.requestedStatus || currentStatus(item, kind); return `<span class="availability-badge status-${value} ${request ? 'proposed' : ''}">${request ? '待确认 · ' : ''}${statusLabels[value]}</span>`; }
function statusField(item, kind, canteenId, shopId) {
  const request = proposedStatus(kind, item.id);
  const value = request?.requestedStatus || currentStatus(item, kind);
  return `<button class="status-field status-${value} ${request ? 'proposed' : ''}" data-action="open-contribution" data-type="status-update" data-target-kind="${kind}" data-canteen-id="${canteenId}" data-shop-id="${shopId}" ${kind === 'dish' ? `data-dish-id="${item.id}"` : ''} aria-label="修改${kind === 'shop' ? '营业' : '供应'}状态：${statusLabels[value]}">${request ? '待确认 · ' : ''}${statusLabels[value]} <span class="edit-mark" aria-hidden="true">✎</span></button>`;
}
function tagList(item) { const tags = shopTags(item); return tags.length ? tags.map((tag) => `<span class="shop-tag">${escapeHtml(tag)}</span>`).join('') : '<span class="shop-tag muted">标签待补充</span>'; }
function tagSummary(item) { return `<button class="shop-tag-summary" data-action="open-tags" data-shop-id="${item.id}" aria-label="查看${escapeHtml(item.name)}的标签">${tagList(item)}<span class="edit-mark" aria-hidden="true">✎</span></button>`; }

function shopCard(item) {
  const cover = coverForShop(item);
  return `<button class="shop-card" data-shop="${item.id}"><span class="shop-card-art">${cover ? `<img src="${escapeHtml(thumbnailUrl(cover.url, 640))}" alt="${escapeHtml(cover.caption)}" />` : icon('bowl', 34)}</span><span class="shop-card-body"><span class="shop-tags">${tagList(item)}</span><strong>${escapeHtml(item.name)}</strong>${currentStatus(item, 'shop') !== 'open' || proposedStatus('shop', item.id) ? statusBadge(item, 'shop') : ''}<span>${icon('pin', 15)} ${escapeHtml(item.location || '位置待补充')}</span></span></button>`;
}

function shopImages(shop) {
  const dishes = (shop.dishes || []).filter((dish) => dish.status !== 'archived' && currentStatus(dish, 'dish') !== 'unlisted');
  return [...dishes.filter((dish) => dish.photo).map((dish) => ({ id: null, dishId: dish.id, url: dish.photo, caption: dish.name, photoKind: 'dish', description: dish.photoDescription || '', ownerId: dish.photoOwnerId || null })), ...(shop.photos || []).filter((photo) => photo.status !== 'archived').map((photo) => ({ ...photo, id: photo.id, dishId: photo.dishId, url: photo.url, caption: dishes.find((dish) => dish.id === photo.dishId)?.name || photo.caption || shop.name, ownerId: photo.ownerId || null }))];
}
function dishImages(shop, dish) { return shopImages(shop).filter((photo) => photo.dishId === dish.id); }
function samplePhotos(photos, count, key) {
  const seed = [...`${key}:${new Date().toDateString()}`].reduce((value, character) => (value * 31 + character.charCodeAt(0)) >>> 0, 7);
  return [...photos].map((photo, index) => ({ photo, score: [...`${photo.id || photo.caption}:${seed}:${index}`].reduce((value, character) => (value * 33 + character.charCodeAt(0)) >>> 0, 1) })).sort((a, b) => a.score - b.score).slice(0, count).map((entry) => entry.photo);
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
  return `<section class="provisional-panel"><div class="detail-section-head"><div><span class="section-kicker">UNDER REVIEW</span><h2>暂时展示中的共建信息</h2></div></div>${items.map((item) => `<article class="provisional-item"><span class="status-pill">待社区确认</span><strong>${escapeHtml(item.title)}</strong>${item.photo ? photoOpenButton(contributionPhoto(item)) : ''}${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ''}<small>由 ${escapeHtml(item.author)} 提交 · 展示至 ${dateLabel(item.expiresAt)}</small>${reactionButtons('contribution', item)}</article>`).join('')}</section>`;
}

function commentsFor(targetKind, targetId) {
  return state.data.comments.filter((entry) => entry.status !== 'archived' && (
    entry.targetKind === targetKind && entry.targetId === targetId ||
    targetKind === 'shop' && !entry.targetKind && entry.shopId === targetId
  ));
}

function commentSection(targetKind, targetId) {
  const comments = commentsFor(targetKind, targetId).sort((a, b) => state.commentSort === 'agreed' ? reactionInfo('comment', b.id).agree - reactionInfo('comment', a.id).agree || Date.parse(b.createdAt) - Date.parse(a.createdAt) : Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const title = targetKind === 'dish' ? '这道菜的评论' : targetKind === 'post' ? '帖子评论' : '评论';
  return `<section class="detail-block comments-block"><div class="block-head"><div><span class="section-kicker">FROM THE COMMUNITY</span><h2>${title}</h2></div><span class="small-note">${escapeHtml(actor()?.name || '')} · ${storageName()}</span></div><form id="comment-form" class="comment-form" data-target-kind="${targetKind}" data-target-id="${targetId}"><textarea name="body" maxlength="500" required placeholder="写下真实、具体的感受…" aria-label="评论内容"></textarea><div><small>提交前经过演示屏蔽词筛选（${filterVersion}）</small><button class="button small primary" type="submit">发布评论</button></div></form><div class="comment-sort"><label for="comment-sort">评论排序</label><select id="comment-sort"><option value="newest" ${state.commentSort === 'newest' ? 'selected' : ''}>最新发布</option><option value="agreed" ${state.commentSort === 'agreed' ? 'selected' : ''}>赞同最多</option></select></div>${comments.length ? comments.map((entry) => `<article class="comment ${entry.status === 'hidden' ? 'folded-content' : ''}"><span class="avatar">${escapeHtml(entry.author.slice(0, 1))}</span><div><b>${escapeHtml(entry.author)}</b><time>${dateLabel(entry.createdAt)}</time>${entry.status === 'hidden' && entry.ownerId !== state.actorId && !canReview(actor()) ? '<p>这条评论因反对较多已隐藏，等待审核人员复核。</p>' : `<p>${escapeHtml(entry.body)}</p>`}${entry.status === 'hidden' ? '<small>内容待复核</small>' : reactionButtons('comment', entry)}${entry.ownerId === state.actorId ? `<button class="quiet-button" data-action="delete-own" data-kind="comment" data-id="${entry.id}">删除我的评论</button>` : ''}</div></article>`).join('') : '<p class="quiet-empty">还没有评论，欢迎留下第一条。</p>'}</section>`;
}

function shopView() {
  const item = activeShops().find((entry) => entry.id === state.shopId);
  if (!item) return missingView();
  const canteen = activeCanteens().find((entry) => entry.id === item.canteenId);
  const comments = state.data.comments.filter((entry) => entry.shopId === item.id);
  const relatedPosts = sortedPosts((state.data.posts || []).filter((entry) => entry.shopId === item.id && !['archived', 'hidden'].includes(entry.status)), 'agreed');
  const provisional = state.data.contributions.filter((entry) => entry.status === 'provisional' && entry.shopId === item.id);
  const fixed = state.data.contributions.filter((entry) => entry.status === 'fixed' && entry.shopId === item.id);
  const visibleDishes = item.dishes.filter((entry) => entry.status !== 'archived' && currentStatus(entry, 'dish') !== 'unlisted');
  const visiblePhotos = shopImages(item);
  const cover = portraitForShop(item);
  const voteSummary = recommendationSummary(state.data, state.actorId);
  const weeklyVotes = (state.data.weeklyVoteCounts ? state.data.weeklyVoteCounts.find((entry) => entry.shopId === item.id)?.count || 0 : voteSummary.weeklyVotes.filter((vote) => vote.shopId === item.id).length);
  const todayToShop = voteSummary.votesToday.filter((vote) => vote.shopId === item.id).length;
  const canVote = voteSummary.available > 0 && todayToShop < 3 && currentStatus(item, 'shop') !== 'unlisted';
  return `<main class="wrap detail-page">${breadcrumb({ campusId: canteen?.campusId, canteen, shop: item })}<div class="shop-detail-head"><div><span class="detail-label">${escapeHtml(canteen?.name || '')} / SHOP</span><h1><button class="title-edit" data-action="open-contribution" data-type="field-update" data-target-kind="shop" data-field="name" data-canteen-id="${canteen?.id}" data-shop-id="${item.id}">${escapeHtml(item.name)} <span>✎</span></button></h1><p class="inline-edit-fields">${statusField(item, 'shop', canteen?.id, item.id)}<span>·</span>${tagSummary(item)}<span>·</span><button data-action="open-contribution" data-type="field-update" data-target-kind="shop" data-field="location" data-canteen-id="${canteen?.id}" data-shop-id="${item.id}">${escapeHtml(item.location || '位置待补充')} ✎</button></p><div class="detail-facts"><span>${icon('clock', 18)} 食堂 ${escapeHtml(canteen?.hours || '营业时间待补充')}</span><button class="fact-edit" data-action="open-contribution" data-type="field-update" data-target-kind="shop" data-field="lateHours" data-canteen-id="${canteen?.id}" data-shop-id="${item.id}">${icon('spark', 18)} ${escapeHtml(item.lateHours || '店铺延时关门信息待补充')} <span class="edit-mark" aria-hidden="true">✎</span></button></div></div><button class="shop-detail-art" data-action="open-gallery" data-kind="shop" data-id="${item.id}" aria-label="查看${escapeHtml(item.name)}的图片">${cover ? `<img src="${escapeHtml(thumbnailUrl(cover.url, 640))}" alt="${escapeHtml(cover.caption)}" />` : icon('image', 54)}</button></div>
    <section class="shop-vote-panel" aria-label="推荐票"><div><span class="section-kicker">RECOMMEND THIS SHOP</span><h2>推荐这家店</h2><p>本周 <b>${weeklyVotes}</b> 票 · 你今天已投 <b>${todayToShop}/3</b> 票 · 当前可用 <b>${voteSummary.available}</b> 票</p></div><button class="button primary" data-action="vote-shop" data-shop-id="${item.id}" ${canVote ? '' : 'disabled'}>${icon('spark', 18)} ${canVote ? '投 1 张推荐票' : currentStatus(item, 'shop') === 'unlisted' ? '已下架，暂停投票' : todayToShop >= 3 ? '今日对该店已达上限' : '暂无可用推荐票'}</button></section>
    <div class="detail-columns"><div><section class="detail-block"><div class="block-head"><div><span class="section-kicker">ON THE MENU</span><h2>菜品与价格</h2></div><button class="mini-add" data-action="open-contribution" data-type="dish" data-shop-id="${item.id}" data-canteen-id="${canteen?.id}">${icon('plus', 17)} 补充菜品</button></div>${visibleDishes.length ? `<div class="dish-list">${visibleDishes.map((dish) => `<div class="dish-row" data-dish="${dish.id}" data-shop-id="${item.id}" role="link" tabindex="0" aria-label="查看${escapeHtml(dish.name)}详情">${dishImages(item, dish)[0] ? `<button class="dish-thumb-button" data-action="open-gallery" data-kind="dish" data-id="${dish.id}" data-shop-id="${item.id}"><img class="dish-thumb" src="${escapeHtml(thumbnailUrl(dishImages(item, dish)[0].url, 160))}" loading="lazy" decoding="async" alt="${escapeHtml(dish.name)}" /></button>` : ''}<span><b>${escapeHtml(dish.name)}</b><small>${escapeHtml(dish.note || '暂无说明')}</small>${proposedStatus('dish', dish.id) ? statusBadge(dish, 'dish') : ''}</span><span class="dish-row-price">${dish.price ? `¥${escapeHtml(dish.price)}` : '价格待补充'}</span></div>`).join('')}</div>` : blankField('还没有菜品信息', '你可以补充菜品名称或口味与参考价格。', 'dish', item.id, canteen?.id)}</section>
    ${commentSection('shop', item.id)}</div>
    <aside><section class="aside-card photo-card"><div class="block-head"><h3>店铺与菜品图片</h3><button class="mini-add" data-action="open-gallery" data-kind="shop" data-id="${item.id}">查看全部 ${visiblePhotos.length}</button></div><button class="photo-preview" data-action="open-gallery" data-kind="shop" data-id="${item.id}">${visiblePhotos.length ? samplePhotos(visiblePhotos, 3, item.id).map((photo) => `<img src="${escapeHtml(thumbnailUrl(photo.url, 320))}" loading="lazy" decoding="async" alt="${escapeHtml(photo.caption)}" />`).join('') : `<span>${icon('image', 30)} 暂无图片，点击补充</span>`}</button></section><section class="aside-card related-posts-card"><div class="block-head"><h3>相关美食贴</h3><button class="mini-add" data-action="open-shop-posts" data-shop-id="${item.id}">查看全部 ${relatedPosts.length}</button></div>${relatedPosts.length ? relatedPosts.slice(0, 3).map((post) => `<button class="related-post" data-post="${post.id}"><b>${escapeHtml(post.title)}</b><small>${escapeHtml(post.author)} · ${dateLabel(post.createdAt)}</small></button>`).join('') : '<p class="related-empty">还没有关联帖子，欢迎分享这家店。</p>'}</section></aside></div>${provisional.length ? provisionalPanel(provisional) : ''}${fixedPanel(fixed)}</main>`;
}

function dishView() {
  const shop = activeShops().find((entry) => entry.id === state.shopId);
  const dish = shop?.dishes.find((entry) => entry.id === state.dishId && entry.status !== 'archived');
  if (!shop || !dish) return missingView();
  const canteen = activeCanteens().find((entry) => entry.id === shop.canteenId);
  const images = dishImages(shop, dish);
  return `<main class="wrap detail-page dish-page">${breadcrumb({ campusId: canteen?.campusId, canteen, shop, current: dish.name })}<section class="dish-hero"><div><span class="detail-label">${escapeHtml(shop.name)} / DISH</span><h1><button class="title-edit" data-action="open-contribution" data-type="field-update" data-target-kind="dish" data-field="name" data-canteen-id="${canteen?.id}" data-shop-id="${shop.id}" data-dish-id="${dish.id}">${escapeHtml(dish.name)} <span>✎</span></button></h1><div class="dish-info-fields">${statusField(dish, 'dish', canteen?.id, shop.id)}<button class="dish-info-field" data-action="open-contribution" data-type="field-update" data-target-kind="dish" data-field="price" data-canteen-id="${canteen?.id}" data-shop-id="${shop.id}" data-dish-id="${dish.id}">${dish.price ? `¥${escapeHtml(dish.price)}` : '价格待补充'} <span class="edit-mark" aria-hidden="true">✎</span></button><button class="dish-info-field note" data-action="open-contribution" data-type="field-update" data-target-kind="dish" data-field="note" data-canteen-id="${canteen?.id}" data-shop-id="${shop.id}" data-dish-id="${dish.id}">${escapeHtml(dish.note || '说明待补充')} <span class="edit-mark" aria-hidden="true">✎</span></button></div></div><button class="dish-hero-photo" data-action="open-gallery" data-kind="dish" data-id="${dish.id}" data-shop-id="${shop.id}">${images.length ? `<img src="${escapeHtml(thumbnailUrl(images[0].url, 640))}" alt="${escapeHtml(dish.name)}" />` : `<span>${icon('image', 36)}<small>添加菜品照片</small></span>`}</button></section><section class="detail-block dish-gallery-block"><div class="block-head"><div><span class="section-kicker">DISH PHOTOS</span><h2>图片 ${images.length}</h2></div><button class="mini-add" data-action="open-gallery" data-kind="dish" data-id="${dish.id}" data-shop-id="${shop.id}">查看全部</button></div><div class="dish-photo-strip">${samplePhotos(images, 3, dish.id).map((photo) => `<button data-action="open-gallery" data-kind="dish" data-id="${dish.id}" data-shop-id="${shop.id}"><img src="${escapeHtml(thumbnailUrl(photo.url, 320))}" loading="lazy" decoding="async" alt="${escapeHtml(photo.caption)}" /></button>`).join('')}<button class="dish-photo-add" data-action="open-contribution" data-type="photo" data-photo-kind="dish" data-canteen-id="${canteen?.id}" data-shop-id="${shop.id}" data-dish-id="${dish.id}">${icon('plus', 24)} 添加照片</button></div></section>${commentSection('dish', dish.id)}${proposedStatus('dish', dish.id) ? provisionalPanel([proposedStatus('dish', dish.id)]) : ''}</main>`;
}

function blankField(title, description, type, shopId, canteenId) { return `<div class="blank-field"><span class="blank-field-icon">${icon('plus', 22)}</span><strong>${title}</strong><p>${description}</p><button class="text-action" data-action="open-contribution" data-type="${type}" data-shop-id="${shopId}" data-canteen-id="${canteenId}">申请补充 ${icon('arrow', 17)}</button></div>`; }
function missingView() { return `<main class="wrap missing-view"><h1>这条资料暂时找不到</h1><p>它可能已下架，或者页面需要刷新。</p><button class="button primary" data-view="home">返回首页</button></main>`; }

function contributeView() {
  return `<main class="wrap content-page"><div class="page-intro"><span class="section-kicker">A SHARED LITTLE GUIDE</span><h1>从你知道的<br><em>一点点开始。</em></h1><p>食堂和店铺信息不需要由一个人写完。你提交的内容会先交给管理员审核，再决定是否暂示或收录。</p></div><div class="contribute-grid"><button class="contribute-tile" data-action="open-contribution" data-type="canteen"><span class="tile-icon green">${icon('bowl', 26)}</span><strong>添加食堂</strong><p>补上一个校区里尚未收录的食堂。</p><span>开始填写 ${icon('arrow', 17)}</span></button><button class="contribute-tile" data-action="open-contribution" data-type="shop"><span class="tile-icon peach">${icon('pin', 26)}</span><strong>添加店铺</strong><p>告诉大家这家店在哪里、叫什么。</p><span>开始填写 ${icon('arrow', 17)}</span></button><button class="contribute-tile" data-action="open-contribution" data-type="dish"><span class="tile-icon cream">${icon('leaf', 26)}</span><strong>补充菜品</strong><p>菜名和参考价格，让选择更轻松。</p><span>开始填写 ${icon('arrow', 17)}</span></button><button class="contribute-tile" data-action="open-contribution" data-type="hours"><span class="tile-icon blue">${icon('clock', 26)}</span><strong>更新营业时间</strong><p>食堂时间有变化，就来更新它。</p><span>开始填写 ${icon('arrow', 17)}</span></button></div><div class="process-banner"><span>${icon('shield', 22)}</span><div><b>每条共建都会先经过管理员确认</b><p>管理员可让信息暂示 24 小时，或核实后直接固定。当前预览数据保存在${storageName()}。</p></div></div></main>`;
}

function profileMessages() {
  const entries = state.data.contributions.filter((entry) => entry.ownerId === state.actorId);
  const unread = entries.filter((entry) => entry.status !== 'pending' && !entry.notificationReadAt).length;
  const labels = { pending: '等待审核', provisional: '暂示中', fixed: '已固定收录', contested: '固定资料待复核', revoked: '已撤销收录', rejected: '未通过', expired: '暂示已结束' };
  return `<div class="profile-section-intro profile-message-head"><div><h3>我的消息</h3><p>共建申请的审核结果会显示在这里。</p></div>${unread ? `<button type="button" class="profile-mark-all" data-action="mark-all-messages-read">全部标为已读（${unread}）</button>` : ''}</div><div class="profile-message-list">${entries.length ? entries.map((entry) => `<article class="message-card ${entry.status !== 'pending' && !entry.notificationReadAt ? 'unread' : ''}"><div><span class="status-pill">${labels[entry.status] || entry.status}</span><small>${dateLabel(entry.reviewedAt || entry.submittedAt)}</small></div><h2>${escapeHtml(entry.title)}</h2><p>${entry.status === 'pending' ? '申请已送达管理员工作台。' : entry.reviewNote ? escapeHtml(entry.reviewNote) : '管理员已处理这条申请。'}</p>${entry.status !== 'pending' && !entry.notificationReadAt ? `<button class="text-action" data-action="mark-message-read" data-id="${entry.id}">标为已读 ${icon('check', 15)}</button>` : ''}</article>`).join('') : '<div class="profile-empty">还没有共建申请。提交后可在这里查看审核消息。</div>'}</div>`;
}

function profilePublications() {
  const posts = state.data.posts.filter((entry) => entry.ownerId === state.actorId && entry.status !== 'archived');
  const comments = state.data.comments.filter((entry) => entry.ownerId === state.actorId && entry.status !== 'archived');
  const photos = [...state.data.canteens.flatMap((item) => item.photos || []), ...state.data.shops.flatMap((item) => item.photos || [])].filter((entry) => entry.ownerId === state.actorId && entry.status !== 'archived');
  return `<div class="profile-section-intro"><h3>我的发布</h3><p>当前可查看自己发布的美食贴，更多管理入口后续补充。</p></div><div class="profile-stats"><div><strong>${posts.length}</strong><span>美食贴</span></div><div><strong>${comments.length}</strong><span>评论</span></div><div><strong>${photos.length}</strong><span>照片</span></div></div>${posts.length ? `<div class="profile-post-list">${posts.slice(0, 8).map((post) => `<button data-post="${post.id}"><b>${escapeHtml(post.title)}</b><small>${dateLabel(post.createdAt)} ${icon('arrow', 15)}</small></button>`).join('')}</div>` : '<div class="profile-empty">还没有发布美食贴。</div>'}`;
}

function profileVoteLedger() {
  const ledger = recommendationLedger(state.data, state.actorId);
  const summary = recommendationSummary(state.data, state.actorId);
  const rewardLabel = (reward) => {
    if (!reward) return '历史额外票（来源未关联）';
    const item = reward.sourceKind === 'comment' ? state.data.comments.find((entry) => entry.id === reward.sourceId) : reward.sourceKind === 'post' ? state.data.posts.find((entry) => entry.id === reward.sourceId) : state.data.contributions.find((entry) => entry.id === reward.sourceId);
    const kind = { comment: '评论获赞', post: '美食贴获赞', contribution: '共建固定' }[reward.sourceKind] || '额外票奖励';
    const title = item?.title || item?.body || '原内容已移除';
    return `${kind} · ${title.slice(0, 42)}`;
  };
  const rewards = [...ledger.rewards].reverse();
  const votes = [...ledger.votes].reverse();
  const rewardByKey = new Map(ledger.rewards.map((entry) => [entry.key, entry]));
  const rewardRows = rewards.slice(0, state.profileLedgerLimit.rewards).map((entry) => `<li><div><b>${escapeHtml(rewardLabel(entry))}</b><small>${fullDateLabel(entry.createdAt)}${entry.inferred ? ' · 旧记录消耗对应关系为推定' : ''}</small></div><span class="${entry.used ? 'ledger-used' : 'ledger-credit'}">${entry.used ? '已使用' : '+1 张'}</span></li>`).join('') || '<li class="ledger-empty">暂无额外票奖励。</li>';
  const voteRows = votes.slice(0, state.profileLedgerLimit.votes).map((entry) => {
    const shop = state.data.shops.find((item) => item.id === entry.shopId);
    const reward = rewardByKey.get(entry.appliedRewardKey);
    const source = entry.source === 'base' ? '每日基础票' : rewardLabel(reward);
    return `<li><div><b>投给 ${escapeHtml(shop?.name || '已下架店铺')}</b><small>${fullDateLabel(entry.createdAt)} · ${escapeHtml(source)}${entry.sourceInferred ? '（旧记录推定）' : ''}</small></div><span class="ledger-debit">−1 张</span></li>`;
  }).join('') || '<li class="ledger-empty">还没有投出推荐票。</li>';
  return `<div class="profile-ledger"><button class="profile-ledger-back" data-action="profile-tab" data-tab="overview">${icon('arrow', 15)} 返回概览</button><div class="profile-section-intro"><h3>推荐票明细</h3><p>今天的基础票每日更新；额外票按奖励记录保留。旧投票若未记录具体奖励来源，会按发放顺序推定。</p></div><div class="profile-ledger-summary"><div><strong>${summary.available}</strong><span>当前可投</span></div><div><strong>${summary.baseRemaining}</strong><span>今日基础票</span></div><div><strong>${summary.bonus}</strong><span>额外票</span></div></div><section><h4>额外票来源 <span>${rewards.length}</span></h4><ul>${rewardRows}</ul>${rewards.length > state.profileLedgerLimit.rewards ? '<button class="profile-ledger-more" data-action="ledger-more" data-kind="rewards">查看更多来源</button>' : ''}</section><section><h4>投票消耗 <span>${votes.length}</span></h4><ul>${voteRows}</ul>${votes.length > state.profileLedgerLimit.votes ? '<button class="profile-ledger-more" data-action="ledger-more" data-kind="votes">查看更多记录</button>' : ''}</section></div>`;
}

function profileSidebar() {
  if (!state.profileOpen) return '';
  if (state.storageMode === 'mysql' && !state.user) return '';
  const count = unreadCount();
  const votes = recommendationSummary(state.data, state.actorId);
  const points = recommendationLedger(state.data, state.actorId).points;
  const tab = (name, label) => `<button class="profile-tab ${state.profileTab === name || name === 'overview' && state.profileTab === 'vote-ledger' ? 'active' : ''}" data-action="profile-tab" data-tab="${name}">${label}${name === 'messages' && count ? `<span class="nav-count">${count}</span>` : ''}</button>`;
  return `<div class="profile-backdrop" data-action="close-profile"><aside class="profile-sidebar" role="dialog" aria-modal="true" aria-label="用户信息" data-stop><div class="profile-top"><div><span class="section-kicker">MY SPACE</span><h2>用户信息</h2></div><button class="icon-button" data-action="close-profile" aria-label="关闭用户信息">${icon('close', 20)}</button></div><div class="profile-identity"><span class="profile-avatar">${escapeHtml(actor()?.name?.slice(0, 1) || '用')}</span><div><b>${escapeHtml(actor()?.name || (state.storageMode === 'mysql' ? '登录' : '用户'))}</b><small>${state.storageMode === 'mysql' ? escapeHtml(state.user.email) : '演示身份 · 本地预览'}</small></div></div>${state.storageMode === 'mysql' ? '<div class="account-actions"><button class="quiet-button" data-action="account-mode" data-mode="change-password">修改密码</button><button class="quiet-button" data-action="logout">退出登录</button></div>' : `<label class="profile-switch">切换演示身份<select id="demo-actor" aria-label="切换演示身份">${demoUsers.map((user) => `<option value="${user.id}" ${user.id === state.actorId ? 'selected' : ''}>${user.name}</option>`).join('')}</select></label>`}<nav class="profile-tabs" aria-label="用户信息栏目">${tab('overview', '概览')}${tab('messages', '我的消息')}${tab('publications', '我的发布')}</nav><div class="profile-body">${state.profileTab === 'messages' ? profileMessages() : state.profileTab === 'publications' ? profilePublications() : state.profileTab === 'vote-ledger' ? profileVoteLedger() : `<div class="profile-section-intro"><h3>你好，${escapeHtml(actor()?.name || (state.storageMode === 'mysql' ? '登录' : '用户'))}</h3><p>共建记录和发布内容会逐步汇集到这里。</p></div><button class="profile-vote-card" data-action="profile-tab" data-tab="vote-ledger" aria-label="查看推荐票来源与消耗明细"><span>我的推荐票 ${icon('chevron', 16)}</span><strong>${votes.available}</strong><small>今日基础票 ${votes.baseRemaining} 张 · 可保留额外票 ${votes.bonus} 张</small></button><div class="profile-points-card"><span>我的积分 <small>试行</small></span><strong>${points}</strong><p>暂按每投 1 张推荐票获得 1 积分计算。兑换校园周边或学习用品等功能尚未开放。</p></div><button class="button outline small profile-ranking-link" data-view="ranking">查看本周推荐榜 ${icon('arrow', 16)}</button>`}</div></aside></div>`;
}

function rulesView() {
  return `<main class="wrap content-page rules-page"><div class="page-intro"><span class="section-kicker">COMMUNITY GUIDE</span><h1>网站评价规则</h1><p>用真实、具体的信息帮助同学选择下一餐。本站不设置打分。以下规则会明确标出当前已启用的部分和后续草案。</p></div><div class="rules-grid">
    <section><span>01 · 已启用</span><h2>发布与共建</h2><p>店铺、菜品和美食贴可以评论，暂不开放回复。评论和帖子提交时使用演示屏蔽词筛选；共建申请由管理员审核，可暂示 24 小时或直接收录。</p></section>
    <section><span>02 · 演示中</span><h2>赞同与反对</h2><p>标签、评论、帖子与共建信息可赞同或反对。每个用户对同一内容只保留一次有效态度，可撤销或改选；不能给自己的内容表态。</p></section>
    <section><span>03 · 演示中</span><h2>隐藏与复核</h2><p>评论、帖子或标签收到至少 5 个反对，且反对数达到赞同数的 2 倍时自动隐藏，由管理员复核。暂示信息获得至少 5 个不同用户赞同且赞同多于反对时可固定；获得至少 5 个不同用户反对且反对不少于赞同时提前撤销。已固定信息集中被反对时交管理员复核。</p></section>
    <section><span>04 · 演示中</span><h2>推荐票与积分</h2><p>每人每天获得 1 张基础票，当天未用则失效；额外奖励票可保留，投票时优先使用基础票。同一店铺每人每天最多投 3 张。店铺票数每周一 00:00（北京时间）重新统计，历史记录保留，额外票不随周榜清零。下架店铺暂停投票。积分暂按每投 1 票累计 1 分，兑换功能尚未开放。</p></section>
    <section><span>05 · 演示中</span><h2>额外推荐票</h2><p>评论获得 5 个不同用户赞同、帖子获得 10 个不同用户赞同，或共建申请被固定收录时，各奖励 1 张；每条内容只奖励一次，不计本人表态。${state.storageMode === 'mysql' ? '奖励根据已登录账户的有效赞同计算。' : '本地预览仅有 4 个演示身份，赞同门槛需接入更多用户后才能自然达到。'}</p></section>
    <section><span>06 · 当前身份说明</span><h2>演示与正式开放</h2><p>${state.storageMode === 'mysql' ? '使用邮箱和网站密码登录；注册、修改密码及找回密码需要邮箱验证，首次注册均为普通用户。管理员和审核员由网站维护人员单独设置，邮箱注册无法获得这些权限。邮箱验证不代表学校身份，学校身份绑定后续开放。' : '本地浏览器预览可切换演示身份，用于流程测试；MySQL 模式使用邮箱验证码登录与服务端权限校验。'}</p></section>
  </div></main>`;
}

function postsView() {
  const shopOnly = state.view === 'shop-posts';
  const shop = shopOnly ? activeShops().find((entry) => entry.id === state.shopId) : null;
  if (shopOnly && !shop) return missingView();
  const canteen = shopOnly ? activeCanteens().find((entry) => entry.id === shop.canteenId) : null;
  const filters = state.postFilters;
  const canteens = activeCanteens().filter((entry) => !filters.campusId || entry.campusId === filters.campusId);
  const shops = activeShops().filter((entry) => !filters.canteenId || entry.canteenId === filters.canteenId).filter((entry) => !filters.campusId || state.data.canteens.find((canteen) => canteen.id === entry.canteenId)?.campusId === filters.campusId);
  const visiblePosts = (state.data.posts || []).filter((entry) => {
    if (['archived', 'hidden'].includes(entry.status)) return false;
    if (shopOnly) return entry.shopId === shop.id;
    const postShop = activeShops().find((item) => item.id === entry.shopId);
    const postCanteen = state.data.canteens.find((item) => item.id === postShop?.canteenId);
    return (!filters.shopId || entry.shopId === filters.shopId)
      && (!filters.canteenId || postShop?.canteenId === filters.canteenId)
      && (!filters.campusId || postCanteen?.campusId === filters.campusId);
  });
  const posts = sortedPosts(visiblePosts, filters.sort);
  const select = (id, label, options, current) => `<div class="post-filter"><label for="${id}">${label}</label><select id="${id}">${options.map(([value, text]) => `<option value="${escapeHtml(value)}" ${value === current ? 'selected' : ''}>${escapeHtml(text)}</option>`).join('')}</select></div>`;
  return `<main class="wrap content-page">${shopOnly ? breadcrumb({ campusId: canteen?.campusId, canteen, shop, current: '相关美食贴' }) : ''}<div class="page-intro"><span class="section-kicker">FOOD STORIES</span><h1>${shopOnly ? `${escapeHtml(shop.name)} · 美食贴` : '美食贴'}</h1><p>${shopOnly ? '这里收录与这家店有关的全部美食贴。' : `选一家已收录的店铺，分享你的一餐。当前内容保存在${storageName()}。`}</p><button class="button primary" data-action="open-post">${icon('plus', 18)} 发美食贴</button></div><div class="posts-toolbar">${shopOnly ? '' : `${select('posts-campus', '校区', [['', '全部校区'], ...state.data.campuses.map((item) => [item.id, item.name])], filters.campusId)}${select('posts-canteen', '食堂', [['', '全部食堂'], ...canteens.map((item) => [item.id, item.name])], filters.canteenId)}${select('posts-shop', '店铺', [['', '全部店铺'], ...shops.map((item) => [item.id, item.name])], filters.shopId)}`}${select('posts-sort', '排序', [['newest', '最新发布'], ['agreed', '赞同最多']], filters.sort)}<span class="posts-result-count">共 ${posts.length} 篇</span></div><div class="posts-grid">${posts.length ? posts.map(postCard).join('') : `<div class="empty-canteen"><span class="empty-kicker">FOOD STORIES</span><h3>这里还没有美食贴</h3><p>试试其他筛选条件，或分享你的发现。</p><button class="button outline" data-action="open-post">发一篇 ${icon('arrow', 17)}</button></div>`}</div></main>`;
}

function sortedPosts(items, sort = 'newest') {
  return [...items].sort((a, b) => sort === 'agreed' ? reactionInfo('post', b.id).agree - reactionInfo('post', a.id).agree || Date.parse(b.createdAt) - Date.parse(a.createdAt) : Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function postCard(post) {
  const shop = activeShops().find((entry) => entry.id === post.shopId);
  return `<article class="post-card" data-post="${post.id}" role="link" tabindex="0" aria-label="阅读${escapeHtml(post.title)}">${post.photo ? `<img src="${escapeHtml(thumbnailUrl(post.photo, 640))}" alt="${escapeHtml(post.title)}" loading="lazy" decoding="async" />` : ''}<div><span class="section-kicker">${escapeHtml(shop?.name || '店铺')}</span><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(postPreview(post))}${post.body?.length > 105 ? '…' : ''}</p><small>${escapeHtml(post.author)} · ${dateLabel(post.createdAt)}</small>${reactionButtons('post', post)}</div></article>`;
}

function postDetailView() {
  const post = (state.data.posts || []).find((entry) => entry.id === state.postId && !['archived', 'hidden'].includes(entry.status));
  if (!post) return missingView();
  const shop = activeShops().find((entry) => entry.id === post.shopId);
  const canteen = activeCanteens().find((entry) => entry.id === shop?.canteenId);
  return `<main class="wrap post-detail-page"><div class="breadcrumb"><button data-view="posts">美食贴</button>${icon('chevron', 14)}<span>${escapeHtml(post.title)}</span></div><article class="post-detail"><span class="section-kicker">FOOD STORIES</span><h1>${escapeHtml(post.title)}</h1><div class="post-byline"><span class="avatar">${escapeHtml(post.author.slice(0, 1))}</span><span>${escapeHtml(post.author)}<small>${dateLabel(post.createdAt)}</small></span></div><div class="rich-content">${postMarkup(post)}</div><div class="post-associated"><span>${icon('pin', 18)} ${escapeHtml(canteen?.name || '食堂')} · ${escapeHtml(shop?.name || '店铺')}</span>${shop ? `<button class="text-action" data-shop="${shop.id}">查看店铺 ${icon('arrow', 16)}</button>` : ''}</div>${reactionButtons('post', post)}${post.ownerId === state.actorId ? `<button class="quiet-button own-post-delete" data-action="delete-own" data-kind="post" data-id="${post.id}">删除我的帖子</button>` : ''}</article><div class="post-comments">${commentSection('post', post.id)}</div></main>`;
}

function postModal() {
  const shops = activeShops();
  const selected = shops.find((shop) => shop.id === state.modal?.selectedShopId);
  const selectedName = selected ? `${activeCanteens().find((canteen) => canteen.id === selected.canteenId)?.name || '食堂'} · ${selected.name}` : '';
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal post-editor-modal" role="dialog" aria-modal="true" aria-label="发美食贴" data-stop><div class="modal-head"><div><span class="section-kicker">FOOD STORIES</span><h2>发美食贴</h2><p>选好店铺，再分享你的发现。</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div>${shops.length ? `<form id="post-form" class="modal-form"><div class="shop-picker"><label for="post-shop-search">关联店铺</label><div class="shop-picker-input">${icon('search', 18)}<input id="post-shop-search" type="search" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="post-shop-options" placeholder="搜索店铺或食堂" value="${escapeHtml(selectedName)}" /></div><input id="post-shop-id" name="shopId" type="hidden" value="${escapeHtml(selected?.id || '')}" /><div id="post-shop-options" class="shop-picker-options" role="listbox" hidden></div><small id="post-shop-hint">输入名称查找，点击结果关联店铺</small></div><label>标题<input name="title" maxlength="80" required placeholder="这餐有什么值得分享？" /></label><div class="rich-editor-wrap"><span class="editor-label">正文</span><div class="editor-toolbar" role="toolbar" aria-label="文字格式"><button type="button" data-action="format-editor" data-command="bold" aria-label="加粗"><b>B</b></button><button type="button" data-action="format-editor" data-command="italic" aria-label="斜体"><i>I</i></button><button type="button" data-action="format-editor" data-command="underline" aria-label="下划线"><u>U</u></button><button type="button" data-action="format-editor" data-command="heading" aria-label="小标题">H2</button><button type="button" data-action="format-editor" data-command="list" aria-label="无序列表">☷</button><label class="editor-image-control">${icon('image', 17)} 添加图片<input id="post-inline-image" type="file" accept="image/png,image/jpeg,image/webp" /></label></div><label class="post-image-description">下一张图片的描述（选填）<input id="post-image-description" maxlength="200" placeholder="填写后再点击添加图片" /></label><div id="post-editor" class="rich-editor" contenteditable="true" role="textbox" aria-label="帖子正文" aria-multiline="true" data-placeholder="写下味道、感受或你的发现…"></div><small>支持加粗、斜体、小标题、列表和正文插图；最多 3 张，大图自动压缩到 900KB 内。</small></div><div class="form-identity">以 <b>${escapeHtml(actor()?.name || '')}</b> 身份发布</div><div class="form-notice">${icon('shield', 17)} 帖子经过演示屏蔽词筛选，内容保存在${storageName()}。</div><button class="button primary full" type="submit">发布美食贴</button></form>` : `<div class="post-empty-note">还没有已收录店铺。先到「一起共建」申请添加店铺，管理员确认后即可关联发帖。</div>`}</div></div>`;
}

function fixedPanel(items) {
  if (!items.length) return '';
  return `<section class="fixed-contributions"><div class="detail-section-head"><div><span class="section-kicker">COMMUNITY RECORD</span><h2>已收录的共建</h2><p>最近收录的 ${Math.min(items.length, 6)} 条资料</p></div></div>${items.slice(0, 6).map((item) => `<article class="fixed-contribution"><div><strong>${escapeHtml(item.title)}</strong><small>由 ${escapeHtml(item.author)} 提交</small></div></article>`).join('')}</section>`;
}

function adminMaintenance() {
  const canteens = activeCanteens();
  const selected = canteens.find((item) => item.id === state.adminCanteenId) || canteens[0];
  const shops = activeShops().filter((shop) => shop.canteenId === selected?.id);
  return `<section class="admin-section"><div class="admin-section-head"><div><h2>直接维护资料</h2><p>先在左侧选择食堂，再管理右侧对应店铺。</p></div><div class="head-actions"><button class="button small outline" data-action="edit-campus">编辑校区</button><button class="button small outline" data-action="edit-canteen">添加食堂</button><button class="button small primary" data-action="edit-shop">添加店铺</button></div></div><div class="manage-columns"><div><h3>食堂</h3>${canteens.length ? canteens.map((item) => `<div class="manage-row ${selected?.id === item.id ? 'selected-canteen' : ''}"><button class="manage-select" data-action="select-admin-canteen" data-id="${item.id}" aria-pressed="${selected?.id === item.id}"><span class="manage-icon">${icon('bowl', 20)}</span><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(state.data.campuses.find((campus) => campus.id === item.campusId)?.name || '')} · ${escapeHtml(item.hours || '时间待补充')}</small></span></button><button aria-label="管理${escapeHtml(item.name)}照片" data-action="manage-canteen-photos" data-id="${item.id}">${icon('image', 17)}</button><button aria-label="编辑${escapeHtml(item.name)}" data-action="edit-canteen" data-id="${item.id}">${icon('edit', 17)}</button><button aria-label="下架${escapeHtml(item.name)}" data-action="remove-canteen" data-id="${item.id}">${icon('trash', 17)}</button></div>`).join('') : '<p class="admin-list-empty">还没有食堂。</p>'}</div><div><h3>${escapeHtml(selected?.name || '店铺')} · 店铺 ${shops.length}</h3>${shops.length ? shops.map((item) => `<div class="manage-row"><span class="manage-icon">${icon('leaf', 20)}</span><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(selected?.name || '')} · ${statusLabels[currentStatus(item, 'shop')]}</small></span><button aria-label="管理${escapeHtml(item.name)}的菜品和图片" data-action="manage-shop-content" data-id="${item.id}">${icon('image', 17)}</button><button aria-label="编辑${escapeHtml(item.name)}" data-action="edit-shop" data-id="${item.id}">${icon('edit', 17)}</button><button aria-label="下架${escapeHtml(item.name)}" data-action="remove-shop" data-id="${item.id}">${icon('trash', 17)}</button></div>`).join('') : '<p class="admin-list-empty">该食堂还没有已收录店铺。</p>'}</div></div></section>`;
}

function adminModeration() {
  const entries = moderationEntries();
  const filters = state.moderationFilters;
  const contested = state.data.contributions.filter((item) => item.status === 'contested');
  const tab = (kind, label) => `<button type="button" class="moderation-tab ${filters.kind === kind ? 'selected' : ''}" data-action="moderation-kind" data-kind="${kind}" aria-pressed="${filters.kind === kind}">${label}<span>${kind === 'all' ? entries.length : entries.filter((entry) => entry.kind === kind).length}</span></button>`;
  return `<section class="admin-section moderation-section"><div class="admin-section-head"><div><h2>评论、帖子与标签</h2><p>按内容、状态和时间查找；隐藏内容可恢复，移除后不再公开。</p></div></div>
    <div class="moderation-toolbar"><div class="moderation-tabs" aria-label="内容类型">${tab('all', '全部')}${tab('comment', '评论')}${tab('post', '帖子')}${tab('tag', '标签')}</div><div class="moderation-controls"><label class="search-box">${icon('search', 17)}<input id="moderation-search" aria-label="搜索内容、作者或位置" placeholder="搜索内容、作者或食堂店铺" value="${escapeHtml(filters.query)}" /></label><label>状态<select id="moderation-status"><option value="all" ${filters.status === 'all' ? 'selected' : ''}>全部状态</option><option value="active" ${filters.status === 'active' ? 'selected' : ''}>公开中</option><option value="hidden" ${filters.status === 'hidden' ? 'selected' : ''}>已隐藏</option></select></label><label>排序<select id="moderation-sort"><option value="newest" ${filters.sort === 'newest' ? 'selected' : ''}>最新发布</option><option value="oldest" ${filters.sort === 'oldest' ? 'selected' : ''}>最早发布</option><option value="opposed" ${filters.sort === 'opposed' ? 'selected' : ''}>反对最多</option></select></label></div></div>
    <div id="moderation-results" aria-live="polite">${moderationResults(entries)}</div>${contested.length ? `<div class="contested-list"><h3>已固定资料待复核</h3>${contested.map((item) => `<div class="moderation-row"><div><span class="status-pill">有异议</span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.reviewNote)}</small></div><div class="moderation-actions"><button data-action="resolve-contested" data-id="${item.id}" data-decision="restore">继续收录</button><button data-action="resolve-contested" data-id="${item.id}" data-decision="revoke">撤销收录</button></div></div>`).join('')}</div>` : ''}</section>`;
}

function moderationEntries() {
  const location = (shopId) => { const shop = state.data.shops.find((item) => item.id === shopId); const canteen = state.data.canteens.find((item) => item.id === shop?.canteenId); return [canteen?.name, shop?.name].filter(Boolean).join(' › ') || '位置未知'; };
  const comments = state.data.comments.filter((item) => item.status !== 'archived').map((item) => {
    const target = item.targetKind === 'dish' ? state.data.shops.flatMap((shop) => shop.dishes || []).find((dish) => dish.id === item.targetId)?.name : item.targetKind === 'post' ? state.data.posts.find((post) => post.id === item.targetId)?.title : '';
    return { ...item, kind: 'comment', title: item.body, context: `${location(item.shopId)}${target ? ` › ${target}` : ''}`, author: item.author || uploaderName(item.ownerId), createdAt: item.createdAt };
  });
  const posts = state.data.posts.filter((item) => item.status !== 'archived').map((item) => ({ ...item, kind: 'post', context: location(item.shopId), author: item.author || uploaderName(item.ownerId) }));
  const tags = state.data.shops.flatMap((shop) => (shop.tagRecords || []).filter((item) => item.status !== 'archived').map((item) => ({ ...item, kind: 'tag', title: item.name, context: location(shop.id), author: uploaderName(item.ownerId), createdAt: item.createdAt || shop.updatedAt || '' })));
  return [...comments, ...posts, ...tags].map((item) => ({ ...item, counts: reactionInfo(item.kind, item.id) }));
}

function moderationResults(entries = moderationEntries()) {
  const filters = state.moderationFilters;
  const query = filters.query.trim().toLocaleLowerCase();
  const visible = entries.filter((item) => (filters.kind === 'all' || item.kind === filters.kind) && (filters.status === 'all' || item.status === filters.status) && (!query || `${item.title} ${item.body || ''} ${item.author} ${item.context}`.toLocaleLowerCase().includes(query)));
  visible.sort((a, b) => filters.sort === 'opposed' ? b.counts.disagree - a.counts.disagree || Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0) : filters.sort === 'oldest' ? Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0) : Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  const labels = { comment: '评论', post: '帖子', tag: '标签' };
  const rows = visible.slice(0, filters.limit).map((item) => `<article class="moderation-item ${item.status === 'hidden' ? 'is-hidden-content' : ''}"><div class="moderation-item-main"><div class="moderation-item-badges"><span class="moderation-kind">${labels[item.kind]}</span><span class="status-pill">${item.status === 'hidden' ? '已隐藏' : '公开中'}</span></div><h3>${escapeHtml(item.title)}</h3>${item.kind === 'post' && item.body ? `<p>${escapeHtml(item.body.slice(0, 150))}${item.body.length > 150 ? '…' : ''}</p>` : ''}<div class="moderation-meta"><span>${escapeHtml(item.context)}</span><span>${escapeHtml(item.author)}</span><span>${dateLabel(item.createdAt)}</span></div><div class="moderation-reactions">赞同 ${item.counts.agree} · 反对 ${item.counts.disagree}</div></div><div class="moderation-actions">${item.status === 'hidden' ? `<button data-action="moderate" data-kind="${item.kind}" data-id="${escapeHtml(item.id)}" data-decision="restore">恢复</button>` : `<button data-action="moderate" data-kind="${item.kind}" data-id="${escapeHtml(item.id)}" data-decision="hide">隐藏</button>`}<button data-action="moderate" data-kind="${item.kind}" data-id="${escapeHtml(item.id)}" data-decision="remove">移除</button></div></article>`).join('');
  return `<div class="moderation-count">找到 ${visible.length} 条内容${visible.length > filters.limit ? ` · 已显示 ${filters.limit} 条` : ''}</div><div class="moderation-list">${rows || '<p class="admin-list-empty">没有符合条件的内容。</p>'}</div>${visible.length > filters.limit ? '<button class="button outline small moderation-more" data-action="moderation-more">显示更多</button>' : ''}`;
}

function adminView() {
  const pending = state.data.contributions.filter((item) => item.status === 'pending');
  const provisional = state.data.contributions.filter((item) => item.status === 'provisional');
  const archived = state.data.canteens.filter((item) => item.status === 'archived').map((item) => ({ ...item, kind: 'canteen' }))
    .concat(state.data.shops.filter((item) => item.status === 'archived').map((item) => ({ ...item, kind: 'shop' })));
  return `<main class="wrap admin-page"><div class="admin-top"><div><span class="section-kicker">LOCAL ADMIN PREVIEW</span><h1>${actor()?.role === 'reviewer' ? '审核工作台' : '管理工作台'}</h1><p>${actor()?.role === 'reviewer' ? '可审核共建申请、处理内容复核；正式资料由管理员直接维护。' : '管理员可审核申请并直接维护资料。'}${state.storageMode === 'mysql' ? '当前权限依据已验证邮箱账户的服务端角色。' : '当前使用可切换的本地演示身份。'}</p></div><span class="preview-tag">仅供本地预览</span></div><div class="admin-stats"><div><strong>${pending.length}</strong><span>待审核申请</span></div><div><strong>${provisional.length}</strong><span>暂示中</span></div><div><strong>${activeCanteens().length}</strong><span>已收录食堂</span></div><div><strong>${activeShops().length}</strong><span>已收录店铺</span></div></div>
  <section class="admin-section"><div class="admin-section-head"><div><h2>共建申请</h2><p>审核后选择暂示 24 小时、直接固定或驳回。</p></div></div>${pending.length ? pending.map(reviewCard).join('') : `<div class="admin-empty">${icon('check', 25)} 当前没有待审核申请</div>`}</section>
  ${provisional.length ? `<section class="admin-section"><div class="admin-section-head"><div><h2>暂示中的资料</h2><p>到期会自动停止展示；管理员或审核员可提前固定或撤销。</p></div></div>${provisional.map((item) => `<div class="manage-row"><span class="status-pill">暂示中</span><span><b>${escapeHtml(item.title)}</b><small>至 ${dateLabel(item.expiresAt)}</small></span><button class="mini-add" data-action="revoke-provisional" data-id="${item.id}">撤销</button><button class="mini-add" data-action="fix-provisional" data-id="${item.id}">固定收录</button></div>`).join('')}</section>` : ''}
  ${actor()?.role === 'admin' ? adminMaintenance() : ''}${adminModeration()}
  ${actor()?.role === 'admin' && archived.length ? `<section class="admin-section"><div class="admin-section-head"><div><h2>已下架资料</h2><p>可恢复误操作下架的食堂或店铺。</p></div></div>${archived.map((item) => `<div class="manage-row"><span class="status-pill">已下架</span><span><b>${escapeHtml(item.name)}</b><small>${item.kind === 'canteen' ? '食堂' : '店铺'}</small></span><button class="mini-add" data-action="restore-entry" data-kind="${item.kind}" data-id="${item.id}">恢复</button></div>`).join('')}</section>` : ''}
  ${actor()?.role === 'admin' ? `<div class="admin-bottom"><span>预览数据存于${storageName()}；清空操作不可恢复。</span><button class="quiet-button" data-action="reset-preview">清空本地预览数据</button></div>` : ''}</main>`;
}

function reviewDetails(item) {
  if (!item) return '';
  const fields = [];
  if (item.type === 'field-update') for (const [field, value] of Object.entries(item.changes || {})) fields.push([changeFields[item.targetKind]?.find(([key]) => key === field)?.[1] || field, Array.isArray(value) ? value.join('、') : value]);
  if (item.type === 'status-update') fields.push(['申请状态', statusLabels[item.requestedStatus] || item.requestedStatus]);
  if (item.type === 'dish') fields.push(['参考价格', item.price ? `¥${item.price}` : '未填写']);
  if (item.type === 'shop') fields.push(['标签', shopTags(item).join('、') || '未填写']);
  if (item.type === 'canteen') fields.push(['营业时间', item.hours || '未填写']);
  if (item.type === 'hours') fields.push(['营业时间', item.hours || item.detail || '未填写']);
  if (item.photo) {
    fields.push(['图片分类', item.type === 'canteen-photo' ? '食堂照片' : item.type === 'dish' || item.photoKind === 'dish' ? '菜品照片' : '店铺门面']);
    fields.push(['图片描述', item.photoDescription || '未填写']);
  }
  if (item.detail) fields.push([item.type === 'dish' ? '补充说明' : '位置或说明', item.detail]);
  return fields.map(([label, value]) => `<div class="review-change"><b>${escapeHtml(label)}</b><span>${escapeHtml(value)}</span></div>`).join('');
}

function reviewCard(item) {
  const labels = { 'status-update': '状态修改', canteen: '新增食堂', shop: '新增店铺', dish: '补充菜品或口味', hours: '营业时间', photo: '店铺图片', 'canteen-photo': '食堂照片', 'shop-info': '店铺信息', 'field-update': '资料修改' };
  const canteen = state.data.canteens.find((entry) => entry.id === item.canteenId);
  const shop = state.data.shops.find((entry) => entry.id === item.shopId);
  const dish = shop?.dishes.find((entry) => entry.id === item.dishId);
  const path = [state.data.campuses.find((entry) => entry.id === item.campusId)?.name, canteen?.name || (item.type === 'canteen' ? '新食堂' : ''), shop?.name || (item.type === 'shop' ? '新店铺' : ''), dish?.name].filter(Boolean).join(' › ');

  return `<article class="review-card"><div><span class="review-type">${labels[item.type] || '资料'}${item.type === 'photo' ? ` · ${item.photoKind === 'storefront' ? '店铺门面' : '菜品照片'}` : ''}</span><span class="review-date">${dateLabel(item.submittedAt)}</span></div><h3>${escapeHtml(item.title)}</h3><div class="review-path">${icon('pin', 15)} ${escapeHtml(path)}</div>${reviewDetails(item)}${item.photo ? `<div class="review-photo-preview">${photoOpenButton(contributionPhoto(item))}</div>` : ''}<small>提交人：${escapeHtml(item.author)}</small><div class="review-actions"><button class="button tiny outline" data-action="review" data-decision="rejected" data-id="${item.id}">驳回</button><button class="button tiny outline" data-action="review" data-decision="provisional" data-id="${item.id}">暂示 24 小时</button><button class="button tiny primary" data-action="review" data-decision="fixed" data-id="${item.id}">直接固定</button></div></article>`;
}

function futureView() {
  return `<main class="wrap content-page future-page"><div class="page-intro"><span class="section-kicker">WHAT COMES NEXT</span><h1>还有一些<br><em>值得期待的想法。</em></h1><p>先把两校区的食堂资料慢慢补齐，之后再按实际需要决定下一步。</p></div><div class="future-grid"><div><span class="future-no">01</span><span class="future-icon">${icon('map', 26)}</span><h2>三维食堂</h2><p>在空间里找店，也许还能留下属于那个位置的告示牌。</p><span class="future-status">规划中</span></div><div><span class="future-no">02</span><span class="future-icon">${icon('spark', 26)}</span><h2>AI 推荐</h2><p>理解你的偏好，帮你在熟悉的校园里发现新味道。</p><span class="future-status">规划中</span></div><div><span class="future-no">03</span><span class="future-icon">${icon('chat', 26)}</span><h2>微信小程序</h2><p>在手机上更顺手地查看食堂、提交信息。</p><span class="future-status">规划中</span></div><div><span class="future-no">04</span><span class="future-icon">${icon('leaf', 26)}</span><h2>赞助合作</h2><p>若将来开放合作，赞助内容会与自然推荐清楚区分。</p><span class="future-status">规划中</span></div></div></main>`;
}

const changeFields = {
  canteen: [['name', '食堂名称'], ['location', '食堂位置'], ['hours', '营业时间']],
  shop: [['name', '店铺名称'], ['location', '店铺位置'], ['tags', '新增标签'], ['lateHours', '延时关门时间']],
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
  const needsShop = type === 'dish' || type === 'photo' || type === 'status-update' || (type === 'field-update' && targetKind !== 'canteen');
  const needsDish = (type === 'field-update' || type === 'status-update') && targetKind === 'dish';
  const lock = context.lockTarget || '';
  const lockCampus = ['campus', 'canteen', 'shop', 'dish'].includes(lock);
  const lockCanteen = ['canteen', 'shop', 'dish'].includes(lock);
  const lockShop = ['shop', 'dish'].includes(lock);
  const lockDish = lock === 'dish';
  const heading = type === 'canteen' ? '添加食堂' : type === 'shop' ? '添加店铺' : type === 'dish' ? '补充菜品或口味' : type === 'photo' ? context.photoKind === 'dish' ? '添加菜品图片' : '添加店铺图片' : type === 'canteen-photo' ? '添加食堂照片' : type === 'status-update' ? '申请修改状态' : '修改资料';
  const targetNames = [state.data.campuses.find((item) => item.id === selectedCampusId)?.name, canteens.find((item) => item.id === canteenId)?.name, shops.find((item) => item.id === shopId)?.name, needsDish || context.dishId ? dishes.find((item) => item.id === context.dishId)?.name : ''].filter(Boolean);
  const choices = type === 'field-update' ? `<div class="choice-intro"><b>选择要修改的条目</b><span>可以只提交一项，也可以勾选多项。</span></div><div class="field-choice-list">${changeFields[targetKind].map(([field, label]) => `<div class="field-choice ${context.field === field ? 'selected' : ''}"><label class="choice-toggle"><input type="checkbox" data-change-field="${field}" ${context.field === field ? 'checked' : ''} /><span>${label}</span></label><div class="choice-input ${context.field === field ? '' : 'is-hidden'}"><input name="change_${field}" maxlength="${field === 'note' ? 200 : 120}" placeholder="${field === 'tags' ? '填写要追加的标签，多个用逗号分隔' : `填写新的${label}`}" ${context.field === field ? 'required' : ''} /></div></div>`).join('')}</div>` : '';
  const content = type === 'status-update' ? `<label>申请状态<select name="requestedStatus" required><option value="">请选择新状态</option>${(targetKind === 'shop' ? [['open', '正常营业'], ['temporarily_closed', '暂示闭店'], ['unlisted', '下架']] : [['available', '可售'], ['unlisted', '下架']]).map(([value, label]) => `<option value="${value}" ${context.requestedStatus === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>情况说明（选填）<textarea name="detail" maxlength="200" placeholder="例如：店铺暂停营业、菜品不再供应"></textarea></label>`
    : type === 'field-update' ? choices
    : type === 'canteen' ? '<label>食堂名称<input name="title" maxlength="60" required placeholder="先告诉我们食堂叫什么" /></label><label>位置（选填）<input name="detail" maxlength="120" placeholder="只知道名字也可以提交" /></label><label>营业时间（选填）<input name="hours" maxlength="120" placeholder="如：每天 07:00–20:00" /></label>'
    : type === 'shop' ? '<label>店铺名称<input name="title" maxlength="60" required placeholder="先告诉我们店铺叫什么" /></label><label>位置（选填）<input name="detail" maxlength="120" placeholder="如：食堂二楼东侧" /></label><label>标签（选填，可多个）<input name="tags" maxlength="120" placeholder="如：面食、饮品、夜宵，用逗号分隔" /></label>'
    : type === 'dish' ? '<label>菜品名称或口味<input name="title" maxlength="60" required placeholder="如：招牌牛肉面、番茄口味" /></label><label>参考价格（选填）<input name="price" maxlength="20" placeholder="如：12.00" /></label><label>补充说明（选填）<textarea name="detail" maxlength="200" placeholder="分量、食材或其他有用信息"></textarea></label><label>菜品照片（选填）<input name="photoFile" type="file" accept="image/png,image/jpeg,image/webp" /></label>'
    : type === 'photo' ? `${lockDish ? `<input type="hidden" name="photoKind" value="dish" /><input type="hidden" name="dishId" value="${escapeHtml(context.dishId)}" />` : `<label>图片类型<select name="photoKind" id="contrib-photo-kind"><option value="storefront" ${context.photoKind === 'dish' ? '' : 'selected'}>店铺门面</option><option value="dish" ${context.photoKind === 'dish' ? 'selected' : ''}>菜品照片</option></select></label><label id="contrib-dish-wrap" class="${context.photoKind === 'dish' ? '' : 'is-hidden'}">对应菜品<select name="dishId" id="contrib-dish" ${context.photoKind === 'dish' ? 'required' : ''}><option value="">请选择菜品</option>${dishes.map((dish) => `<option value="${dish.id}" ${dish.id === context.dishId ? 'selected' : ''}>${escapeHtml(dish.name)}</option>`).join('')}</select></label><p class="field-hint" id="dish-hint">${context.photoKind === 'dish' ? '菜品照片会显示在对应菜品详情页。' : '门面照片无需关联菜品。'}</p>`}<label>选择图片<input name="photoFile" type="file" accept="image/png,image/jpeg,image/webp" required /></label>`
    : '<label>食堂照片<input name="photoFile" type="file" accept="image/png,image/jpeg,image/webp" required /></label>';
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal contribution-sheet" role="dialog" aria-modal="true" aria-label="${heading}" data-stop><div class="modal-head"><div><span class="section-kicker">BUILD IT TOGETHER</span><h2>${heading}</h2><p>选好位置，只填写你想补充的部分。</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><form id="contribution-form" class="modal-form"><input type="hidden" name="type" value="${type}" />${targetKind ? `<input type="hidden" name="targetKind" value="${targetKind}" />` : ''}
    <div class="contribution-target"><b>提交到这里</b><span id="contribution-target-text">${escapeHtml(targetNames.join(' › ') || '请选择校区和目标')}</span></div>
    <div class="target-selectors">${lockCampus ? `<input type="hidden" name="campusId" id="contrib-campus" value="${escapeHtml(selectedCampusId)}" />` : `<label>校区<select name="campusId" id="contrib-campus" required>${state.data.campuses.map((item) => `<option value="${item.id}" ${item.id === selectedCampusId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>`}
    ${needsCanteen ? lockCanteen ? `<input type="hidden" name="canteenId" id="contrib-canteen" value="${escapeHtml(canteenId)}" />` : `<label>食堂<select name="canteenId" id="contrib-canteen" required><option value="">请选择食堂</option>${canteens.map((item) => `<option value="${item.id}" ${item.id === canteenId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}
    ${needsShop ? lockShop ? `<input type="hidden" name="shopId" id="contrib-shop" value="${escapeHtml(shopId)}" />` : `<label>店铺<select name="shopId" id="contrib-shop" required><option value="">请选择店铺</option>${shops.map((item) => `<option value="${item.id}" ${item.id === shopId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}
    ${needsDish ? lockDish ? `<input type="hidden" name="dishId" id="contrib-target-dish" value="${escapeHtml(context.dishId)}" />` : `<label>菜品或口味<select name="dishId" id="contrib-target-dish" required><option value="">请选择菜品或口味</option>${dishes.map((item) => `<option value="${item.id}" ${item.id === context.dishId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}</select></label>` : ''}</div>
    ${content}${['photo', 'canteen-photo', 'dish'].includes(type) ? photoDescriptionField() : ''}<div class="form-identity">以 <b>${escapeHtml(actor()?.name || '')}</b> 身份提交</div><div class="form-notice">${icon('shield', 17)} 图片超出 900KB 时自动压缩；申请和目标位置会一起交给管理员审核。</div><button class="button primary full" type="submit">提交申请 ${icon('arrow', 18)}</button></form></div></div>`;
}

function editModal() {
  const context = state.modal;
  const data = state.data;
  if (context.kind === 'campus') return `<div class="modal-backdrop" data-action="close-modal"><div class="modal narrow" role="dialog" aria-modal="true" aria-label="编辑校区" data-stop><div class="modal-head"><h2>编辑校区名称</h2><button class="icon-button" data-action="close-modal">${icon('close', 20)}</button></div><form id="edit-form" class="modal-form"><input type="hidden" name="kind" value="campus" />${data.campuses.map((item) => `<label>${escapeHtml(item.name)}<input name="${item.id}" value="${escapeHtml(item.name)}" required maxlength="40" /></label>`).join('')}<button class="button primary full" type="submit">保存校区名称</button></form></div></div>`;
  const isCanteen = context.kind === 'canteen';
  const item = context.id && (isCanteen ? data.canteens : data.shops).find((entry) => entry.id === context.id);
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal narrow" role="dialog" aria-modal="true" aria-label="${isCanteen ? '编辑食堂' : '编辑店铺'}" data-stop><div class="modal-head"><div><span class="section-kicker">ADMIN EDIT</span><h2>${item ? '编辑' : '添加'}${isCanteen ? '食堂' : '店铺'}</h2></div><button class="icon-button" data-action="close-modal">${icon('close', 20)}</button></div><form id="edit-form" class="modal-form"><input type="hidden" name="kind" value="${context.kind}" /><input type="hidden" name="entryId" value="${item?.id || ''}" />${isCanteen ? `<label>校区<select name="campusId" required>${data.campuses.map((campusItem) => `<option value="${campusItem.id}" ${campusItem.id === (item?.campusId || state.campusId) ? 'selected' : ''}>${escapeHtml(campusItem.name)}</option>`).join('')}</select></label>` : `<label>所属食堂<select name="canteenId" required><option value="">请选择食堂</option>${activeCanteens().map((canteen) => `<option value="${canteen.id}" ${canteen.id === item?.canteenId ? 'selected' : ''}>${escapeHtml(canteen.name)}</option>`).join('')}</select></label>`}<label>名称<input name="name" value="${escapeHtml(item?.name || '')}" required maxlength="60" /></label><label>位置<input name="location" value="${escapeHtml(item?.location || '')}" maxlength="120" placeholder="可留空，之后由共建补充" /></label>${isCanteen ? `<label>营业时间<input name="hours" value="${escapeHtml(item?.hours || '')}" maxlength="120" placeholder="如：每日 07:00–20:00" /></label>` : `<label>标签（逗号分隔）<input name="tags" value="${escapeHtml(shopTags(item || {}).join('、'))}" maxlength="120" placeholder="如：面食、饮品、夜宵" /></label><label>延时关门说明<input name="lateHours" value="${escapeHtml(item?.lateHours || '')}" maxlength="120" /></label><label>营业状态<select name="availability"><option value="open" ${currentStatus(item || {}, 'shop') === 'open' ? 'selected' : ''}>正常营业</option><option value="temporarily_closed" ${currentStatus(item || {}, 'shop') === 'temporarily_closed' ? 'selected' : ''}>暂示闭店</option><option value="unlisted" ${currentStatus(item || {}, 'shop') === 'unlisted' ? 'selected' : ''}>下架</option></select></label>`}<button class="button primary full" type="submit">保存资料</button></form></div></div>`;
}

function decisionModal() {
  const context = state.modal;
  const item = state.data.contributions.find((entry) => entry.id === context.id);
  const labels = { fixed: '直接固定', provisional: '暂示 24 小时', rejected: '驳回' };
  const canteen = state.data.canteens.find((entry) => entry.id === item?.canteenId);
  const shop = state.data.shops.find((entry) => entry.id === item?.shopId);
  const path = [state.data.campuses.find((entry) => entry.id === item?.campusId)?.name, canteen?.name, shop?.name, shop?.dishes.find((entry) => entry.id === item?.dishId)?.name].filter(Boolean).join(' › ');
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal narrow" role="dialog" aria-modal="true" aria-label="审核共建申请" data-stop><div class="modal-head"><div><span class="section-kicker">REVIEW CONTRIBUTION</span><h2>${labels[context.decision]}申请</h2><p>${escapeHtml(item?.title || '')}</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><div class="review-path">${icon('pin', 15)} ${escapeHtml(path)}</div>${reviewDetails(item)}${item?.photo ? `<div class="review-photo-preview">${photoOpenButton(contributionPhoto(item))}</div>` : ''}<div class="review-submitter">提交人：${escapeHtml(item?.author || '')} · ${dateLabel(item?.submittedAt)}</div><form id="review-form" class="modal-form"><label>审核说明（选填）<textarea name="note" maxlength="200" placeholder="写下审核依据，方便之后查阅"></textarea></label><div class="form-notice">${icon('shield', 17)} 此操作会更新本地预览数据。</div><button class="button primary full" type="submit">确认${labels[context.decision]}</button></form></div></div>`;
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
    return `<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-label="管理菜品和图片" data-stop><div class="modal-head"><div><span class="section-kicker">ADMIN CONTENT</span><h2>${escapeHtml(shop.name)} · 菜品与图片</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><div class="content-admin-section"><div class="block-head"><h3>菜品</h3><button class="mini-add" data-action="edit-dish" data-shop-id="${shop.id}">${icon('plus', 16)} 添加菜品</button></div>${dishes.length ? dishes.map((entry) => `<div class="manage-row"><span><b>${escapeHtml(entry.name)}</b><small>${entry.price ? `¥${escapeHtml(entry.price)}` : '价格待补充'} · ${statusLabels[currentStatus(entry, 'dish')]}</small></span><button data-action="edit-dish" data-shop-id="${shop.id}" data-id="${entry.id}" aria-label="编辑${escapeHtml(entry.name)}">${icon('edit', 17)}</button><button data-action="remove-content" data-kind="dish" data-shop-id="${shop.id}" data-id="${entry.id}" aria-label="下架${escapeHtml(entry.name)}">${icon('trash', 17)}</button></div>`).join('') : '<p class="admin-list-empty">还没有菜品。</p>'}</div><div class="content-admin-section"><div class="block-head"><h3>图片</h3><button class="mini-add" data-action="edit-photo" data-shop-id="${shop.id}">${icon('plus', 16)} 添加图片</button></div>${photos.length ? photos.map((entry) => `<div class="manage-row"><span><b>${escapeHtml(entry.caption)}</b><small>本地预览图片</small></span><button data-action="edit-photo" data-shop-id="${shop.id}" data-id="${entry.id}" aria-label="编辑图片">${icon('edit', 17)}</button><button data-action="remove-content" data-kind="photo" data-shop-id="${shop.id}" data-id="${entry.id}" aria-label="下架图片">${icon('trash', 17)}</button></div>`).join('') : '<p class="admin-list-empty">还没有图片。</p>'}</div></div></div>`;
  }
  const isDish = context.kind === 'dish-editor';
  const item = context.id && (isDish ? shop.dishes : shop.photos).find((entry) => entry.id === context.id);
  const photoKind = item?.photoKind || (item?.dishId ? 'dish' : 'storefront');
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal narrow" role="dialog" aria-modal="true" aria-label="${isDish ? '编辑菜品' : '编辑图片'}" data-stop><div class="modal-head"><div><span class="section-kicker">ADMIN EDIT</span><h2>${item ? '编辑' : '添加'}${isDish ? '菜品' : '图片'}</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><form id="shop-content-form" class="modal-form"><input type="hidden" name="contentKind" value="${isDish ? 'dish' : 'photo'}"/><input type="hidden" name="shopId" value="${shop.id}"/><input type="hidden" name="entryId" value="${item?.id || ''}"/>${isDish ? `<label>菜品名称<input name="name" maxlength="60" required value="${escapeHtml(item?.name || '')}"/></label><label>参考价格<input name="price" maxlength="20" value="${escapeHtml(item?.price || '')}" placeholder="如 12.00"/></label><label>说明<textarea name="note" maxlength="200">${escapeHtml(item?.note || '')}</textarea></label><label>供应状态<select name="availability"><option value="available" ${currentStatus(item || {}, 'dish') === 'available' ? 'selected' : ''}>可售</option><option value="unlisted" ${currentStatus(item || {}, 'dish') === 'unlisted' ? 'selected' : ''}>下架</option></select></label><label>菜品照片（选填）<input name="photoFile" type="file" accept="image/png,image/jpeg,image/webp" /></label>` : `<label>图片类型<select name="photoKind" id="admin-photo-kind"><option value="storefront" ${photoKind === 'storefront' ? 'selected' : ''}>店铺门面</option><option value="dish" ${photoKind === 'dish' ? 'selected' : ''}>菜品照片</option></select></label><label id="admin-dish-wrap" class="${photoKind === 'dish' ? '' : 'is-hidden'}">对应菜品<select name="dishId" ${photoKind === 'dish' ? 'required' : ''}><option value="">请选择菜品</option>${shop.dishes.filter((dish) => dish.status !== 'archived').map((dish) => `<option value="${dish.id}" ${dish.id === item?.dishId ? 'selected' : ''}>${escapeHtml(dish.name)}</option>`).join('')}</select></label><p class="field-hint">门面图片无需关联菜品；图片分类与下方的个人描述会分别展示。</p><label>选择图片${item ? '（不选择则保留原图）' : ''}<input name="photoFile" type="file" accept="image/png,image/jpeg,image/webp" ${item ? '' : 'required'}/></label>`}${photoDescriptionField(isDish ? item?.photoDescription : item?.description)}<button class="button primary full" type="submit">保存${isDish ? '菜品' : '图片'}</button></form></div></div>`;
}

function modal() {
  if (!state.modal) return '';
  if (state.modal.kind === 'post') return postModal();
  if (state.modal.kind === 'contribution') return contributionModalV2();
  if (state.modal.kind === 'tags') return tagsModal();
  if (state.modal.kind === 'gallery') return galleryModal();
  if (state.modal.kind === 'canteen-photos') return canteenPhotosModal();
  if (state.modal.kind === 'review') return decisionModal();
  if (state.modal.kind === 'confirm') return confirmModal();
  if (['shop-content', 'dish-editor', 'photo-editor'].includes(state.modal.kind)) return shopContentModal();
  return editModal();
}

function tagsModal() {
  const shop = activeShops().find((item) => item.id === state.modal.shopId);
  if (!shop) return '';
  const tags = (shop.tagRecords || []).filter((tag) => tag.status === 'active');
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal tags-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(shop.name)}的标签" data-stop><div class="modal-head"><div><span class="section-kicker">SHOP TAGS</span><h2>${escapeHtml(shop.name)} · 标签</h2><p>赞同有帮助的标签；反对达到门槛后，标签会隐藏并交给管理员复核。</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><div class="tag-gallery">${tags.map((tag) => `<div class="tag-gallery-item"><span class="shop-tag">${escapeHtml(tag.name)}</span>${reactionButtons('tag', tag)}</div>`).join('')}<button class="tag-gallery-add" data-action="open-contribution" data-type="field-update" data-target-kind="shop" data-field="tags" data-canteen-id="${shop.canteenId}" data-shop-id="${shop.id}">${icon('plus', 24)}<b>添加标签</b><small>申请后由管理员审核</small></button></div></div></div>`;
}

function galleryModal() {
  const { entityKind, id, shopId } = state.modal;
  const canteen = entityKind === 'canteen' ? activeCanteens().find((item) => item.id === id) : null;
  const shop = entityKind === 'canteen' ? null : activeShops().find((item) => item.id === (shopId || id));
  const dish = entityKind === 'dish' ? shop?.dishes.find((item) => item.id === id) : null;
  const images = canteen ? canteenPhotos(canteen) : dish ? dishImages(shop, dish) : shop ? shopImages(shop) : [];
  const canteenId = canteen?.id || shop?.canteenId || '';
  const addType = canteen ? 'canteen-photo' : 'photo';
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal gallery-modal" role="dialog" aria-modal="true" aria-label="图片展示" data-stop><div class="modal-head"><div><span class="section-kicker">PHOTO GALLERY</span><h2>${escapeHtml(canteen?.name || dish?.name || shop?.name || '图片')} · 图片</h2><p>共 ${images.length} 张，点击图片放大；点击窗口外空白处或右上角关闭。</p></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><div class="gallery-grid">${images.map((photo) => `<figure>${photoOpenButton(photo)}<figcaption>${escapeHtml(photo.caption)}<small>上传者：${escapeHtml(uploaderName(photo.ownerId, photo.author))}</small></figcaption>${photo.id && photo.ownerId === state.actorId ? `<button class="gallery-delete" data-action="delete-own" data-kind="photo" data-id="${photo.id}">删除我的图片</button>` : ''}</figure>`).join('')}<button class="gallery-add" data-action="open-contribution" data-type="${addType}" data-photo-kind="${dish ? 'dish' : ''}" data-canteen-id="${canteenId}" data-shop-id="${shop?.id || ''}" data-dish-id="${dish?.id || ''}">${icon('plus', 30)}<b>添加图片</b><small>申请后由管理员审核</small></button></div></div></div>`;
}

function lightbox() {
  if (!state.lightbox) return '';
  const { url, caption, category, uploader, description } = state.lightbox;
  return `<div class="lightbox-backdrop" data-action="close-lightbox"><div class="lightbox-dialog" role="dialog" aria-modal="true" aria-label="放大查看图片" data-stop><button class="lightbox-close" data-action="close-lightbox" aria-label="关闭图片">${icon('close', 22)}</button><div class="lightbox-image-stack"><img class="lightbox-preview" src="${escapeHtml(thumbnailUrl(url, 640))}" alt="" /><img class="lightbox-full" src="${escapeHtml(url)}" alt="${escapeHtml(caption)}" /></div><div class="lightbox-caption"><strong>${escapeHtml(category || caption || '图片')}</strong><span>${escapeHtml(uploader)} 想说：${escapeHtml(description || '未填写描述')}</span></div></div></div>`;
}

let choiceCounter = 0;
function refreshChoiceSelects(scope = root) {
  for (const select of scope.querySelectorAll('.choice-select select')) {
    const wrapper = select.closest('.choice-select');
    const button = wrapper.querySelector('.choice-select-trigger');
    const list = wrapper.querySelector('.choice-select-options');
    const chosen = select.selectedOptions[0];
    button.querySelector('span').textContent = chosen?.textContent || '请选择';
    button.classList.toggle('placeholder', !select.value);
    button.disabled = select.disabled;
    list.innerHTML = [...select.options].map((option) => `<button type="button" role="option" data-action="choose-choice" data-value="${escapeHtml(option.value)}" aria-selected="${option.selected}" ${option.disabled ? 'disabled' : ''}>${escapeHtml(option.textContent)}</button>`).join('');
  }
}
function upgradeSelects() {
  for (const select of root.querySelectorAll('select:not(.choice-native)')) {
    select.classList.add('choice-native');
    select.setAttribute('aria-hidden', 'true');
    select.tabIndex = -1;
    if (!select.id) select.id = `choice-native-${++choiceCounter}`;
    if (select.required) { select.dataset.requiredChoice = 'true'; select.required = false; }
    const wrapper = document.createElement('div'); wrapper.className = 'choice-select';
    const label = select.getAttribute('aria-label') || root.querySelector(`label[for="${select.id}"]`)?.textContent?.trim() || select.closest('label')?.childNodes[0]?.textContent?.trim() || '选择选项';
    wrapper.innerHTML = `<button type="button" class="choice-select-trigger" data-action="toggle-choice" role="combobox" aria-label="${escapeHtml(label)}" aria-expanded="false" aria-controls="${select.id}-options"><span></span>${icon('chevron', 16)}</button><div class="choice-select-options" id="${select.id}-options" role="listbox" hidden></div>`;
    select.parentNode.insertBefore(wrapper, select); wrapper.prepend(select);
  }
  refreshChoiceSelects();
}

function canteenPhotosModal() {
  const canteen = activeCanteens().find((item) => item.id === state.modal.id);
  if (!canteen) return '';
  return `<div class="modal-backdrop" data-action="close-modal"><div class="modal" role="dialog" aria-modal="true" aria-label="管理食堂照片" data-stop><div class="modal-head"><div><span class="section-kicker">ADMIN PHOTOS</span><h2>${escapeHtml(canteen.name)} · 照片</h2></div><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close', 20)}</button></div><div class="admin-photo-list">${canteenPhotos(canteen).map((photo) => `<div class="manage-row"><img src="${escapeHtml(thumbnailUrl(photo.url, 320))}" loading="lazy" decoding="async" alt="食堂照片" /><span><b>食堂照片</b></span><button data-action="remove-canteen-photo" data-id="${photo.id}" data-canteen-id="${canteen.id}" aria-label="下架照片">${icon('trash', 17)}</button></div>`).join('') || '<p class="admin-list-empty">还没有照片。</p>'}</div><form id="canteen-photo-form" class="modal-form"><input type="hidden" name="canteenId" value="${canteen.id}" /><label>添加食堂照片<input name="photoFile" type="file" accept="image/png,image/jpeg,image/webp" required /></label>${photoDescriptionField()}<button class="button primary full" type="submit">保存照片</button></form></div></div>`;
}

function render() {
  root.innerHTML = `${header()}${state.notice ? `<div class="toast" role="status">${escapeHtml(state.notice)}<button data-action="dismiss-notice" aria-label="关闭提示">${icon('close', 15)}</button></div>` : ''}${state.view === 'home' ? home() : state.view === 'directory' ? directoryView() : state.view === 'ranking' ? rankingView() : ['posts', 'shop-posts'].includes(state.view) ? postsView() : state.view === 'post-detail' ? postDetailView() : state.view === 'rules' ? rulesView() : state.view === 'canteen' ? canteenView() : state.view === 'shop' ? shopView() : state.view === 'dish' ? dishView() : state.view === 'contribute' ? contributeView() : state.view === 'admin' && canReview(actor()) ? adminView() : futureView()}${footer()}${profileSidebar()}${accountDialog()}${modal()}${lightbox()}`;
  upgradeSelects();
  if (root.querySelector('.lightbox-full')?.complete && root.querySelector('.lightbox-full')?.naturalWidth) root.querySelector('.lightbox-image-stack')?.classList.add('loaded');
  const overlayOpen = Boolean(state.modal || state.profileOpen || state.authOpen || state.lightbox);
  document.documentElement.classList.toggle('modal-open', overlayOpen);
  document.body.classList.toggle('modal-open', overlayOpen);
}

async function refresh(initial = false) {
  state.storageMode = await repo.mode();
  if (state.storageMode === 'mysql') { const session = await repo.authSession(); state.user = session.user; if (!state.user && state.authMode === 'change-password') state.authMode = 'login'; state.actorId = session.user?.id || null; }
  state.data = await repo.snapshot();
  if (state.data.contributions.some((item) => item.status === 'provisional' && Date.parse(item.expiresAt) <= Date.now())) {
    await repo.expireProvisional();
    state.data = await repo.snapshot();
  }
  if (initial) loadRoute();
  render();
}

function showNotice(message) {
  state.notice = message;
  root.querySelector('.toast')?.remove();
  root.insertAdjacentHTML('afterbegin', `<div class="toast" role="status">${escapeHtml(message)}<button data-action="dismiss-notice" aria-label="关闭提示">${icon('close', 15)}</button></div>`);
  window.setTimeout(() => { if (state.notice === message) { state.notice = ''; root.querySelector('.toast')?.remove(); } }, 4200);
}
function routePath() {
  if (state.view === 'canteen' && state.canteenId) return `/canteens/${encodeURIComponent(state.canteenId)}`;
  if (state.view === 'shop' && state.shopId) return `/shops/${encodeURIComponent(state.shopId)}`;
  if (state.view === 'shop-posts' && state.shopId) return `/shops/${encodeURIComponent(state.shopId)}/posts`;
  if (state.view === 'dish' && state.shopId && state.dishId) return `/shops/${encodeURIComponent(state.shopId)}/dishes/${encodeURIComponent(state.dishId)}`;
  if (state.view === 'post-detail' && state.postId) return `/posts/${encodeURIComponent(state.postId)}`;
  if (state.view === 'directory') return `/directory/${encodeURIComponent(state.campusId)}`;
  return state.view === 'home' ? '/' : `/${state.view}`;
}
function loadRoute() {
  const parts = location.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  state.view = 'home';
  if (parts[0] === 'canteens' && parts[1]) { state.view = 'canteen'; state.canteenId = parts[1]; state.campusId = state.data.canteens.find((item) => item.id === parts[1])?.campusId || state.campusId; }
  else if (parts[0] === 'shops' && parts[1]) {
    state.shopId = parts[1]; state.canteenId = state.data.shops.find((item) => item.id === parts[1])?.canteenId || null;
    state.campusId = state.data.canteens.find((item) => item.id === state.canteenId)?.campusId || state.campusId;
    state.view = parts[2] === 'dishes' && parts[3] ? 'dish' : parts[2] === 'posts' ? 'shop-posts' : 'shop'; state.dishId = parts[2] === 'dishes' ? parts[3] || null : null;
  }
  else if (parts[0] === 'posts' && parts[1]) { state.view = 'post-detail'; state.postId = parts[1]; }
  else if (parts[0] === 'directory') { state.view = 'directory'; if (state.data.campuses.some((item) => item.id === parts[1])) state.campusId = parts[1]; }
  else if (['posts', 'ranking', 'contribute', 'future', 'rules', 'admin'].includes(parts[0])) state.view = parts[0];
}
function go(view) { state.view = view; state.modal = null; state.lightbox = null; state.profileOpen = false; state.query = ''; history.pushState({}, '', routePath()); window.scrollTo({ top: 0, behavior: 'smooth' }); render(); }
window.addEventListener('popstate', () => { if (!state.data) return; loadRoute(); state.modal = null; state.lightbox = null; state.profileOpen = false; closeAccountDialog(); render(); });

function fuzzyMatch(text, query) {
  const haystack = text.toLocaleLowerCase();
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  if (haystack.includes(needle)) return true;
  let at = 0;
  for (const character of haystack) if (character === needle[at]) at++;
  return at === needle.length;
}
function updateShopOptions(query = '') {
  const list = root.querySelector('#post-shop-options');
  const input = root.querySelector('#post-shop-search');
  if (!list || !input) return;
  const matches = activeShops().map((shop) => ({ shop, canteen: activeCanteens().find((entry) => entry.id === shop.canteenId) })).filter(({ shop, canteen }) => fuzzyMatch(`${canteen?.name || ''} ${shop.name} ${shopTags(shop).join(' ')}`, query)).slice(0, 30);
  list.innerHTML = matches.length ? matches.map(({ shop, canteen }) => `<button type="button" role="option" data-action="pick-post-shop" data-id="${shop.id}" aria-selected="${shop.id === root.querySelector('#post-shop-id')?.value}"><b>${escapeHtml(shop.name)}</b><small>${escapeHtml(canteen?.name || '食堂')} · ${escapeHtml(state.data.campuses.find((campus) => campus.id === canteen?.campusId)?.name || '校区')}</small></button>`).join('') : '<div class="shop-picker-empty">没有找到店铺，试试食堂名称或其他关键词</div>';
  list.hidden = false; input.setAttribute('aria-expanded', 'true');
}

root.addEventListener('mousedown', (event) => { if (event.target.closest('[data-action="format-editor"]')) event.preventDefault(); });
root.addEventListener('load', (event) => { if (event.target.matches?.('.lightbox-full')) event.target.closest('.lightbox-image-stack')?.classList.add('loaded'); }, true);
root.addEventListener('focusin', (event) => { if (event.target.id === 'post-shop-search') updateShopOptions(event.target.value === root.querySelector('#post-shop-search')?.defaultValue ? '' : event.target.value); });

root.addEventListener('keydown', (event) => {
  const openChoice = event.target.closest('.choice-select.open');
  if (event.key === 'Escape' && openChoice) { event.preventDefault(); openChoice.classList.remove('open'); openChoice.querySelector('.choice-select-options').hidden = true; openChoice.querySelector('.choice-select-trigger').setAttribute('aria-expanded', 'false'); openChoice.querySelector('.choice-select-trigger').focus(); return; }
  if (event.key === 'ArrowDown' && event.target.matches('.choice-select-trigger')) { event.preventDefault(); if (!event.target.closest('.choice-select').classList.contains('open')) event.target.click(); event.target.closest('.choice-select').querySelector('.choice-select-options button')?.focus(); return; }
  if (event.key === 'Escape' && state.lightbox) { state.lightbox = null; render(); return; }
  if (event.target.id === 'post-shop-search') {
    if (event.key === 'ArrowDown') { event.preventDefault(); updateShopOptions(event.target.value); root.querySelector('#post-shop-options button')?.focus(); return; }
    if (event.key === 'Escape') { root.querySelector('#post-shop-options').hidden = true; event.target.setAttribute('aria-expanded', 'false'); return; }
  }
  if (event.key === 'Escape' && state.authOpen) { closeAccountDialog(); render(); return; }
  if (event.key === 'Escape' && state.profileOpen) { state.profileOpen = false; render(); return; }
  if (!['Enter', ' '].includes(event.key)) return;
  const card = event.target.closest('.dish-row[data-dish], .post-card[data-post]');
  if (!card || event.target !== card) return;
  event.preventDefault();
  card.click();
});

// Backdrop dismissal requires the press and release to both start outside the panel.
const backdropSelector = '.auth-backdrop, .profile-backdrop, .modal-backdrop, .lightbox-backdrop';
let backdropGesture = null;
root.addEventListener('pointerdown', event => {
  const backdrop = event.target.closest(backdropSelector);
  backdropGesture = backdrop ? { backdrop, pointerId: event.pointerId, outside: event.target === backdrop, complete: false } : null;
});
root.addEventListener('pointerup', event => {
  if (backdropGesture) backdropGesture.complete = backdropGesture.outside && backdropGesture.pointerId === event.pointerId && event.target === backdropGesture.backdrop;
});
root.addEventListener('pointercancel', () => { if (backdropGesture) backdropGesture.complete = false; });

root.addEventListener('click', async (event) => {
  const gesture = backdropGesture;
  backdropGesture = null;
  if (!event.target.closest('.choice-select')) for (const wrapper of root.querySelectorAll('.choice-select.open')) { wrapper.classList.remove('open'); wrapper.querySelector('.choice-select-options').hidden = true; wrapper.querySelector('.choice-select-trigger').setAttribute('aria-expanded', 'false'); }
  if (event.target.matches('.rich-content img')) {
    const post = state.data.posts.find((entry) => entry.id === state.postId);
    state.lightbox = { url: event.target.src, caption: event.target.alt || '帖子图片', category: '美食贴图片', description: event.target.dataset.photoDescription || '', uploader: uploaderName(post?.ownerId, post?.author) }; render(); return;
  }
  const target = event.target.closest('[data-action], [data-view], [data-campus], [data-canteen], [data-shop], [data-dish], [data-post]');
  if (!target) return;
  // A field click can resolve to the backdrop; ignore it before changing state.
  if (target.matches(backdropSelector) && (event.target.closest('[data-stop]') || gesture && !gesture.complete)) return;
  if (target.matches('[data-stop]')) return;
  if (target.dataset.campus) { state.campusId = target.dataset.campus; state.query = ''; if (target.dataset.view) go(target.dataset.view); else { history.pushState({}, '', routePath()); render(); } return; }
  if (target.dataset.view) { go(target.dataset.view); return; }
  if (target.dataset.canteen) { state.canteenId = target.dataset.canteen; go('canteen'); return; }
  if (target.dataset.shop) { state.shopId = target.dataset.shop; go('shop'); return; }
  if (target.dataset.dish) { state.dishId = target.dataset.dish; state.shopId = target.dataset.shopId; go('dish'); return; }
  if (target.dataset.post) { state.postId = target.dataset.post; go('post-detail'); return; }
  const command = target.dataset.action;
  if (command === 'cancel-password-change') { if (state.authBusy) return; closeAccountDialog(); state.profileOpen = Boolean(state.user); render(); return; }
  if (command === 'account-mode') { if (state.authBusy) return; captureAuthDraft(); state.authOpen = true; state.profileOpen = false; state.authNotice = ''; state.authMode = target.dataset.mode; state.authDraft.password = ''; state.authDraft.confirmPassword = ''; state.authDraft.code = ''; state.authDraft.challengeId = ''; if (state.authMode === 'change-password') state.authDraft.email = state.user?.email || ''; render(); return; }
  if (command === 'send-login-code') { await sendLoginCode(); return; }
  if (command === 'logout') { try { await repo.authPost('logout'); state.modal = null; state.authMode = 'login'; state.authDraft.password = ''; state.authDraft.confirmPassword = ''; state.profileTab = 'overview'; await refresh(); } catch (error) { showNotice(error.message); } return; }
  if (state.storageMode === 'mysql' && !state.user && ['open-post', 'open-contribution', 'react', 'vote-shop'].includes(command)) { openAccountDialog('login'); render(); showNotice('登录后即可参与共建与评价。'); return; }
  const maintenanceActions = ['select-admin-canteen', 'manage-canteen-photos', 'edit-campus', 'edit-canteen', 'edit-shop', 'manage-shop-content', 'edit-dish', 'edit-photo', 'remove-canteen', 'remove-shop', 'remove-content', 'reset-preview', 'restore-entry', 'remove-canteen-photo', 'confirm-operation'];
  if (maintenanceActions.includes(command) && actor()?.role !== 'admin') { showNotice('只有管理员可以直接维护资料。'); return; }
  if (command === 'toggle-choice') { const wrapper = target.closest('.choice-select'); const shouldOpen = !wrapper.classList.contains('open'); for (const other of root.querySelectorAll('.choice-select.open')) { other.classList.remove('open'); other.querySelector('.choice-select-options').hidden = true; other.querySelector('.choice-select-trigger').setAttribute('aria-expanded', 'false'); } wrapper.classList.toggle('open', shouldOpen); wrapper.querySelector('.choice-select-options').hidden = !shouldOpen; target.setAttribute('aria-expanded', String(shouldOpen)); return; }
  if (command === 'choose-choice') { const wrapper = target.closest('.choice-select'); const select = wrapper.querySelector('select'); select.value = target.dataset.value; wrapper.classList.remove('open'); wrapper.querySelector('.choice-select-options').hidden = true; wrapper.querySelector('.choice-select-trigger').setAttribute('aria-expanded', 'false'); refreshChoiceSelects(wrapper); select.dispatchEvent(new Event('change', { bubbles: true })); return; }
  if (command === 'open-lightbox') { const photo = target.querySelector('img'); state.lightbox = { url: target.dataset.fullUrl || photo?.src || '', caption: target.dataset.caption || photo?.alt || '图片', category: target.dataset.category || photo?.alt || '图片', description: target.dataset.description || '', uploader: uploaderName(target.dataset.ownerId, target.dataset.uploader) }; render(); return; }
  if (command === 'close-lightbox') { if (event.target.closest('[data-stop]') && target.classList.contains('lightbox-backdrop')) return; state.lightbox = null; render(); return; }
  if (command === 'pick-post-shop') { const shop = activeShops().find((entry) => entry.id === target.dataset.id); const canteen = activeCanteens().find((entry) => entry.id === shop?.canteenId); if (!shop) return; state.modal.selectedShopId = shop.id; root.querySelector('#post-shop-id').value = shop.id; root.querySelector('#post-shop-search').value = `${canteen?.name || '食堂'} · ${shop.name}`; root.querySelector('#post-shop-options').hidden = true; root.querySelector('#post-shop-search').setAttribute('aria-expanded', 'false'); return; }
  if (command === 'toggle-profile') { if (state.storageMode === 'mysql' && !state.user) openAccountDialog('login'); else state.profileOpen = !state.profileOpen; state.profileTab = 'overview'; render(); return; }
  if (command === 'close-account') { closeAccountDialog(); render(); return; }
  if (command === 'close-profile') { state.profileOpen = false; render(); return; }
  if (command === 'profile-tab') { state.profileTab = target.dataset.tab; render(); return; }
  if (command === 'ledger-more') { state.profileLedgerLimit[target.dataset.kind] += 20; render(); return; }
  if (command === 'close-modal') { if (event.target.closest('[data-stop]') && target.classList.contains('modal-backdrop')) return; state.modal = null; render(); return; }
  if (command === 'dismiss-notice') { state.notice = ''; root.querySelector('.toast')?.remove(); return; }
  if (command === 'go-contribute') { go('contribute'); return; }
  if (command === 'scroll-how') { document.querySelector('#how-it-works')?.scrollIntoView({ behavior: 'smooth' }); return; }
  if (command === 'open-post') { state.modal = { kind: 'post', selectedShopId: ['shop', 'dish', 'shop-posts'].includes(state.view) ? state.shopId : null }; render(); return; }
  if (command === 'open-shop-posts') { state.shopId = target.dataset.shopId; go('shop-posts'); return; }
  if (command === 'select-admin-canteen') { state.adminCanteenId = target.dataset.id; render(); return; }
  if (command === 'moderation-kind') { state.moderationFilters.kind = target.dataset.kind; state.moderationFilters.limit = 12; render(); return; }
  if (command === 'moderation-more') { state.moderationFilters.limit += 12; root.querySelector('#moderation-results').innerHTML = moderationResults(); return; }
  if (command === 'open-tags') { state.modal = { kind: 'tags', shopId: target.dataset.shopId }; render(); return; }
  if (command === 'format-editor') {
    const editor = root.querySelector('#post-editor');
    editor?.focus();
    const commands = { heading: ['formatBlock', 'h2'], list: ['insertUnorderedList', null] };
    const [name, value] = commands[target.dataset.command] || [target.dataset.command, null];
    document.execCommand(name, false, value);
    return;
  }
  if (command === 'open-contribution') { const targetCanteen = state.data.canteens.find((entry) => entry.id === target.dataset.canteenId); const lockTarget = state.view === 'dish' && target.dataset.dishId ? 'dish' : state.view === 'shop' && target.dataset.shopId ? 'shop' : state.view === 'canteen' && target.dataset.canteenId ? 'canteen' : state.view === 'directory' ? 'campus' : ''; state.modal = { kind: 'contribution', type: target.dataset.type, targetKind: target.dataset.targetKind || null, field: target.dataset.field || null, photoKind: target.dataset.photoKind || null, lockTarget, campusId: targetCanteen?.campusId || state.campusId, canteenId: target.dataset.canteenId || null, shopId: target.dataset.shopId || null, dishId: target.dataset.dishId || null }; try { render(); } catch (error) { state.modal = null; showNotice(error.message || '表单暂时无法打开。'); } return; }
  if (command === 'open-gallery') { state.modal = { kind: 'gallery', entityKind: target.dataset.kind, id: target.dataset.id, shopId: target.dataset.shopId }; render(); return; }
  if (command === 'manage-canteen-photos') { state.modal = { kind: 'canteen-photos', id: target.dataset.id }; render(); return; }
  if (command === 'edit-campus') { state.modal = { kind: 'campus' }; render(); return; }
  if (command === 'edit-canteen' || command === 'edit-shop') { state.modal = { kind: command === 'edit-canteen' ? 'canteen' : 'shop', id: target.dataset.id || null }; render(); return; }
  if (command === 'manage-shop-content') { state.modal = { kind: 'shop-content', shopId: target.dataset.id }; render(); return; }
  if (command === 'edit-dish' || command === 'edit-photo') { state.modal = { kind: command === 'edit-dish' ? 'dish-editor' : 'photo-editor', shopId: target.dataset.shopId, id: target.dataset.id || null }; render(); return; }
  if (command === 'review') { state.modal = { kind: 'review', id: target.dataset.id, decision: target.dataset.decision }; render(); return; }
  if (command === 'remove-canteen' || command === 'remove-shop' || command === 'remove-content' || command === 'reset-preview') { state.modal = { kind: 'confirm', action: command, id: target.dataset.id, shopId: target.dataset.shopId, contentKind: target.dataset.kind }; render(); return; }
  try {
    if (command === 'vote-shop') { const result = await repo.castRecommendationVote(target.dataset.shopId, state.actorId); await refresh(); showNotice(result.source === 'base' ? '已投出今日基础推荐票。' : '已投出 1 张额外推荐票。'); return; }
    if (command === 'moderate') { await repo.moderateContent(target.dataset.kind, target.dataset.id, target.dataset.decision, state.actorId); await refresh(); showNotice('内容处理结果已保存。'); return; }
    if (command === 'resolve-contested') { await repo.resolveContested(target.dataset.id, target.dataset.decision, state.actorId); await refresh(); showNotice('共建复核结果已保存。'); return; }
    if (command === 'react') { await repo.setReaction(target.dataset.kind, target.dataset.id, state.actorId, target.dataset.stance); await refresh(); return; }
    if (command === 'restore-entry') { await repo.restoreEntry(target.dataset.kind, target.dataset.id, state.actorId); await refresh(); showNotice('资料已恢复。'); return; }
    if (command === 'fix-provisional') { await repo.fixProvisional(target.dataset.id, state.actorId); await refresh(); showNotice('已固定收录。'); return; }
    if (command === 'revoke-provisional') { await repo.revokeProvisional(target.dataset.id, state.actorId); await refresh(); showNotice('暂示已撤销。'); return; }
    if (command === 'mark-message-read') { await repo.markReviewMessageRead(target.dataset.id, state.actorId); await refresh(); return; }
    if (command === 'mark-all-messages-read') { await repo.markAllReviewMessagesRead(state.actorId); await refresh(); return; }
    if (command === 'delete-own') { await repo.deleteOwnContent(target.dataset.kind, target.dataset.id, state.actorId); state.modal = null; if (target.dataset.kind === 'post') { state.view = 'posts'; history.pushState({}, '', routePath()); } await refresh(); showNotice('已删除自己发布的内容。'); return; }
    if (command === 'remove-canteen-photo') { await repo.removeCanteenPhoto(target.dataset.canteenId, target.dataset.id, state.actorId); state.modal = { kind: 'canteen-photos', id: target.dataset.canteenId }; await refresh(); showNotice('照片已下架。'); return; }
    if (command === 'confirm-operation') {
      const operation = state.modal;
      if (operation.action === 'reset-preview') {
        await repo.resetPreview(state.actorId); state.campusId = 'campus-a'; state.view = 'home'; state.modal = null; await refresh(); showNotice('本地预览数据已清空。');
      } else if (operation.action === 'remove-content') {
        await repo.removeShopContent(operation.contentKind, operation.shopId, operation.id, state.actorId);
        state.modal = { kind: 'shop-content', shopId: operation.shopId }; await refresh(); showNotice('资料已下架。');
      } else {
        await repo.removeEntry(operation.action === 'remove-shop' ? 'shop' : 'canteen', operation.id, state.actorId);
        state.modal = null; await refresh(); showNotice('资料已下架。');
      }
    }
  } catch (error) { showNotice(error.message || '操作失败，请重试。'); }
});

root.addEventListener('input', (event) => {
  if (event.target.closest('#email-login-form')) { captureAuthDraft(); return; }
  if (event.target.id === 'moderation-search') { state.moderationFilters.query = event.target.value; state.moderationFilters.limit = 12; root.querySelector('#moderation-results').innerHTML = moderationResults(); return; }
  if (event.target.id === 'post-shop-search') { root.querySelector('#post-shop-id').value = ''; state.modal.selectedShopId = null; updateShopOptions(event.target.value); return; }
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
  if (event.target.id === 'moderation-status' || event.target.id === 'moderation-sort') { state.moderationFilters[event.target.id === 'moderation-status' ? 'status' : 'sort'] = event.target.value; state.moderationFilters.limit = 12; root.querySelector('#moderation-results').innerHTML = moderationResults(); return; }
  if (['posts-campus', 'posts-canteen', 'posts-shop', 'posts-sort'].includes(event.target.id)) {
    const filters = state.postFilters;
    if (event.target.id === 'posts-campus') { filters.campusId = event.target.value; filters.canteenId = ''; filters.shopId = ''; }
    if (event.target.id === 'posts-canteen') { filters.canteenId = event.target.value; filters.shopId = ''; }
    if (event.target.id === 'posts-shop') filters.shopId = event.target.value;
    if (event.target.id === 'posts-sort') filters.sort = event.target.value;
    render(); return;
  }
  if (event.target.id === 'comment-sort') { state.commentSort = event.target.value; render(); return; }
  if (event.target.id === 'demo-actor') {
    if (state.storageMode === 'mysql') return;
    state.actorId = event.target.value;
    localStorage.setItem('canteen-guide-demo-actor', state.actorId);
    if (state.view === 'admin' && !canReview(actor())) state.view = 'home';
    state.modal = null;
    render();
    return;
  }
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
      if (editor.querySelectorAll('img').length >= 3) throw new Error('每篇最多添加 3 张图片。');
      const url = await imageAsDataUrl(file);
      const descriptionInput = root.querySelector('#post-image-description');
      const description = descriptionInput.value.trim();
      const screening = description ? screenComment(description) : { allowed: true };
      if (!screening.allowed) throw new Error(screening.reason);
      editor.insertAdjacentHTML('beforeend', `<p><img src="${url}" alt="帖子图片" data-photo-description="${escapeHtml(description)}" /></p>`);
      descriptionInput.value = '';
      hint.textContent = file.size > 900_000 ? '图片已压缩并加入正文末尾。' : '图片已添加到正文末尾，可继续编辑文字。';
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
    dish.dataset.requiredChoice = isDish ? 'true' : '';
    dish.required = false;
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
    dishSelect.dataset.requiredChoice = isDish ? 'true' : '';
    dishSelect.required = false;
    if (!isDish) dishSelect.value = '';
    form.querySelector('#dish-hint').textContent = isDish ? (dishes.length ? '菜品照片的说明直接使用菜品名称。' : '这家店还没有菜品，请先申请补充菜品。') : '门面照片无需关联菜品，图片说明为「店铺门面」。';
  }
  const names = [state.data.campuses.find((entry) => entry.id === campusId)?.name, activeCanteens().find((entry) => entry.id === canteenSelect?.value)?.name, activeShops().find((entry) => entry.id === shopSelect?.value)?.name, activeShops().flatMap((entry) => entry.dishes).find((entry) => entry.id === targetDishSelect?.value || entry.id === dishSelect?.value)?.name].filter(Boolean);
  form.querySelector('#contribution-target-text').textContent = names.join(' › ');
  refreshChoiceSelects(form);
});

root.addEventListener('submit', async (event) => {
  if (event.target.id === 'email-login-form') { event.preventDefault(); await submitAccountForm(); return; }
  if (!['contribution-form', 'edit-form', 'comment-form', 'review-form', 'shop-content-form', 'post-form', 'canteen-photo-form'].includes(event.target.id)) return;
  event.preventDefault();
  const form = event.target;
  if (state.storageMode === 'mysql' && !state.user) { state.modal = null; openAccountDialog('login'); render(); showNotice('请先登录。'); return; }
  const values = Object.fromEntries(new FormData(form).entries());
  try {
    if (['edit-form', 'shop-content-form', 'canteen-photo-form'].includes(form.id) && actor()?.role !== 'admin') throw new Error('只有管理员可以直接维护资料。');
    if ([...form.querySelectorAll('select[data-required-choice="true"]')].some((select) => !select.value)) throw new Error('请先选择完整的目标信息。');
    if (form.id === 'contribution-form' || form.id === 'post-form') {
      if (values.photoFile instanceof File && values.photoFile.size) {
        values.photo = await imageAsDataUrl(values.photoFile);
      }
      delete values.photoFile;
      values.actorId = state.actorId;
      if (form.id === 'post-form') {
        if (!values.shopId) throw new Error('请从搜索结果中选择关联店铺。');
        const editor = form.querySelector('#post-editor');
        values.contentHtml = sanitizeRichHtml(editor.innerHTML);
        values.body = plainTextFromRichHtml(values.contentHtml);
        if (!values.body || values.body.length > 5000) throw new Error('正文需填写，且不超过 5000 字。');
        const screening = screenComment(`${values.title} ${values.body}`);
        if (!screening.allowed) throw new Error(screening.reason);
        await repo.submitPost(values); state.modal = null; state.view = 'posts'; history.pushState({}, '', routePath()); await refresh(); showNotice(`美食贴已保存到${storageName()}。`); return;
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
        for (const item of state.data.campuses) await repo.saveCampus(item.id, values[item.id], state.actorId);
      } else if (values.kind === 'canteen') await repo.saveCanteen({ ...values, id: values.entryId, actorId: state.actorId });
      else await repo.saveShop({ ...values, id: values.entryId, actorId: state.actorId });
      state.modal = null; await refresh(); showNotice('资料已保存。'); return;
    }
    if (form.id === 'canteen-photo-form') {
      const file = values.photoFile;
      if (!file || !file.size) throw new Error('请选择图片。');
      await repo.saveCanteenPhoto({ canteenId: values.canteenId, photo: await imageAsDataUrl(file), photoDescription: values.photoDescription, actorId: state.actorId });
      state.modal = { kind: 'canteen-photos', id: values.canteenId }; await refresh(); showNotice('食堂照片已保存。'); return;
    }
    if (form.id === 'review-form') {
      await repo.reviewContribution(state.modal.id, state.modal.decision, values.note, state.actorId);
      state.modal = null; await refresh(); showNotice('审核结果已保存到本地预览。'); return;
    }
    if (form.id === 'shop-content-form') {
      const shopId = values.shopId;
      if (values.photoFile instanceof File && values.photoFile.size) {
          values.photo = await imageAsDataUrl(values.photoFile);
      }
      delete values.photoFile;
      if (values.contentKind === 'dish') await repo.saveDish({ ...values, id: values.entryId, actorId: state.actorId });
      else await repo.savePhoto({ ...values, id: values.entryId, actorId: state.actorId });
      state.modal = { kind: 'shop-content', shopId }; await refresh(); showNotice('店铺资料已保存。'); return;
    }
    const screening = screenComment(values.body);
    if (!screening.allowed) throw new Error(screening.reason);
    await repo.addComment(form.dataset.targetKind, form.dataset.targetId, state.actorId, values.body);
    await refresh(); showNotice(`评论已保存到${storageName()}。`);
  } catch (error) { showNotice(error.message || '提交失败，请重试。'); }
});

refresh(true).catch((error) => { root.innerHTML = `<main class="wrap missing-view"><h1>页面暂时无法加载</h1><p>${escapeHtml(error.message)}</p></main>`; });

window.setInterval(async () => {
  try {
    if (state.data?.contributions.some((item) => item.status === 'provisional' && Date.parse(item.expiresAt) <= Date.now()) && await repo.expireProvisional()) {
      state.data = await repo.snapshot();
      render();
    }
  } catch { /* The next user action will retry loading preview data. */ }
}, 60_000);

function openAccountDialog(mode = 'login') { state.authOpen = true; state.profileOpen = false; state.authMode = mode; state.authNotice = ''; }
function closeAccountDialog() { state.authOpen = false; state.authMode = 'login'; state.authNotice = ''; state.authDraft.password = ''; state.authDraft.confirmPassword = ''; state.authDraft.code = ''; }
function accountDialog() {
  if (!state.authOpen || state.storageMode !== 'mysql') return '';

  const draft = state.authDraft;
  const mode = state.authMode;
  const isLogin = mode === 'login';
  const isChange = mode === 'change-password';
  const title = { login: '邮箱登录', register: '注册账户', 'reset-password': '找回 / 设置密码', 'change-password': '修改密码' }[mode];
  const intro = { login: '输入邮箱和网站密码登录。', register: '验证邮箱并设置密码，注册后为普通用户。', 'reset-password': '验证邮箱后设置新密码。已有账户首次设置密码也从这里开始。', 'change-password': '验证码将发送到你的账户邮箱。修改后需重新登录。' }[mode];
  const wait = Math.max(0, Math.ceil((draft.resendAt - Date.now()) / 1000));
  return `<div class="auth-backdrop" data-action="close-account"><section class="auth-dialog" role="dialog" aria-modal="true" aria-label="${title}" data-stop><div class="auth-dialog-head"><div><span class="section-kicker">WELCOME TO 食间</span><h2>${title}</h2></div><button class="icon-button" data-action="close-account" aria-label="关闭">${icon('close', 20)}</button></div><div class="auth-dialog-body"><p class="login-intro">${intro}</p>${!isChange ? `<nav class="account-mode-tabs"><button type="button" class="${isLogin ? 'active' : ''}" data-action="account-mode" data-mode="login">登录</button><button type="button" class="${mode === 'register' ? 'active' : ''}" data-action="account-mode" data-mode="register">注册</button></nav>` : ''}${state.authNotice ? `<div class="auth-feedback" role="status">${escapeHtml(state.authNotice)}</div>` : ''}<form id="email-login-form" class="modal-form"><label>邮箱<input name="email" type="email" autocomplete="email" maxlength="254" required ${isChange || state.authBusy ? 'readonly' : ''} value="${escapeHtml(isChange ? state.user.email : draft.email)}" placeholder="你的邮箱地址" /></label>${mode === 'register' ? `<label>昵称（选填）<input name="name" maxlength="20" ${state.authBusy ? 'readonly' : ''} value="${escapeHtml(draft.name)}" placeholder="2–20 字，留空自动生成" /></label>` : ''}<label>${isLogin ? '登录密码' : '新密码'}<input name="password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" minlength="8" maxlength="128" required ${state.authBusy ? 'readonly' : ''} value="${escapeHtml(draft.password)}" placeholder="${isLogin ? '输入网站密码' : '8–128 个字符'}" /></label>${!isLogin ? `<label>确认密码<input name="confirmPassword" type="password" autocomplete="new-password" minlength="8" maxlength="128" required ${state.authBusy ? 'readonly' : ''} value="${escapeHtml(draft.confirmPassword)}" placeholder="再次输入新密码" /></label><div class="login-code-row"><label>验证码<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required ${state.authBusy ? 'readonly' : ''} value="${escapeHtml(draft.code)}" placeholder="6 位验证码" /></label><button type="button" class="button outline small" data-action="send-login-code" ${state.authBusy || wait ? 'disabled' : ''}>${wait ? wait + ' 秒后重发' : '发送验证码'}</button></div><p class="small-note">验证码 10 分钟有效，仅用于本次操作。修改或重置密码后，所有设备需重新登录。</p>` : '<p class="small-note">使用网站密码登录，无需每次接收验证码。</p>'}<button class="button primary full" ${state.authBusy ? 'disabled' : ''}>${state.authBusy ? '正在处理…' : { login: '登录', register: '验证并注册', 'reset-password': '重置密码', 'change-password': '确认修改密码' }[mode]}</button></form>${isLogin ? '<button class="quiet-button account-reset-link" data-action="account-mode" data-mode="reset-password">忘记密码</button>' : `<button class="quiet-button account-reset-link" data-action="${isChange ? 'cancel-password-change' : 'account-mode'}" data-mode="login">${isChange ? '返回用户信息' : '返回登录'}</button>`}</div></section></div>`;
}
function captureAuthDraft() {
  const form = root.querySelector('#email-login-form');
  if (!form) return;
  for (const key of ['email', 'name', 'code', 'password', 'confirmPassword']) if (form.elements[key]) state.authDraft[key] = form.elements[key].value;
}
async function sendLoginCode() {
  if (state.authBusy || state.authDraft.resendAt > Date.now()) return;
  captureAuthDraft();
  const email = state.authDraft.email.trim().toLowerCase();
  const purpose = state.authMode;
  state.authBusy = true; render();
  try {
    const result = await repo.authPost('send-code', { email, purpose });
    state.authDraft.challengeId = result.challengeId;
    state.authDraft.sentPurpose = purpose;
    state.authDraft.sentEmail = email;
    state.authDraft.resendAt = Date.now() + result.retryAfter * 1000;
    state.authDraft.code = '';
    state.authNotice = '验证码已发送，请检查收件箱或垃圾邮件。';
  } catch (error) { state.authNotice = error.message; }
  finally { state.authBusy = false; render(); }
}
async function submitAccountForm() {
  if (state.authBusy) return;
  captureAuthDraft();
  if (state.authMode !== 'login' && (!state.authDraft.challengeId || state.authDraft.email.trim().toLowerCase() !== state.authDraft.sentEmail || state.authDraft.sentPurpose !== state.authMode)) { state.authNotice = '请先为当前邮箱获取验证码。'; render(); return; }
  state.authBusy = true; render();
  try {
    const mode = state.authMode;
    await repo.authPost(mode, state.authDraft);
    state.authMode = 'login';
    state.authDraft = { email: '', name: '', password: '', confirmPassword: '', code: '', challengeId: '', sentEmail: '', sentPurpose: '', resendAt: 0 };
    state.profileTab = 'overview';
    state.authOpen = !['login', 'register'].includes(mode);
    state.profileOpen = false;
    await refresh(); state.authNotice = mode === 'register' ? '注册成功，欢迎来到食间。' : mode === 'login' ? '登录成功，欢迎来到食间。' : '密码已更新，请使用新密码登录。';
    if (!state.authOpen) showNotice(state.authNotice);
  } catch (error) { state.authNotice = error.message; }
  finally { state.authBusy = false; render(); }
}
setInterval(() => { const button = root.querySelector('[data-action="send-login-code"]'); if (button && !state.authBusy) { const wait = Math.max(0, Math.ceil((state.authDraft.resendAt - Date.now()) / 1000)); button.disabled = wait > 0; button.textContent = wait ? wait + ' 秒后重发' : '发送验证码'; } }, 1000);
