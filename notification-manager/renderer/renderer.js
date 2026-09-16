const $ = (selector) => document.querySelector(selector);
let settings = {};
let deviceOffset = 0;
let campaigns = [];
let templates = [];
let campaignFilter = 'all';
let activeLocale = 'zh-CN';
let localeDrafts = {};

function token() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
function message(text, error = false) {
  const target = $('#message');
  target.textContent = text;
  target.dataset.error = String(error);
  window.clearTimeout(message.timer);
  message.timer = window.setTimeout(() => { target.textContent = ''; }, 6000);
}
function values() { return { port: Number($('#port').value || 8788), adminToken: $('#token').value.trim() }; }
function updateAudience() {
  const audience = $('#audience').value;
  $('#deviceTarget').hidden = audience !== 'device';
  $('#versionTarget').hidden = audience !== 'version';
  $('#languageTarget').hidden = audience !== 'language';
}
function currentTarget() { return { audience: $('#audience').value, deviceId: $('#deviceId').value.trim(), targetVersion: $('#targetVersion').value.trim(), targetLanguage: $('#targetLanguage').value, activation: $('#activationFilter').value, licenseTier: $('#tierFilter').value, activeWithinDays: Number($('#activeFilter').value || 0) }; }
function saveLocaleDraft() { localeDrafts[activeLocale] = { title: $('#title').value.trim(), body: $('#body').value.trim() }; }
function switchLocale(locale) { saveLocaleDraft(); activeLocale = locale; const value = localeDrafts[locale] || {}; $('#title').value = value.title || ''; $('#body').value = value.body || ''; document.querySelectorAll('#localeTabs button').forEach((item) => item.classList.toggle('active', item.dataset.locale === locale)); updatePreview(); }
function updatePreview() { saveLocaleDraft(); const value = localeDrafts[activeLocale] || {}; $('#notificationPreview small').textContent = $('#noticeKind').selectedOptions[0]?.textContent || '普通通知'; $('#notificationPreview strong').textContent = value.title || '通知标题'; $('#notificationPreview p').textContent = value.body || '通知内容会显示在客户端的通知中心与详情弹窗中。'; }
function clearCampaignEditor() { localeDrafts = {}; activeLocale = 'zh-CN'; $('#campaignEditorTitle').textContent = '新建通知'; $('#noticeKind').value = 'info'; $('#scheduledAt').value = ''; $('#audience').value = 'all'; $('#deviceId').value = ''; $('#targetVersion').value = ''; $('#targetLanguage').value = 'zh-CN'; $('#activationFilter').value = ''; $('#tierFilter').value = ''; $('#activeFilter').value = '0'; $('#requiresAcknowledgement').checked = false; switchLocale('zh-CN'); updateAudience(); }
function fillCampaign(campaign) { localeDrafts = structuredClone(campaign.locales || {}); $('#campaignEditorTitle').textContent = `编辑：${campaign.title}`; $('#noticeKind').value = campaign.kind || 'info'; $('#scheduledAt').value = campaign.scheduledAt ? campaign.scheduledAt.slice(0, 16) : ''; const target = campaign.target || {}; $('#audience').value = target.audience || 'all'; $('#deviceId').value = target.deviceId || ''; $('#targetVersion').value = target.targetVersion || ''; $('#targetLanguage').value = target.targetLanguage || 'zh-CN'; $('#activationFilter').value = target.activation || ''; $('#tierFilter').value = target.licenseTier || ''; $('#activeFilter').value = String(target.activeWithinDays || 0); $('#requiresAcknowledgement').checked = !!campaign.requiresAcknowledgement; activeLocale = 'zh-CN'; switchLocale(localeDrafts['zh-CN'] ? 'zh-CN' : Object.keys(localeDrafts)[0] || 'zh-CN'); updateAudience(); }
function campaignStatus(status) { return ({ draft:'草稿', scheduled:'待发送', sent:'已发送', revoked:'已作废', sending:'发送中' })[status] || status; }
function renderCampaigns() { const needle = $('#campaignSearch').value.trim().toLowerCase(); const shown = campaigns.filter((item) => (campaignFilter === 'all' || item.status === campaignFilter) && (!needle || `${item.title} ${item.status}`.toLowerCase().includes(needle))); $('#campaignList').innerHTML = shown.length ? shown.map((item) => `<article class="campaign-item"><button data-campaign-open="${item.id}"><strong>${escapeHtml(item.title)}</strong><small>${campaignStatus(item.status)} · ${new Date(item.createdAt).toLocaleString('zh-CN')}</small><small>目标 ${item.stats.targeted} · 已读 ${item.stats.read} · 已确认 ${item.stats.acknowledged}</small></button><div>${item.status === 'draft' || item.status === 'scheduled' ? `<button data-campaign-send="${item.id}" class="plain">发送</button>` : ''}${item.status !== 'revoked' ? `<button data-campaign-revoke="${item.id}" class="danger">作废</button>` : ''}</div></article>`).join('') : '<p>没有符合条件的通知。</p>';
  $('#campaignList').querySelectorAll('[data-campaign-open]').forEach((button) => button.addEventListener('click', () => fillCampaign(campaigns.find((item) => item.id === button.dataset.campaignOpen))));
  $('#campaignList').querySelectorAll('[data-campaign-send]').forEach((button) => button.addEventListener('click', async () => { try { await window.notificationManager.sendCampaign(button.dataset.campaignSend); message('通知已发送。'); refreshCampaigns(); } catch (error) { message(error.message, true); } }));
  $('#campaignList').querySelectorAll('[data-campaign-revoke]').forEach((button) => button.addEventListener('click', async () => { if (!confirm('作废会从所有客户端撤回这条通知，确认继续？')) return; try { await window.notificationManager.revokeCampaign(button.dataset.campaignRevoke); message('通知已作废并撤回。'); refreshCampaigns(); } catch (error) { message(error.message, true); } }));
}
async function refreshCampaigns() { try { const result = await window.notificationManager.campaigns(); campaigns = result.campaigns || []; templates = result.templates || []; for (const status of ['all','draft','scheduled','sent','revoked']) $(`#campaign${status[0].toUpperCase()}${status.slice(1)}`).textContent = status === 'all' ? campaigns.length : campaigns.filter((item) => item.status === status).length; renderCampaigns(); $('#templateList').innerHTML = templates.length ? templates.map((item) => `<button data-template="${item.id}"><strong>${escapeHtml(item.name || item.title)}</strong><small>${escapeHtml(item.title)}</small></button>`).join('') : '<p>还没有保存模板。</p>'; $('#templateList').querySelectorAll('[data-template]').forEach((button) => button.addEventListener('click', () => fillCampaign(templates.find((item) => item.id === button.dataset.template)))); } catch { $('#campaignList').innerHTML = '<p>服务启动后将显示通知批次。</p>'; } }
async function submitCampaign(mode, templateName = '') { saveLocaleDraft(); const target = currentTarget(); if (target.audience === 'device' && !target.deviceId) return message('请填写设备 ID。', true); if (target.audience === 'version' && !target.targetVersion) return message('请填写目标版本。', true); const locales = Object.fromEntries(Object.entries(localeDrafts).filter(([, value]) => value.title)); if (!Object.keys(locales).length) return message('至少填写一种语言的标题。', true); try { const result = await window.notificationManager.createCampaign({ title: locales['zh-CN']?.title || Object.values(locales)[0].title, locales, kind: $('#noticeKind').value, target, requiresAcknowledgement: $('#requiresAcknowledgement').checked, scheduledAt: $('#scheduledAt').value ? new Date($('#scheduledAt').value).toISOString() : '', status: mode, templateName }); message(mode === 'draft' ? '草稿已保存。' : result.campaign.status === 'scheduled' ? '已安排定时发送。' : `已发送给 ${result.campaign.stats.targeted} 台设备。`); await refreshCampaigns(); fillCampaign(result.campaign); } catch (error) { message(error.message, true); } }
const PAGE_META = { overview:['运营概览','今天的服务状态'], notifications:['通知工作台','创建与管理通知'], licenses:['授权管理','激活码与设备席位'], devices:['设备管理','查找和管理用户设备'], release:['版本发布','向客户端发布更新'], data:['数据与备份','保护与迁移服务数据'], audit:['审计与健康','服务运行与操作记录'], settings:['服务设置','低频服务配置'] };
function go(page) { document.querySelectorAll('.page').forEach((item) => item.classList.toggle('active', item.dataset.page === page)); document.querySelectorAll('#nav button').forEach((item) => item.classList.toggle('active', item.dataset.page === page)); const meta = PAGE_META[page]; $('#eyebrow').textContent = meta[0]; $('#pageTitle').textContent = meta[1]; }
function formatDate(value) { return value ? new Date(value).toLocaleDateString('zh-CN') : '永久'; }
async function refreshLicenses() {
  const target = $('#licenseList');
  try {
    const { licenses } = await window.notificationManager.licenses();
    if (!licenses.length) { target.innerHTML = '<p>还没有生成激活码。</p>'; return; }
    target.innerHTML = licenses.map((license) => `<article class="license-item ${license.revoked ? 'revoked' : ''}"><div><strong>${license.tier.toUpperCase()}${license.label ? ` · ${escapeHtml(license.label)}` : ''}</strong><small class="license-code">${license.codeAvailable ? `<code>${escapeHtml(license.code)}</code><button data-copy-license="${license.id}" data-code="${escapeHtml(license.code)}" class="plain">复制激活码</button>` : '此激活码由旧版服务生成，仅保存了不可逆哈希，无法恢复原码。'}</small><small>${license.revoked ? '已撤销' : license.frozen ? '已冻结' : `有效 · 最多 ${license.maxDevices} 台设备 · ${formatDate(license.expiresAt)}到期`}</small><small>已绑定 ${license.activatedDevices.length} 台设备</small></div><div class="license-actions">${license.activatedDevices.map((device) => `<button data-unbind="${license.id}" data-device="${device.deviceId}" class="plain">解绑</button>`).join('')} ${license.revoked ? '' : `<button data-freeze="${license.id}" class="plain">${license.frozen ? '恢复' : '冻结'}</button><button data-revoke="${license.id}" class="danger">撤销</button>`}</div></article>`).join('');
    target.querySelectorAll('[data-copy-license]').forEach((button) => button.addEventListener('click', () => { window.notificationManager.copy(button.dataset.code); message('激活码已复制。'); }));
    target.querySelectorAll('[data-revoke]').forEach((button) => button.addEventListener('click', async () => { if (!confirm('撤销后所有已激活设备都会失效，确认继续？')) return; try { await window.notificationManager.revokeLicense(button.dataset.revoke); message('授权已撤销。'); refreshLicenses(); } catch (error) { message(error.message, true); } }));
    target.querySelectorAll('[data-unbind]').forEach((button) => button.addEventListener('click', async () => { try { await window.notificationManager.removeLicenseDevice(button.dataset.unbind, button.dataset.device); message('设备已解绑，可重新激活。'); refreshLicenses(); } catch (error) { message(error.message, true); } }));
    target.querySelectorAll('[data-freeze]').forEach((button) => button.addEventListener('click', async () => { try { await window.notificationManager.freezeLicense(button.dataset.freeze); message('授权状态已更新。'); refreshLicenses(); } catch (error) { message(error.message, true); } }));
  } catch { target.innerHTML = '<p>服务启动后将显示授权记录。</p>'; }
}
async function refreshAudit() { const target = $('#auditList'); try { const { entries } = await window.notificationManager.audit(); target.innerHTML = entries.length ? entries.slice(0, 80).map((entry) => `<article><strong>${escapeHtml(entry.action)}</strong><small>${new Date(entry.createdAt).toLocaleString('zh-CN')} · ${escapeHtml(JSON.stringify(entry.detail || {}))}</small></article>`).join('') : '<p>尚无管理操作记录。</p>'; } catch { target.innerHTML = '<p>服务启动后将显示审计日志。</p>'; } }
async function refreshHistory() { const target = $('#notificationHistory'); try { const { notifications } = await window.notificationManager.notificationHistory(); target.innerHTML = notifications.length ? notifications.map((notice) => `<article><strong>${escapeHtml(notice.title)}</strong><small>${new Date(notice.createdAt).toLocaleString('zh-CN')} · 设备 ${escapeHtml(notice.deviceId)} · ${notice.revoked ? '已作废' : notice.dismissed ? '用户已清除' : notice.read ? '已读' : '未读'}</small>${notice.revoked ? '' : `<button data-revoke-notification="${notice.id}" class="danger">作废此通知</button>`}</article>`).join('') : '<p>还没有历史通知。</p>'; target.querySelectorAll('[data-revoke-notification]').forEach((button) => button.addEventListener('click', async () => { if (!confirm('作废后，用户将不再看到这条通知。确认继续？')) return; try { await window.notificationManager.revokeNotification(button.dataset.revokeNotification); message('通知已作废。'); refreshHistory(); } catch (error) { message(error.message, true); } })); } catch { target.innerHTML = '<p>服务启动后将显示历史通知。</p>'; } }
async function refreshDevices() {
  const target = $('#deviceList');
  try { const result = await window.notificationManager.devices($('#deviceSearch').value.trim(), deviceOffset); const page = Math.floor(deviceOffset / 50) + 1; $('#devicePage').textContent = `第 ${page} 页 · 共 ${result.total} 台`; $('#previousDevices').disabled = deviceOffset === 0; $('#nextDevices').disabled = deviceOffset + 50 >= result.total; target.innerHTML = result.devices.length ? result.devices.map((device) => `<article><strong>${escapeHtml(device.id)}</strong><small>${escapeHtml(device.appVersion)} · ${escapeHtml(device.language)} · 最近在线 ${device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString('zh-CN') : '未知'}</small><small>设备密钥：<code>${escapeHtml(device.deviceKey || '设备重新连接后生成')}</code></small></article>`).join('') : '<p>没有匹配的设备。</p>'; } catch { target.innerHTML = '<p>服务启动后将显示设备列表。</p>'; }
}
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[character])); }
async function refresh() {
  const status = await window.notificationManager.status();
  const live = status.running;
  $('#status').className = `service-chip ${live ? 'online' : 'offline'}`;
  $('#status span').textContent = live ? `服务运行中 · ${status.onlineDevices || 0} 台设备在线` : '服务未启动';
  $('#serverLabel').textContent = live ? '通知服务正在运行' : '服务尚未启动';
  $('#serverDetail').textContent = `端口 ${status.port} · ${live ? '等待客户端连接' : '本机运行'}`;
  $('#start').disabled = live;
  $('#stop').disabled = !live;
  $('#overviewState').textContent = live ? '运行中' : '离线';
  $('#overviewStorage').textContent = status.storage || '本地存储';
  $('#overviewDevices').textContent = status.registeredDevices || 0;
  $('#overviewOnline').textContent = status.onlineDevices || 0;
  $('#overviewUptime').textContent = status.uptimeSeconds ? `${Math.floor(status.uptimeSeconds / 60)} 分钟` : '—';
  $('#overviewMemory').textContent = status.memoryBytes ? `${Math.round(status.memoryBytes / 1024 / 1024)} MB 内存` : '—';
  $('#healthSummary').textContent = live ? `服务正常，${status.onlineDevices || 0} 台设备实时在线，${status.registeredDevices || 0} 台设备已登记。` : '服务未启动。请在“服务设置”中启动并检查 Tunnel。';
}
async function save() {
  settings = await window.notificationManager.saveSettings(values());
  message('设置已保存。');
  await refresh();
  await refreshLicenses();
  await refreshDevices();
  await refreshAudit();
  await refreshCampaigns();
  updateAudience();
}
async function init() {
  settings = await window.notificationManager.settings();
  $('#publicUrl').value = 'https://api.qnjyxh.xyz';
  $('#port').value = settings.port || 8788;
  $('#token').value = settings.adminToken || '';
  await refresh();
  try {
    const release = await window.notificationManager.release();
    $('#latestVersion').value = release.latestVersion || '';
    $('#downloadUrl').value = release.downloadUrl || '';
    $('#releaseNotes').value = release.releaseNotes || '';
  } catch { /* The server may not be running on first launch. */ }
  updateAudience();
  clearCampaignEditor();
  await refreshCampaigns();
}

$('#generateToken').addEventListener('click', () => { $('#token').value = token(); message('已生成新的管理密钥。记得点击“保存设置”。'); });
$('#save').addEventListener('click', () => save().catch((error) => message(error.message, true)));
$('#openFolder').addEventListener('click', () => window.notificationManager.openFolder());
$('#start').addEventListener('click', async () => {
  try { await save(); const state = await window.notificationManager.start(); message(state.running ? '服务已启动。' : '服务没有成功启动，请检查端口是否被占用。', !state.running); await refresh(); }
  catch (error) { message(error.message, true); }
});
$('#stop').addEventListener('click', async () => { await window.notificationManager.stop(); message('服务已停止。'); await refresh(); });
$('#audience').addEventListener('change', updateAudience);
$('#sendTest').addEventListener('click', () => submitCampaign('send'));
$('#saveDraft').addEventListener('click', () => submitCampaign('draft'));
$('#previewCampaign').addEventListener('click', updatePreview);
$('#newCampaign').addEventListener('click', clearCampaignEditor);
$('#refreshCampaigns').addEventListener('click', refreshCampaigns);
$('#saveTemplate').addEventListener('click', () => { const name = prompt('模板名称'); if (name) submitCampaign('draft', name); });
$('#campaignSearch').addEventListener('input', renderCampaigns);
document.querySelectorAll('[data-campaign-filter]').forEach((button) => button.addEventListener('click', () => { campaignFilter = button.dataset.campaignFilter; document.querySelectorAll('[data-campaign-filter]').forEach((item) => item.classList.toggle('active', item === button)); renderCampaigns(); }));
document.querySelectorAll('#localeTabs button').forEach((button) => button.addEventListener('click', () => switchLocale(button.dataset.locale)));
['title','body','noticeKind'].forEach((id) => $(`#${id}`).addEventListener('input', updatePreview));
$('#saveRelease').addEventListener('click', async () => {
  try {
    const release = await window.notificationManager.saveRelease({ latestVersion: $('#latestVersion').value.trim(), downloadUrl: $('#downloadUrl').value.trim(), releaseNotes: $('#releaseNotes').value.trim() });
    message(`已发布 ${release.latestVersion}。客户端下次启动将检查更新。`);
  } catch (error) { message(error.message, true); }
});
$('#createLicense').addEventListener('click', async () => {
  try {
    const result = await window.notificationManager.createLicense({ tier: $('#licenseTier').value, label: $('#licenseLabel').value.trim(), maxDevices: Number($('#licenseDevices').value || 1), quantity: Number($('#licenseQuantity').value || 1), expiresAt: $('#licenseExpires').value || '' });
    const codes = result.created ? result.created.map((item) => item.code).join('\n') : result.code; $('#createdCode').hidden = false; $('#createdCode code').textContent = codes; message(`已生成 ${result.created?.length || 1} 个激活码；之后也能在下方列表中查看和复制。`); await refreshLicenses(); await refreshAudit();
  } catch (error) { message(error.message, true); }
});
$('#copyCode').addEventListener('click', () => { const code = $('#createdCode code').textContent; if (code) { window.notificationManager.copy(code); message('激活码已复制。'); } });
$('#searchDevices').addEventListener('click', () => { deviceOffset = 0; refreshDevices(); });
$('#deviceSearch').addEventListener('keydown', (event) => { if (event.key === 'Enter') { deviceOffset = 0; refreshDevices(); } });
$('#previousDevices').addEventListener('click', () => { deviceOffset = Math.max(0, deviceOffset - 50); refreshDevices(); });
$('#nextDevices').addEventListener('click', () => { deviceOffset += 50; refreshDevices(); });
$('#backupData').addEventListener('click', async () => { try { const folder = await window.notificationManager.backup(); message(`数据已导出到：${folder}`); } catch (error) { message(error.message, true); } });
$('#openBackups').addEventListener('click', () => window.notificationManager.openFolder());
$('#refreshAudit').addEventListener('click', () => refreshAudit());
document.querySelectorAll('#nav button').forEach((button) => button.addEventListener('click', () => go(button.dataset.page)));
document.querySelectorAll('[data-go]').forEach((button) => button.addEventListener('click', () => go(button.dataset.go)));
$('#quickNotify').addEventListener('click', () => go('notifications'));
$('#quickLicense').addEventListener('click', () => { go('licenses'); $('#licenseCreate').hidden = false; });
$('#showLicenseCreate').addEventListener('click', () => { $('#licenseCreate').hidden = false; });
$('#hideLicenseCreate').addEventListener('click', () => { $('#licenseCreate').hidden = true; });
$('#quickBackup').addEventListener('click', () => $('#backupData').click());
setInterval(() => refresh().catch(() => {}), 5000);
init().catch((error) => message(error.message, true));
