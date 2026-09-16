import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './styles.css';
import { buildCatalog, translate, localizeKnown } from './i18n/catalog.mjs';
import { contextAttachments, contextMessages, contextPlan, listOllamaModels, streamCloud, streamOllama } from './modelGateway';

const CANVAS_INDEX_KEY = 'branchspace-canvas-index';
const CANVAS_DB_NAME = 'wonderful-canvas-store';
const CANVAS_DB_VERSION = 1;
const CANVAS_STORE = 'canvases';
const OFFICIAL_NOTIFICATION_SERVER = 'https://api.qnjyxh.xyz';
const APP_VERSION = '0.1.0';
const LICENSE_OFFLINE_GRACE_DAYS = 7;

function isNewerVersion(candidate, current) {
  const numbers = (value) => String(value || '').replace(/^v/i, '').split(/[^0-9]+/).filter(Boolean).map(Number);
  const next = numbers(candidate); const now = numbers(current);
  for (let index = 0; index < Math.max(next.length, now.length); index += 1) {
    const delta = (next[index] || 0) - (now[index] || 0);
    if (delta) return delta > 0;
  }
  return false;
}

function hasCopyableTextSelection() {
  const selection = window.getSelection?.();
  return !!selection && !selection.isCollapsed && selection.rangeCount > 0 && !!selection.toString().trim();
}

function openCanvasDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CANVAS_DB_NAME, CANVAS_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CANVAS_STORE)) request.result.createObjectStore(CANVAS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error(tr('无法打开画布数据库',"Cannot open canvas database")));
  });
}

async function readCanvasState(id) {
  const db = await openCanvasDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(CANVAS_STORE, 'readonly').objectStore(CANVAS_STORE).get(id);
    request.onsuccess = () => { db.close(); resolve(request.result || null); };
    request.onerror = () => { db.close(); reject(request.error); };
  });
}

async function writeCanvasState(id, state) {
  const db = await openCanvasDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CANVAS_STORE, 'readwrite');
    transaction.objectStore(CANVAS_STORE).put(state, id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

async function deleteCanvasState(id) {
  const db = await openCanvasDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(CANVAS_STORE, 'readwrite');
    transaction.objectStore(CANVAS_STORE).delete(id);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error); };
  });
}

const DEFAULT_OLLAMA = { id: 'local-default', name: 'Qwen', endpoint: 'http://127.0.0.1:11434', model: 'qwen2.5:7b' };
const DEFAULT_CLOUD = { id: 'cloud-default', name: 'OpenAI', format: 'responses', endpoint: 'https://api.openai.com/v1', model: 'gpt-5.4', apiKey: '', useLocalProxy: true, chatOptions: { thinking: false, reasoning: 'none', temperature: .7 } };
const GEMINI_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta';
const CLOUD_FORMAT_PRESETS = {
  responses: { endpoint: 'https://api.openai.com/v1', model: 'gpt-5.4' },
  'openai-compatible': { endpoint: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  anthropic: { endpoint: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5' },
  gemini: { endpoint: GEMINI_ENDPOINT, model: 'gemini-2.5-flash' },
};
const DEFAULT_CHAT_OPTIONS = { thinking: false, reasoning: 'none', temperature: .7 };
// Older profiles stored a reasoning level separately from the thought toggle.
// The toggle now has one unambiguous meaning: off means no reasoning request.
const normalizeChatOptions = (options = {}) => {
  const resolved = { ...DEFAULT_CHAT_OPTIONS, ...options };
  return !resolved.thinking || resolved.reasoning === 'none' ? { ...resolved, thinking: false, reasoning: 'none' } : resolved;
};
const DEFAULT_AGENT_SETTINGS = {
  codex: { model: '', reasoning: 'high', accessMode: 'workspace-write', profile: '', ephemeral: true, addDir: '' },
  claude: { model: '', permissionMode: 'default', maxTurns: '', verbose: false },
  deepseek: { profile: 'headless', reasoning: 'high', thinking: true },
};
const DEFAULT_CUSTOM_THEME = { background: '#f4f6f2', surface: '#ffffff', text: '#18231d', accent: '#267c5b', grid: '#c8d4cd' };
const UI_LANGUAGES = [
  ['zh-CN', '简体中文'], ['zh-TW', '繁體中文'], ['en', 'English'], ['ja', '日本語'], ['ko', '한국어'],
  ['es', 'Español'], ['fr', 'Français'], ['de', 'Deutsch'], ['pt-BR', 'Português'], ['ru', 'Русский'], ['ar', 'العربية'],
];
const UI_COPY = {
  'zh-CN': { canvasHint: '拖动画布 · 右键框选 · Shift 多选 · Alt 拖动子树 · Delete 删除', empty: '空画布', emptyHint: '在下方输入第一句话开始', attach: '＋ 图片 / 文件', shortcut: 'Enter 发送 · Shift Enter 换行', chat: '对话', idea: '想法', action: '行动', newCanvas: '新画布 · 从零开始', rootHint: '输入一个问题，AI 将从零开始回答……', ideaHint: '记录一个不需要 AI 回答的想法……', dropChat: '松开以添加到这次对话', language: '界面语言', languageHint: '仅改变软件界面文字；卡片内容与 AI 回复不会被自动翻译。', save: '保存', saving: '保存中…', saved: '已保存', saveFailed: '保存失败', fitCanvas: '适应画布', autoLayout: '自动整理', minimap: '小地图', focusPath: '专注路径', allCanvases: '所有画布', search: '搜索', library: '资料库', settings: '设置', localArchives: '本地 WDF 存档', savedCanvases: '已保存的画布', importWdf: '导入 WDF', createCanvas: '创建新画布', createCanvasHint: '从一个空白输入框开始', appearance: '外观', appearanceHint: '选择适合环境的界面，画布内容不会改变。', modelConnections: '模型连接', modelConnectionsHint: '本地与云端 API', projectData: '项目数据', projectDataHint: '导入与导出', themeDisplay: '主题与显示', interfaceTheme: '界面主题', interfaceThemeHint: '基础主题与高对比度主题，后者优先保证读写清晰。', preview: '缩放预览', previewHint: '缩小画布时仅显示标题；关闭后卡片始终保持完整内容。', enabled: '已开启', disabled: '已关闭', customTheme: '自定义', customThemeHint: '颜色会立即应用，并保存在当前设备。', restoreColors: '恢复默认颜色', currentNode: '当前节点', selectedNodes: '个节点已选择', overview: '概览', context: '上下文', operations: '操作', manualInput: '手动输入', nodeActions: '节点操作', editNode: '编辑节点', retryModel: '换模型重试', searchPlaceholder: '搜索标题、问题、回答或模型…', noResults: '没有匹配的节点', results: '项结果', currentCanvas: '当前画布', uploadCurrent: '＋ 上传到当前输入', libraryEmpty: '还没有文件。可以在此上传，或从任意输入框添加文件。', navigate: '导航', close: '关闭' },
  'zh-TW': { canvasHint: '拖曳畫布 · 右鍵框選 · Shift 多選 · Alt 拖曳子樹 · Delete 刪除', empty: '空白畫布', emptyHint: '在下方輸入第一句話開始', attach: '＋ 圖片 / 檔案', shortcut: 'Enter 傳送 · Shift Enter 換行', chat: '對話', idea: '想法', action: '行動', newCanvas: '新畫布 · 從零開始', rootHint: '輸入問題，AI 將從零開始回答……', ideaHint: '記錄一個不需要 AI 回答的想法……', dropChat: '放開即可加入這次對話', language: '介面語言', languageHint: '僅變更軟體介面文字；卡片內容與 AI 回覆不會自動翻譯。' },
  en: { canvasHint: 'Drag canvas · Right-drag to select · Shift multi-select · Alt drag subtree · Delete', empty: 'Empty canvas', emptyHint: 'Start with your first message below', attach: '＋ Image / File', shortcut: 'Enter to send · Shift Enter for newline', chat: 'Chat', idea: 'Idea', action: 'Action', newCanvas: 'New canvas · Start from scratch', rootHint: 'Ask a question and let AI answer from scratch…', ideaHint: 'Capture an idea without an AI reply…', dropChat: 'Release to add to this conversation', language: 'Interface language', languageHint: 'Changes app controls only. Cards and AI responses are not translated.', save: 'Save', saving: 'Saving…', saved: 'Saved', saveFailed: 'Save failed', fitCanvas: 'Fit canvas', autoLayout: 'Auto arrange', minimap: 'Minimap', focusPath: 'Focus path', allCanvases: 'All canvases', search: 'Search', library: 'Library', settings: 'Settings', localArchives: 'Local WDF archives', savedCanvases: 'Saved canvases', importWdf: 'Import WDF', createCanvas: 'Create canvas', createCanvasHint: 'Start with an empty composer', appearance: 'Appearance', appearanceHint: 'Choose an interface for your environment. Canvas content will not change.', modelConnections: 'Model connections', modelConnectionsHint: 'Local and cloud APIs', projectData: 'Project data', projectDataHint: 'Import and export', themeDisplay: 'Theme and display', interfaceTheme: 'Interface theme', interfaceThemeHint: 'Standard and high-contrast themes for clear reading and writing.', preview: 'Zoom preview', previewHint: 'Show only titles when zoomed out. Turn this off to keep full card content at every zoom level.', enabled: 'On', disabled: 'Off', customTheme: 'Custom theme', customThemeHint: 'Colors apply instantly and are saved in this browser.', restoreColors: 'Restore default colors', currentNode: 'Current node', selectedNodes: 'nodes selected', overview: 'Overview', context: 'Context', operations: 'Actions', manualInput: 'Manual input', nodeActions: 'Node actions', editNode: 'Edit node', retryModel: 'Retry with another model', searchPlaceholder: 'Search titles, questions, answers, or models…', noResults: 'No matching nodes', results: 'results', currentCanvas: 'Current canvas', uploadCurrent: '＋ Upload to current input', libraryEmpty: 'No files yet. Upload here or add files from any composer.', navigate: 'Navigate', close: 'Close' },
  ja: { canvasHint: 'キャンバスをドラッグ · 右ドラッグで選択 · Shift 複数選択 · Alt で子ツリー移動 · Delete 削除', empty: '空のキャンバス', emptyHint: '下の入力欄から最初のメッセージを始めましょう', attach: '＋ 画像 / ファイル', shortcut: 'Enter 送信 · Shift Enter 改行', chat: '会話', idea: 'アイデア', action: '実行', newCanvas: '新しいキャンバス · ゼロから開始', rootHint: '質問を入力すると、AI がゼロから回答します…', ideaHint: 'AI の回答が不要なアイデアを記録…', dropChat: '離すとこの会話に追加されます', language: '表示言語', languageHint: 'アプリの操作表示のみ変更します。カードと AI の回答は翻訳されません。' },
  ko: { canvasHint: '캔버스 드래그 · 오른쪽 드래그로 선택 · Shift 다중 선택 · Alt 하위 트리 이동 · Delete 삭제', empty: '빈 캔버스', emptyHint: '아래 입력창에서 첫 메시지를 시작하세요', attach: '＋ 이미지 / 파일', shortcut: 'Enter 전송 · Shift Enter 줄바꿈', chat: '대화', idea: '아이디어', action: '실행', newCanvas: '새 캔버스 · 처음부터 시작', rootHint: '질문을 입력하면 AI가 처음부터 답변합니다…', ideaHint: 'AI 답변이 필요 없는 아이디어를 기록하세요…', dropChat: '놓으면 이 대화에 추가됩니다', language: '인터페이스 언어', languageHint: '앱 조작 문구만 변경됩니다. 카드와 AI 응답은 번역되지 않습니다.' },
  es: { canvasHint: 'Arrastra el lienzo · Botón derecho para seleccionar · Shift múltiple · Alt mueve subárbol · Supr eliminar', empty: 'Lienzo vacío', emptyHint: 'Empieza con tu primer mensaje abajo', attach: '＋ Imagen / Archivo', shortcut: 'Enter para enviar · Shift Enter para nueva línea', chat: 'Chat', idea: 'Idea', action: 'Acción', newCanvas: 'Nuevo lienzo · Empezar desde cero', rootHint: 'Escribe una pregunta y la IA responderá desde cero…', ideaHint: 'Guarda una idea sin respuesta de IA…', dropChat: 'Suelta para añadir a esta conversación', language: 'Idioma de la interfaz', languageHint: 'Solo cambia la interfaz. Las tarjetas y respuestas de IA no se traducen.' },
  fr: { canvasHint: 'Glisser le canevas · Clic droit pour sélectionner · Shift multiple · Alt déplace la branche · Suppr supprimer', empty: 'Canevas vide', emptyHint: 'Commencez avec votre premier message ci-dessous', attach: '＋ Image / Fichier', shortcut: 'Entrée pour envoyer · Maj Entrée pour nouvelle ligne', chat: 'Discussion', idea: 'Idée', action: 'Action', newCanvas: 'Nouveau canevas · Commencer de zéro', rootHint: 'Posez une question et l’IA répondra depuis zéro…', ideaHint: 'Notez une idée sans réponse de l’IA…', dropChat: 'Déposez pour ajouter à cette discussion', language: 'Langue de l’interface', languageHint: 'Change seulement l’interface. Les cartes et réponses IA ne sont pas traduites.' },
  de: { canvasHint: 'Leinwand ziehen · Rechts ziehen zum Auswählen · Shift Mehrfachauswahl · Alt Unterbaum bewegen · Entf löschen', empty: 'Leere Leinwand', emptyHint: 'Beginne unten mit deiner ersten Nachricht', attach: '＋ Bild / Datei', shortcut: 'Enter zum Senden · Shift Enter für Zeilenumbruch', chat: 'Chat', idea: 'Idee', action: 'Aktion', newCanvas: 'Neue Leinwand · Von vorn beginnen', rootHint: 'Stelle eine Frage, die KI antwortet von Grund auf…', ideaHint: 'Eine Idee ohne KI-Antwort festhalten…', dropChat: 'Loslassen, um zur Unterhaltung hinzuzufügen', language: 'Oberflächensprache', languageHint: 'Ändert nur die Bedienoberfläche. Karten und KI-Antworten werden nicht übersetzt.' },
  'pt-BR': { canvasHint: 'Arraste a tela · Botão direito para selecionar · Shift múltiplo · Alt move a subárvore · Delete excluir', empty: 'Tela vazia', emptyHint: 'Comece com sua primeira mensagem abaixo', attach: '＋ Imagem / Arquivo', shortcut: 'Enter para enviar · Shift Enter para nova linha', chat: 'Conversa', idea: 'Ideia', action: 'Ação', newCanvas: 'Nova tela · Começar do zero', rootHint: 'Digite uma pergunta e a IA responderá do zero…', ideaHint: 'Registre uma ideia sem resposta da IA…', dropChat: 'Solte para adicionar a esta conversa', language: 'Idioma da interface', languageHint: 'Altera apenas a interface. Cartões e respostas da IA não são traduzidos.' },
  ru: { canvasHint: 'Перетаскивание холста · Правая кнопка для выбора · Shift множественный выбор · Alt переместить ветвь · Delete удалить', empty: 'Пустой холст', emptyHint: 'Начните с первого сообщения ниже', attach: '＋ Изображение / файл', shortcut: 'Enter — отправить · Shift Enter — новая строка', chat: 'Диалог', idea: 'Идея', action: 'Действие', newCanvas: 'Новый холст · Начать с нуля', rootHint: 'Задайте вопрос, и ИИ ответит с нуля…', ideaHint: 'Запишите идею без ответа ИИ…', dropChat: 'Отпустите, чтобы добавить к этому диалогу', language: 'Язык интерфейса', languageHint: 'Меняет только интерфейс. Карточки и ответы ИИ не переводятся.' },
  ar: { canvasHint: 'اسحب اللوحة · زر الفأرة الأيمن للتحديد · Shift لتحديد متعدد · Alt لتحريك الفرع · Delete للحذف', empty: 'لوحة فارغة', emptyHint: 'ابدأ برسالتك الأولى في الأسفل', attach: '＋ صورة / ملف', shortcut: 'Enter للإرسال · Shift Enter لسطر جديد', chat: 'محادثة', idea: 'فكرة', action: 'إجراء', newCanvas: 'لوحة جديدة · ابدأ من الصفر', rootHint: 'اكتب سؤالاً وسيجيب الذكاء الاصطناعي من الصفر…', ideaHint: 'سجّل فكرة لا تحتاج إلى رد من الذكاء الاصطناعي…', dropChat: 'أفلت للإضافة إلى هذه المحادثة', language: 'لغة الواجهة', languageHint: 'يغيّر واجهة التطبيق فقط. لا تُترجم البطاقات وردود الذكاء الاصطناعي.' },
};
const NODE_COLORS = [
  ['default', '默认', ''], ['sage', '雾青', '#edf7f1'], ['amber', '琥珀', '#fff4dc'],
  ['rose', '玫瑰', '#fff0f0'], ['sky', '晴空', '#eef6ff'], ['lilac', '紫雾', '#f5efff'],
];

// UI_COPY stores short, keyed labels.  This companion table covers the longer
// interface phrases passed through tr().  A missing phrase deliberately falls
// back to English — never to Chinese — so mixed-language screens are avoided.
const PHRASE_PACKS = {
  'zh-TW': { 'Save': '儲存', 'Settings': '設定', 'Cancel': '取消', 'Done': '完成', 'Delete': '刪除', 'Close': '關閉', 'Action settings': '本次行動設定', 'Conversation settings': '本次對話設定', 'Model': '模型', 'Reasoning effort': '推理強度', 'Working directory': '工作目錄', 'Choose folder': '選擇資料夾', 'Artifacts': '產物', 'Action controls': '行動操作', 'Node actions': '節點操作', 'Current node': '目前節點', 'Context': '上下文', 'Actions': '操作', 'Question in this turn': '本輪問題', 'Delete links': '刪除連線' },
  ja: { 'Save': '保存', 'Settings': '設定', 'Cancel': 'キャンセル', 'Done': '完了', 'Delete': '削除', 'Close': '閉じる', 'Action settings': '実行設定', 'Conversation settings': '会話設定', 'Model': 'モデル', 'Reasoning effort': '推論の強さ', 'Working directory': '作業ディレクトリ', 'Choose folder': 'フォルダーを選択', 'Artifacts': '成果物', 'Action controls': '実行操作', 'Node actions': 'ノード操作', 'Current node': '現在のノード', 'Context': 'コンテキスト', 'Actions': '操作', 'Question in this turn': 'このターンの質問', 'Delete links': '接続を削除' },
  ko: { 'Save': '저장', 'Settings': '설정', 'Cancel': '취소', 'Done': '완료', 'Delete': '삭제', 'Close': '닫기', 'Action settings': '실행 설정', 'Conversation settings': '대화 설정', 'Model': '모델', 'Reasoning effort': '추론 강도', 'Working directory': '작업 디렉터리', 'Choose folder': '폴더 선택', 'Artifacts': '결과물', 'Action controls': '실행 제어', 'Node actions': '노드 작업', 'Current node': '현재 노드', 'Context': '컨텍스트', 'Actions': '작업', 'Question in this turn': '이번 대화의 질문', 'Delete links': '연결 삭제' },
  es: { 'Save': 'Guardar', 'Settings': 'Configuración', 'Cancel': 'Cancelar', 'Done': 'Listo', 'Delete': 'Eliminar', 'Close': 'Cerrar', 'Action settings': 'Configuración de acción', 'Conversation settings': 'Configuración de conversación', 'Model': 'Modelo', 'Reasoning effort': 'Esfuerzo de razonamiento', 'Working directory': 'Directorio de trabajo', 'Choose folder': 'Elegir carpeta', 'Artifacts': 'Resultados', 'Action controls': 'Controles de acción', 'Node actions': 'Acciones del nodo', 'Current node': 'Nodo actual', 'Context': 'Contexto', 'Actions': 'Acciones', 'Question in this turn': 'Pregunta de este turno', 'Delete links': 'Eliminar conexiones' },
  fr: { 'Save': 'Enregistrer', 'Settings': 'Paramètres', 'Cancel': 'Annuler', 'Done': 'Terminé', 'Delete': 'Supprimer', 'Close': 'Fermer', 'Action settings': 'Paramètres de l’action', 'Conversation settings': 'Paramètres de conversation', 'Model': 'Modèle', 'Reasoning effort': 'Effort de raisonnement', 'Working directory': 'Dossier de travail', 'Choose folder': 'Choisir un dossier', 'Artifacts': 'Livrables', 'Action controls': 'Contrôles d’action', 'Node actions': 'Actions du nœud', 'Current node': 'Nœud actuel', 'Context': 'Contexte', 'Actions': 'Actions', 'Question in this turn': 'Question de ce tour', 'Delete links': 'Supprimer les liens' },
  de: { 'Save': 'Speichern', 'Settings': 'Einstellungen', 'Cancel': 'Abbrechen', 'Done': 'Fertig', 'Delete': 'Löschen', 'Close': 'Schließen', 'Action settings': 'Aktionsoptionen', 'Conversation settings': 'Gesprächseinstellungen', 'Model': 'Modell', 'Reasoning effort': 'Denkaufwand', 'Working directory': 'Arbeitsverzeichnis', 'Choose folder': 'Ordner auswählen', 'Artifacts': 'Ergebnisse', 'Action controls': 'Aktionssteuerung', 'Node actions': 'Knotenaktionen', 'Current node': 'Aktueller Knoten', 'Context': 'Kontext', 'Actions': 'Aktionen', 'Question in this turn': 'Frage dieser Runde', 'Delete links': 'Verbindungen löschen' },
  'pt-BR': { 'Save': 'Salvar', 'Settings': 'Configurações', 'Cancel': 'Cancelar', 'Done': 'Concluído', 'Delete': 'Excluir', 'Close': 'Fechar', 'Action settings': 'Configurações da ação', 'Conversation settings': 'Configurações da conversa', 'Model': 'Modelo', 'Reasoning effort': 'Nível de raciocínio', 'Working directory': 'Diretório de trabalho', 'Choose folder': 'Escolher pasta', 'Artifacts': 'Resultados', 'Action controls': 'Controles da ação', 'Node actions': 'Ações do nó', 'Current node': 'Nó atual', 'Context': 'Contexto', 'Actions': 'Ações', 'Question in this turn': 'Pergunta desta rodada', 'Delete links': 'Excluir conexões' },
  ru: { 'Save': 'Сохранить', 'Settings': 'Настройки', 'Cancel': 'Отмена', 'Done': 'Готово', 'Delete': 'Удалить', 'Close': 'Закрыть', 'Action settings': 'Настройки действия', 'Conversation settings': 'Настройки диалога', 'Model': 'Модель', 'Reasoning effort': 'Уровень рассуждения', 'Working directory': 'Рабочая папка', 'Choose folder': 'Выбрать папку', 'Artifacts': 'Результаты', 'Action controls': 'Управление действием', 'Node actions': 'Действия узла', 'Current node': 'Текущий узел', 'Context': 'Контекст', 'Actions': 'Действия', 'Question in this turn': 'Вопрос этого шага', 'Delete links': 'Удалить связи' },
  ar: { 'Save': 'حفظ', 'Settings': 'الإعدادات', 'Cancel': 'إلغاء', 'Done': 'تم', 'Delete': 'حذف', 'Close': 'إغلاق', 'Action settings': 'إعدادات الإجراء', 'Conversation settings': 'إعدادات المحادثة', 'Model': 'النموذج', 'Reasoning effort': 'مستوى الاستدلال', 'Working directory': 'مجلد العمل', 'Choose folder': 'اختر مجلداً', 'Artifacts': 'المخرجات', 'Action controls': 'عناصر تحكم الإجراء', 'Node actions': 'إجراءات العقدة', 'Current node': 'العقدة الحالية', 'Context': 'السياق', 'Actions': 'الإجراءات', 'Question in this turn': 'سؤال هذه الجولة', 'Delete links': 'حذف الروابط' },
};

// Shared settings/navigation vocabulary.  Keep these explicit and offline: UI
// translation must never send card content or model output to a third party.
const COMPLETE_UI_PACKS = {
  'zh-TW': { 'About':'關於','Notifications':'通知','License':'授權','Activated':'已啟用','Not activated':'未啟用','Current version':'目前版本','Official website':'官方網站','Notification service':'通知服務','Model connections':'模型連線','Appearance':'外觀','Project data':'專案資料','Local models':'本機模型','Cloud model library':'雲端模型庫','API configuration':'API 設定','Display name':'顯示名稱','Server URL':'服務位址','Model name':'模型名稱','Test connection':'測試連線','In-app notifications':'應用程式內通知','Receive notifications':'接收通知','Activation code':'啟用碼','Export WDF':'匯出 WDF','Import WDF':'匯入 WDF','Save':'儲存','Close':'關閉','Delete':'刪除','Cancel':'取消','Done':'完成' },
  ja: { 'About':'情報','Notifications':'通知','License':'ライセンス','Activated':'有効','Not activated':'未有効','Current version':'現在のバージョン','Official website':'公式サイト','Notification service':'通知サービス','Model connections':'モデル接続','Appearance':'外観','Project data':'プロジェクトデータ','Local models':'ローカルモデル','Cloud model library':'クラウドモデルライブラリ','API configuration':'API 設定','Display name':'表示名','Server URL':'サーバー URL','Model name':'モデル名','Test connection':'接続をテスト','In-app notifications':'アプリ内通知','Receive notifications':'通知を受け取る','Activation code':'アクティベーションコード','Export WDF':'WDF をエクスポート','Import WDF':'WDF をインポート','Save':'保存','Close':'閉じる','Delete':'削除','Cancel':'キャンセル','Done':'完了' },
  ko: { 'About':'정보','Notifications':'알림','License':'라이선스','Activated':'활성화됨','Not activated':'활성화되지 않음','Current version':'현재 버전','Official website':'공식 웹사이트','Notification service':'알림 서비스','Model connections':'모델 연결','Appearance':'모양','Project data':'프로젝트 데이터','Local models':'로컬 모델','Cloud model library':'클라우드 모델 라이브러리','API configuration':'API 설정','Display name':'표시 이름','Server URL':'서버 URL','Model name':'모델 이름','Test connection':'연결 테스트','In-app notifications':'앱 내 알림','Receive notifications':'알림 받기','Activation code':'활성화 코드','Export WDF':'WDF 내보내기','Import WDF':'WDF 가져오기','Save':'저장','Close':'닫기','Delete':'삭제','Cancel':'취소','Done':'완료' },
  es: { 'About':'Acerca de','Notifications':'Notificaciones','License':'Licencia','Activated':'Activada','Not activated':'Sin activar','Current version':'Versión actual','Official website':'Sitio web oficial','Notification service':'Servicio de notificaciones','Model connections':'Conexiones de modelos','Appearance':'Apariencia','Project data':'Datos del proyecto','Local models':'Modelos locales','Cloud model library':'Biblioteca de modelos en la nube','API configuration':'Configuración de API','Display name':'Nombre visible','Server URL':'URL del servidor','Model name':'Nombre del modelo','Test connection':'Probar conexión','In-app notifications':'Notificaciones en la aplicación','Receive notifications':'Recibir notificaciones','Activation code':'Código de activación','Export WDF':'Exportar WDF','Import WDF':'Importar WDF','Save':'Guardar','Close':'Cerrar','Delete':'Eliminar','Cancel':'Cancelar','Done':'Listo' },
  fr: { 'About':'À propos','Notifications':'Notifications','License':'Licence','Activated':'Activée','Not activated':'Non activée','Current version':'Version actuelle','Official website':'Site officiel','Notification service':'Service de notifications','Model connections':'Connexions de modèles','Appearance':'Apparence','Project data':'Données du projet','Local models':'Modèles locaux','Cloud model library':'Bibliothèque de modèles cloud','API configuration':'Configuration API','Display name':'Nom affiché','Server URL':'URL du serveur','Model name':'Nom du modèle','Test connection':'Tester la connexion','In-app notifications':'Notifications intégrées','Receive notifications':'Recevoir les notifications','Activation code':'Code d’activation','Export WDF':'Exporter WDF','Import WDF':'Importer WDF','Save':'Enregistrer','Close':'Fermer','Delete':'Supprimer','Cancel':'Annuler','Done':'Terminé' },
  de: { 'About':'Info','Notifications':'Benachrichtigungen','License':'Lizenz','Activated':'Aktiviert','Not activated':'Nicht aktiviert','Current version':'Aktuelle Version','Official website':'Offizielle Website','Notification service':'Benachrichtigungsdienst','Model connections':'Modellverbindungen','Appearance':'Darstellung','Project data':'Projektdaten','Local models':'Lokale Modelle','Cloud model library':'Cloud-Modellbibliothek','API configuration':'API-Konfiguration','Display name':'Anzeigename','Server URL':'Server-URL','Model name':'Modellname','Test connection':'Verbindung testen','In-app notifications':'In-App-Benachrichtigungen','Receive notifications':'Benachrichtigungen empfangen','Activation code':'Aktivierungscode','Export WDF':'WDF exportieren','Import WDF':'WDF importieren','Save':'Speichern','Close':'Schließen','Delete':'Löschen','Cancel':'Abbrechen','Done':'Fertig' },
  'pt-BR': { 'About':'Sobre','Notifications':'Notificações','License':'Licença','Activated':'Ativada','Not activated':'Não ativada','Current version':'Versão atual','Official website':'Site oficial','Notification service':'Serviço de notificações','Model connections':'Conexões de modelos','Appearance':'Aparência','Project data':'Dados do projeto','Local models':'Modelos locais','Cloud model library':'Biblioteca de modelos na nuvem','API configuration':'Configuração de API','Display name':'Nome de exibição','Server URL':'URL do servidor','Model name':'Nome do modelo','Test connection':'Testar conexão','In-app notifications':'Notificações no aplicativo','Receive notifications':'Receber notificações','Activation code':'Código de ativação','Export WDF':'Exportar WDF','Import WDF':'Importar WDF','Save':'Salvar','Close':'Fechar','Delete':'Excluir','Cancel':'Cancelar','Done':'Concluído' },
  ru: { 'About':'О приложении','Notifications':'Уведомления','License':'Лицензия','Activated':'Активирована','Not activated':'Не активирована','Current version':'Текущая версия','Official website':'Официальный сайт','Notification service':'Служба уведомлений','Model connections':'Подключения моделей','Appearance':'Внешний вид','Project data':'Данные проекта','Local models':'Локальные модели','Cloud model library':'Библиотека облачных моделей','API configuration':'Настройка API','Display name':'Отображаемое имя','Server URL':'URL сервера','Model name':'Название модели','Test connection':'Проверить подключение','In-app notifications':'Уведомления в приложении','Receive notifications':'Получать уведомления','Activation code':'Код активации','Export WDF':'Экспорт WDF','Import WDF':'Импорт WDF','Save':'Сохранить','Close':'Закрыть','Delete':'Удалить','Cancel':'Отмена','Done':'Готово' },
  ar: { 'About':'حول','Notifications':'الإشعارات','License':'الترخيص','Activated':'مفعّل','Not activated':'غير مفعّل','Current version':'الإصدار الحالي','Official website':'الموقع الرسمي','Notification service':'خدمة الإشعارات','Model connections':'اتصالات النماذج','Appearance':'المظهر','Project data':'بيانات المشروع','Local models':'النماذج المحلية','Cloud model library':'مكتبة النماذج السحابية','API configuration':'إعداد API','Display name':'اسم العرض','Server URL':'عنوان الخادم','Model name':'اسم النموذج','Test connection':'اختبار الاتصال','In-app notifications':'إشعارات داخل التطبيق','Receive notifications':'تلقي الإشعارات','Activation code':'رمز التفعيل','Export WDF':'تصدير WDF','Import WDF':'استيراد WDF','Save':'حفظ','Close':'إغلاق','Delete':'حذف','Cancel':'إلغاء','Done':'تم' },
};

const SPONSOR_LOCALIZATIONS = `
Sponsor|贊助|スポンサー|후원|Patrocinar|Soutenir|Unterstützen|Apoiar|Поддержать|دعم
Support continued Wendaflow development|支持 Wendaflow 持續開發|Wendaflow の継続開発を支援|Wendaflow의 지속적인 개발 지원|Apoyar el desarrollo continuo de Wendaflow|Soutenir le développement continu de Wendaflow|Die Weiterentwicklung von Wendaflow unterstützen|Apoie o desenvolvimento contínuo do Wendaflow|Поддержать дальнейшую разработку Wendaflow|دعم تطوير Wendaflow المستمر
Sponsor Wendaflow|贊助 Wendaflow|Wendaflow を支援|Wendaflow 후원|Patrocinar Wendaflow|Soutenir Wendaflow|Wendaflow unterstützen|Apoiar o Wendaflow|Поддержать Wendaflow|ادعم Wendaflow
If Wendaflow helps you, you can support its continued development through any option below. Click a QR code to enlarge it.|如果 Wendaflow 對你有幫助，歡迎透過下列任一方式支持後續開發。點擊 QR 碼可放大查看。|Wendaflow がお役に立った場合は、以下のいずれかの方法で開発を支援できます。QR コードをクリックすると拡大できます。|Wendaflow가 도움이 되었다면 아래 방법 중 하나로 개발을 후원해 주세요. QR 코드를 클릭하면 확대됩니다.|Si Wendaflow te ayuda, puedes apoyar su desarrollo con cualquiera de las opciones siguientes. Haz clic en el código QR para ampliarlo.|Si Wendaflow vous aide, vous pouvez soutenir son développement avec l’une des options ci-dessous. Cliquez sur le QR code pour l’agrandir.|Wenn Wendaflow dir hilft, kannst du die Weiterentwicklung mit einer der folgenden Optionen unterstützen. Klicke den QR-Code zum Vergrößern an.|Se o Wendaflow ajuda você, apoie o desenvolvimento contínuo por qualquer opção abaixo. Clique no QR code para ampliar.|Если Wendaflow вам помогает, поддержите его дальнейшую разработку любым из способов ниже. Нажмите QR-код для увеличения.|إذا كان Wendaflow مفيداً لك، يمكنك دعم تطويره المستمر عبر أي خيار أدناه. انقر رمز QR لتكبيره.
WeChat Pay|微信支付|WeChat Pay|위챗 페이|WeChat Pay|WeChat Pay|WeChat Pay|WeChat Pay|WeChat Pay|WeChat Pay
WeChat Pay recommended|推薦使用微信支付|WeChat Pay を推奨|위챗 페이 권장|Se recomienda WeChat Pay|WeChat Pay recommandé|WeChat Pay empfohlen|WeChat Pay recomendado|Рекомендуется WeChat Pay|يوصى باستخدام WeChat Pay
Alipay|支付寶|Alipay|알리페이|Alipay|Alipay|Alipay|Alipay|Alipay|Alipay
Scan with Alipay|使用支付寶掃碼|Alipay でスキャン|알리페이로 스캔|Escanear con Alipay|Scanner avec Alipay|Mit Alipay scannen|Escaneie com o Alipay|Сканировать через Alipay|امسح عبر Alipay
Binance Pay|幣安支付|Binance Pay|바이낸스 페이|Binance Pay|Binance Pay|Binance Pay|Binance Pay|Binance Pay|Binance Pay
Scan with Binance App|使用幣安 App 掃碼|Binance アプリでスキャン|바이낸스 앱으로 스캔|Escanear con la app de Binance|Scanner avec l’app Binance|Mit der Binance-App scannen|Escaneie com o app Binance|Сканировать в приложении Binance|امسح عبر تطبيق Binance
USDT · TRON|USDT · TRON|USDT · TRON|USDT · TRON|USDT · TRON|USDT · TRON|USDT · TRON|USDT · TRON|USDT · TRON|USDT · TRON
TRON network only|僅支援 TRON 網路|TRON ネットワークのみ|TRON 네트워크만 지원|Solo red TRON|Réseau TRON uniquement|Nur TRON-Netzwerk|Somente rede TRON|Только сеть TRON|شبكة TRON فقط
sponsorship QR code|贊助 QR 碼|支援用 QR コード|후원 QR 코드|Código QR de patrocinio|QR code de soutien|Unterstützungs-QR-Code|QR code de apoio|QR-код для поддержки|رمز QR للدعم
Click to enlarge|點擊放大|クリックして拡大|클릭하여 확대|Haz clic para ampliar|Cliquer pour agrandir|Zum Vergrößern klicken|Clique para ampliar|Нажмите для увеличения|انقر للتكبير
Thank you — your support directly helps Wendaflow keep improving.|感謝你的支持，它會直接幫助 Wendaflow 持續改進。|ご支援ありがとうございます。Wendaflow の継続的な改善に直接役立ちます。|후원해 주셔서 감사합니다. Wendaflow의 지속적인 개선에 직접 도움이 됩니다.|Gracias: tu apoyo ayuda directamente a que Wendaflow siga mejorando.|Merci : votre soutien aide directement Wendaflow à continuer de s’améliorer.|Danke — deine Unterstützung hilft Wendaflow direkt, sich weiter zu verbessern.|Obrigado — seu apoio ajuda diretamente o Wendaflow a continuar melhorando.|Спасибо — ваша поддержка напрямую помогает Wendaflow становиться лучше.|شكراً لك — دعمك يساعد Wendaflow مباشرة على الاستمرار في التحسن.
`;
const TRANSLATIONS = buildCatalog(UI_COPY, PHRASE_PACKS, COMPLETE_UI_PACKS, [SPONSOR_LOCALIZATIONS]);
function readUiLanguage() {
  const value = localStorage.getItem('wendaflow-ui-language');
  return UI_LANGUAGES.some(([id]) => id === value) ? value : 'zh-CN';
}
// Helpers outside React resolve the current persisted locale on each invocation.
function tr(chinese, english) { return translate(TRANSLATIONS, readUiLanguage(), chinese, english); }

function loadState(canvasId) {
  try {
    if (canvasId) {
      const canvasValue = JSON.parse(localStorage.getItem(`branchspace-canvas-${canvasId}`));
      if (Array.isArray(canvasValue?.nodes)) return canvasValue;
    }
  } catch {}
  return { nodes: [], selectedId: null, collapsedIds: [], viewport: { x: 20, y: 20, zoom: .9 } };
}

function loadCanvasBoot() {
  const now = new Date().toISOString();
  try {
    const saved = JSON.parse(localStorage.getItem(CANVAS_INDEX_KEY));
    if (saved?.canvases?.length) return { canvases: saved.canvases.map((canvas) => ({ ...canvas, createdAt: canvas.createdAt || now, updatedAt: canvas.updatedAt || canvas.createdAt || now })), activeId: saved.activeId || saved.canvases[0].id };
  } catch {}
  return { canvases: [{ id: 'canvas-main', name: tr('主画布',"Main canvas"), createdAt: now, updatedAt: now }], activeId: 'canvas-main' };
}

function formatCanvasTime(value, language = 'zh-CN') {
  if (!value) return translate(TRANSLATIONS,language,'未知','Unknown');
  return new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function ancestors(nodes, id) {
  const map = new Map(nodes.map((node) => [node.id, node]));
  const result = [];
  let cursor = map.get(id);
  while (cursor) {
    result.unshift(cursor);
    cursor = cursor.parentId ? map.get(cursor.parentId) : null;
  }
  return result;
}

function statusLabel(status, language = 'zh-CN') {
  const tr = (zh,en) => translate(TRANSLATIONS,language,zh,en);
  const labels = {done:tr('已完成','Completed'),queued:tr('排队中','Queued'),running:tr('执行中','Running'),thinking:tr('思考中','Thinking'),streaming:tr('生成中','Generating'),approval:tr('等待授权','Awaiting approval'),failed:tr('失败','Failed'),stopped:tr('已暂停','Stopped')};
  return labels[status] || '';
}

function patchLatestRequest(item, patch) {
  const requestRecord = { ...(item.requestRecord || {}), ...patch };
  const requestHistory = [...(item.requestHistory || [])];
  if (requestHistory.length) requestHistory[requestHistory.length - 1] = { ...requestHistory[requestHistory.length - 1], ...patch };
  else if (Object.keys(requestRecord).length) requestHistory.push(requestRecord);
  return { ...item, requestRecord, requestHistory };
}

function semanticPreview(zoom) {
  // The visual hand-off itself is animated in CSS. Keeping this target binary
  // means a stopped wheel can never leave a card in a half-preview state.
  // The boundary is deliberately ahead of the compact layout threshold so a
  // single ordinary wheel notch completes the preview change.
  return zoom < 0.54 ? 1 : 0;
}

function findBranchPosition(nodes, parent, nodeSizes) {
  const parentSize = nodeSizes.get(parent.id) || { width: parent.manualWidth || 224, height: parent.manualHeight || 110 };
  const x = parent.x + parentSize.width + 86;
  const offsets = [0, 155, -155, 310, 465, -310, 620, -465, 775, -620];
  const overlaps = (candidateY) => nodes.some((node) => {
    const size = nodeSizes.get(node.id) || { width: node.manualWidth || 224, height: node.manualHeight || 110 };
    return x < node.x + size.width + 28 && x + 224 + 28 > node.x && candidateY < node.y + size.height + 28 && candidateY + 110 + 28 > node.y;
  });
  const offset = offsets.find((value) => !overlaps(parent.y + value));
  return { x, y: parent.y + (offset ?? offsets[offsets.length - 1]) };
}

function isDescendant(nodes, nodeId, ancestorId) {
  const map = new Map(nodes.map((node) => [node.id, node]));
  let cursor = map.get(nodeId);
  while (cursor?.parentId) {
    if (cursor.parentId === ancestorId) return true;
    cursor = map.get(cursor.parentId);
  }
  return false;
}

function questionTitle(text, fallback = tr('新起点',"New starting point")) {
  // A node title is the user's actual question/idea, not a generated summary.
  // Keep every word; the compact canvas renderer decides how much to display.
  return (text || '').trim().replace(/\s+/g, ' ') || fallback;
}

function outputAssets(content = '') {
  return [...content.matchAll(/!?\[([^\]]*)\]\(([^)]+)\)/g)].map((match) => ({ name: match[1] || match[2].split('/').pop(), url: match[2], image: match[0].startsWith('!') || /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(match[2]) })).slice(0, 6);
}

function localArtifactPath(artifact) {
  if (artifact?.localPath) return artifact.localPath;
  const value = String(artifact?.href || '').trim().replace(/^file:\/\//i, '');
  return /^[A-Za-z]:[\\/]/.test(value) ? decodeURIComponent(value) : '';
}

function actionArtifacts(node) {
  const linked = outputAssets(node.content || '').map((asset, index) => ({ id: `link-${index}-${asset.url}`, name: asset.name, href: asset.url, localPath: /^[A-Za-z]:[\\/]/.test(asset.url) ? asset.url : '', image: asset.image, state: tr('生成内容',"Generated content") }));
  const generated = (node.execution?.artifacts || []).map((artifact, index) => ({ id: artifact.id || `generated-${index}-${artifact.name}`, jobId: node.execution?.jobId, name: artifact.name, href: artifact.url, localPath: artifact.localPath, image: artifact.image, state: artifact.state || tr('生成文件',"Generated file"), size: artifact.size }));
  const changed = String(node.execution?.after?.status || '').split(/\r?\n/).filter(Boolean).flatMap((line, index) => {
    const match = line.match(/^(.{1,2})\s+(.+)$/);
    if (!match) return [];
    const code = match[1].trim() || 'M';
    const file = match[2].split(' -> ').at(-1).trim();
    if (!file) return [];
    return [{ id: `file-${index}-${file}`, name: file, state: code.includes('?') || code.includes('A') ? tr('新增文件',"New file") : code.includes('D') ? tr('已删除',"Deleted") : tr('已修改',"Modified") }];
  });
  const seen = new Set();
  return [...generated, ...linked, ...changed].filter((item) => {
    const key = String(item.localPath || item.href || item.name || item.id).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ModelPicker({ value, onChange, options, language }) {
  const tr = (zh,en) => translate(TRANSLATIONS,language,zh,en);
  const [open, setOpen] = useState(false);
  const selected = options.find((item) => item.value === value) || options[0];
  return <div className="model-picker">
    <button type="button" className={open ? 'open' : ''} onClick={() => setOpen((state) => !state)} aria-haspopup="listbox" aria-expanded={open}><span>{selected?.label || tr('选择模型',"Select model")}</span><i>⌄</i></button>
    {open && <div className="model-picker-menu" role="listbox">{options.map((item) => <button type="button" role="option" aria-selected={item.value === value} key={item.value} className={item.value === value ? 'selected' : ''} onClick={() => { onChange(item.value); setOpen(false); }}><span>{item.label}</span><i>{item.value === value ? '✓' : ''}</i></button>)}</div>}
  </div>;
}

function App() {
  const canvasBoot = useMemo(loadCanvasBoot, []);
  const [canvases, setCanvases] = useState(canvasBoot.canvases);
  const [activeCanvasId, setActiveCanvasId] = useState(canvasBoot.activeId);
  const [canvasMenuOpen, setCanvasMenuOpen] = useState(false);
  const [closingPanels, setClosingPanels] = useState(new Set());
  const [editingCanvasId, setEditingCanvasId] = useState(null);
  const [saveStatus, setSaveStatus] = useState('');
  const saveCanvasRef = useRef(null);
  const [savedCanvases, setSavedCanvases] = useState([]);
  const [canvasLibraryStatus, setCanvasLibraryStatus] = useState('');
  const [canvasTransition, setCanvasTransition] = useState('');
  const [theme, setTheme] = useState(() => localStorage.getItem('wonderful-theme') || 'contrast-light');
  const [uiLanguage, setUiLanguage] = useState(readUiLanguage);
  const tr = (chinese, english) => translate(TRANSLATIONS, uiLanguage, chinese, english);
  const systemText = (value) => localizeKnown(TRANSLATIONS, uiLanguage, value);
  const openExternalUrl = (url) => {
    if (!url) return;
    if (window.wonderfulWindow?.openExternal) {
      window.wonderfulWindow.openExternal(url).catch(() => window.open(url, '_blank', 'noopener,noreferrer'));
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };
  const colorLabel = (id) => ({default:tr('默认','Default'),sage:tr('雾青','Mist'),amber:tr('琥珀','Amber'),rose:tr('玫瑰','Rose'),sky:tr('晴空','Sky'),lilac:tr('紫雾','Lilac')})[id] || tr('默认','Default');
  const mergeGoalLabel = (goal) => ({'综合结论':tr('综合结论','Synthesize conclusions'),'并列比较':tr('并列比较','Compare side by side'),'找出冲突':tr('找出冲突','Find conflicts'),'制定行动':tr('制定行动','Plan actions')})[goal];
  const copy = Object.fromEntries(Object.entries(UI_COPY.en).map(([key,english]) => [key,tr(UI_COPY['zh-CN'][key],english)]));
  const text = (key, chinese = key) => copy[key] ?? chinese;
  // "Classic preview" is deliberately kept separate from camera zoom.  It
  // restores the reliable title-only preview that existed before the recent
  // staged rich-content experiment, and can be disabled completely.
  const [previewEnabled, setPreviewEnabled] = useState(() => localStorage.getItem('wonderful-preview-enabled') === 'true');
  const [customTheme, setCustomTheme] = useState(() => {
    try { return { ...DEFAULT_CUSTOM_THEME, ...JSON.parse(localStorage.getItem('wonderful-custom-theme') || '{}') }; }
    catch { return DEFAULT_CUSTOM_THEME; }
  });
  const [actionRunner, setActionRunner] = useState(() => localStorage.getItem('wonderful-action-runner') || 'codex');
  const [actionOptionsOpen, setActionOptionsOpen] = useState(false);
  const [chatOptionsOpen, setChatOptionsOpen] = useState(false);
  const [actionWorkspace, setActionWorkspace] = useState('');
  const [agentSettings, setAgentSettings] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('wonderful-agent-settings')) || {};
      const oldCodexMode = saved.codex?.accessMode || saved.codex?.sandbox || 'workspace-write';
      return { codex: { ...DEFAULT_AGENT_SETTINGS.codex, ...saved.codex, accessMode: oldCodexMode }, claude: { ...DEFAULT_AGENT_SETTINGS.claude, ...saved.claude }, deepseek: { ...DEFAULT_AGENT_SETTINGS.deepseek, ...saved.deepseek } };
    } catch { return JSON.parse(JSON.stringify(DEFAULT_AGENT_SETTINGS)); }
  });
  const [taskAgentSettings, setTaskAgentSettings] = useState(() => JSON.parse(JSON.stringify(agentSettings)));
  const [rootComposerOpen, setRootComposerOpen] = useState(false);
  const [rootComposerClosing, setRootComposerClosing] = useState(false);
  const [rootPosition, setRootPosition] = useState({ x: 220, y: 220 });
  const initial = useMemo(() => loadState(canvasBoot.activeId), []);
  const [nodes, setNodes] = useState(initial.nodes);
  const [selectedId, setSelectedId] = useState(initial.selectedId);
  const [selectedIds, setSelectedIds] = useState(new Set(initial.selectedId ? [initial.selectedId] : []));
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsClosing, setSettingsClosing] = useState(false);
  const [settingsSection, setSettingsSection] = useState('models');
  const [sponsorPreview, setSponsorPreview] = useState(null);
  const [sponsorCopied, setSponsorCopied] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wendaflow-notifications') || '[]'); } catch { return []; }
  });
  const [notificationSettings, setNotificationSettings] = useState(() => {
    try { return { enabled: true, deviceId: crypto.randomUUID?.() || `device-${Date.now()}`, ...JSON.parse(localStorage.getItem('wendaflow-notification-settings') || '{}'), serverUrl: OFFICIAL_NOTIFICATION_SERVER }; }
    catch { return { enabled: true, deviceId: crypto.randomUUID?.() || `device-${Date.now()}`, serverUrl: OFFICIAL_NOTIFICATION_SERVER }; }
  });
  const [notificationToast, setNotificationToast] = useState(null);
  const [notificationDetail, setNotificationDetail] = useState(null);
  const [updateCheckState, setUpdateCheckState] = useState('idle');
  const notificationToastTimerRef = useRef(null);
  const [license, setLicense] = useState(() => {
    try { return JSON.parse(localStorage.getItem('wendaflow-license') || 'null'); } catch { return null; }
  });
  const [activationCode, setActivationCode] = useState('');
  const [licenseStatus, setLicenseStatus] = useState('');
  const [licenseBusy, setLicenseBusy] = useState(false);
  const [localProfiles, setLocalProfiles] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('branchspace-local-profiles'));
      if (Array.isArray(saved) && saved.length) return saved;
      return [{ ...DEFAULT_OLLAMA, ...JSON.parse(localStorage.getItem('branchspace-ollama')) }];
    } catch { return [DEFAULT_OLLAMA]; }
  });
  const [activeLocalId, setActiveLocalId] = useState(() => localProfiles[0].id);
  const [ollamaStatus, setOllamaStatus] = useState('');
  const [cloudProfiles, setCloudProfiles] = useState(() => {
    try {
      // Cloud profiles are user configuration, not a browser-session cache.
      // Keep the session fallback only as a one-time migration for older builds.
      const saved = JSON.parse(localStorage.getItem('branchspace-cloud-profiles') || sessionStorage.getItem('branchspace-cloud-profiles') || 'null');
      if (Array.isArray(saved) && saved.length) return saved;
      const legacy = JSON.parse(localStorage.getItem('branchspace-cloud') || sessionStorage.getItem('branchspace-cloud') || 'null');
      return [{ ...DEFAULT_CLOUD, ...legacy }];
    } catch { return [DEFAULT_CLOUD]; }
  });
  const [activeCloudId, setActiveCloudId] = useState(() => cloudProfiles[0].id);
  const [projectStatus, setProjectStatus] = useState('');
  const [collapsedIds, setCollapsedIds] = useState(new Set(initial.collapsedIds || []));
  const [newNodeId, setNewNodeId] = useState(null);
  const [foldingId, setFoldingId] = useState(null);
  const [revealingId, setRevealingId] = useState(null);
  const [deletingIds, setDeletingIds] = useState(new Set());
  const [deleteUndo, setDeleteUndo] = useState(null);
  const [restoringIds, setRestoringIds] = useState(new Set());
  const [nodeSizes, setNodeSizes] = useState(new Map());
  const [previewFullSizes, setPreviewFullSizes] = useState(new Map());
  const resizingRef = useRef(null);
  const nodeSizesRef = useRef(new Map());
  const [viewport, setViewport] = useState({ x: 20, y: 20, zoom: 0.82 });
  const [previewLayoutActive, setPreviewLayoutActive] = useState(false);
  const [previewContentPhase, setPreviewContentPhase] = useState('full');
  const [draft, setDraft] = useState('');
  const [canvasFileDragActive, setCanvasFileDragActive] = useState(false);
  const canvasFileDragDepthRef = useRef(0);
  const [composerFileDragActive, setComposerFileDragActive] = useState(false);
  const composerFileDragDepthRef = useRef(0);
  const [model, setModel] = useState(() => `cloud:${cloudProfiles[0].id}`);
  const [nodeType, setNodeType] = useState('conversation');
  const [focusMode, setFocusMode] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [inspectorClosing, setInspectorClosing] = useState(false);
  const [inspectorTab, setInspectorTab] = useState('actions');
  const [inspectorTitleExpanded, setInspectorTitleExpanded] = useState(false);
  const [branchingFrom, setBranchingFrom] = useState(null);
  const [linkingFrom, setLinkingFrom] = useState(null);
  const [linkType, setLinkType] = useState('reference');
  const [relationDrag, setRelationDrag] = useState(null);
  const [relationMenu, setRelationMenu] = useState(null);
  const [editingRelation, setEditingRelation] = useState(null);
  const [relationEditorClosing, setRelationEditorClosing] = useState(false);
  const [removingRelation, setRemovingRelation] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [contextMenuClosing, setContextMenuClosing] = useState(false);
  const [mergeWorkbench, setMergeWorkbench] = useState(false);
  const [mergeGoal, setMergeGoal] = useState('综合结论');
  const [pendingContextRelations, setPendingContextRelations] = useState([]);
  const [mindMapState, setMindMapState] = useState({ nodeId: null, status: '', suggestions: [], selected: [], mode: 'questions' });
  const [contextInspectorOpen, setContextInspectorOpen] = useState(false);
  const [inspectorContextCollapsed, setInspectorContextCollapsed] = useState(true);
  const [excludedContextIds, setExcludedContextIds] = useState(new Set());
  const [composerClosing, setComposerClosing] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [panning, setPanning] = useState(null);
  const [marquee, setMarquee] = useState(null);
  const [selectedConnections, setSelectedConnections] = useState([]);
  const [lineSelectionMenu, setLineSelectionMenu] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [editingNode, setEditingNode] = useState(null);
  const [inlineEditSize, setInlineEditSize] = useState(null);
  const [editDraft, setEditDraft] = useState({ title: '', prompt: '', content: '', type: 'conversation', tags: '', note: '' });
  const [searchOpen, setSearchOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [storageWarning, setStorageWarning] = useState('');
  const [parallelMode, setParallelMode] = useState(false);
  const [parallelModels, setParallelModels] = useState(new Set());
  const [minimapOpen, setMinimapOpen] = useState(() => localStorage.getItem('branchspace-minimap') === 'true');
  const canvasRef = useRef(null);
  const viewportRef = useRef(viewport);
  const targetViewportRef = useRef(viewport);
  const semanticPreviewRef = useRef(semanticPreview(viewport.zoom));
  const previewLayoutTimerRef = useRef(null);
  const previewContentTimerRef = useRef(null);
  const zoomFrameRef = useRef(null);
  const connectionFrameRef = useRef(null);
  const canvasTransitionTimerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const inspectorTimerRef = useRef(null);
  const nodeAnimationTimerRef = useRef(null);
  const foldTimerRef = useRef(null);
  const generationRef = useRef(new Map());
  const settingsTimerRef = useRef(null);
  const importRef = useRef(null);
  const canvasImportRef = useRef(null);
  const deleteTimerRef = useRef(null);
  const undoTimerRef = useRef(null);
  const worldRef = useRef(null);
  const connectionsRef = useRef(null);
  const viewportRenderTimeRef = useRef(0);
  const viewportAnimatingRef = useRef(false);
  const attachmentRef = useRef(null);
  const relationDragRef = useRef(null);
  const nodeClipboardRef = useRef([]);
  const suppressContextMenuUntilRef = useRef(0);
  const libraryUploadRef = useRef(null);
  const activeCanvasIdRef = useRef(activeCanvasId);
  const metadataCanvasRef = useRef(activeCanvasId);
  const canvasHydratedRef = useRef(false);
  const canvasWriteQueueRef = useRef(new Map());

  const selected = nodes.find((node) => node.id === selectedId) || null;
  const branchSource = nodes.find((node) => node.id === branchingFrom) || null;
  const activePath = useMemo(() => ancestors(nodes, selected?.id), [nodes, selected?.id]);
  const branchPath = useMemo(() => branchSource ? ancestors(nodes, branchSource.id) : [], [nodes, branchSource]);
  const includedBranchPath = useMemo(() => branchPath.filter((node) => !excludedContextIds.has(node.id)), [branchPath, excludedContextIds]);
  const activeIds = useMemo(() => new Set([...selectedIds].flatMap((id) => ancestors(nodes, id).map((node) => node.id))), [nodes, selectedIds]);
  const visibleNodes = useMemo(() => nodes.filter((node) => {
    let cursor = node;
    const map = new Map(nodes.map((item) => [item.id, item]));
    while (cursor?.parentId) {
      // During the short folding animation descendants stay mounted.  Removing
      // them at its first frame made cards and their lines pop out abruptly.
      if (collapsedIds.has(cursor.parentId)) return false;
      cursor = map.get(cursor.parentId);
    }
    return true;
  }), [nodes, collapsedIds]);
  const renderedNodes = useMemo(() => {
    if (visibleNodes.length <= 36) return visibleNodes;
    const zoom = Math.max(.08, viewport.zoom);
    const margin = 520 / zoom;
    const canvasWidth = canvasRef.current?.clientWidth || window.innerWidth;
    const canvasHeight = canvasRef.current?.clientHeight || window.innerHeight;
    const bounds = {
      left: -viewport.x / zoom - margin,
      top: -viewport.y / zoom - margin,
      right: (canvasWidth - viewport.x) / zoom + margin,
      bottom: (canvasHeight - viewport.y) / zoom + margin,
    };
    const keep = new Set();
    const visibleMap = new Map(visibleNodes.map((node) => [node.id, node]));
    for (const node of visibleNodes) {
      const size = nodeSizes.get(node.id) || { width: node.manualWidth || 224, height: node.manualHeight || 110 };
      if (node.x <= bounds.right && node.x + size.width >= bounds.left && node.y <= bounds.bottom && node.y + size.height >= bounds.top) keep.add(node.id);
    }
    for (const id of [...keep, ...selectedIds, selectedId, branchingFrom, ...(dragging?.ids || [])].filter(Boolean)) {
      let cursor = visibleMap.get(id);
      while (cursor) { keep.add(cursor.id); cursor = cursor.parentId ? visibleMap.get(cursor.parentId) : null; }
    }
    for (const node of visibleNodes) if (node.parentId && keep.has(node.parentId)) keep.add(node.id);
    return visibleNodes.filter((node) => keep.has(node.id));
  }, [visibleNodes, viewport, nodeSizes, selectedIds, selectedId, branchingFrom, dragging]);
  const deletionIds = useMemo(() => {
    const roots = [...selectedIds].filter((id) => id !== 'root');
    return new Set(nodes.filter((node) => roots.includes(node.id) || roots.some((rootId) => isDescendant(nodes, node.id, rootId))).map((node) => node.id));
  }, [nodes, selectedIds]);
  const activeCloud = cloudProfiles.find((profile) => profile.id === activeCloudId) || cloudProfiles[0] || DEFAULT_CLOUD;
  const activeCanvas = canvases.find((canvas) => canvas.id === activeCanvasId) || canvases[0];
  const ollama = localProfiles.find((profile) => profile.id === activeLocalId) || localProfiles[0] || DEFAULT_OLLAMA;
  const selectedCloud = model.startsWith('cloud:') ? cloudProfiles.find((profile) => profile.id === model.slice(6)) : null;
  const selectedLocal = model.startsWith('local:') ? localProfiles.find((profile) => profile.id === model.slice(6)) : ollama;
  const modelOptions = [...cloudProfiles.map((profile) => ({ value: `cloud:${profile.id}`, label: `${profile.name} · ${profile.model}` })), ...localProfiles.map((profile) => ({ value: `local:${profile.id}`, label: `${profile.name} · ${profile.model}` }))];
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return nodes.slice(0, 8);
    return nodes.filter((node) => [node.title, node.prompt, node.content, node.model].some((value) => value?.toLocaleLowerCase().includes(query))).slice(0, 20);
  }, [nodes, searchQuery]);
  const libraryItems = useMemo(() => {
    const items = [];
    const seen = new Set();
    for (const node of nodes) for (const attachment of node.attachments || []) {
      if (seen.has(attachment.id)) continue;
      seen.add(attachment.id); items.push({ ...attachment, nodeId: node.id, nodeTitle: node.title });
    }
    for (const attachment of attachments) if (!seen.has(attachment.id)) { seen.add(attachment.id); items.push({ ...attachment, nodeId: null, nodeTitle: tr('当前输入',"Current input") }); }
    return items;
  }, [nodes, attachments]);
  const miniBounds = useMemo(() => {
    if (!visibleNodes.length) return { minX: 0, minY: 0, width: 1, height: 1 };
    const minX = Math.min(...visibleNodes.map((node) => node.x));
    const minY = Math.min(...visibleNodes.map((node) => node.y));
    const maxX = Math.max(...visibleNodes.map((node) => node.x + (nodeSizes.get(node.id)?.width || 224)));
    const maxY = Math.max(...visibleNodes.map((node) => node.y + (nodeSizes.get(node.id)?.height || 110)));
    return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  }, [visibleNodes, nodeSizes]);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      try {
        const stored = await readCanvasState(activeCanvasId);
        if (cancelled) return;
        if (stored?.nodes) {
          setNodes(stored.nodes);
          setSelectedId(stored.selectedId || null);
          setSelectedIds(new Set(stored.selectedId ? [stored.selectedId] : []));
          setCollapsedIds(new Set(stored.collapsedIds || []));
          const nextViewport = stored.viewport || targetViewportRef.current;
          targetViewportRef.current = nextViewport;
          commitViewport(nextViewport);
        } else {
          await writeCanvasState(activeCanvasId, { nodes, selectedId, collapsedIds: [...collapsedIds], viewport: targetViewportRef.current });
        }
        canvasHydratedRef.current = true;
        setStorageWarning('');
      } catch (error) {
        console.error('Wonderful IndexedDB hydration failed', error);
        canvasHydratedRef.current = true;
        setStorageWarning(tr('浏览器画布数据库不可用；仍可点击“保存”写入本地 WDF。',"Local cache unavailable. Use Save to write a WDF file."));
      }
    };
    hydrate();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!canvasHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      writeCanvasState(activeCanvasId, { nodes, selectedId, collapsedIds: [...collapsedIds], viewport: targetViewportRef.current })
        .then(() => setStorageWarning(''))
        .catch((error) => {
          console.error('Wonderful IndexedDB persistence failed', error);
          setStorageWarning(tr('自动缓存失败；请点击“保存”写入本地 WDF。',"Local cache unavailable. Use Save to write a WDF file."));
        });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [nodes, selectedId, collapsedIds, activeCanvasId]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (canvasHydratedRef.current) void saveCanvasRef.current?.(true);
    }, 120_000);
    return () => window.clearInterval(timer);
  }, [activeCanvasId]);
  useEffect(() => localStorage.setItem(CANVAS_INDEX_KEY, JSON.stringify({ canvases, activeId: activeCanvasId })), [canvases, activeCanvasId]);
  useEffect(() => {
    if (metadataCanvasRef.current !== activeCanvasId) { metadataCanvasRef.current = activeCanvasId; return; }
    setCanvases((items) => items.map((canvas) => canvas.id === activeCanvasId ? { ...canvas, updatedAt: new Date().toISOString() } : canvas));
  }, [nodes]);

  useEffect(() => localStorage.setItem('branchspace-local-profiles', JSON.stringify(localProfiles)), [localProfiles]);
  useEffect(() => localStorage.setItem('branchspace-minimap', String(minimapOpen)), [minimapOpen]);
  useEffect(() => { localStorage.setItem('wonderful-theme', theme); document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => {
    localStorage.setItem('wendaflow-ui-language', uiLanguage);
    document.documentElement.lang = uiLanguage;
    document.documentElement.dir = uiLanguage === 'ar' ? 'rtl' : 'ltr';
  }, [uiLanguage]);
  useEffect(() => {
    localStorage.setItem('wonderful-preview-enabled', String(previewEnabled));
    // A preference change must not leave a canvas in the staged preview DOM.
    semanticPreviewRef.current = previewEnabled ? semanticPreview(viewportRef.current.zoom) : 0;
    setPreviewLayoutActive(false);
    setPreviewContentPhase('full');
    setPreviewFullSizes(new Map());
    if (worldRef.current) worldRef.current.style.setProperty('--semantic', semanticPreviewRef.current);
  }, [previewEnabled]);
  useEffect(() => {
    localStorage.setItem('wonderful-custom-theme', JSON.stringify(customTheme));
    const root = document.documentElement;
    Object.entries(customTheme).forEach(([key, value]) => root.style.setProperty(`--custom-${key}`, value));
  }, [customTheme]);
  useEffect(() => localStorage.setItem('wonderful-action-runner', actionRunner), [actionRunner]);
  useEffect(() => localStorage.setItem('wonderful-agent-settings', JSON.stringify(agentSettings)), [agentSettings]);
  useEffect(() => localStorage.setItem('branchspace-cloud-profiles', JSON.stringify(cloudProfiles)), [cloudProfiles]);
  useEffect(() => localStorage.setItem('wendaflow-notifications', JSON.stringify(notifications.slice(0, 120))), [notifications]);
  useEffect(() => localStorage.setItem('wendaflow-notification-settings', JSON.stringify({ ...notificationSettings, serverUrl: OFFICIAL_NOTIFICATION_SERVER })), [notificationSettings]);
  useEffect(() => { if (license) localStorage.setItem('wendaflow-license', JSON.stringify(license)); else localStorage.removeItem('wendaflow-license'); }, [license]);
  useEffect(() => {
    if (!license?.token) return;
    let cancelled = false;
    fetch(`${OFFICIAL_NOTIFICATION_SERVER}/v1/licenses/validate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: license.token, deviceId: notificationSettings.deviceId, appVersion: APP_VERSION }) })
      .then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error || tr('授权验证失败',"License verification failed")); if (!cancelled) { setLicense({ ...data.license, lastValidatedAt: new Date().toISOString() }); setLicenseStatus(tr('授权已验证。','License verified.')); } })
      .catch(() => { if (!cancelled) { const validated = license.lastValidatedAt ? new Date(license.lastValidatedAt).getTime() : 0; const remaining = Math.ceil((validated + LICENSE_OFFLINE_GRACE_DAYS * 86400000 - Date.now()) / 86400000); setLicenseStatus(remaining > 0 ? tr(`当前离线，授权将在 ${remaining} 天后需要联网验证。`, `Offline — verification required in ${remaining} days.`) : tr('当前无法验证授权，请联网后重试。','License could not be verified. Connect to the internet and try again.')); } });
    return () => { cancelled = true; };
  }, []);
  useEffect(() => {
    if (!notificationSettings.enabled) return undefined;
    const base = OFFICIAL_NOTIFICATION_SERVER;
    const socketUrl = base.replace(/^http/i, 'ws') + `/v1/realtime?deviceId=${encodeURIComponent(notificationSettings.deviceId)}&version=${encodeURIComponent(APP_VERSION)}&language=${encodeURIComponent(uiLanguage)}`;
    let socket;
    let retry;
    let disposed = false;
    const connect = () => {
      if (disposed) return;
      try {
        socket = new WebSocket(socketUrl);
        socket.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'connected' && message.deviceKey) setNotificationSettings((current) => current.deviceKey === message.deviceKey ? current : { ...current, deviceKey: message.deviceKey });
            if (message.type === 'notification-revoked' && message.id) { setNotifications((items) => items.filter((item) => item.id !== message.id)); setNotificationToast((current) => current?.id === message.id ? null : current); setNotificationDetail((current) => current?.id === message.id ? null : current); return; }
            const received = message.type === 'notification'
              ? [message.notification]
              : message.type === 'history' && Array.isArray(message.notifications)
                ? message.notifications
                : [];
            if (!received.length) return;
            if (message.type === 'notification' && message.notification) {
              const incoming = message.notification;
              window.clearTimeout(notificationToastTimerRef.current);
              setNotificationToast(incoming);
              if (!incoming.requiresAcknowledgement) notificationToastTimerRef.current = window.setTimeout(() => setNotificationToast(null), 7600);
            }
            setNotifications((items) => {
              const existing = new Map(items.map((item) => [item.id, item]));
              received.forEach((notice) => {
                if (!notice) return;
                const incoming = { id: notice.id || `notice-${Date.now()}`, createdAt: notice.createdAt || new Date().toISOString(), read: false, ...notice };
                existing.set(incoming.id, { ...incoming, read: existing.get(incoming.id)?.read ?? incoming.read });
              });
              return [...existing.values()]
                .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
                .slice(0, 120);
            });
          } catch { /* Ignore malformed remote events. */ }
        };
        socket.onclose = () => {
          if (!disposed) retry = window.setTimeout(connect, 5000);
        };
      } catch {
        if (!disposed) retry = window.setTimeout(connect, 5000);
      }
    };
    connect();
    return () => {
      disposed = true;
      window.clearTimeout(retry);
      socket?.close();
    };
  }, [notificationSettings.enabled, notificationSettings.deviceId, uiLanguage]);
  const checkForUpdates = async (showResult = false) => {
    setUpdateCheckState('checking');
    try {
      const response = await fetch(`${OFFICIAL_NOTIFICATION_SERVER}/v1/client/latest?version=${encodeURIComponent(APP_VERSION)}`);
      if (!response.ok) throw new Error('update-service-unavailable');
      const release = await response.json();
      if (!release?.latestVersion || !isNewerVersion(release.latestVersion, APP_VERSION)) {
        setUpdateCheckState('current');
        if (showResult) setNotificationToast({ id: `update-check-current-${Date.now()}`, title: tr('已是最新版本', 'You’re up to date'), body: `${tr('当前版本', 'Current version')} · ${APP_VERSION}`, kind: 'info', createdAt: new Date().toISOString(), read: false });
        return false;
      }
      const notice = { id: `update-${release.latestVersion}`, title: tr('发现新版本', 'New version available'), body: `${tr('Wendaflow', 'Wendaflow')} ${release.latestVersion}${release.releaseNotes ? ` · ${release.releaseNotes}` : ''}`, kind: 'update', createdAt: release.publishedAt || new Date().toISOString(), read: false, requiresAcknowledgement: true, downloadUrl: release.downloadUrl || '' };
      setNotifications((items) => items.some((item) => item.id === notice.id) ? items : [notice, ...items].slice(0, 120));
      setNotificationToast(notice);
      setUpdateCheckState('available');
      return true;
    } catch {
      setUpdateCheckState('failed');
      if (showResult) setNotificationToast({ id: `update-check-failed-${Date.now()}`, title: tr('检查更新失败', 'Update check failed'), body: tr('无法连接更新服务，请稍后重试。', 'Could not reach the update service. Please try again.'), kind: 'warning', createdAt: new Date().toISOString(), read: false });
      return false;
    }
  };
  useEffect(() => {
    void checkForUpdates();
    return () => window.clearTimeout(notificationToastTimerRef.current);
  }, []);
  useEffect(() => {
    const current = cloudProfiles.find((profile) => profile.id === activeCloudId);
    if (current?.format === 'gemini' && !current.endpoint) {
      setCloudProfiles((items) => items.map((profile) => profile.id === current.id ? { ...profile, endpoint: GEMINI_ENDPOINT } : profile));
    }
  }, [activeCloudId, cloudProfiles]);

  useEffect(() => {
    if (settingsOpen && importRef.current) importRef.current.accept = '.wdf,application/x-branchspace-wdf';
  }, [settingsOpen]);

  useEffect(() => {
    const handler = (event) => {
      const editing = event.target instanceof Element && event.target.closest('textarea, input, [contenteditable="true"]');
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !editing) {
        event.preventDefault();
        undoDelete();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [deleteUndo]);

  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); saveCanvas(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearchOpen(true); setCanvasMenuOpen(false); setLibraryOpen(false); }
      if (event.key === 'Escape' && searchOpen) closeFloatingPanel('search', setSearchOpen);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [searchOpen, saveCanvas]);

  useEffect(() => {
    if (!worldRef.current) return undefined;
    const observer = new ResizeObserver((entries) => {
      if (viewportAnimatingRef.current) return;
      setNodeSizes((current) => {
        const next = new Map(current);
        let changed = false;
        for (const entry of entries) {
          const id = entry.target.dataset.nodeId;
          // The drag itself already owns manual dimensions. Feeding each
          // intermediate observer measurement back into graph geometry makes
          // long action cards visibly bounce while their content reflows.
          if (id && resizingRef.current === id) continue;
          const height = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height;
          const width = entry.borderBoxSize?.[0]?.inlineSize || entry.contentRect.width;
          const previous = next.get(id);
          if (id && (!previous || Math.abs(previous.height - height) > .5 || Math.abs(previous.width - width) > .5)) { next.set(id, { width, height }); changed = true; }
        }
        if (changed) nodeSizesRef.current = next;
        return changed ? next : current;
      });
    });
    worldRef.current.querySelectorAll('.node').forEach((node) => observer.observe(node));
    return () => observer.disconnect();
    // A canvas can be switched to another one with exactly the same number of
    // cards.  Watching only the length left the observer attached to the old
    // DOM cards, which in turn left stale measurements feeding the preview
    // transition.  The identity list makes measurement ownership explicit.
  }, [activeCanvasId, visibleNodes.map((node) => node.id).join('|')]);

  useEffect(() => {
    if (!branchingFrom) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closeBranch();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [branchingFrom]);

  useEffect(() => () => {
    if (zoomFrameRef.current) cancelAnimationFrame(zoomFrameRef.current);
    if (connectionFrameRef.current) cancelAnimationFrame(connectionFrameRef.current);
    if (canvasTransitionTimerRef.current) clearTimeout(canvasTransitionTimerRef.current);
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    if (inspectorTimerRef.current) clearTimeout(inspectorTimerRef.current);
    if (nodeAnimationTimerRef.current) clearTimeout(nodeAnimationTimerRef.current);
    if (foldTimerRef.current) clearTimeout(foldTimerRef.current);
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    if (previewLayoutTimerRef.current) clearTimeout(previewLayoutTimerRef.current);
    if (previewContentTimerRef.current) clearTimeout(previewContentTimerRef.current);
    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    generationRef.current.forEach((controller) => controller.abort());
  }, []);

  useEffect(() => {
    if (!selectedId || branchingFrom) return undefined;
    const clearOnEscape = (event) => {
      if (event.key === 'Escape') clearSelection();
      const isEditing = event.target instanceof Element && event.target.closest('textarea, input, select, [contenteditable="true"]');
      if (!isEditing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'c') {
        // A selectable Markdown answer is real document text. Do not hijack
        // its native copy shortcut merely because its enclosing card is also
        // selected on the canvas.
        if (hasCopyableTextSelection()) return;
        event.preventDefault();
        copySelectedNodes();
      }
      if (!isEditing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteCopiedNodes(); }
      if ((event.key === 'Delete' || event.key === 'Backspace') && !isEditing) {
        if (selectedConnections.length) removeConnections();
        else deleteSelection();
      }
    };
    window.addEventListener('keydown', clearOnEscape);
    return () => window.removeEventListener('keydown', clearOnEscape);
  }, [selectedId, branchingFrom, selectedConnections, nodes, selectedIds]);

  function selectNode(id, options = {}) {
    if (inspectorTimerRef.current) clearTimeout(inspectorTimerRef.current);
    setInspectorClosing(false);
    setInspectorOpen(true);
    setDeleteConfirm(false);
    setSelectedConnections([]);
    setLineSelectionMenu(null);
    if (id !== selectedId) {
      setInspectorTab('actions');
      setInspectorTitleExpanded(false);
    }
    if (editingNode && editingNode !== id) {
      setEditingNode(null);
      setInlineEditSize(null);
    }
    if (linkingFrom && linkingFrom !== id && !options.additive) {
      commitRelation(linkingFrom, id, linkType);
      setLinkingFrom(null);
    }
    if (options.additive) {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        const remaining = [...next];
        setSelectedId(next.has(id) ? id : (remaining[remaining.length - 1] || null));
        return next;
      });
    } else {
      setSelectedIds(new Set([id]));
      setSelectedId(id);
    }
  }

  function clearSelection() {
    if (!selectedId || inspectorClosing) return;
    closeBranch();
    setSelectedConnections([]);
    setLineSelectionMenu(null);
    setLinkingFrom(null);
    setInspectorClosing(true);
    inspectorTimerRef.current = window.setTimeout(() => {
      setSelectedId(null);
      setSelectedIds(new Set());
      setDeleteConfirm(false);
      setInspectorClosing(false);
      inspectorTimerRef.current = null;
    }, 190);
  }

  async function copySelectedNodes() {
    const copied = nodes.filter((node) => selectedIds.has(node.id)).map((node) => JSON.parse(JSON.stringify(node)));
    if (!copied.length) return;
    nodeClipboardRef.current = copied;
    const payload = JSON.stringify({ type: 'wonderful-nodes', nodes: copied });
    try { await navigator.clipboard?.writeText(payload); } catch {}
    setStorageWarning(tr(`已复制 ${copied.length} 个卡片，可在画布空白处按 Ctrl+V 粘贴。`,`Copied ${copied.length} cards. Press Ctrl+V on the canvas to paste.`));
  }

  async function pasteCopiedNodes() {
    let copied = nodeClipboardRef.current;
    try {
      const parsed = JSON.parse(await navigator.clipboard?.readText());
      if (parsed?.type === 'wonderful-nodes' && Array.isArray(parsed.nodes)) copied = parsed.nodes;
    } catch {}
    if (!copied?.length) { setStorageWarning(tr('剪贴板中没有 Wendaflow 卡片。',"No Wendaflow cards in clipboard")); return; }
    const rect = canvasRef.current?.getBoundingClientRect();
    const base = targetViewportRef.current;
    const anchor = rect ? { x: (rect.width * .5 - base.x) / base.zoom, y: (rect.height * .5 - base.y) / base.zoom } : { x: 220, y: 220 };
    const minX = Math.min(...copied.map((node) => node.x));
    const minY = Math.min(...copied.map((node) => node.y));
    const idMap = new Map(copied.map((node, index) => [node.id, `node-${Date.now()}-${index}`]));
    const clones = copied.map((node, index) => ({ ...node, id: idMap.get(node.id), parentId: idMap.get(node.parentId) || null, relations: (node.relations || []).filter((relation) => idMap.has(relation.targetId)).map((relation) => ({ ...relation, id: `relation-${Date.now()}-${index}-${relation.id}`, targetId: idMap.get(relation.targetId) })), x: Math.round(anchor.x + node.x - minX + 24), y: Math.round(anchor.y + node.y - minY + 24), status: node.type === 'conversation' ? 'done' : node.status }));
    setNodes((items) => [...items, ...clones]);
    setSelectedIds(new Set(clones.map((node) => node.id)));
    setSelectedId(clones[0].id);
    setInspectorOpen(false);
    setStorageWarning(tr(`已粘贴 ${clones.length} 个卡片。`,`Pasted ${clones.length} cards`));
  }

  function deleteSelection() {
    if (!deletionIds.size || deletingIds.size) return;
    const ids = new Set(deletionIds);
    const removedNodes = nodes.filter((node) => ids.has(node.id));
    const relationBackups = nodes.filter((node) => !ids.has(node.id) && (node.relations || []).some((relation) => ids.has(relation.targetId))).map((node) => ({ id: node.id, relations: node.relations }));
    const removedCollapsedIds = [...collapsedIds].filter((id) => ids.has(id));
    const primaryParent = nodes.find((node) => node.id === selectedId)?.parentId;
    ids.forEach((id) => generationRef.current.get(id)?.abort());
    if (branchingFrom && ids.has(branchingFrom)) closeBranch();
    setDeletingIds(ids);
    setInspectorClosing(true);
    deleteTimerRef.current = window.setTimeout(() => {
      setNodes((current) => current.filter((node) => !ids.has(node.id)).map((node) => ({ ...node, relations: (node.relations || []).filter((relation) => !ids.has(relation.targetId)), links: (node.links || []).filter((targetId) => !ids.has(targetId)) })));
      setCollapsedIds((current) => new Set([...current].filter((id) => !ids.has(id))));
      setDeletingIds(new Set());
      setInspectorClosing(false);
      if (primaryParent && !ids.has(primaryParent)) selectNode(primaryParent);
      else { setSelectedId(null); setSelectedIds(new Set()); }
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
      setDeleteUndo({ nodes: removedNodes, collapsedIds: removedCollapsedIds, relationBackups });
      undoTimerRef.current = window.setTimeout(() => { setDeleteUndo(null); undoTimerRef.current = null; }, 6000);
      deleteTimerRef.current = null;
    }, 240);
  }

  function undoDelete() {
    if (!deleteUndo) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    const restoredIds = new Set(deleteUndo.nodes.map((node) => node.id));
    setNodes((current) => [...current.filter((node) => !restoredIds.has(node.id)), ...deleteUndo.nodes].map((node) => {
      const backup = deleteUndo.relationBackups?.find((item) => item.id === node.id);
      return backup ? { ...node, relations: backup.relations } : node;
    }));
    setCollapsedIds((current) => new Set([...current, ...deleteUndo.collapsedIds]));
    const restoredRoot = deleteUndo.nodes.find((node) => !restoredIds.has(node.parentId)) || deleteUndo.nodes[0];
    setSelectedIds(new Set([restoredRoot.id]));
    setSelectedId(restoredRoot.id);
    setRestoringIds(restoredIds);
    setInspectorOpen(true);
    setDeleteUndo(null);
    undoTimerRef.current = null;
    if (nodeAnimationTimerRef.current) clearTimeout(nodeAnimationTimerRef.current);
    nodeAnimationTimerRef.current = window.setTimeout(() => setRestoringIds(new Set()), 420);
  }

  function toggleCollapse(nodeId) {
    if (collapsedIds.has(nodeId)) {
      setCollapsedIds((current) => {
        const next = new Set(current);
        next.delete(nodeId);
        return next;
      });
      setRevealingId(nodeId);
      if (nodeAnimationTimerRef.current) clearTimeout(nodeAnimationTimerRef.current);
      nodeAnimationTimerRef.current = window.setTimeout(() => setRevealingId(null), 420);
      return;
    }
    setFoldingId(nodeId);
    if (foldTimerRef.current) clearTimeout(foldTimerRef.current);
    foldTimerRef.current = window.setTimeout(() => {
      setCollapsedIds((current) => new Set(current).add(nodeId));
      setFoldingId(null);
      foldTimerRef.current = null;
    }, 210);
  }

  function dismissContextMenu(after) {
    if (!contextMenu || contextMenuClosing) return;
    setContextMenuClosing(true);
    window.setTimeout(() => {
      setContextMenu(null);
      setContextMenuClosing(false);
      after?.();
    }, 150);
  }

  function syncConnectionGeometry() {
    if (!worldRef.current || !connectionsRef.current) return;
    const cards = new Map([...worldRef.current.querySelectorAll('.node')].map((element) => [element.dataset.nodeId, element]));
    connectionsRef.current.querySelectorAll('.connection[data-parent-id][data-child-id]').forEach((path) => {
      const parent = cards.get(path.dataset.parentId);
      const child = cards.get(path.dataset.childId);
      if (!parent || !child) return;
      const parentX = Number(parent.dataset.nodeX);
      const parentY = Number(parent.dataset.nodeY);
      const childX = Number(child.dataset.nodeX);
      const childY = Number(child.dataset.nodeY);
      const parentStyle = getComputedStyle(parent);
      const childStyle = getComputedStyle(child);
      const parentWidth = Number.parseFloat(parentStyle.width) || parent.offsetWidth;
      const parentHeight = Number.parseFloat(parentStyle.height) || parent.offsetHeight;
      const childHeight = Number.parseFloat(childStyle.height) || child.offsetHeight;
      const x1 = parentX + parentWidth;
      const y1 = parentY + parentHeight / 2;
      const x2 = childX;
      const y2 = childY + childHeight / 2;
      const mid = (x1 + x2) / 2;
      path.setAttribute('d', `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
    });
  }

  function finishConnectionTransition(start = performance.now()) {
    if (connectionFrameRef.current) cancelAnimationFrame(connectionFrameRef.current);
    const tick = () => {
      syncConnectionGeometry();
      if (performance.now() - start < 500) connectionFrameRef.current = requestAnimationFrame(tick);
      else connectionFrameRef.current = null;
    };
    connectionFrameRef.current = requestAnimationFrame(tick);
  }

  function commitViewport(next, forceRender = true) {
    viewportRef.current = next;
    const transform = `translate3d(${next.x}px, ${next.y}px, 0) scale(${next.zoom})`;
    const semantic = previewEnabled ? semanticPreview(next.zoom) : 0;
    const previewChanged = semantic !== semanticPreviewRef.current;
    semanticPreviewRef.current = semantic;
    if (previewChanged) {
      if (previewLayoutTimerRef.current) clearTimeout(previewLayoutTimerRef.current);
      if (previewContentTimerRef.current) clearTimeout(previewContentTimerRef.current);
      // Classic preview: the same card simply shows / hides its detail.  It
      // intentionally has no second "reserved" layout, so neither action
      // feeds nor Markdown can create a half-expanded intermediate card.
      setPreviewLayoutActive(false);
      setPreviewContentPhase('full');
      setPreviewFullSizes(new Map());
    }
    if (worldRef.current) worldRef.current.style.transform = transform;
    if (worldRef.current) worldRef.current.style.setProperty('--semantic', semantic);
    if (connectionsRef.current) connectionsRef.current.style.transform = transform;
    // World and SVG share the same transform, so ordinary pan/zoom does not
    // need costly layout reads. Geometry is refreshed only for the semantic
    // card-size transition below.
    if (previewChanged) finishConnectionTransition();
    const now = performance.now();
    if (forceRender || now - viewportRenderTimeRef.current >= 48) {
      viewportRenderTimeRef.current = now;
      setViewport(next);
    }
  }

  function stopZoomAnimation() {
    if (zoomFrameRef.current) cancelAnimationFrame(zoomFrameRef.current);
    zoomFrameRef.current = null;
    viewportAnimatingRef.current = false;
    canvasRef.current?.classList.remove('viewport-animating');
    targetViewportRef.current = viewportRef.current;
  }

  function animateViewport() {
    viewportAnimatingRef.current = true;
    canvasRef.current?.classList.add('viewport-animating');
    const current = viewportRef.current;
    const target = targetViewportRef.current;
    const next = {
      x: current.x + (target.x - current.x) * 0.2,
      y: current.y + (target.y - current.y) * 0.2,
      zoom: current.zoom + (target.zoom - current.zoom) * 0.2,
    };
    const settled = Math.abs(next.x - target.x) < 0.12 && Math.abs(next.y - target.y) < 0.12 && Math.abs(next.zoom - target.zoom) < 0.001;
    if (settled) {
      commitViewport(target, true);
      finishConnectionTransition();
      zoomFrameRef.current = null;
      viewportAnimatingRef.current = false;
      canvasRef.current?.classList.remove('viewport-animating');
      window.requestAnimationFrame(() => {
        if (!worldRef.current) return;
        const measured = new Map([...worldRef.current.querySelectorAll('.node')].map((element) => [element.dataset.nodeId, { width: element.offsetWidth, height: element.offsetHeight }]));
        nodeSizesRef.current = measured;
        setNodeSizes(measured);
      });
      return;
    }
    commitViewport(next, false);
    zoomFrameRef.current = requestAnimationFrame(animateViewport);
  }

  function beginNodeDrag(event, node) {
    if (event.button !== 0) return;
    if (event.target.closest('.markdown-content, button, input, textarea, select, a')) return;
    event.stopPropagation();
    setSelectedConnections([]);
    setLineSelectionMenu(null);
    let dragIds;
    if (event.altKey) {
      const roots = selectedIds.has(node.id) ? [...selectedIds] : [node.id];
      dragIds = nodes.filter((item) => roots.includes(item.id) || roots.some((rootId) => isDescendant(nodes, item.id, rootId))).map((item) => item.id);
      if (!selectedIds.has(node.id)) selectNode(node.id);
    } else if (event.shiftKey) {
      const nextSelection = new Set(selectedIds);
      if (nextSelection.has(node.id)) nextSelection.delete(node.id);
      else nextSelection.add(node.id);
      dragIds = nextSelection.has(node.id) ? [...nextSelection] : [];
      selectNode(node.id, { additive: true });
    } else if (selectedIds.has(node.id)) {
      dragIds = [...selectedIds];
      setSelectedId(node.id);
    } else {
      dragIds = [node.id];
      selectNode(node.id);
    }
    const positions = new Map(nodes.filter((item) => dragIds.includes(item.id)).map((item) => [item.id, { x: item.x, y: item.y }]));
    setDragging({ ids: dragIds, startX: event.clientX, startY: event.clientY, positions });
  }

  function beginRelationDrag(event, node) {
    if (event.button !== 0) return;
    event.preventDefault(); event.stopPropagation();
    setRelationMenu(null);
    const next = { sourceId: node.id, x: event.clientX, y: event.clientY, targetId: null };
    relationDragRef.current = next;
    setRelationDrag(next);
  }

  function commitRelation(sourceId, targetId, type) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (type === 'inherit') {
      if (isDescendant(nodes, sourceId, targetId)) { setStorageWarning(tr('不能把节点继承到自己的后代。',"Cannot inherit from a descendant")); return; }
      setNodes((items) => items.map((node) => node.id === targetId ? { ...node, parentId: sourceId } : node));
    } else setNodes((items) => items.map((node) => node.id === sourceId ? { ...node, relations: [...(node.relations || []).filter((relation) => relation.targetId !== targetId), { id: `relation-${Date.now()}`, targetId, type }] } : node));
    setStorageWarning(type === 'merge' ? tr('已建立合并关系。',"Merge link created") : type === 'reference' ? tr('已建立引用关系。',"Reference link created") : tr('已建立继承关系。',"Inheritance link created"));
  }

  function handleContentWheel(event) {
    // A scrollable answer owns every wheel event.  At its top/bottom edge the
    // old implementation leaked it to the canvas and unexpectedly zoomed.
    event.stopPropagation();
    event.nativeEvent?.stopImmediatePropagation?.();
  }

  function beginResize(event, node) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const size = nodeSizes.get(node.id) || { width: node.manualWidth || 224, height: node.manualHeight || 110 };
    event.currentTarget.setPointerCapture?.(event.pointerId);
    resizingRef.current = node.id;
    setResizing({ id: node.id, startX: event.clientX, startY: event.clientY, width: size.width, height: size.height });
  }

  function removeConnections(connections = selectedConnections) {
    if (!connections.length) return;
    setNodes((items) => items.map((node) => {
      let next = node;
      connections.filter((connection) => connection.kind === 'parent' && connection.childId === node.id)
        .forEach(() => { next = { ...next, parentId: null }; });
      const removing = connections.filter((connection) => connection.kind === 'relation' && connection.sourceId === node.id);
      if (removing.length) {
        const keys = new Set(removing.map((connection) => `${connection.targetId}:${connection.type || ''}`));
        next = { ...next, relations: (next.relations || []).filter((relation) => !keys.has(`${relation.targetId}:${relation.type || ''}`)) };
      }
      return next;
    }));
    setSelectedConnections([]);
    setLineSelectionMenu(null);
    setStorageWarning(tr(`已移除 ${connections.length} 条连线。`,`Removed ${connections.length} links`));
  }

  function closeRelationEditor(afterClose) {
    if (!editingRelation || relationEditorClosing) return;
    setRelationEditorClosing(true);
    window.setTimeout(() => {
      setEditingRelation(null);
      setRelationEditorClosing(false);
      afterClose?.();
    }, 170);
  }

  function beginPan(event) {
    if (contextMenu) dismissContextMenu();
    if (editingRelation) closeRelationEditor();
    if (lineSelectionMenu || selectedConnections.length) {
      setSelectedConnections([]);
      setLineSelectionMenu(null);
    }
    if (event.button === 2 && !event.target.closest('.node, button, textarea, select, .composer')) {
      event.preventDefault();
      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      setSelectedConnections([]);
      setLineSelectionMenu(null);
      setMarquee({ startX: x, startY: y, x, y });
      return;
    }
    if (event.button !== 0 || event.target.closest('.node, button, textarea, select, .composer')) return;
    stopZoomAnimation();
    // The DOM transform can be ahead of React state during a wheel zoom.
    // Starting from the state snapshot made the first pan frame jump back,
    // then catch up. The ref is updated on every compositor commit.
    const current = viewportRef.current;
    setPanning({ startX: event.clientX, startY: event.clientY, x: current.x, y: current.y, moved: false });
  }

  function movePointer(event) {
    if (relationDrag) {
      const target = document.elementsFromPoint(event.clientX, event.clientY).find((element) => element instanceof HTMLElement && element.dataset?.nodeId)?.dataset.nodeId || null;
      const current = relationDragRef.current;
      if (current) {
        const next = { ...current, x: event.clientX, y: event.clientY, targetId: target === current.sourceId ? null : target };
        relationDragRef.current = next;
        setRelationDrag(next);
      }
    } else if (resizing) {
      const width = Math.max(210, Math.min(720, resizing.width + (event.clientX - resizing.startX) / viewport.zoom));
      const height = Math.max(110, Math.min(720, resizing.height + (event.clientY - resizing.startY) / viewport.zoom));
      setNodes((items) => items.map((node) => node.id === resizing.id ? { ...node, manualWidth: Math.round(width), manualHeight: Math.round(height) } : node));
      window.requestAnimationFrame(syncConnectionGeometry);
    } else if (marquee) {
      const rect = canvasRef.current.getBoundingClientRect();
      const next = { ...marquee, x: event.clientX - rect.left, y: event.clientY - rect.top };
      setMarquee(next);
      const left = Math.min(next.startX, next.x), right = Math.max(next.startX, next.x);
      const top = Math.min(next.startY, next.y), bottom = Math.max(next.startY, next.y);
      const hits = visibleNodes.filter((node) => {
        const nodeLeft = viewport.x + node.x * viewport.zoom, nodeTop = viewport.y + node.y * viewport.zoom;
        const size = nodeSizes.get(node.id) || { width: 224, height: 110 };
        return nodeLeft + size.width * viewport.zoom >= left && nodeLeft <= right && nodeTop + size.height * viewport.zoom >= top && nodeTop <= bottom;
      }).map((node) => node.id);
      setSelectedIds(new Set(hits));
      setSelectedId(hits[hits.length - 1] || null);
      if (hits.length) { setSelectedConnections([]); setLineSelectionMenu(null); setInspectorOpen(true); setInspectorClosing(false); }
    } else if (dragging) {
      const dx = (event.clientX - dragging.startX) / viewport.zoom;
      const dy = (event.clientY - dragging.startY) / viewport.zoom;
      setNodes((items) => items.map((node) => {
        const origin = dragging.positions.get(node.id);
        return origin ? { ...node, x: origin.x + dx, y: origin.y + dy } : node;
      }));
    } else if (panning) {
      const moved = panning.moved || Math.hypot(event.clientX - panning.startX, event.clientY - panning.startY) > 4;
      if (moved !== panning.moved) setPanning({ ...panning, moved });
      const nextViewport = { ...viewportRef.current, x: panning.x + event.clientX - panning.startX, y: panning.y + event.clientY - panning.startY };
      targetViewportRef.current = nextViewport;
      commitViewport(nextViewport, false);
    }
  }

  function endPointer(event) {
    const finalRelationDrag = relationDragRef.current;
    if (finalRelationDrag) {
      if (finalRelationDrag.targetId) setRelationMenu({ sourceId: finalRelationDrag.sourceId, targetId: finalRelationDrag.targetId, x: finalRelationDrag.x, y: finalRelationDrag.y });
      relationDragRef.current = null;
      setRelationDrag(null);
    }
    if (panning) {
      targetViewportRef.current = viewportRef.current;
      commitViewport(viewportRef.current, true);
      if (!panning.moved) { clearSelection(); closeRootComposer(); }
    }
    if (marquee) {
      suppressContextMenuUntilRef.current = Date.now() + 260;
      const left = Math.min(marquee.startX, marquee.x), right = Math.max(marquee.startX, marquee.x);
      const top = Math.min(marquee.startY, marquee.y), bottom = Math.max(marquee.startY, marquee.y);
      const nodeHits = visibleNodes.filter((node) => {
        const nodeLeft = viewport.x + node.x * viewport.zoom, nodeTop = viewport.y + node.y * viewport.zoom;
        const size = nodeSizes.get(node.id) || { width: 224, height: 110 };
        return nodeLeft + size.width * viewport.zoom >= left && nodeLeft <= right && nodeTop + size.height * viewport.zoom >= top && nodeTop <= bottom;
      });
      if (!nodeHits.length && connectionsRef.current && canvasRef.current) {
        const canvasRect = canvasRef.current.getBoundingClientRect();
        const picked = [...connectionsRef.current.querySelectorAll('.connection[data-connection-key]')].flatMap((path) => {
          const box = path.getBoundingClientRect();
          const intersects = box.right >= canvasRect.left + left && box.left <= canvasRect.left + right && box.bottom >= canvasRect.top + top && box.top <= canvasRect.top + bottom;
          if (!intersects) return [];
          const kind = path.dataset.connectionKind;
          return [{ key: path.dataset.connectionKey, kind, sourceId: path.dataset.sourceId, targetId: path.dataset.targetId, childId: path.dataset.childId, type: path.dataset.connectionType }];
        });
        setSelectedConnections(picked);
        if (picked.length) setLineSelectionMenu({ open: true });
      }
    }
    setDragging(null);
    setPanning(null);
    setMarquee(null);
    resizingRef.current = null;
    setResizing(null);
  }

  function zoomCanvas(event) {
    event.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const base = targetViewportRef.current;
    const factor = Math.exp(-event.deltaY * 0.0012);
    const nextZoom = Math.min(2.4, Math.max(0.22, base.zoom * factor));
    const worldX = (pointerX - base.x) / base.zoom;
    const worldY = (pointerY - base.y) / base.zoom;
    targetViewportRef.current = { x: pointerX - worldX * nextZoom, y: pointerY - worldY * nextZoom, zoom: nextZoom };
    if (!zoomFrameRef.current) zoomFrameRef.current = requestAnimationFrame(animateViewport);
  }

  function fitView() {
    if (!visibleNodes.length || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const minX = Math.min(...visibleNodes.map((node) => node.x));
    const minY = Math.min(...visibleNodes.map((node) => node.y));
    const maxX = Math.max(...visibleNodes.map((node) => node.x + (nodeSizes.get(node.id)?.width || 224)));
    const maxY = Math.max(...visibleNodes.map((node) => node.y + (nodeSizes.get(node.id)?.height || 110)));
    const graphWidth = Math.max(224, maxX - minX);
    const graphHeight = Math.max(110, maxY - minY);
    const leftPadding = 86;
    const rightPadding = selected ? 330 : 86;
    const topPadding = 92;
    const bottomPadding = 70;
    const availableWidth = Math.max(240, rect.width - leftPadding - rightPadding);
    const availableHeight = Math.max(180, rect.height - topPadding - bottomPadding);
    const zoom = Math.min(1, Math.max(0.22, Math.min(availableWidth / graphWidth, availableHeight / graphHeight)));
    const contentWidth = graphWidth * zoom;
    const contentHeight = graphHeight * zoom;
    targetViewportRef.current = {
      x: leftPadding + (availableWidth - contentWidth) / 2 - minX * zoom,
      y: topPadding + (availableHeight - contentHeight) / 2 - minY * zoom,
      zoom,
    };
    if (!zoomFrameRef.current) zoomFrameRef.current = requestAnimationFrame(animateViewport);
  }

  function autoLayout() {
    const depthMap = new Map();
    const nodeMap = new Map(nodes.map((node) => [node.id, node]));
    const getDepth = (node) => node.parentId && nodeMap.has(node.parentId) ? getDepth(nodeMap.get(node.parentId)) + 1 : 0;
    visibleNodes.forEach((node) => {
      const depth = getDepth(node);
      if (!depthMap.has(depth)) depthMap.set(depth, []);
      depthMap.get(depth).push(node);
    });
    const sizeFor = (node) => {
      const measured = nodeSizes.get(node.id);
      return { width: node.manualWidth || measured?.width || 224, height: node.manualHeight || measured?.height || 110 };
    };
    const orderedDepths = [...depthMap.keys()].sort((a, b) => a - b);
    const columnX = new Map();
    let nextX = 100;
    orderedDepths.forEach((depth) => {
      columnX.set(depth, nextX);
      const maxWidth = Math.max(224, ...depthMap.get(depth).map((node) => sizeFor(node).width));
      nextX += maxWidth + 92;
    });
    const positions = new Map();
    [...depthMap.entries()].sort(([a], [b]) => a - b).forEach(([depth, items]) => {
      let y = 110;
      items.sort((a, b) => a.y - b.y).forEach((node) => {
        const size = sizeFor(node);
        positions.set(node.id, { x: columnX.get(depth), y });
        y += size.height + 74;
      });
    });
    setNodes((items) => items.map((node) => positions.has(node.id) ? { ...node, ...positions.get(node.id) } : node));
    if (canvasRef.current && positions.size) {
      const laidOut = visibleNodes.map((node) => ({ ...node, ...positions.get(node.id) }));
      const minX = Math.min(...laidOut.map((node) => node.x)), minY = Math.min(...laidOut.map((node) => node.y));
      const maxX = Math.max(...laidOut.map((node) => node.x + sizeFor(node).width));
      const maxY = Math.max(...laidOut.map((node) => node.y + sizeFor(node).height));
      const rect = canvasRef.current.getBoundingClientRect();
      const zoom = Math.min(1.08, Math.max(.22, Math.min((rect.width - 390) / Math.max(1, maxX - minX), (rect.height - 160) / Math.max(1, maxY - minY))));
      targetViewportRef.current = { x: 76 + (rect.width - 370 - (maxX - minX) * zoom) / 2 - minX * zoom, y: 90 + (rect.height - 130 - (maxY - minY) * zoom) / 2 - minY * zoom, zoom };
      if (!zoomFrameRef.current) zoomFrameRef.current = requestAnimationFrame(animateViewport);
    }
  }

  function navigateMiniMap(event) {
    if (!canvasRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const worldX = miniBounds.minX + ((event.clientX - rect.left) / rect.width) * miniBounds.width;
    const worldY = miniBounds.minY + ((event.clientY - rect.top) / rect.height) * miniBounds.height;
    const canvasRect = canvasRef.current.getBoundingClientRect();
    const zoom = targetViewportRef.current.zoom;
    targetViewportRef.current = { x: canvasRect.width / 2 - worldX * zoom, y: canvasRect.height / 2 - worldY * zoom, zoom };
    if (!zoomFrameRef.current) zoomFrameRef.current = requestAnimationFrame(animateViewport);
  }

  async function switchCanvas(id) {
    if (id === activeCanvasId) { setCanvasMenuOpen(false); return; }
    setCanvasTransition('leaving');
    await new Promise((resolve) => window.setTimeout(resolve, 130));
    await writeCanvasState(activeCanvasId, { nodes, selectedId, collapsedIds: [...collapsedIds], viewport: targetViewportRef.current }).catch(console.error);
    const state = await readCanvasState(id).catch(() => null) || loadState(id);
    if (previewLayoutTimerRef.current) clearTimeout(previewLayoutTimerRef.current);
    if (previewContentTimerRef.current) clearTimeout(previewContentTimerRef.current);
    if (connectionFrameRef.current) cancelAnimationFrame(connectionFrameRef.current);
    // Preview is canvas-local. Reset its semantic target before mounting the
    // next canvas so a pending transition from the previous one cannot force
    // this canvas through an unintended half-preview layout.
    const nextViewport = state.viewport || { x: 20, y: 20, zoom: .82 };
    semanticPreviewRef.current = previewEnabled ? semanticPreview(nextViewport.zoom) : 0;
    setPreviewLayoutActive(Boolean(semanticPreviewRef.current));
    setPreviewContentPhase(semanticPreviewRef.current ? 'hidden' : 'full');
    setPreviewFullSizes(new Map());
    nodeSizesRef.current = new Map();
    setNodeSizes(new Map());
    activeCanvasIdRef.current = id;
    setActiveCanvasId(id);
    setNodes(state.nodes);
    setCollapsedIds(new Set(state.collapsedIds || []));
    const nextSelected = state.selectedId || state.nodes[0]?.id || null;
    setSelectedId(nextSelected);
    setSelectedIds(new Set(nextSelected ? [nextSelected] : []));
    stopZoomAnimation(); targetViewportRef.current = nextViewport; commitViewport(nextViewport);
    setCanvasTransition('entering');
    if (canvasTransitionTimerRef.current) clearTimeout(canvasTransitionTimerRef.current);
    canvasTransitionTimerRef.current = window.setTimeout(() => { setCanvasTransition(''); canvasTransitionTimerRef.current = null; }, 260);
    setCanvasMenuOpen(false);
    setRootComposerOpen(false);
  }

  async function createCanvas() {
    const id = `canvas-${Date.now()}`;
    const usedNumbers = new Set(canvases.map((canvas) => Number(canvas.name.match(/新画布\s+(\d+)/)?.[1])).filter(Number.isFinite));
    let nextNumber = 1;
    while (usedNumbers.has(nextNumber)) nextNumber += 1;
    const name = tr(`新画布 ${nextNumber}`,`New canvas ${nextNumber}`);
    setCanvasTransition('leaving');
    await new Promise((resolve) => window.setTimeout(resolve, 130));
    await writeCanvasState(activeCanvasId, { nodes, selectedId, collapsedIds: [...collapsedIds], viewport: targetViewportRef.current }).catch(console.error);
    await writeCanvasState(id, { nodes: [], selectedId: null, collapsedIds: [], viewport: { x: 20, y: 20, zoom: .9 } }).catch(console.error);
    const now = new Date().toISOString();
    setCanvases((items) => [...items, { id, name, createdAt: now, updatedAt: now }]);
    if (previewLayoutTimerRef.current) clearTimeout(previewLayoutTimerRef.current);
    if (previewContentTimerRef.current) clearTimeout(previewContentTimerRef.current);
    if (connectionFrameRef.current) cancelAnimationFrame(connectionFrameRef.current);
    semanticPreviewRef.current = 0; setPreviewLayoutActive(false); setPreviewContentPhase('full'); setPreviewFullSizes(new Map()); nodeSizesRef.current = new Map(); setNodeSizes(new Map());
    activeCanvasIdRef.current = id; setActiveCanvasId(id); setNodes([]); setSelectedId(null); setSelectedIds(new Set()); setCollapsedIds(new Set());
    setRootPosition({ x: 220, y: 220 }); setRootComposerOpen(false); setDraft(''); setAttachments([]);
    const nextViewport = { x: 20, y: 20, zoom: .9 }; stopZoomAnimation(); targetViewportRef.current = nextViewport; commitViewport(nextViewport);
    setCanvasTransition('entering');
    if (canvasTransitionTimerRef.current) clearTimeout(canvasTransitionTimerRef.current);
    canvasTransitionTimerRef.current = window.setTimeout(() => { setCanvasTransition(''); canvasTransitionTimerRef.current = null; }, 260);
    setCanvasMenuOpen(false);
  }

  function renameCanvas(id, name) {
    const nextName = name.replace(/[\r\n]/g, '').slice(0, 40);
    setCanvases((items) => items.map((canvas) => canvas.id === id ? { ...canvas, name: nextName, updatedAt: new Date().toISOString() } : canvas));
  }

  async function refreshSavedCanvases() {
    try {
      setCanvasLibraryStatus(tr('正在读取本地存档…',"Loading local archives…"));
      const response = await fetch('http://127.0.0.1:4318/canvases');
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setSavedCanvases(result.canvases || []); setCanvasLibraryStatus('');
    } catch (error) { setCanvasLibraryStatus(tr(`无法读取本地存档：${error.message}`,`Operation failed: ${error.message}`)); }
  }

  async function saveCanvas(silent = false) {
    if (!silent) setSaveStatus('保存中…');
    try {
      const now = new Date().toISOString();
      const canvas = { ...activeCanvas, updatedAt: now };
      await writeCanvasState(activeCanvasId, { nodes, selectedId, collapsedIds: [...collapsedIds], viewport: targetViewportRef.current });
      localStorage.setItem(CANVAS_INDEX_KEY, JSON.stringify({ canvases, activeId: activeCanvasId }));
      const response = await fetch('http://127.0.0.1:4318/canvases/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ format: 'wonderful-wdf', version: 1, canvas, nodes, selectedId, collapsedIds: [...collapsedIds], viewport: targetViewportRef.current }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setCanvases((items) => items.map((item) => item.id === activeCanvasId ? canvas : item));
      await refreshSavedCanvases();
      setStorageWarning('');
      if (!silent) {
        setSaveStatus('已保存');
        window.setTimeout(() => setSaveStatus(''), 1600);
      }
    } catch (error) { if (!silent) setSaveStatus('保存失败'); setCanvasLibraryStatus(error.message); }
  }
  saveCanvasRef.current = saveCanvas;

  async function openSavedCanvas(id) {
    try {
      const response = await fetch(`http://127.0.0.1:4318/canvases/open?id=${encodeURIComponent(id)}`);
      const payload = await response.json(); if (!response.ok) throw new Error(payload.error);
      const canvas = payload.canvas;
      setCanvases((items) => items.some((item) => item.id === id) ? items.map((item) => item.id === id ? canvas : item) : [...items, canvas]);
      await writeCanvasState(id, { nodes: payload.nodes || [], selectedId: payload.selectedId || null, collapsedIds: payload.collapsedIds || [], viewport: payload.viewport || { x: 20, y: 20, zoom: .9 } });
      activeCanvasIdRef.current = id; setActiveCanvasId(id); setNodes(payload.nodes || []); setCollapsedIds(new Set(payload.collapsedIds || []));
      setSelectedId(payload.selectedId || null); setSelectedIds(new Set(payload.selectedId ? [payload.selectedId] : []));
      const nextViewport = payload.viewport || { x: 20, y: 20, zoom: .9 }; stopZoomAnimation(); targetViewportRef.current = nextViewport; commitViewport(nextViewport);
      closeFloatingPanel('canvas', setCanvasMenuOpen);
    } catch (error) { setCanvasLibraryStatus(tr(`打开失败：${error.message}`,`Operation failed: ${error.message}`)); }
  }

  async function deleteSavedCanvas(id) {
    try {
      const response = await fetch('http://127.0.0.1:4318/canvases/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error);
      setSavedCanvases((items) => items.filter((canvas) => canvas.id !== id));
      await deleteCanvasState(id).catch(console.error);
    } catch (error) { setCanvasLibraryStatus(tr(`删除失败：${error.message}`,`Operation failed: ${error.message}`)); }
  }

  function closeFloatingPanel(name, setter) {
    setClosingPanels((current) => new Set(current).add(name));
    const selector = { canvas: '.canvas-overview', search: '.search-panel', library: '.library-panel' }[name];
    document.querySelector(selector)?.animate([
      { opacity: 1, transform: 'translate(0,0) scale(1)', filter: 'blur(0)' },
      { opacity: 0, transform: 'translate(-7px,-4px) scale(.98)', filter: 'blur(2px)' },
    ], { duration: 190, easing: 'cubic-bezier(.55,.05,.8,.45)', fill: 'forwards' });
    window.setTimeout(() => { setter(false); setClosingPanels((current) => { const next = new Set(current); next.delete(name); return next; }); }, 190);
  }

  function toggleFloatingPanel(name, open, setter) {
    if (open) closeFloatingPanel(name, setter); else setter(true);
  }

  function closeRootComposer() {
    if (!rootComposerOpen || rootComposerClosing || !nodes.length) return;
    setRootComposerClosing(true);
    window.setTimeout(() => { setRootComposerOpen(false); setRootComposerClosing(false); }, 220);
  }

  function updateAgentSetting(runner, patch) {
    if (actionOptionsOpen) {
      setTaskAgentSettings((current) => ({ ...current, [runner]: { ...current[runner], ...patch } }));
      setAgentSettings((current) => ({ ...current, [runner]: { ...current[runner], ...patch } }));
      return;
    }
    setAgentSettings((current) => ({ ...current, [runner]: { ...current[runner], ...patch } }));
  }

  function updateTaskAgentSetting(runner, patch) {
    setTaskAgentSettings((current) => ({ ...current, [runner]: { ...current[runner], ...patch } }));
  }

  async function pickWorkspaceDirectory(forCurrentAction = false) {
    try {
      const desktopPath = await window.wonderfulWindow?.pickDirectory?.();
      let path = desktopPath || '';
      if (!path) {
        const response = await fetch('http://127.0.0.1:4318/pick-directory', { method: 'POST' });
        const result = await response.json(); if (!response.ok) throw new Error(result.error);
        path = result.path || '';
      }
      if (!path) return;
      if (forCurrentAction) setActionWorkspace(path);
      else setCanvases((items) => items.map((canvas) => canvas.id === activeCanvasId ? { ...canvas, workspace: path } : canvas));
    } catch (error) { setProjectStatus(tr(`选择目录失败：${error.message}`,`Operation failed: ${error.message}`)); }
  }

  function updateConversationOptions(patch) {
    if (model.startsWith('cloud:')) {
      setCloudProfiles((items) => items.map((profile) => profile.id === model.slice(6) ? { ...profile, chatOptions: { ...DEFAULT_CHAT_OPTIONS, ...(profile.chatOptions || {}), ...patch } } : profile));
    } else {
      setLocalProfiles((items) => items.map((profile) => profile.id === model.slice(6) ? { ...profile, chatOptions: { ...DEFAULT_CHAT_OPTIONS, ...(profile.chatOptions || {}), ...patch } } : profile));
    }
  }

  function shouldShowNodeThinking(node) {
    if (!node.thinking) return false;
    // Prefer the exact options recorded when this card was generated. For old
    // cards without a record, fall back to the model's current setting.
    if (node.requestRecord?.options) return normalizeChatOptions(node.requestRecord.options).reasoning !== 'none';
    const nodeModelValue = String(node.modelValue || model || '');
    const profile = nodeModelValue.startsWith('cloud:') ? cloudProfiles.find((item) => item.id === nodeModelValue.slice(6)) : null;
    const localProfile = nodeModelValue.startsWith('local:') ? localProfiles.find((item) => item.id === nodeModelValue.slice(6)) : ollama;
    return normalizeChatOptions(profile?.chatOptions || localProfile?.chatOptions || {}).reasoning !== 'none';
  }

  async function createFirstNode() {
    const text = draft.trim();
    if (!text && !attachments.length) return;
    const requestText = text || tr('请理解并描述我上传的图片或文件。',"Please interpret the uploaded images or files.");
    const profile = model.startsWith('cloud:') ? cloudProfiles.find((item) => item.id === model.slice(6)) : null;
    const localProfile = model.startsWith('local:') ? localProfiles.find((item) => item.id === model.slice(6)) : ollama;
    const root = {
      id: `root-${Date.now()}`, parentId: null, type: nodeType,
      author: nodeType === 'thought' ? tr('你',"You") : nodeType === 'action' ? tr('执行代理',"Agent") : 'AI',
      model: nodeType === 'thought' ? null : nodeType === 'action' ? ({ codex: 'Codex', claude: 'Claude Code', deepseek: 'DeepSeek Harness' }[actionRunner]) : profile?.model || localProfile?.model,
      title: questionTitle(text, nodeType === 'action' ? tr('新行动',"New action") : nodeType === 'thought' ? tr('新想法',"New idea") : tr('图片问题',"Image question")),
      content: requestText, prompt: nodeType === 'conversation' ? requestText : null,
      x: rootPosition.x, y: rootPosition.y, attachments,
      status: nodeType === 'action' ? 'running' : nodeType === 'conversation' ? 'queued' : 'done', generationPhase: nodeType === 'conversation' ? tr('请求已排队，正在准备上下文…',"Request queued…") : null, modelValue: model, actionRunner, actionOptions: taskAgentSettings[actionRunner], actionWorkspace: actionWorkspace || activeCanvas?.workspace || '', execution: nodeType === 'action' ? { activityCollapsed: true, events: [] } : undefined,
    };
    const sourceNodes = nodes;
    setNodes((items) => [...items, root]);
    setSelectedId(root.id);
    setSelectedIds(new Set([root.id]));
    setNewNodeId(root.id);
    setDraft(''); setAttachments([]); setRootComposerOpen(false); setActionOptionsOpen(false); setActionWorkspace(''); setTaskAgentSettings(JSON.parse(JSON.stringify(agentSettings)));
    if (nodeAnimationTimerRef.current) clearTimeout(nodeAnimationTimerRef.current);
    nodeAnimationTimerRef.current = window.setTimeout(() => setNewNodeId(null), 520);
    if (root.type === 'conversation') await generateResponse(root.id, model, sourceNodes, null, requestText, root.attachments);
    if (root.type === 'action') void approveAction(root, [...sourceNodes, root], activeCanvas);
  }

  async function closeCanvas(id, event) {
    event?.stopPropagation();
    if (canvases.length <= 1) return;
    const index = canvases.findIndex((canvas) => canvas.id === id);
    const remaining = canvases.filter((canvas) => canvas.id !== id);
    if (id === activeCanvasId) {
      const nextCanvas = remaining[Math.min(index, remaining.length - 1)];
      const state = await readCanvasState(nextCanvas.id).catch(() => null) || loadState(nextCanvas.id);
      activeCanvasIdRef.current = nextCanvas.id; setActiveCanvasId(nextCanvas.id); setNodes(state.nodes); setCollapsedIds(new Set(state.collapsedIds || []));
      const nextSelected = state.selectedId || state.nodes[0]?.id || null;
      setSelectedId(nextSelected); setSelectedIds(new Set(nextSelected ? [nextSelected] : []));
      const nextViewport = state.viewport || { x: 20, y: 20, zoom: .82 }; stopZoomAnimation(); targetViewportRef.current = nextViewport; commitViewport(nextViewport);
    }
    setCanvases(remaining);
  }

  function focusSearchResult(node) {
    const pathIds = new Set(ancestors(nodes, node.id).map((item) => item.id));
    setCollapsedIds((current) => new Set([...current].filter((id) => !pathIds.has(id))));
    selectNode(node.id);
    closeFloatingPanel('search', setSearchOpen);
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const size = nodeSizes.get(node.id) || { width: 224, height: 110 };
    const zoom = Math.max(.72, Math.min(1.15, targetViewportRef.current.zoom));
    targetViewportRef.current = { x: rect.width / 2 - (node.x + size.width / 2) * zoom, y: rect.height / 2 - (node.y + size.height / 2) * zoom, zoom };
    if (!zoomFrameRef.current) zoomFrameRef.current = requestAnimationFrame(animateViewport);
  }

  function handleCanvasDoubleClick(event) {
    if (event.target.closest('.node, button, textarea, select, .composer')) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const current = targetViewportRef.current;
    setRootPosition({
      x: (event.clientX - rect.left - current.x) / current.zoom - 112,
      y: (event.clientY - rect.top - current.y) / current.zoom - 55,
    });
    setSelectedId(null); setSelectedIds(new Set()); setInspectorOpen(false);
    setRootComposerOpen(true); setDraft(''); setAttachments([]);
    setExcludedContextIds(new Set()); setContextInspectorOpen(false);
    window.requestAnimationFrame(() => document.querySelector('.root-composer textarea')?.focus());
  }

  async function createBranch() {
    const text = draft.trim();
    if ((!text && !attachments.length) || !selected) return;
    if (parallelMode && nodeType === 'conversation') {
      const choices = [...parallelModels].length ? [...parallelModels] : [model];
      const extraRelations = [...pendingContextRelations];
      const baseId = Date.now();
      const parentSize = nodeSizes.get(selected.id) || { width: selected.manualWidth || 224, height: selected.manualHeight || 110 };
      const created = choices.map((modelValue, index) => {
        const profile = modelValue.startsWith('cloud:') ? cloudProfiles.find((item) => item.id === modelValue.slice(6)) : null;
        const localProfile = modelValue.startsWith('local:') ? localProfiles.find((item) => item.id === modelValue.slice(6)) : ollama;
        return { id: `node-${baseId}-${index}`, parentId: selected.id, type: 'conversation', author: 'AI', model: profile?.model || localProfile?.model, title: questionTitle(text, tr('图片问题',"Image question")), content: text, prompt: text, attachments, x: selected.x + parentSize.width + 86, y: selected.y + (index - (choices.length - 1) / 2) * 190, status: 'queued', generationPhase: tr('请求已排队，正在准备上下文…',"Request queued…"), modelValue, contextExclusions: [...excludedContextIds], contextRelations: extraRelations };
      });
      setNodes((items) => [...items, ...created]);
      setCollapsedIds((current) => { const next = new Set(current); next.delete(selected.id); return next; });
      setNewNodeId(created[0].id);
      selectNode(created[0].id);
      closeBranch(); setDraft(''); setAttachments([]); setActionOptionsOpen(false); setActionWorkspace(''); setTaskAgentSettings(JSON.parse(JSON.stringify(agentSettings)));
      created.forEach((node) => generateResponse(node.id, node.modelValue, nodes, selected.id, text, node.attachments, node.contextExclusions, activeCanvasIdRef.current, extraRelations));
      return;
    }
    const position = findBranchPosition(nodes, selected, nodeSizes);
    const id = `node-${Date.now()}`;
    const next = {
      id,
      parentId: selected.id,
      type: nodeType,
      author: nodeType === 'thought' ? tr('你',"You") : nodeType === 'action' ? tr('执行代理',"Agent") : 'AI',
      model: nodeType === 'thought' ? null : nodeType === 'action' ? ({ codex: 'Codex', claude: 'Claude Code', deepseek: 'DeepSeek Harness' }[actionRunner]) : selectedCloud?.model || selectedLocal?.model,
      title: questionTitle(text, nodeType === 'action' ? tr('新行动',"New action") : nodeType === 'thought' ? tr('新想法',"New idea") : tr('图片问题',"Image question")),
      content: text,
      prompt: nodeType === 'conversation' ? text : null,
      attachments,
      x: position.x,
      y: position.y,
      status: nodeType === 'action' ? 'running' : nodeType === 'conversation' ? 'queued' : 'done', generationPhase: nodeType === 'conversation' ? tr('请求已排队，正在准备上下文…',"Request queued…") : null, actionRunner, actionOptions: taskAgentSettings[actionRunner], actionWorkspace: actionWorkspace || activeCanvas?.workspace || '', contextRelations: [...pendingContextRelations], execution: nodeType === 'action' ? { activityCollapsed: true, events: [] } : undefined,
      modelValue: nodeType === 'conversation' ? model : null,
      contextExclusions: [...excludedContextIds],
    };
    setNodes((items) => [...items, next]);
    setCollapsedIds((current) => {
      if (!current.has(selected.id)) return current;
      const expanded = new Set(current);
      expanded.delete(selected.id);
      return expanded;
    });
    setNewNodeId(id);
    if (nodeAnimationTimerRef.current) clearTimeout(nodeAnimationTimerRef.current);
    nodeAnimationTimerRef.current = window.setTimeout(() => setNewNodeId(null), 520);
    selectNode(id);
    const extraRelations = [...pendingContextRelations];
    closeBranch();
    setDraft('');
    setAttachments([]);
    // Conversation branches deliberately start in "thinking" so the card can
    // communicate the connection phase.  Do not use that display status as a
    // dispatch guard: doing so created the card but never sent its request.
    if (next.type === 'action') {
      void approveAction(next, [...nodes, next], activeCanvas);
    } else if (next.type === 'conversation') {
      await generateResponse(id, model, nodes, selected.id, text, next.attachments, next.contextExclusions, activeCanvasIdRef.current, extraRelations);
    }
  }

  function updateTaskNode(canvasId, id, updater) {
    if (activeCanvasIdRef.current === canvasId) {
      setNodes((items) => items.map((item) => item.id === id ? updater(item) : item));
      return;
    }
    const previous = canvasWriteQueueRef.current.get(canvasId) || Promise.resolve();
    const next = previous.then(async () => {
      const state = await readCanvasState(canvasId);
      if (!Array.isArray(state?.nodes)) return;
      await writeCanvasState(canvasId, { ...state, nodes: state.nodes.map((item) => item.id === id ? updater(item) : item) });
    }).catch((error) => console.error('Wonderful background task persistence failed', error));
    canvasWriteQueueRef.current.set(canvasId, next);
  }

  async function generateResponse(id, modelValue, sourceNodes, parentId, text, requestAttachments = [], contextExclusions = [], taskCanvasId = activeCanvasIdRef.current, extraRelations = []) {
    const profile = modelValue.startsWith('cloud:') ? cloudProfiles.find((item) => item.id === modelValue.slice(6)) : null;
    const localProfile = modelValue.startsWith('local:') ? localProfiles.find((item) => item.id === modelValue.slice(6)) : ollama;
    let heartbeat = null;
    let timeout = null;
    let timedOut = false;
    try {
      updateTaskNode(taskCanvasId, id, (item) => ({ ...item, status: 'queued', generationPhase: tr('请求已排队，正在准备上下文…',"Request queued…"), error: null }));
      await new Promise((resolve) => window.requestAnimationFrame(resolve));
      const controller = new AbortController();
      generationRef.current.set(id, controller);
      const excluded = new Set(contextExclusions);
      const requestContext = contextPlan(sourceNodes, parentId, contextExclusions, extraRelations);
      const actualAttachments = contextAttachments(sourceNodes, parentId, requestAttachments, contextExclusions, extraRelations);
      const inheritedCount = requestContext.length;
      const startedAt = Date.now();
      const record = { id: `request-${startedAt}`, status: 'thinking', startedAt: new Date(startedAt).toISOString(), model: profile?.model || localProfile?.model, modelValue, provider: profile?.name || 'Ollama', options: normalizeChatOptions(profile?.chatOptions || localProfile?.chatOptions || {}), prompt: text, attachments: actualAttachments.map((item) => ({ id: item.id, name: item.name, type: item.type, size: item.size })), context: requestContext.map(({ node, relation }) => ({ id: node.id, title: node.title, relation, type: node.type })), excludedIds: [...contextExclusions] };
      updateTaskNode(taskCanvasId, id, (item) => ({ ...item, status: 'thinking', generationPhase: tr(`正在整理 ${inheritedCount} 条上下文并连接模型…`,`Preparing ${inheritedCount} context nodes and connecting…`), error: null, requestRecord: record, requestHistory: [...(item.requestHistory?.length ? item.requestHistory : item.requestRecord ? [item.requestRecord] : []), record] }));
      heartbeat = window.setInterval(() => updateTaskNode(taskCanvasId, id, (item) => item.status === 'thinking' ? { ...item, generationPhase: tr(`模型正在思考，等待首个输出（${Math.max(1, Math.floor((Date.now() - startedAt) / 1000))} 秒）…`,`Waiting for first output (${Math.max(1, Math.floor((Date.now() - startedAt) / 1000))} seconds)…`) } : item), 1000);
      // Do not kill a model just because it is still reasoning. The visible
      // Stop button is the user's explicit cancellation control.
      const onToken = (partial) => updateTaskNode(taskCanvasId, id, (item) => ({ ...patchLatestRequest(item, { status: 'streaming', firstTokenAt: item.requestRecord?.firstTokenAt || new Date().toISOString() }), content: partial, status: 'streaming', generationPhase: tr('模型正在逐字输出…',"Streaming response…") }));
      const onThinking = (partial) => updateTaskNode(taskCanvasId, id, (item) => ({ ...patchLatestRequest(item, { status: item.content ? 'streaming' : 'thinking' }), thinking: `${item.thinking || ''}${partial}`, status: item.content ? 'streaming' : 'thinking', generationPhase: tr('模型正在思考…',"Thinking…") }));
      const messages = contextMessages(sourceNodes, parentId, text, requestAttachments, contextExclusions, extraRelations);
      if (profile && !profile.apiKey) throw new Error(tr(`尚未填写 ${profile.name} 的 API 密钥`,`Missing API key for ${profile.name}`));
      const chatOptions = normalizeChatOptions(profile?.chatOptions || localProfile?.chatOptions || {});
      const content = profile ? await streamCloud({ ...profile, messages, chatOptions, signal: controller.signal, onToken, onThinking }) : await streamOllama({ endpoint: localProfile.endpoint, model: localProfile.model, messages, chatOptions, signal: controller.signal, onToken, onThinking });
      generationRef.current.delete(id);
      window.clearInterval(heartbeat); window.clearTimeout(timeout);
      updateTaskNode(taskCanvasId, id, (item) => ({ ...patchLatestRequest(item, { status: 'done', completedAt: new Date().toISOString(), durationMs: Date.now() - startedAt, outputChars: content.length }), content, status: 'done', generationPhase: null, model: profile?.model || localProfile.model, error: null }));
    } catch (error) {
      generationRef.current.delete(id);
      window.clearInterval(heartbeat); window.clearTimeout(timeout);
      const message = timedOut ? tr('等待模型首个输出超过 90 秒；已保留上下文但主动停止。请检查模型负载或减少上下文。',"No output after 90 seconds. Request stopped; check model load or reduce context.") : error.name === 'AbortError' ? tr('生成已由你停止。',"Generation stopped by you.") : systemText(error.message);
      updateTaskNode(taskCanvasId, id, (item) => ({ ...patchLatestRequest(item, { status: error.name === 'AbortError' ? 'stopped' : 'failed', completedAt: new Date().toISOString(), durationMs: item.requestRecord?.startedAt ? Date.now() - new Date(item.requestRecord.startedAt).getTime() : undefined, error: message }), content: timedOut ? message : error.name === 'AbortError' ? (item.content || tr('生成已由你停止。',"Generation stopped by you.")) : tr(`${message}。请在设置中检查对应的模型连接。`,`${message}. Check the model connection in Settings.`), status: error.name === 'AbortError' && !timedOut ? 'stopped' : 'failed', generationPhase: null, error: error.name === 'AbortError' && !timedOut ? null : message }));
    }
  }

  async function testOllama() {
    setOllamaStatus(tr('正在连接…',"Connecting…"));
    try {
      const models = await listOllamaModels(ollama.endpoint);
      setOllamaStatus(models.length ? tr(`已连接 · 检测到 ${models.length} 个模型`,`Connected · ${models.length} models detected`) : tr('已连接 · 尚未安装模型',"Connected · No models installed"));
      if (models.length && !models.includes(ollama.model)) updateActiveLocal({ model: models[0] });
    } catch (error) { setOllamaStatus(error.message); }
  }

  async function addAttachmentFiles(fileList, { appendToComposer = true } = {}) {
    const files = [...(fileList || [])];
    if (!files.length) return;
    const readAsDataUrl = (file) => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    const compactImage = (file) => new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        const maxEdge = 1920;
        const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => {
          if (!blob) { reject(new Error(tr('图片处理失败',"Image processing failed"))); return; }
          const reader = new FileReader();
          reader.onload = () => resolve({ dataUrl: reader.result, size: blob.size, type: blob.type });
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }, 'image/webp', .84);
      };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error(tr(`无法读取图片 ${file.name}`,`Cannot read image ${file.name}`))); };
      image.src = url;
    });
    const next = [];
    for (const file of files) {
      const item = { id: `attachment-${Date.now()}-${next.length}`, name: file.name, type: file.type || 'application/octet-stream', size: file.size, sourcePath: window.wonderfulWindow?.filePath?.(file) || '' };
      if (file.type.startsWith('image/') && file.size <= 20 * 1024 * 1024) {
        const compacted = await compactImage(file);
        item.dataUrl = compacted.dataUrl; item.size = compacted.size; item.type = compacted.type;
      }
      else if ((file.type.startsWith('text/') || /\.(js|ts|jsx|tsx|py|java|c|cpp|css|html|json|md|yaml|yml|sh|sql)$/i.test(file.name)) && file.size <= 300 * 1024) item.text = await file.text();
      else if (file.size <= 30 * 1024 * 1024) item.dataUrl = await readAsDataUrl(file);
      next.push(item);
    }
    if (appendToComposer) setAttachments((current) => [...current, ...next]);
    return next;
  }

  function isFileDrag(event) {
    return Array.from(event.dataTransfer?.types || []).includes('Files');
  }

  function canvasPointFromEvent(event) {
    const rect = canvasRef.current?.getBoundingClientRect();
    const current = targetViewportRef.current;
    if (!rect) return { x: 220, y: 220 };
    return {
      x: Math.round((event.clientX - rect.left - current.x) / current.zoom - 150),
      y: Math.round((event.clientY - rect.top - current.y) / current.zoom - 72),
    };
  }

  function handleCanvasDragEnter(event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    canvasFileDragDepthRef.current += 1;
    setCanvasFileDragActive(true);
  }

  function handleCanvasDragOver(event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleCanvasDragLeave(event) {
    if (!isFileDrag(event)) return;
    canvasFileDragDepthRef.current = Math.max(0, canvasFileDragDepthRef.current - 1);
    if (!canvasFileDragDepthRef.current) setCanvasFileDragActive(false);
  }

  async function handleCanvasDrop(event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    canvasFileDragDepthRef.current = 0;
    setCanvasFileDragActive(false);
    const files = [...(event.dataTransfer?.files || [])];
    if (!files.length) return;
    try {
      const attachmentsForNode = await addAttachmentFiles(files, { appendToComposer: false });
      if (!attachmentsForNode.length) return;
      const point = canvasPointFromEvent(event);
      const label = attachmentsForNode.length === 1 ? attachmentsForNode[0].name : tr(`已拖放 ${attachmentsForNode.length} 个文件`,`Dropped ${attachmentsForNode.length} files`);
      const created = {
        id: `drop-${Date.now()}`,
        parentId: null,
        type: 'thought',
        author: tr('你',"You"),
        model: tr('手动输入',"Manual input"),
        title: label,
        content: tr(`已拖放 ${attachmentsForNode.length} 个文件。可双击此卡片补充说明，或从加号继续向 AI 提问。`,`Dropped ${attachmentsForNode.length} files. Double-click to add details, or use + to ask AI.`),
        prompt: null,
        attachments: attachmentsForNode,
        x: Math.max(20, point.x),
        y: Math.max(20, point.y),
        status: 'done',
      };
      setNodes((items) => [...items, created]);
      setSelectedId(created.id);
      setSelectedIds(new Set([created.id]));
      setInspectorOpen(true);
      setInspectorClosing(false);
      setNewNodeId(created.id);
      if (nodeAnimationTimerRef.current) clearTimeout(nodeAnimationTimerRef.current);
      nodeAnimationTimerRef.current = window.setTimeout(() => setNewNodeId(null), 520);
      setStorageWarning(tr(`已在画布中添加 ${attachmentsForNode.length} 个文件。`,`Added ${attachmentsForNode.length} files to canvas`));
    } catch (error) {
      setStorageWarning(tr(`拖放文件失败：${error.message || '无法读取文件'}`,`Operation failed: ${error.message || '无法读取文件'}`));
    }
  }

  function handleComposerDragEnter(event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    composerFileDragDepthRef.current += 1;
    setComposerFileDragActive(true);
  }

  function handleComposerDragOver(event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'copy';
  }

  function handleComposerDragLeave(event) {
    if (!isFileDrag(event)) return;
    event.stopPropagation();
    composerFileDragDepthRef.current = Math.max(0, composerFileDragDepthRef.current - 1);
    if (!composerFileDragDepthRef.current) setComposerFileDragActive(false);
  }

  async function handleComposerDrop(event) {
    if (!isFileDrag(event)) return;
    event.preventDefault();
    event.stopPropagation();
    composerFileDragDepthRef.current = 0;
    setComposerFileDragActive(false);
    try {
      const next = await addAttachmentFiles(event.dataTransfer?.files || []);
      if (next?.length) setStorageWarning(tr(`已添加 ${next.length} 个附件，发送后会一并交给 AI。`,`Added ${next.length} attachments. They will be sent with your message.`));
    } catch (error) {
      setStorageWarning(tr(`添加附件失败：${error.message || '无法读取文件'}`,`Operation failed: ${error.message || '无法读取文件'}`));
    }
  }

  async function addAttachments(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    await addAttachmentFiles(files);
  }

  useEffect(() => {
    const onPaste = (event) => {
      const files = [...(event.clipboardData?.files || [])];
      if (!files.length) return;
      event.preventDefault();
      if (!branchSource && !rootComposerOpen && nodes.length) setRootComposerOpen(true);
      void addAttachmentFiles(files);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [branchSource, rootComposerOpen, nodes.length]);

  useEffect(() => {
    // Dropping a file over a header, inspector, or other non-canvas area
    // must never navigate the Electron/web view away from the current canvas.
    const preventFileNavigation = (event) => {
      if (Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault();
    };
    window.addEventListener('dragover', preventFileNavigation);
    window.addEventListener('drop', preventFileNavigation);
    return () => {
      window.removeEventListener('dragover', preventFileNavigation);
      window.removeEventListener('drop', preventFileNavigation);
    };
  }, []);

  function stopGeneration(id) {
    generationRef.current.get(id)?.abort();
  }

  async function retryGeneration(node, overrideModel = node.modelValue || model) {
    if (!node?.prompt) return;
    setNodes((items) => items.map((item) => item.id === node.id ? { ...item, status: 'queued', generationPhase: tr('请求已排队，正在准备上下文…',"Request queued…"), error: null, content: node.prompt, modelValue: overrideModel } : item));
    await generateResponse(node.id, overrideModel, nodes.filter((item) => item.id !== node.id), node.parentId, node.prompt, node.attachments || [], node.contextExclusions || [], activeCanvasIdRef.current, node.contextRelations || []);
  }

  function addLibraryItemToInput(item) {
    setAttachments((current) => current.some((attachment) => attachment.id === item.id) ? current : [...current, { id: item.id, name: item.name, type: item.type, size: item.size, dataUrl: item.dataUrl, text: item.text }]);
    setLibraryOpen(false);
    setRootComposerClosing(false);
    setRootComposerOpen(true);
    setStorageWarning(tr(`「${item.name}」已加入输入框，可直接继续提问。`,`“${item.name}” added to the composer`));
  }

  function removeLibraryItem(item) {
    setNodes((items) => items.map((node) => ({ ...node, attachments: (node.attachments || []).filter((attachment) => attachment.id !== item.id) })));
    setAttachments((items) => items.filter((attachment) => attachment.id !== item.id));
  }

  function openLibraryItem(item) {
    if (item.dataUrl) {
      if (window.wonderfulWindow?.openDataFile) {
        window.wonderfulWindow.openDataFile(item.name, item.dataUrl).catch(() => window.open(item.dataUrl, '_blank', 'noopener,noreferrer'));
      } else window.open(item.dataUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (item.text) {
      const url = URL.createObjectURL(new Blob([item.text], { type: item.type || 'text/plain' }));
      openExternalUrl(url);
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
    }
  }

  function updateActiveCloud(patch) {
    setCloudProfiles((items) => items.map((profile) => profile.id === activeCloud.id ? { ...profile, ...patch } : profile));
  }

  function updateActiveLocal(patch) {
    setLocalProfiles((items) => items.map((profile) => profile.id === ollama.id ? { ...profile, ...patch } : profile));
  }

  function addLocalProfile() {
    const id = `local-${Date.now()}`;
    const profile = { ...DEFAULT_OLLAMA, id, name: tr(`本地模型 ${localProfiles.length + 1}`,`Local model ${localProfiles.length + 1}`), model: '' };
    setLocalProfiles((items) => [...items, profile]);
    setActiveLocalId(id);
    setModel(`local:${id}`);
    setOllamaStatus('');
  }

  function removeActiveLocal() {
    const remaining = localProfiles.filter((profile) => profile.id !== ollama.id);
    setLocalProfiles(remaining);
    setActiveLocalId(remaining[0]?.id || '');
    if (model === `local:${ollama.id}`) setModel(remaining[0] ? `local:${remaining[0].id}` : '');
    setOllamaStatus('');
  }

  function addCloudProfile() {
    const id = `cloud-${Date.now()}`;
    const profile = { ...DEFAULT_CLOUD, id, name: tr(`新模型 ${cloudProfiles.length + 1}`,`New model ${cloudProfiles.length + 1}`), model: '' };
    setCloudProfiles((items) => [...items, profile]);
    setActiveCloudId(id);
    setModel(`cloud:${id}`);
  }

  function removeActiveCloud() {
    const remaining = cloudProfiles.filter((profile) => profile.id !== activeCloud.id);
    setCloudProfiles(remaining);
    setActiveCloudId(remaining[0]?.id || '');
    if (model === `cloud:${activeCloud.id}`) setModel(remaining[0] ? `cloud:${remaining[0].id}` : '');
  }

  async function openWorkspaceDirectory(workspace = '') {
    try {
      const target = workspace || activeCanvas?.workspace || '';
      if (target && window.wonderfulWindow?.openPath) {
        await window.wonderfulWindow.openPath(target);
        return;
      }
      const response = await fetch('http://127.0.0.1:4318/open-directory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || tr('无法打开工作目录',"Cannot open workspace"));
    } catch (error) { setStorageWarning(error.message); }
  }

  function startEditingNode(nodeToEdit = selected) {
    if (!nodeToEdit?.id) nodeToEdit = selected;
    if (!nodeToEdit) return;
    if (nodeToEdit.id !== selectedId) { setSelectedId(nodeToEdit.id); setSelectedIds(new Set([nodeToEdit.id])); }
    const card = worldRef.current?.querySelector(`.node[data-node-id="${CSS.escape(nodeToEdit.id)}"]`);
    setInlineEditSize(card ? { width: card.offsetWidth, height: card.offsetHeight } : null);
    setEditDraft({ title: nodeToEdit.title || '', prompt: nodeToEdit.prompt || '', content: nodeToEdit.content || '', type: nodeToEdit.type, tags: (nodeToEdit.tags || []).join('，'), note: nodeToEdit.note || '', color: nodeToEdit.color || '' });
    setEditingNode(nodeToEdit.id);
    setInspectorTab('actions');
  }

  function saveNodeEdit() {
    if (!selected || !editDraft.title.trim() || !editDraft.content.trim()) return;
    setNodes((items) => items.map((node) => node.id === selected.id ? { ...node, title: editDraft.title.trim(), prompt: editDraft.type === 'conversation' ? editDraft.prompt.trim() || null : null, content: editDraft.content.trim(), type: editDraft.type, author: editDraft.type === 'thought' ? tr('你',"You") : editDraft.type === 'action' ? tr('执行代理',"Agent") : 'AI', model: editDraft.type === 'thought' ? null : editDraft.type === 'action' ? tr('本地 Codex',"Local Codex") : node.model || selectedLocal?.model, status: editDraft.type === 'action' && node.type !== 'action' ? 'approval' : editDraft.type === 'thought' ? 'done' : node.status, tags: editDraft.tags.split(/[，,]/).map((tag) => tag.trim()).filter(Boolean), note: editDraft.note.trim(), color: editDraft.color || '' } : node));
    setEditingNode(null);
    setInlineEditSize(null);
  }

  function openSettings() {
    if (settingsTimerRef.current) clearTimeout(settingsTimerRef.current);
    setSettingsClosing(false);
    setSettingsOpen(true);
  }

  function closeSettings() {
    if (!settingsOpen || settingsClosing) return;
    setSettingsClosing(true);
    settingsTimerRef.current = window.setTimeout(() => {
      setSettingsOpen(false);
      setSettingsClosing(false);
      settingsTimerRef.current = null;
    }, 220);
  }

  function exportProject() {
    const payload = { format: 'branchspace-wdf', version: 1, exportedAt: new Date().toISOString(), nodes, collapsedIds: [...collapsedIds], viewport: targetViewportRef.current };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/x-branchspace-wdf' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `wonderful-${new Date().toISOString().slice(0, 10)}.wdf`;
    anchor.click();
    URL.revokeObjectURL(url);
    setProjectStatus(tr('项目文件已导出',"Project exported"));
  }

  async function importProject(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      if (payload.format !== 'branchspace-wdf' || !Array.isArray(payload.nodes) || !payload.nodes.length || !payload.nodes.every((node) => node.id && Number.isFinite(node.x) && Number.isFinite(node.y))) throw new Error(tr('不是有效的 Wendaflow WDF 文件',"Invalid Wendaflow WDF file"));
      setNodes(payload.nodes);
      setCollapsedIds(new Set(payload.collapsedIds || []));
      const firstId = payload.nodes[0].id;
      setSelectedIds(new Set([firstId]));
      setSelectedId(firstId);
      if (payload.viewport?.zoom) {
        stopZoomAnimation();
        targetViewportRef.current = payload.viewport;
        commitViewport(payload.viewport);
      }
      setProjectStatus(tr(`已导入 ${payload.nodes.length} 个节点`,`Imported ${payload.nodes.length} nodes`));
    } catch (error) { setProjectStatus(tr(`导入失败：${error.message}`,`Operation failed: ${error.message}`)); }
  }

  async function generateMindMapSuggestions(node = selected, mode = mindMapState.mode || 'questions') {
    if (!node) return;
    const profile = model.startsWith('cloud:') ? cloudProfiles.find((item) => item.id === model.slice(6)) : null;
    const localProfile = model.startsWith('local:') ? localProfiles.find((item) => item.id === model.slice(6)) : ollama;
    const modes = { questions: '值得继续追问的问题', ideas: '可行的新想法或发散方向', counterpoints: '需要反驳、验证或警惕的角度', actions: '下一步可执行的行动' };
    const prompt = `围绕节点「${node.title}」扩展思维导图，类型是「${modes[mode] || modes.questions}」。只返回 3 到 6 条简洁的子节点标题，每行一条，不要编号、解释或 Markdown。`;
    setMindMapState({ nodeId: node.id, status: tr('AI 正在生成候选分支…',"AI is generating candidate branches…"), suggestions: [], selected: [], mode });
    let buffer = '';
    try {
      if (profile && !profile.apiKey) throw new Error(tr(`尚未填写 ${profile.name} 的 API 密钥`,`Missing API key for ${profile.name}`));
      const messages = contextMessages(nodes, node.id, prompt, [], []);
      const chatOptions = normalizeChatOptions(profile?.chatOptions || localProfile?.chatOptions || {});
      const answer = profile
        ? await streamCloud({ ...profile, messages, chatOptions, onToken: (text) => { buffer = text; setMindMapState((current) => ({ ...current, status: tr('正在整理候选节点…',"Organizing candidate nodes…") })); } })
        : await streamOllama({ endpoint: localProfile.endpoint, model: localProfile.model, messages, chatOptions, onToken: (text) => { buffer = text; setMindMapState((current) => ({ ...current, status: tr('正在整理候选节点…',"Organizing candidate nodes…") })); } });
      const suggestions = (answer || buffer).split(/\r?\n/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.、)\s])\s*/, '').trim()).filter(Boolean).filter((line, index, lines) => lines.indexOf(line) === index).slice(0, 6);
      if (!suggestions.length) throw new Error(tr('模型没有返回可用的节点标题',"No usable node titles returned"));
      setMindMapState({ nodeId: node.id, status: tr('候选分支已生成：可保留、取消选择或全部丢弃',"Candidates ready: select, deselect, or discard them"), suggestions, selected: suggestions, mode });
    } catch (error) { setMindMapState({ nodeId: node.id, status: tr(`生成失败：${error.message}`,`Operation failed: ${error.message}`), suggestions: [], selected: [], mode }); }
  }

  function addMindMapSuggestions() {
    const parent = nodes.find((node) => node.id === mindMapState.nodeId);
    if (!parent || !mindMapState.selected.length) return;
    const parentSize = nodeSizes.get(parent.id) || { width: parent.manualWidth || 224, height: parent.manualHeight || 110 };
    const created = mindMapState.selected.map((title, index) => ({
      id: `map-${Date.now()}-${index}`, parentId: parent.id, type: 'thought', author: tr('你',"You"), model: null,
      title, content: title, prompt: null, attachments: [], status: 'done',
      x: parent.x + parentSize.width + 100, y: parent.y + (index - (mindMapState.suggestions.length - 1) / 2) * 142,
    }));
    setNodes((items) => [...items, ...created]);
    setCollapsedIds((current) => { const next = new Set(current); next.delete(parent.id); return next; });
    setNewNodeId(created[0]?.id || null);
    window.setTimeout(() => setNewNodeId(null), 520);
    setMindMapState({ nodeId: null, status: '', suggestions: [], selected: [], mode: 'questions' });
    setStorageWarning(tr(`已加入 ${created.length} 个 AI 扩展节点。`,`Added ${created.length} AI nodes`));
  }

  function startBranch(node, options = {}) {
    if (branchingFrom === node.id) {
      closeBranch();
      return;
    }
    if (closeTimerRef.current) clearTimeout(closeTimerRef.current);
    setComposerClosing(false);
    selectNode(node.id);
    setBranchingFrom(node.id);
    setExcludedContextIds(new Set()); setContextInspectorOpen(false);
    if (!options.preservePendingContext) setPendingContextRelations([]);
    window.requestAnimationFrame(() => document.querySelector('.composer textarea')?.focus());
  }

  function closeBranch() {
    if (!branchingFrom || composerClosing) return;
    setComposerClosing(true);
    closeTimerRef.current = window.setTimeout(() => {
      setBranchingFrom(null);
      setExcludedContextIds(new Set()); setContextInspectorOpen(false); setPendingContextRelations([]);
      setComposerClosing(false);
      closeTimerRef.current = null;
    }, 230);
  }

  async function approveAction(actionNode = selected, sourceNodes = nodes, canvasSnapshot = activeCanvas) {
    if (actionNode?.type !== 'action') return;
    const actionId = actionNode.id;
    const task = actionNode.content.split('\n\n---\n\n')[0];
    const excluded = new Set(actionNode.contextExclusions || []);
    // Actions share the same explicit context plan as conversations, including
    // temporary merge/reference context without mutating source nodes.
    const inherited = contextPlan(sourceNodes, actionNode.id, [...excluded], actionNode.contextRelations || []).map(({ node }) => node);
    const context = inherited.map((node, index) => {
      const label = node.type === 'thought' ? '用户想法' : node.type === 'conversation' ? '对话节点' : '行动记录';
      const question = node.prompt ? `\n用户问题：${node.prompt}` : '';
      return `[${index + 1}] ${label}「${node.title}」${question}\n内容：${node.content}`;
    }).join('\n\n');
    const inheritedAttachments = inherited.flatMap((node) => node.attachments || []);
    const prompt = `${context ? `这是 Wendaflow 画布已经确认的上下文。必须先阅读并使用它；它不是可忽略的附注：\n\n${context}\n\n---\n\n` : ''}当前需要执行的任务：\n${task}\n\n请在最终答复中说明你实际使用了哪些上下文节点；如果上下文与任务冲突，优先说明冲突而不是静默忽略。`;
    const runner = actionNode.actionRunner || 'codex';
    const runnerName = { codex: 'Codex', claude: 'Claude Code', deepseek: 'DeepSeek Harness' }[runner];
    const taskCanvasId = activeCanvasIdRef.current;
    setNodes((items) => items.map((node) => node.id === actionId ? { ...node, status: 'running', model: runnerName, execution: { ...(node.execution || {}), activityCollapsed: node.execution?.activityCollapsed !== false, runner, events: [{ id: `context-${actionId}`, type: 'message', text: inherited.length ? tr(`已注入 ${inherited.length} 个上下文节点与 ${inheritedAttachments.length} 个附件。`,`Injected ${inherited.length} context nodes and ${inheritedAttachments.length} attachments.`) : tr('此任务从零开始，没有继承节点。',"Starting from scratch, without inherited nodes.") }], startedAt: new Date().toISOString() } } : node));
    try {
      const taskAttachments = [...inheritedAttachments, ...(actionNode.attachments || [])].filter((item) => item.dataUrl || item.sourcePath).map((item) => ({ name: item.name, type: item.type, dataUrl: item.dataUrl, sourcePath: item.sourcePath || '' }));
      const images = taskAttachments.filter((item) => item.dataUrl?.startsWith('data:image/'));
      const files = taskAttachments.filter((item) => !item.dataUrl?.startsWith('data:image/'));
      const response = await fetch('http://127.0.0.1:4318/agent/start', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ runner, prompt, images, files, workspace: actionNode.actionWorkspace || canvasSnapshot?.workspace || '', options: actionNode.actionOptions || agentSettings[runner] }) });
      let result = await response.json();
      if (!response.ok) throw new Error(result.error || tr(`Codex 返回 ${response.status}`,`Codex returned ${response.status}`));
      const jobId = result.id;
      while (result.status === 'running') {
        updateTaskNode(taskCanvasId, actionId, (node) => ({ ...node, execution: { ...(node.execution || {}), jobId, runner, events: result.events || [], terminal: result.terminal || '', before: result.before, after: result.after, artifacts: result.artifacts || [], inheritedNodeIds: inherited.map((item) => item.id), workspace: actionNode.actionWorkspace || canvasSnapshot?.workspace || '' } }));
        await new Promise((resolve) => window.setTimeout(resolve, 280));
        const statusResponse = await fetch(`http://127.0.0.1:4318/agent/status?id=${encodeURIComponent(jobId)}`); result = await statusResponse.json();
        if (!statusResponse.ok) throw new Error(result.error);
      }
      const finalStatus = result.status === 'done' ? 'done' : result.status === 'stopped' ? 'stopped' : 'failed';
      updateTaskNode(taskCanvasId, actionId, (node) => ({ ...node, status: finalStatus, content: result.output ? `${task}\n\n---\n\n**${tr(`${runnerName} 执行结果`,`${runnerName} execution results`)}**\n\n${result.output}` : node.content, error: result.error || null, execution: { ...(node.execution || {}), jobId, runner, completedAt: result.completedAt, events: result.events || [], terminal: result.terminal || '', before: result.before, after: result.after, artifacts: result.artifacts || [], inheritedNodeIds: inherited.map((item) => item.id), workspace: actionNode.actionWorkspace || canvasSnapshot?.workspace || '', output: result.output } }));
    } catch (error) {
      updateTaskNode(taskCanvasId, actionId, (node) => ({ ...node, status: 'failed', content: `${task}\n\n---\n\n${tr(`${runnerName} 执行失败：${systemText(error.message)}`,`${runnerName} execution failed: ${systemText(error.message)}`)}`, error: error.message }));
    }
  }

  async function stopAgentJob(node) {
    const id = node.execution?.jobId;
    if (!id) return;
    await fetch('http://127.0.0.1:4318/agent/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
  }

  async function openActionArtifact(artifact) {
    try {
      const localPath = localArtifactPath(artifact);
      if (localPath && window.wonderfulWindow?.openPath) {
        await window.wonderfulWindow.openPath(localPath);
        return;
      }
      if (artifact.jobId) {
        const result = await fetch('http://127.0.0.1:4318/agent/artifact/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job: artifact.jobId, artifactId: artifact.id, path: artifact.localPath || '' }) });
        if (result.ok) return;
      }
      // Electron's shell.openPath is the reliable way to invoke the system
      // default program.  Download links alone merely open a browser tab.
      if (window.wonderfulWindow?.openDataFile && artifact.href) {
        const response = await fetch(artifact.href);
        if (!response.ok) throw new Error(tr('无法读取该产物文件',"Cannot read artifact file"));
        const blob = await response.blob();
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
        });
        await window.wonderfulWindow.openDataFile(artifact.name, dataUrl);
        return;
      }
      if (!artifact.href) throw new Error(tr('该产物没有可用的本地路径',"Artifact has no local path"));
      openExternalUrl(artifact.href);
    } catch (error) { setStorageWarning(error.message || tr('无法打开产物',"Cannot open artifact")); }
  }

  async function downloadActionArtifact(artifact) {
    try {
      const localPath = localArtifactPath(artifact);
      if (localPath && window.wonderfulWindow?.savePath) {
        await window.wonderfulWindow.savePath(localPath, artifact.name);
        return;
      }
      if (!artifact.href) throw new Error(tr('该产物没有可下载的数据',"Artifact has no downloadable data"));
      const response = await fetch(artifact.href);
      if (!response.ok) throw new Error(tr('无法读取该产物文件',"Cannot read artifact file"));
      const blob = await response.blob();
      if (window.wonderfulWindow?.saveDataFile) {
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
        });
        await window.wonderfulWindow.saveDataFile(artifact.name, dataUrl);
        return;
      }
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = artifact.name; anchor.click(); URL.revokeObjectURL(url);
    } catch (error) { setStorageWarning(error.message || tr('无法下载产物',"Cannot download artifact")); }
  }

  function renderActionControls() {
    const options = taskAgentSettings[actionRunner];
    const runnerLabel = { codex: 'Codex', claude: 'Claude Code', deepseek: 'DeepSeek Harness' }[actionRunner];
    const accessLabels = { 'read-only': tr('只读','Read only'), 'workspace-write': tr('工作区可写','Workspace write'), 'auto-review': tr('自动审查','Auto review'), 'full-access': tr('完全访问','Full access') };
    const reasoningLabels = { low:tr('低','Low'),medium:tr('中','Medium'),high:tr('高','High'),xhigh:tr('极高','XHigh'),max:tr('最高','Max') };
    const summary = actionRunner === 'codex' ? `${reasoningLabels[options.reasoning] || options.reasoning.toUpperCase()} · ${accessLabels[options.accessMode] || tr('工作区可写','Workspace write')}` : actionRunner === 'claude' ? `${options.model || tr('默认模型','Default model')} · ${options.permissionMode}` : `${reasoningLabels[options.reasoning] || options.reasoning.toUpperCase()} · ${options.thinking ? tr('思考开启','Thinking on') : tr('直接执行','Direct execution')}`;
    const workspace = actionWorkspace || activeCanvas?.workspace || '';
    return <div className="inline-agent-config">
      <button className={`agent-summary-button ${actionOptionsOpen ? 'active' : ''}`} onClick={() => setActionOptionsOpen((value) => !value)}><span>{summary}</span><i>⌄</i></button>
      {actionOptionsOpen && <div className="agent-config-popover">
        <header><div><small>{tr('本次行动配置','Action settings')}</small><strong>{runnerLabel}</strong></div><button onClick={() => setActionOptionsOpen(false)}>×</button></header>
        {actionRunner === 'codex' && <>
          <div className="inline-option-grid two-column">
            <label>{tr('模型','Model')}<input value={options.model} onChange={(event) => updateAgentSetting('codex', { model: event.target.value })} placeholder={tr('使用默认模型','Use default model')} /></label>
            <label>{tr('推理强度','Reasoning effort')}<select value={options.reasoning} onChange={(event) => updateAgentSetting('codex', { reasoning: event.target.value })}><option value="low">{tr('低','Low')}</option><option value="medium">{tr('中','Medium')}</option><option value="high">{tr('高','High')}</option><option value="xhigh">{tr('极高','XHigh')}</option></select></label>
            <label className="full-row">{tr('执行模式','Execution mode')}<select className={options.accessMode === 'full-access' ? 'danger-select' : ''} value={options.accessMode} onChange={(event) => updateAgentSetting('codex', { accessMode: event.target.value })}><option value="read-only">{tr('只读分析','Read-only analysis')}</option><option value="workspace-write">{tr('工作区可写','Workspace write')}</option><option value="auto-review">{tr('自动审查并执行','Auto-review and execute')}</option><option value="full-access">{tr('完全访问（跳过审批与沙箱）','Full access (skip approvals and sandbox)')}</option></select></label>
            <label>{tr('配置 Profile','Configuration profile')}<input value={options.profile} onChange={(event) => updateAgentSetting('codex', { profile: event.target.value })} placeholder={tr('可选','Optional')} /></label>
            <label className="inline-checkbox"><input type="checkbox" checked={options.ephemeral !== false} onChange={(event) => updateAgentSetting('codex', { ephemeral: event.target.checked })} />{tr('临时会话','Ephemeral session')}</label>
          </div>
          {options.accessMode === 'full-access' && <p className="permission-warning">{tr('完全访问会跳过沙箱和单次审批，仅在你信任任务与工作目录时使用。','Full access skips the sandbox and per-action approvals. Use it only for trusted tasks and directories.')}</p>}
        </>}
        {actionRunner === 'claude' && <div className="inline-option-grid two-column">
          <label>{tr('模型','Model')}<input value={options.model} onChange={(event) => updateAgentSetting('claude', { model: event.target.value })} placeholder={tr('使用默认模型','Use default model')} /></label>
          <label>{tr('权限模式','Permission mode')}<select value={options.permissionMode} onChange={(event) => updateAgentSetting('claude', { permissionMode: event.target.value })}><option value="default">{tr('默认','Default')}</option><option value="plan">{tr('计划模式','Plan mode')}</option><option value="acceptEdits">{tr('自动接受编辑','Accept edits automatically')}</option><option value="bypassPermissions">{tr('完全访问','Full access')}</option></select></label>
          <label>{tr('最大轮数','Maximum turns')}<input type="number" min="1" max="200" value={options.maxTurns} onChange={(event) => updateAgentSetting('claude', { maxTurns: event.target.value })} placeholder={tr('不限','No limit')} /></label>
          <label className="inline-checkbox"><input type="checkbox" checked={!!options.verbose} onChange={(event) => updateAgentSetting('claude', { verbose: event.target.checked })} />{tr('详细日志','Verbose logs')}</label>
        </div>}
        {actionRunner === 'deepseek' && <div className="inline-option-grid two-column">
          <label>{tr('配置档','Profile')}<input value={options.profile} disabled /></label>
          <label>{tr('推理策略','Reasoning strategy')}<select value={options.reasoning} onChange={(event) => updateAgentSetting('deepseek', { reasoning: event.target.value })}><option value="low">{tr('低','Low')}</option><option value="medium">{tr('中','Medium')}</option><option value="high">{tr('高','High')}</option><option value="max">{tr('最高','Max')}</option></select></label>
          <label className="inline-checkbox full-row"><input type="checkbox" checked={options.thinking} onChange={(event) => updateAgentSetting('deepseek', { thinking: event.target.checked })} />{tr('要求充分思考后再执行','Require extended thinking before execution')}</label>
        </div>}
        <div className="inline-workspace"><div><small>{tr('工作目录','Working directory')}</small><strong title={workspace}>{workspace ? workspace.split(/[\\/]/).pop() : tr('使用 Wendaflow 默认目录','Use Wendaflow default directory')}</strong></div><button onClick={() => pickWorkspaceDirectory(true)}>{tr('选择文件夹','Choose folder')}</button>{actionWorkspace && <button className="clear-workspace" onClick={() => setActionWorkspace('')}>{tr('使用画布目录','Use canvas directory')}</button>}</div>
        <footer><span>{tr('点击发送即授权并立即执行','Sending authorizes immediate execution')}</span><button onClick={() => setActionOptionsOpen(false)}>{tr('完成','Done')}</button></footer>
      </div>}
    </div>;
  }

  function renderConversationControls() {
    const profile = model.startsWith('cloud:') ? cloudProfiles.find((item) => item.id === model.slice(6)) : localProfiles.find((item) => item.id === model.slice(6));
    const options = normalizeChatOptions(profile?.chatOptions || {});
    const reasoningDisabled = options.reasoning === 'none';
    const reasoningLabel = ({none:tr('已关闭','Off'),low:tr('低','Low'),medium:tr('中','Medium'),high:tr('高','High')}[options.reasoning] || options.reasoning);
    const summary = `${reasoningDisabled || !options.thinking ? tr('直接回答','Direct answer') : tr('思考开启','Thinking on')} · ${reasoningLabel}`;
    return <div className="inline-agent-config conversation-config">
      <button className={`agent-summary-button ${chatOptionsOpen ? 'active' : ''}`} onClick={() => setChatOptionsOpen((value) => !value)}><span>{summary}</span><i>⌄</i></button>
      {chatOptionsOpen && <div className="agent-config-popover chat-config-popover">
        <header><div><small>{tr('本次对话配置','Conversation settings')}</small><strong>{profile?.name || tr('当前模型','Current model')}</strong></div><button onClick={() => setChatOptionsOpen(false)}>×</button></header>
        <div className="inline-option-grid two-column">
          <label>{tr('推理强度','Reasoning effort')}<select value={options.reasoning} onChange={(event) => { const reasoning = event.target.value; updateConversationOptions({ reasoning, thinking: reasoning !== 'none' }); }}><option value="none">{tr('已关闭','Off')}</option><option value="low">{tr('低','Low')}</option><option value="medium">{tr('中','Medium')}</option><option value="high">{tr('高','High')}</option></select></label>
          <label>{tr('创造性','Creativity')}<select value={String(options.temperature)} onChange={(event) => updateConversationOptions({ temperature: Number(event.target.value) })}><option value="0.2">{tr('精确','Precise')}</option><option value="0.7">{tr('平衡','Balanced')}</option><option value="1">{tr('发散','Creative')}</option></select></label>
          <label className="inline-checkbox full-row"><input type="checkbox" checked={!reasoningDisabled && !!options.thinking} onChange={(event) => updateConversationOptions(event.target.checked ? { thinking: true, reasoning: options.reasoning === 'none' ? 'low' : options.reasoning } : { thinking: false, reasoning: 'none' })} />{tr('开启模型的深度思考（若该模型支持）','Enable extended thinking when supported')}</label>
        </div>
        <footer><span>{tr('配置会记住，并随当前模型使用','Settings are remembered for the current model')}</span><button onClick={() => setChatOptionsOpen(false)}>{tr('完成','Done')}</button></footer>
      </div>}
    </div>;
  }

  const syncNotificationState = (ids, action = 'read') => { if (!notificationSettings.deviceKey) return; fetch(`${OFFICIAL_NOTIFICATION_SERVER}/v1/client/notifications/state`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deviceId: notificationSettings.deviceId, deviceKey: notificationSettings.deviceKey, ids, action }) }).catch(() => {}); };
  const markNotificationRead = (notice) => { setNotifications((items) => items.map((item) => item.id === notice.id ? { ...item, read: true } : item)); syncNotificationState([notice.id], 'read'); };
  const openNotificationDetail = (notice) => {
    setNotificationsOpen(false);
    setNotificationToast(null);
    setNotificationDetail(notice);
    if (!notice.requiresAcknowledgement) markNotificationRead(notice);
    if (notice.canvasId && canvases.some((canvas) => canvas.id === notice.canvasId)) switchCanvas(notice.canvasId);
    if (notice.nodeId) setSelectedId(notice.nodeId);
  };
  const confirmNotification = (notice) => {
    markNotificationRead(notice);
    setNotificationToast(null);
    setNotificationDetail(null);
  };
  const activateLicense = async () => {
    const code = activationCode.trim();
    if (!code) { setLicenseStatus(tr('请输入激活码。','Enter an activation code.')); return; }
    setLicenseBusy(true); setLicenseStatus(tr('正在激活…','Activating…'));
    try {
      const response = await fetch(`${OFFICIAL_NOTIFICATION_SERVER}/v1/licenses/activate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, deviceId: notificationSettings.deviceId, appVersion: APP_VERSION }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || tr('激活失败。','Activation failed.'));
      setLicense({ ...result.license, lastValidatedAt: new Date().toISOString() }); setActivationCode(''); setLicenseStatus(tr('激活成功，授权已绑定到这台设备。','Activated successfully and bound to this device.'));
    } catch (error) { setLicenseStatus(error.message || tr('激活失败。','Activation failed.')); } finally { setLicenseBusy(false); }
  };
  const deactivateLicense = () => { setLicense(null); setLicenseStatus(tr('已移除此设备上的授权。你可以稍后重新激活。','License removed from this device. You can activate again later.')); };

  return (
    <div className="app-shell">
      {storageWarning && <div className="storage-warning" role="status">{systemText(storageWarning)}<button onClick={() => setStorageWarning('')} aria-label={tr('关闭提示','Dismiss message')}>×</button></div>}
      {notificationDetail && <div className="modal-backdrop notification-detail-backdrop" onPointerDown={(event) => { if (!notificationDetail.requiresAcknowledgement && event.target === event.currentTarget) setNotificationDetail(null); }}><section className="notification-detail-card" role="dialog" aria-modal="true" aria-label={notificationDetail.title}><header><div><small>{notificationDetail.kind === 'update' ? tr('版本更新','Version update') : tr('通知详情','Notification details')}</small><h2>{notificationDetail.title}</h2></div>{!notificationDetail.requiresAcknowledgement && <button onClick={() => setNotificationDetail(null)} aria-label={tr('关闭','Close')}>×</button>}</header><div className="notification-detail-content"><p>{notificationDetail.body}</p><time>{new Date(notificationDetail.createdAt).toLocaleString(uiLanguage)}</time></div><footer>{notificationDetail.downloadUrl && <button onClick={() => openExternalUrl(notificationDetail.downloadUrl)}>{tr('打开下载页','Open download page')}</button>}<button className="primary" onClick={() => confirmNotification(notificationDetail)}>{notificationDetail.requiresAcknowledgement ? tr('确认','Acknowledge') : tr('完成','Done')}</button></footer></section></div>}
      <header className="topbar">
        <div className="brand-mark" aria-label="Wendaflow">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <path d="M6.5 8.5v6.2c0 5.9 3 8.8 6.6 8.8 2.2 0 3.4-1.2 3.4-3.3V8.5m0 8.2c0 4.5 1.4 6.8 4.1 6.8 3 0 4.9-2.8 4.9-8.8V8.5" />
            <circle cx="6.5" cy="7" r="1.5" /><circle cx="16.5" cy="7" r="1.5" /><circle cx="25.5" cy="7" r="1.5" />
          </svg>
        </div>
        <div className="project-block"><strong>Wendaflow</strong><span>{tr('让对话自由分岔','Let conversations branch freely')}</span></div>
        <div className="canvas-tabs" aria-label={tr('画布标签栏','Canvas tabs')} onWheel={(event) => { const delta = event.deltaY || event.deltaX; if (!delta) return; event.preventDefault(); event.stopPropagation(); event.currentTarget.scrollLeft += delta; }}>{canvases.map((canvas) => <button key={canvas.id} className={canvas.id === activeCanvasId ? 'active' : ''} onClick={() => switchCanvas(canvas.id)} onDoubleClick={(event) => { event.stopPropagation(); setEditingCanvasId(canvas.id); }}>{editingCanvasId === canvas.id ? <input autoFocus value={canvas.name} onClick={(event) => event.stopPropagation()} onChange={(event) => renameCanvas(canvas.id, event.target.value)} onBlur={() => { if (!canvas.name.trim()) renameCanvas(canvas.id, tr('未命名画布','Untitled canvas')); setEditingCanvasId(null); }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} /> : <span title={tr('双击重命名','Double-click to rename')}>{canvas.name}</span>}<i onClick={(event) => closeCanvas(canvas.id, event)}>×</i></button>)}<button className="new-tab" aria-label={tr('新建画布','New canvas')} title={tr('新建画布','New canvas')} onClick={createCanvas}>＋</button></div>
        <div className="window-drag-strip" aria-label={tr('拖动窗口','Drag window')} title={tr('拖动窗口','Drag window')} onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); window.wonderfulWindow?.beginDrag?.(event.screenX, event.screenY); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) window.wonderfulWindow?.moveDrag?.(event.screenX, event.screenY); }} onPointerUp={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); window.wonderfulWindow?.endDrag?.(); }} onPointerCancel={() => window.wonderfulWindow?.endDrag?.()} />
        <div className="topbar-actions">
          <div className="notification-anchor">
            <button className={`quiet-button notification-button ${notificationsOpen ? 'active' : ''}`} aria-label={tr('通知','Notifications')} onClick={() => setNotificationsOpen((value) => !value)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>{notifications.filter((item) => !item.read).length > 0 && <b>{Math.min(99, notifications.filter((item) => !item.read).length)}</b>}</button>
            {notificationToast && <section className={`notification-toast ${notificationToast.requiresAcknowledgement ? 'requires-confirmation' : ''}`} role="status" onClick={() => openNotificationDetail(notificationToast)}><i>{notificationToast.kind === 'update' ? '↑' : '●'}</i><div><strong>{notificationToast.title}</strong><p>{notificationToast.body}</p></div>{!notificationToast.requiresAcknowledgement && <button aria-label={tr('关闭','Close')} onClick={(event) => { event.stopPropagation(); setNotificationToast(null); }}>×</button>}</section>}
            {notificationsOpen && <section className="notification-center" onPointerDown={(event) => event.stopPropagation()}>
              <header><div><small>{tr('通知中心','Notification center')}</small><strong>{tr('应用内通知','In-app notifications')}</strong></div><button onClick={() => setNotificationsOpen(false)} aria-label={text('close')}>×</button></header>
              <div className="notification-list">{notifications.length ? notifications.map((notice) => <button key={notice.id} className={notice.read ? 'read' : ''} onClick={() => openNotificationDetail(notice)}><i>{notice.kind === 'error' ? '!' : notice.kind === 'action' ? '↗' : notice.requiresAcknowledgement ? '✓' : '•'}</i><span><strong>{notice.title}</strong><small>{notice.body}</small><em>{new Date(notice.createdAt).toLocaleString(uiLanguage)}</em></span></button>) : <p>{tr('目前没有通知。软件运行时会在这里接收任务结果、公告和异常提醒。','No notifications yet. While the app is running, task results, announcements, and alerts will appear here.')}</p>}</div>
              {!!notifications.length && <footer><button onClick={() => { setNotifications((items) => items.map((item) => ({ ...item, read: true }))); syncNotificationState([], 'read'); }}>{tr('全部标为已读','Mark all as read')}</button><button onClick={() => { syncNotificationState([], 'dismiss'); setNotifications([]); }}>{tr('清除全部','Clear all')}</button></footer>}
            </section>}
          </div>
          <button className={`quiet-button save-button ${saveStatus === '保存中…' ? 'saving' : saveStatus === '已保存' ? 'saved' : saveStatus === '保存失败' ? 'failed' : ''}`} disabled={saveStatus === '保存中…'} onClick={saveCanvas}>{saveStatus === '保存中…' ? text('saving') : saveStatus === '已保存' ? text('saved') : saveStatus === '保存失败' ? text('saveFailed') : text('save')}</button>
          <button className="quiet-button" onClick={fitView}>{text('fitCanvas')}</button>
          <button className="quiet-button" onClick={autoLayout}>{text('autoLayout')}</button>
          <button className={minimapOpen ? 'quiet-button active' : 'quiet-button'} onClick={() => setMinimapOpen((value) => !value)}>{text('minimap')}</button>
          <button className={focusMode ? 'quiet-button active' : 'quiet-button'} onClick={() => setFocusMode((value) => !value)}>{text('focusPath')}</button>
          <div className="window-controls"><button aria-label={tr('最小化','Minimize')} onClick={() => window.wonderfulWindow?.minimize?.()}>—</button><button aria-label={tr('切换窗口大小','Toggle window size')} onClick={() => window.wonderfulWindow?.maximize?.()}>□</button><button className="window-close" aria-label={tr('关闭 Wendaflow','Close Wendaflow')} onClick={() => window.wonderfulWindow?.close?.()}>×</button></div>
        </div>
      </header>

      <nav className="rail" aria-label={tr('主导航','Main navigation')}>
        <button className={`rail-button ${canvasMenuOpen ? 'active' : ''}`} aria-label={text('allCanvases')} onClick={() => { if (!canvasMenuOpen) refreshSavedCanvases(); toggleFloatingPanel('canvas', canvasMenuOpen, setCanvasMenuOpen); setSearchOpen(false); setLibraryOpen(false); }}>⌘</button>
        <button className={`rail-button search-rail ${searchOpen ? 'active' : ''}`} aria-label={text('search')} onClick={() => { toggleFloatingPanel('search', searchOpen, setSearchOpen); setCanvasMenuOpen(false); setLibraryOpen(false); }}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4 4"/></svg></button>
        <button className={`rail-button ${libraryOpen ? 'active' : ''}`} aria-label={text('library')} onClick={() => { toggleFloatingPanel('library', libraryOpen, setLibraryOpen); setSearchOpen(false); setCanvasMenuOpen(false); }}>▱</button>
        <div className="rail-spacer" />
        <button className="rail-button" aria-label={text('settings')} onPointerDown={(event) => { event.stopPropagation(); openSettings(); }} onClick={openSettings}>⚙</button>
      </nav>

      {canvasMenuOpen && <section className={`canvas-overview ${closingPanels.has('canvas') ? 'closing' : ''}`} aria-label={text('allCanvases')}>
        <header><div><span>{text('localArchives')}</span><h2>{text('savedCanvases')}</h2></div><div className="overview-header-actions"><button onClick={() => canvasImportRef.current?.click()}>{text('importWdf')}</button><button aria-label={text('close')} onClick={() => closeFloatingPanel('canvas', setCanvasMenuOpen)}>×</button></div></header>
        <button className="create-canvas-row" onClick={createCanvas}><i>＋</i><span><strong>{text('createCanvas')}</strong><small>{text('createCanvasHint')}</small></span></button>
        {canvasLibraryStatus && <p className="canvas-library-status">{systemText(canvasLibraryStatus)}</p>}
        <div className="canvas-overview-list">{savedCanvases.map((canvas) => <article key={canvas.id} className={canvas.id === activeCanvasId ? 'active' : ''} onClick={() => openSavedCanvas(canvas.id)}>
          <div className="canvas-overview-icon">{canvas.name.trim().slice(0, 1) || '▱'}</div>
          <div className="canvas-overview-info"><strong>{canvas.name}</strong><small>{tr('创建于','Created')} {formatCanvasTime(canvas.createdAt, uiLanguage)} · {tr('编辑于','Edited')} {formatCanvasTime(canvas.updatedAt, uiLanguage)} · {canvas.nodeCount} {tr('个节点','nodes')}</small></div>
          {canvas.id === activeCanvasId && <em>{tr('当前','Current')}</em>}<button className="delete-saved-canvas" aria-label={`${tr('删除本地存档','Delete local archive')} ${canvas.name}`} title={tr('删除本地存档','Delete local archive')} onClick={(event) => { event.stopPropagation(); deleteSavedCanvas(canvas.id); }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5"/></svg></button>
        </article>)}{!canvasLibraryStatus && !savedCanvases.length && <div className="no-saved-canvases">{tr('还没有保存过画布。打开一个标签并点击右上角“保存”。','No saved canvases yet. Open a tab and click Save in the upper-right corner.')}</div>}</div>
        <input ref={canvasImportRef} type="file" accept=".wdf,application/x-branchspace-wdf" hidden onChange={importProject} />
      </section>}

      <main
        ref={canvasRef} data-drop-label={tr("松开以添加文件","Release to add files")} data-drop-hint={tr("支持图片、文档、代码与其他附件","Images, documents, code, and other attachments")}
        className={`canvas ${panning ? 'panning' : ''} ${marquee ? 'marquee-active' : ''} ${canvasFileDragActive ? 'file-drag-active' : ''} ${canvasTransition ? `canvas-${canvasTransition}` : ''}`}
        onPointerDown={beginPan}
        onPointerMove={movePointer}
        onPointerUp={endPointer}
        onPointerLeave={endPointer}
        onWheel={zoomCanvas}
        onDoubleClick={handleCanvasDoubleClick}
        onContextMenu={(event) => event.preventDefault()}
        onDragEnter={handleCanvasDragEnter}
        onDragOver={handleCanvasDragOver}
        onDragLeave={handleCanvasDragLeave}
        onDrop={handleCanvasDrop}
      >
        <div className="canvas-hint">{copy.canvasHint}</div>
        {selectedIds.size > 1 && <div className="multi-selection-count">{tr(`已选择 ${selectedIds.size} 个节点 · 可一起拖动或删除`,`${selectedIds.size} nodes selected · Drag or delete them together`)}</div>}
        {!nodes.length && <div className="empty-welcome"><strong>{copy.empty}</strong><span>{copy.emptyHint}</span></div>}
        {marquee && <div className="selection-marquee" style={{ left: Math.min(marquee.startX, marquee.x), top: Math.min(marquee.startY, marquee.y), width: Math.abs(marquee.x - marquee.startX), height: Math.abs(marquee.y - marquee.startY) }} />}
        <svg ref={connectionsRef} className="connections" style={{ transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})` }}>
          <defs>
            <marker id="connection-arrow" viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="5.5" markerHeight="5.5" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 1 L 9 5 L 0 9 z" className="connection-arrowhead" />
            </marker>
          </defs>
          {renderedNodes.flatMap((source) => [
            ...(source.links || []).map((targetId) => ({ source, target: nodes.find((item) => item.id === targetId), type: 'reference' })),
            ...(source.relations || []).map((relation) => ({ source, target: nodes.find((item) => item.id === relation.targetId), type: relation.type || 'reference', relationId: relation.id })),
          ]).map(({ source, target, type, relationId }, index) => {
            if (!target) return null;
            const sourceSize = nodeSizes.get(source.id) || { width: 224, height: 110 };
            const targetSize = nodeSizes.get(target.id) || { width: 224, height: 110 };
            const x1 = source.x + sourceSize.width / 2, y1 = source.y + sourceSize.height;
            const x2 = target.x + targetSize.width / 2, y2 = target.y;
            const bend = Math.max(46, Math.abs(y2 - y1) * .36);
            const deletingRelation = removingRelation && removingRelation.sourceId === source.id && removingRelation.targetId === target.id;
            const connectionKey = `relation:${source.id}:${target.id}:${type}`;
            return <path key={relationId || `link-${source.id}-${target.id}-${type}-${index}`} data-connection-key={connectionKey} data-connection-kind="relation" data-source-id={source.id} data-target-id={target.id} data-connection-type={type} markerEnd="url(#connection-arrow)" className={`connection relation-connection ${type} ${selectedConnections.some((item) => item.key === connectionKey) ? 'line-selected' : ''} ${deletingRelation ? 'deleting' : ''}`} d={`M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`} onClick={(event) => { event.stopPropagation(); setRelationEditorClosing(false); setEditingRelation({ sourceId: source.id, targetId: target.id, type }); }} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setContextMenu({ kind: 'relation', sourceId: source.id, targetId: target.id, type, x: event.clientX, y: event.clientY }); }} />;
          })}
          {renderedNodes.filter((node) => node.parentId).map((node) => {
            const parent = nodes.find((item) => item.id === node.parentId);
            if (!parent) return null;
            const parentSize = nodeSizes.get(parent.id) || { width: 224, height: 110 };
            const nodeSize = nodeSizes.get(node.id) || { width: 224, height: 110 };
            const x1 = parent.x + parentSize.width;
            const y1 = parent.y + parentSize.height / 2;
            const x2 = node.x;
            const y2 = node.y + nodeSize.height / 2;
            const mid = (x1 + x2) / 2;
            const active = activeIds.has(parent.id) && activeIds.has(node.id);
            const folding = foldingId && isDescendant(nodes, node.id, foldingId);
            const revealing = (revealingId && isDescendant(nodes, node.id, revealingId)) || restoringIds.has(node.id);
            const deleting = deletingIds.has(node.id) || deletingIds.has(parent.id);
            const connectionKey = `parent:${parent.id}:${node.id}`;
            return <path key={node.id} data-parent-id={parent.id} data-child-id={node.id} data-connection-key={connectionKey} data-connection-kind="parent" pathLength="1" markerEnd="url(#connection-arrow)" className={`${active ? 'connection active' : 'connection'} ${selectedConnections.some((item) => item.key === connectionKey) ? 'line-selected' : ''} ${node.id === newNodeId ? 'newborn' : ''} ${folding ? 'folding' : ''} ${revealing ? 'revealing' : ''} ${deleting ? 'deleting' : ''}`} d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); setContextMenu({ kind: 'parent', childId: node.id, x: event.clientX, y: event.clientY }); }} />;
          })}
        </svg>
        {lineSelectionMenu && selectedConnections.length > 0 && <section className="line-selection-menu" onPointerDown={(event) => event.stopPropagation()}><span>{tr(`已选 ${selectedConnections.length} 条连线`,`${selectedConnections.length} connections selected`)}</span><small>{selectedConnections.some((item) => item.kind === 'parent') ? tr('包含继承关系；删除会解除父子继承。','Includes inheritance links; deleting removes the parent-child relationship.') : tr('可批量移除引用或合并关系。','Remove reference or merge links in a batch.')}</small><div><button onClick={() => { setSelectedConnections([]); setLineSelectionMenu(null); }}>{tr('取消','Cancel')}</button><button className="danger" onClick={() => removeConnections()}>{tr('删除连线','Delete links')}</button></div></section>}
        <div ref={worldRef} className="world" style={{ transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`, '--semantic': previewEnabled ? semanticPreview(viewport.zoom) : 0 }}>
          {renderedNodes.map((node) => {
            const selectedNode = selectedIds.has(node.id) && !inspectorClosing;
            const muted = focusMode && !activeIds.has(node.id);
            // There is one semantic preview layout. Going further out scales
            // the canvas itself, but never switches cards into a second,
            // differently shaped compact preview.
            const detailLevel = previewEnabled && viewport.zoom < 0.54 ? 'summary' : 'full';
            const readingSize = node.manualWidth ? 'manual-size' : node.content.length > 650 ? 'long-answer' : node.content.length > 220 ? 'medium-answer' : 'short-answer';
            const artifacts = node.type === 'action' ? actionArtifacts(node) : [];
            const liveEvents = node.type === 'action' ? (node.execution?.events || []).slice(-18) : [];
            const activityCollapsed = node.execution?.activityCollapsed !== false;
            const displayTitle = node.title || node.prompt || node.content || tr('未命名节点', 'Untitled node');
            const longPreviewTitle = [...(displayTitle || '')].length > 13;
            // Let CSS interpolate these dimensions from --semantic. Updating
            // a CSS variable on the world every animation frame is smoother
            // than waiting for React's deliberately throttled viewport render.
            const fullWidth = node.manualWidth || (node.content.length > 650 ? 380 : node.content.length > 220 ? 290 : longPreviewTitle ? 292 : 224);
            const previewWidth = Math.min(fullWidth, longPreviewTitle ? fullWidth : 184);
            // Preview cards are title-first.  Work out the space the actual
            // preview title needs instead of relying on a fixed two-line box:
            // action titles are commonly long and were being clipped by that
            // old constraint.
            const previewTitleLines = Math.min(4, Math.max(1, Math.ceil([...displayTitle].length / Math.max(7, Math.floor((previewWidth - 30) / 22)))));
            const previewHeight = longPreviewTitle ? Math.min(224, 84 + previewTitleLines * 32) : 110;
            const previewFullHeight = previewFullSizes.get(node.id)?.height || (node.content.length > 650 ? 390 : node.content.length > 220 ? 285 : 180);
            const childCount = nodes.filter((item) => item.parentId === node.id).length;
            const hiddenCount = nodes.filter((item) => isDescendant(nodes, item.id, node.id)).length;
            const showNodeThinking = shouldShowNodeThinking(node);
            const folding = foldingId && isDescendant(nodes, node.id, foldingId);
            const revealing = (revealingId && isDescendant(nodes, node.id, revealingId)) || restoringIds.has(node.id);
            return (
              <article
                key={node.id}
                data-node-id={node.id}
                data-node-x={node.x}
                data-node-y={node.y}
                className={`node ${node.type} ${readingSize} ${previewLayoutActive && !node.manualWidth ? 'preview-reserve' : ''} ${node.color ? 'colored' : ''} ${longPreviewTitle ? 'preview-long-title' : ''} ${selectedNode ? 'selected' : ''} ${node.id === selectedId && selectedIds.size > 1 ? 'primary-selected' : ''} ${muted ? 'muted' : ''} ${dragging?.ids?.includes(node.id) ? 'dragging' : ''} ${resizing?.id === node.id ? 'resizing' : ''} ${editingNode === node.id ? 'inline-editing' : ''} ${node.id === newNodeId ? 'newborn' : ''} ${folding ? 'folding' : ''} ${revealing ? 'revealing' : ''} ${deletingIds.has(node.id) ? 'deleting' : ''} ${detailLevel}`}
                style={{ transform: `translate(${node.x}px, ${node.y}px)`, '--full-width': `${fullWidth}px`, '--preview-width': `${previewWidth}px`, '--preview-height': `${previewHeight}px`, '--preview-title-height': `${previewTitleLines * 1.2}em`, '--full-card-height': `${Math.max(previewHeight, previewFullHeight)}px`, '--preview-content-top': `${longPreviewTitle ? 96 : 69}px`, ...(node.color ? { '--node-tint': node.color } : {}), ...(node.manualWidth ? { '--full-height': `${node.manualHeight || 110}px`, '--full-read-height': `${Math.max(0, (node.manualHeight || 110) - 82)}px` } : {}), ...(editingNode === node.id && inlineEditSize ? { '--edit-width': `${inlineEditSize.width}px`, '--edit-height': `${inlineEditSize.height}px` } : {}) }}
                onPointerDown={(event) => beginNodeDrag(event, node)}
                onClick={(event) => { event.stopPropagation(); closeBranch(); }}
                onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); selectNode(node.id); startEditingNode(node); }}
                onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); if (Date.now() < suppressContextMenuUntilRef.current) return; selectNode(node.id); setContextMenu({ kind: 'node', nodeId: node.id, x: event.clientX, y: event.clientY }); }}
              >
                <div className="node-topline">
                  <span className="node-kind">{node.type === 'action' ? copy.action : node.type === 'thought' ? copy.idea : node.model}</span>
                  <span className="node-flags">{node.favorite && '★'}{node.completed && '✓'}</span>
                  {(node.type === 'action' || ['running', 'queued', 'thinking', 'streaming', 'failed', 'stopped'].includes(node.status)) && <span className={`status ${node.status}`}>{statusLabel(node.status, uiLanguage)}</span>}
                </div>
                {!!outputAssets(node.content).length && <div className="output-assets">{outputAssets(node.content).map((asset) => <a key={asset.url} href={asset.url} target="_blank" rel="noreferrer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (node.type !== 'action') return; const artifact = artifacts.find((item) => item.href === asset.url || item.name === asset.name); if (!artifact) return; event.preventDefault(); openActionArtifact(artifact); }}><span>{asset.image ? tr('图','IMG') : tr('档','FILE')}</span>{asset.name}</a>)}</div>}
                {editingNode === node.id ? <div className="inline-node-editor" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} onWheel={handleContentWheel}><input autoFocus aria-label={tr('卡片标题','Card title')} value={editDraft.title} onChange={(event) => setEditDraft((value) => ({ ...value, title: event.target.value }))} /><textarea aria-label={tr('卡片正文','Card body')} value={editDraft.content} onChange={(event) => setEditDraft((value) => ({ ...value, content: event.target.value }))} /><div><button onClick={() => { setEditingNode(null); setInlineEditSize(null); }}>{tr('取消','Cancel')}</button><button className="save" onClick={saveNodeEdit}>{tr('完成','Done')}</button></div></div> : <h2>{displayTitle}</h2>}
                {node.type === 'conversation' && ['queued', 'thinking', 'streaming'].includes(node.status) && <div className={`generation-progress ${node.status}`}><i />{node.generationPhase ? (systemText(node.generationPhase)) : (node.status === 'queued' ? tr('请求正在排队…','Request queued…') : node.status === 'thinking' ? tr('正在思考与整理上下文…','Thinking and preparing context…') : tr('模型正在逐字输出…','Streaming response…'))}</div>}
                {!!node.tags?.length && <div className="node-tags">{node.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
                {editingNode !== node.id && previewContentPhase !== 'hidden' && <div className={`markdown-content preview-content-${previewContentPhase}`} onWheel={handleContentWheel}>
                  {(node.type !== 'thought' || node.content !== displayTitle) && <ReactMarkdown remarkPlugins={[remarkGfm]} components={{ a: ({ href, children, ...props }) => <a {...props} href={href} onClick={(event) => { if (node.type !== 'action') return; const label = String(children || ''); const artifact = artifacts.find((item) => item.href === href || item.name === label); if (!artifact) return; event.preventDefault(); event.stopPropagation(); openActionArtifact(artifact); }}>{children}</a> }}>{node.content}</ReactMarkdown>}
                  {showNodeThinking && <details className="thinking-output"><summary>{tr('模型思考过程','Model reasoning')}</summary><pre>{node.thinking}</pre></details>}
                  {!!node.attachments?.length && <div className="node-attachments">
                    {node.attachments.map((item) => {
                      if (item.dataUrl?.startsWith('data:image/')) return <a key={item.id} className="image-attachment" href={item.dataUrl} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); openLibraryItem(item); }}><img src={item.dataUrl} alt={item.name} /><span>{item.name} · {tr('用系统查看器打开','Open in system viewer')}</span></a>;
                      if (item.text) return <div key={item.id} className="code-attachment"><strong>{item.name}</strong><pre>{item.text.slice(0, 900)}</pre></div>;
                      if (item.dataUrl) return <a key={item.id} className="file-attachment" href={item.dataUrl} download={item.name} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}><strong>▱ {item.name}</strong><small>{Math.ceil(item.size / 1024)} KB · {tr('点击下载','Click to download')}</small></a>;
                      return <div key={item.id} className="file-attachment"><strong>▱ {item.name}</strong><small>{Math.ceil(item.size / 1024)} KB</small></div>;
                    })}
                  </div>}
                </div>}
                {node.type === 'action' && liveEvents.length > 0 && <section className={`action-live-feed ${activityCollapsed ? 'collapsed' : ''}`}><header><button className="activity-toggle" aria-expanded={!activityCollapsed} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setNodes((items) => items.map((item) => item.id === node.id ? { ...item, execution: { ...(item.execution || {}), activityCollapsed: !(item.execution?.activityCollapsed !== false) } } : item)); }}><span>{tr('行动动态','Action activity')}</span><small>{activityCollapsed ? tr(`${liveEvents.length} 条记录 · 已折叠`,`${liveEvents.length} entries · collapsed`) : node.status === 'running' ? tr('实时更新','Live updates') : tr('执行记录','Execution record')}</small><i>⌄</i></button></header><div>{liveEvents.map((event) => <article key={event.id} className={event.type}><i>{event.type === 'thinking' ? tr('思','TH') : event.type === 'command' ? '›_' : event.type === 'file' ? tr('文','FI') : event.type === 'message' ? tr('答','RE') : '·'}</i><span><strong>{event.type === 'thinking' ? tr('正在思考','Thinking') : event.type === 'command' ? tr('运行命令','Running command') : event.type === 'file' ? tr('修改文件','Changing files') : event.type === 'message' ? tr('阶段结果','Step result') : event.type === 'stderr' ? tr('终端错误','Terminal error') : tr('终端输出','Terminal output')}</strong><small>{event.text}</small></span></article>)}</div>{node.execution?.terminal && <details className="action-terminal"><summary>{tr('完整终端输出','Full terminal output')}</summary><pre>{node.execution.terminal}</pre></details>}</section>}
                {node.type === 'action' && <section className={`action-artifacts ${artifacts.length ? '' : 'empty'}`}><header><span>{tr('产物','Artifacts')}</span><small>{artifacts.length ? `${artifacts.length} ${tr('项','items')}` : node.status === 'running' ? tr('正在收集…','Collecting…') : tr('暂无','None')}</small></header>{artifacts.length > 0 && <div>{artifacts.map((artifact) => artifact.href || artifact.localPath ? <div className="artifact-item" key={artifact.id} onPointerDown={(event) => event.stopPropagation()}><i>{artifact.image ? tr('图','IMG') : tr('档','FILE')}</i><span><strong>{artifact.name}</strong><small>{systemText(artifact.state)}</small></span><button title={tr('下载到指定位置','Download to a selected location')} onClick={(event) => { event.stopPropagation(); downloadActionArtifact(artifact); }}>↓</button><button title={tr('用系统默认程序打开','Open with the default app')} onClick={(event) => { event.stopPropagation(); openActionArtifact(artifact); }}>↗</button></div> : <div key={artifact.id}><i>{tr('文','DOC')}</i><span><strong>{artifact.name}</strong><small>{systemText(artifact.state)}</small></span></div>)}</div>}</section>}
                {['running', 'queued', 'thinking', 'streaming'].includes(node.status) && <button className="stop-generation" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); node.type === 'action' ? stopAgentJob(node) : stopGeneration(node.id); }}>{tr('停止','Stop')}</button>}
                <button className="resize-handle" aria-label={tr('调整卡片大小','Resize card')} onPointerDown={(event) => beginResize(event, node)} />
                <button className="relation-handle" aria-label={tr('拖出关系线','Create relation')} title={tr('拖到另一个节点，选择继承、引用或合并','Drag to another node, then choose inherit, reference, or merge')} onPointerDown={(event) => beginRelationDrag(event, node)}>⌁</button>
                {childCount > 0 && <button className={`collapse-button ${collapsedIds.has(node.id) ? 'collapsed' : ''}`} aria-label={collapsedIds.has(node.id) ? tr(`展开分支，包含 ${hiddenCount} 个节点`,`Expand branch (${hiddenCount} nodes)`) : tr(`折叠分支，包含 ${hiddenCount} 个节点`,`Collapse branch (${hiddenCount} nodes)`)} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); toggleCollapse(node.id); }}>{collapsedIds.has(node.id) ? `+${hiddenCount}` : '−'}</button>}
                <button className={`fork-button ${branchingFrom === node.id ? 'armed' : ''}`} aria-label={branchingFrom === node.id ? tr('取消创建分支','Cancel branch') : tr('从这里创建分支','Branch from here')} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); startBranch(node); }}><span>{branchingFrom === node.id ? '✓' : '＋'}</span></button>
                {branchingFrom === node.id && <div className="branch-feedback">{tr('已选为分叉起点','Selected as branch origin')}</div>}
              </article>
            );
          })}
          {mindMapState.nodeId && mindMapState.suggestions.map((title, index) => {
            const parent = nodes.find((node) => node.id === mindMapState.nodeId);
            if (!parent) return null;
            const parentSize = nodeSizes.get(parent.id) || { width: parent.manualWidth || 224, height: parent.manualHeight || 110 };
            const kept = mindMapState.selected.includes(title);
            const kind = {ideas:copy.idea,counterpoints:tr('反驳','Counterpoint'),actions:copy.action,questions:tr('问题','Question')}[mindMapState.mode] || tr('问题','Question');
            return <article key={`candidate-${title}-${index}`} className={`mindmap-candidate ${kept ? 'kept' : 'excluded'}`} style={{ transform: `translate(${parent.x + parentSize.width + 96}px, ${parent.y + (index - (mindMapState.suggestions.length - 1) / 2) * 126}px)` }}><small>{tr("AI 候选 ·","AI candidate · ")}{kind}</small><strong>{title}</strong></article>;
          })}
        </div>

        {branchSource && (
          <section className={`composer ${composerClosing ? 'closing' : 'branching'} ${composerFileDragActive ? 'file-drag-active' : ''}`} data-drop-label={copy.dropChat} aria-label={tr("创建分支","Create branch")} onDragEnter={handleComposerDragEnter} onDragOver={handleComposerDragOver} onDragLeave={handleComposerDragLeave} onDrop={handleComposerDrop}>
            <div className="composer-context-row">
              <div className="composer-context">{tr(`新分支 · 从「${branchSource.title}」开始`,`New branch · from “${branchSource.title}”`)}</div>
              <button className={`context-toggle ${contextInspectorOpen ? 'active' : ''}`} onClick={() => setContextInspectorOpen((value) => !value)}>{text('context')} {contextPlan(nodes, branchSource.id, [...excludedContextIds], pendingContextRelations).length} · {tr('附件','Attachments')} {contextAttachments(nodes, branchSource.id, attachments, [...excludedContextIds], pendingContextRelations).length}</button>
              <button className="composer-close" aria-label={tr('取消创建分支','Cancel branch')} onClick={closeBranch}>×</button>
            </div>
            {contextInspectorOpen && <div className="context-inspector"><header><strong>{tr("发送前上下文检查器","Pre-send context inspector")}</strong><span>{tr("点击节点可临时排除","Click a node to exclude it temporarily")}</span></header><p className="context-summary">{tr(`当前将发送 ${contextPlan(nodes, branchSource.id, [...excludedContextIds], pendingContextRelations).length} 条上下文；已排除 ${excludedContextIds.size} 条。排除节点会同时移除它携带的附件，但不会删除画布上的关系。`,`Sending ${contextPlan(nodes, branchSource.id, [...excludedContextIds], pendingContextRelations).length} context nodes; ${excludedContextIds.size} excluded. Excluding a node also excludes its attachments, without deleting any links.`)}</p><div>{contextPlan(nodes, branchSource.id, [], pendingContextRelations).map(({ node, relation }, index) => { const excluded = excludedContextIds.has(node.id); const fileCount = (node.attachments || []).length; return <button key={node.id} className={excluded ? 'excluded' : ''} onClick={() => setExcludedContextIds((current) => { const next = new Set(current); if (next.has(node.id)) next.delete(node.id); else next.add(node.id); return next; })}><i>{excluded ? '−' : index + 1}</i><span><strong>{node.title}</strong><small>{relation === 'merge' ? tr('合并上下文',"Merged context") : relation === 'reference' ? tr('引用上下文',"Referenced context") : node.type === 'thought' ? tr('想法背景',"Idea background") : tr('继承上下文',"Inherited context")}</small></span>{fileCount > 0 && <em>{tr(`${fileCount} 个附件`,`${fileCount} attachments`)}</em>}</button>; })}</div></div>}
            <div className="branch-intents">{[[tr('继续追问',"Ask further"),tr('请沿着这里继续深入分析。',"Continue analyzing this in depth.")],[tr('换个角度',"Another angle"),tr('请换一个角度重新思考。',"Reconsider this from another perspective.")],[tr('反驳它',"Challenge this"),tr('请寻找这个观点的漏洞、反例与风险。',"Find weaknesses, counterexamples, and risks in this view.")],[tr('总结此处',"Summarize here"),tr('请总结以上上下文的核心结论。',"Summarize the key conclusions of the context above.")],[tr('变成行动',"Turn into action"),tr('请将以上内容转化为可执行步骤。',"Turn the above into actionable steps.")]].map(([label,prompt]) => <button key={label} onClick={() => { setNodeType(label === tr('变成行动',"Turn into action") ? 'action' : 'conversation'); setDraft(prompt); }}>{label}</button>)}</div>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={tr('沿着这个节点继续思考，或交给 AI 执行……','Continue from this node, or ask AI to act…')} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); createBranch(); } }} />
            {!!attachments.length && <div className="attachment-chips">{attachments.map((item) => <button key={item.id} onClick={() => setAttachments((current) => current.filter((attachment) => attachment.id !== item.id))}>{item.name}<span>×</span></button>)}</div>}
            {nodeType === 'conversation' && parallelMode && <div className="parallel-models">{modelOptions.map((item) => <button key={item.value} className={parallelModels.has(item.value) ? 'selected' : ''} onClick={() => setParallelModels((current) => { const next = new Set(current); if (next.has(item.value)) next.delete(item.value); else next.add(item.value); return next; })}>{item.label}</button>)}</div>}
            <div className="composer-bottom">
              <div className="segmented">
                {[['conversation', copy.chat], ['thought', copy.idea], ['action', copy.action]].map(([value, label]) => <button key={value} className={nodeType === value ? 'selected' : ''} onClick={() => setNodeType(value)}>{label}</button>)}
              </div>
              {nodeType === 'conversation' && <ModelPicker language={uiLanguage} value={model} onChange={(value) => { setModel(value); setChatOptionsOpen(false); }} options={modelOptions} />}
              {nodeType === 'conversation' && renderConversationControls()}
              {nodeType === 'action' && <ModelPicker language={uiLanguage} value={actionRunner} onChange={setActionRunner} options={[{ value: 'codex', label: 'Codex' }, { value: 'claude', label: 'Claude Code' }, { value: 'deepseek', label: 'DeepSeek Harness' }]} />}
              {nodeType === 'action' && renderActionControls()}
              {nodeType === 'conversation' && <button className={`parallel-toggle ${parallelMode ? 'active' : ''}`} onClick={() => setParallelMode((value) => !value)}>{tr('并行','Parallel')}</button>}
              <button className="attach-button" aria-label={copy.attach} onClick={() => attachmentRef.current?.click()}>{copy.attach}</button><input ref={attachmentRef} type="file" multiple hidden onChange={addAttachments} />
              <span className="shortcut">{copy.shortcut}</span>
              <button className="send-button" onClick={createBranch}>↑</button>
            </div>
          </section>
        )}
        {(!nodes.length || rootComposerOpen) && <section className={`composer branching empty-composer root-composer ${rootComposerClosing ? 'closing' : ''} ${composerFileDragActive ? 'file-drag-active' : ''}`} data-drop-label={copy.dropChat} aria-label={tr("创建新的起点","Create a starting point")} onDragEnter={handleComposerDragEnter} onDragOver={handleComposerDragOver} onDragLeave={handleComposerDragLeave} onDrop={handleComposerDrop}><div className="composer-context-row"><div className="composer-context">{nodes.length ? (tr('新起点 · 不继承任何上下文','New starting point · No inherited context')) : copy.newCanvas}</div>{!!nodes.length && <button className="composer-close" aria-label={tr("取消创建新起点","Cancel new starting point")} onClick={closeRootComposer}>×</button>}</div><textarea autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={nodeType === 'action' ? tr(`描述要交给${actionRunner}的任务……`,`Describe the task for ${actionRunner}…`) : nodeType === 'thought' ? copy.ideaHint : copy.rootHint} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); createFirstNode(); } }} />{!!attachments.length && <div className="attachment-chips">{attachments.map((item) => <button key={item.id} onClick={() => setAttachments((current) => current.filter((attachment) => attachment.id !== item.id))}>{item.name}<span>×</span></button>)}</div>}<div className="composer-bottom"><div className="segmented">{[['conversation', copy.chat], ['thought', copy.idea], ['action', copy.action]].map(([value, label]) => <button key={value} className={nodeType === value ? 'selected' : ''} onClick={() => setNodeType(value)}>{label}</button>)}</div>{nodeType === 'conversation' && <ModelPicker language={uiLanguage} value={model} onChange={(value) => { setModel(value); setChatOptionsOpen(false); }} options={modelOptions} />}{nodeType === 'conversation' && renderConversationControls()}{nodeType === 'action' && <ModelPicker language={uiLanguage} value={actionRunner} options={[{ value: 'codex', label: 'Codex' }, { value: 'claude', label: 'Claude Code' }, { value: 'deepseek', label: 'DeepSeek Harness' }]} onChange={setActionRunner} />}{nodeType === 'action' && renderActionControls()}<button className="attach-button" aria-label={copy.attach} onClick={() => attachmentRef.current?.click()}>{copy.attach}</button><input ref={attachmentRef} type="file" multiple hidden onChange={addAttachments} /><span className="shortcut">{copy.shortcut}</span><button className="send-button" onClick={createFirstNode}>↑</button></div></section>}
      </main>

      {relationDrag && <div className="relation-drag-tip" style={{ left: relationDrag.x + 14, top: relationDrag.y + 14 }}>{relationDrag.targetId ? tr('松开以选择关系','Release to choose relation') : tr('拖到另一个节点','Drag to another node')}</div>}
      {relationMenu && <div className="relation-popover" style={{ left: relationMenu.x + 12, top: relationMenu.y + 12 }}><small>{tr('建立到目标节点的关系','Create a relation to the target node')}</small><div>{[['inherit',tr('继承','Inherit')],['reference',tr('引用','Reference')],['merge',tr('合并','Merge')]].map(([type,label]) => <button key={type} onClick={() => { commitRelation(relationMenu.sourceId, relationMenu.targetId, type); setRelationMenu(null); }}>{label}</button>)}</div><button className="relation-cancel" onClick={() => setRelationMenu(null)}>{tr('取消','Cancel')}</button></div>}
      {contextMenu && <div className={`canvas-context-menu ${contextMenuClosing ? 'closing' : ''}`} style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>{contextMenu.kind === 'relation' ? <><strong>{tr('关系连线','Relation link')}</strong><button className="danger" onClick={() => { const relation = { sourceId: contextMenu.sourceId, targetId: contextMenu.targetId }; dismissContextMenu(() => { setRemovingRelation(relation); window.setTimeout(() => { setNodes((items) => items.map((node) => node.id === relation.sourceId ? { ...node, relations: (node.relations || []).filter((item) => item.targetId !== relation.targetId) } : node)); setRemovingRelation(null); }, 210); }); }}>{tr('删除连线','Delete link')}</button></> : contextMenu.kind === 'parent' ? <><strong>{tr('分支连线','Branch link')}</strong><button className="danger" onClick={() => dismissContextMenu(() => setNodes((items) => items.map((node) => node.id === contextMenu.childId ? { ...node, parentId: null } : node)))}>{tr('解除父子关系','Detach parent and child')}</button></> : (() => { const menuNode = nodes.find((node) => node.id === contextMenu.nodeId); return menuNode ? <><strong>{menuNode.title}</strong><button onClick={() => dismissContextMenu(() => startBranch(menuNode))}>{tr('从这里创建分支','Create branch from here')}</button><button onClick={() => dismissContextMenu(() => startEditingNode(menuNode))}>{tr('编辑节点','Edit node')}</button><button onClick={() => dismissContextMenu(() => toggleCollapse(menuNode.id))}>{collapsedIds.has(menuNode.id) ? tr('展开子节点','Expand children') : tr('折叠子节点','Collapse children')}</button><button onClick={() => dismissContextMenu(() => setNodes((items) => items.map((node) => node.id === menuNode.id ? { ...node, favorite: !node.favorite } : node)))}>{menuNode.favorite ? tr('取消收藏','Remove favorite') : tr('收藏','Favorite')}</button><button className="danger" onClick={() => dismissContextMenu(() => { setSelectedIds(new Set([menuNode.id])); setSelectedId(menuNode.id); window.setTimeout(deleteSelection, 0); })}>{tr('删除节点','Delete node')}</button></> : null; })()}</div>}
      {editingRelation && <div className={`relation-editor-popover ${relationEditorClosing ? 'closing' : ''}`}><span>{tr('正在编辑','Editing ')}{editingRelation.type === 'merge' ? tr('合并','merge') : tr('引用','reference')}{tr('连线',' link')}</span><div>{[['reference',tr('引用','Reference')],['merge',tr('合并','Merge')]].map(([type,label]) => <button key={type} className={editingRelation.type === type ? 'active' : ''} onClick={() => { commitRelation(editingRelation.sourceId, editingRelation.targetId, type); setEditingRelation({ ...editingRelation, type }); }}>{label}</button>)}<button className="remove" onClick={() => { const relation = { ...editingRelation }; closeRelationEditor(() => { setRemovingRelation(relation); window.setTimeout(() => { setNodes((items) => items.map((node) => node.id === relation.sourceId ? { ...node, relations: (node.relations || []).filter((item) => item.targetId !== relation.targetId) } : node)); setRemovingRelation(null); }, 210); }); }}>{tr('删除','Delete')}</button></div><button className="relation-cancel" onClick={() => closeRelationEditor()}>{tr('完成','Done')}</button></div>}
      {mergeWorkbench && selectedIds.size > 1 && <section className="merge-workbench"><header><div><small>{tr("合并工作台","Merge workspace")}</small><strong>{tr(`${selectedIds.size} 个节点将作为显式上下文`,`${selectedIds.size} nodes will be explicit context`)}</strong></div><button onClick={() => setMergeWorkbench(false)}>×</button></header><div className="merge-goals">{['综合结论','并列比较','找出冲突','制定行动'].map((goal) => <button key={goal} className={mergeGoal === goal ? 'active' : ''} onClick={() => setMergeGoal(goal)}>{mergeGoalLabel(goal)}</button>)}</div><div className="merge-items">{[...selectedIds].map((id, index) => { const node = nodes.find((item) => item.id === id); return node && <span key={id}><i>{index + 1}</i>{node.title}</span>; })}</div><footer><small>{tr("第一个选中节点为起点；其余节点只会附加到这一次新分支的上下文，不会改写原节点关系。","The first node is the starting point. Other nodes add context to this branch only; existing links stay unchanged.")}</small><button onClick={() => { const ids = [...selectedIds]; const sourceId = selectedId && ids.includes(selectedId) ? selectedId : ids[0]; const source = nodes.find((node) => node.id === sourceId); const mergeRelations = ids.filter((id) => id !== sourceId).map((targetId, index) => ({ id: `merge-${Date.now()}-${index}`, targetId, type: 'merge' })); setPendingContextRelations(mergeRelations); setMergeWorkbench(false); setNodeType('conversation'); setDraft(tr(`请基于已合并的 ${ids.length} 个节点，${mergeGoal}。`,`Based on the ${ids.length} merged nodes: ${mergeGoalLabel(mergeGoal)}.`)); if (source) startBranch(source, { preservePendingContext: true }); }}>{tr("创建合并分支","Create merged branch")}</button></footer></section>}

      {inspectorOpen && selected && selectedIds.size === 1 ? (
        <aside className={`inspector ${inspectorClosing ? 'closing' : ''}`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
          <div className="inspector-head"><div><span>{selectedIds.size > 1 ? `${selectedIds.size} ${text('selectedNodes')}` : text('currentNode')}</span><button type="button" className={`inspector-title ${inspectorTitleExpanded ? 'expanded' : ''}`} title={selected?.title} onClick={() => setInspectorTitleExpanded((value) => !value)}>{selected?.title}</button></div><button aria-label={text('close')} onClick={() => setInspectorOpen(false)}>×</button></div>
          <div className="meta-row"><span>{selected?.author}</span><span>{selected?.model || text('manualInput')}</span><span>{selected?.type === 'action' ? statusLabel(selected.status, uiLanguage) : text('saved')}</span></div>
          <nav className="inspector-tabs" aria-label={text('currentNode')}>{[['overview',text('overview')],['context',`${text('context')} ${activePath.length}`],['actions',text('operations')]].map(([value,label]) => <button key={value} className={inspectorTab === value ? 'active' : ''} onClick={() => setInspectorTab(value)}>{label}</button>)}</nav>
          <div key={inspectorTab} className={`inspector-body tab-${inspectorTab}`}>
          {inspectorTab === 'overview' && selected?.prompt && <section className="inspector-section prompt-section"><h3>{tr('这一轮的问题','Question in this turn')}</h3><p>{selected.prompt}</p></section>}
          {inspectorTab === 'context' && <section className={`inspector-section inherited-context ${inspectorContextCollapsed ? 'collapsed' : ''}`}><div className="inspector-section-heading"><h3>{tr('本次继承的上下文','Inherited context')}</h3><button type="button" className="section-collapse" aria-expanded={!inspectorContextCollapsed} onClick={() => setInspectorContextCollapsed((value) => !value)}>{inspectorContextCollapsed ? tr(`展开 ${activePath.length} 条`,`Expand ${activePath.length}`) : tr('收起','Collapse')}</button></div>{inspectorContextCollapsed ? <p className="context-collapsed-summary">{activePath.length ? tr(`已继承 ${activePath.length} 个节点；需要查看或临时跳转时展开。`,`Inherits ${activePath.length} nodes. Expand to inspect or jump temporarily.`) : tr('当前节点没有继承上下文。','This node has no inherited context.')}</p> : <div className="path-items">{activePath.map((node, index) => <button className={node.id === selectedId ? 'path-item active' : 'path-item'} key={node.id} onClick={() => selectNode(node.id)}><span>{index + 1}</span><div><strong>{node.title}</strong><small>{node.content}</small></div></button>)}</div>}</section>}
          {inspectorTab === 'overview' && selected?.type === 'action' && <section className="inspector-section action-permission"><h3>{tr('本地行动','Local action')}</h3><div className="inspector-status-card"><span className={`status ${selected.status}`}>{statusLabel(selected.status, uiLanguage)}</span><p>{selected.status === 'running' ? `${selected.model || tr('执行器','Runner')} ${tr('正在本地工作区执行','is running in the local workspace')}` : selected.status === 'done' ? tr('执行已完成，记录和产物均已保存','Execution completed. Records and artifacts are saved.') : selected.status === 'failed' ? tr('执行失败，请检查代理连接','Execution failed. Check the agent connection.') : tr('等待执行','Waiting to run')}</p></div><div className="workspace-path-row"><small className="workspace-path">{selected.execution?.workspace || activeCanvas?.workspace || tr('Wendaflow 项目目录','Wendaflow project directory')}</small><button onClick={() => openWorkspaceDirectory(selected.execution?.workspace || activeCanvas?.workspace || '')}>{tr('打开 ↗','Open ↗')}</button></div>{selected.status === 'approval' && <button className="primary-action" onClick={approveAction}>{tr('允许','Allow')} {selected.model || tr('执行器','Runner')} {tr('执行','to run')}</button>}</section>}
          {inspectorTab === 'context' && selected?.type === 'action' && selected.execution && <section className="inspector-section agent-workbench"><details><summary><span>{tr('代理执行记录','Agent execution record')}</span><small>{selected.execution.events?.length || 0} {tr('条','items')}</small></summary><div className="agent-timeline">{(selected.execution.events || []).map((event) => <article key={event.id} className={event.type}><i /><div><small>{new Date(event.at).toLocaleTimeString(uiLanguage)}</small><pre>{event.text}</pre></div></article>)}</div>{selected.execution.after?.status && <details className="workspace-changes"><summary>{tr('工作区文件变化','Workspace file changes')}</summary><pre>{selected.execution.after.status}</pre></details>}{selected.execution.after?.diff && <details className="workspace-changes"><summary>{tr('查看代码差异','View code diff')}</summary><pre>{selected.execution.after.diff}</pre></details>}</details></section>}
          {inspectorTab === 'overview' && selected?.type === 'conversation' && <section className="inspector-section inspector-status-card"><div className="generation-state"><span className={`status ${selected.status}`}>{statusLabel(selected.status, uiLanguage) || text('saved')}</span><small>{systemText(selected.error) || systemText(selected.generationPhase) || tr('问题、模型和上下文请求记录均已保存','Question, model, and context request records are saved')}</small></div></section>}
          {inspectorTab === 'context' && selected?.type === 'conversation' && selected.requestRecord && <section className="inspector-section generation-tools"><h3>{tr('请求记录','Request record')}</h3><details className="request-record"><summary>{tr('本次请求','This request')} · {selected.requestHistory?.length || 1} {tr('次','times')}</summary><dl><dt>{tr('模型','Model')}</dt><dd>{selected.requestRecord.provider} · {selected.requestRecord.model}</dd><dt>{tr('状态','Status')}</dt><dd>{statusLabel(selected.requestRecord.status, uiLanguage) || selected.requestRecord.status}</dd><dt>{tr('耗时','Duration')}</dt><dd>{selected.requestRecord.durationMs ? tr(`${(selected.requestRecord.durationMs / 1000).toFixed(1)} 秒`,`${(selected.requestRecord.durationMs / 1000).toFixed(1)} seconds`) : tr('进行中','In progress')}</dd><dt>{tr('上下文','Context')}</dt><dd>{selected.requestRecord.context?.length || 0} {tr('条','items')} · {tr('附件','attachments')} {selected.requestRecord.attachments?.length || 0}</dd></dl><strong>{tr('实际注入的节点','Injected nodes')}</strong><div className="request-context-list">{selected.requestRecord.context?.map((item) => <span key={item.id} className={item.relation}>{item.relation === 'merge' ? tr('合并','Merge') : item.relation === 'reference' ? tr('引用','Reference') : tr('继承','Inherit')} · {item.title}</span>)}</div>{selected.requestRecord.error && <pre>{systemText(selected.requestRecord.error)}</pre>}</details></section>}
          {inspectorTab === 'actions' && selected?.type === 'conversation' && <section className="inspector-section generation-tools"><h3>{tr('生成操作','Generation actions')}</h3><label>{tr('重试模型','Retry model')}<select value={model} onChange={(event) => setModel(event.target.value)}>{modelOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><button className="wide-action" disabled={['queued', 'thinking', 'streaming'].includes(selected.status) || !selected.prompt} onClick={() => retryGeneration(selected, model)}>{selected.status === 'failed' ? tr('修复连接后重试','Retry after fixing connection') : tr('使用所选模型重新生成','Regenerate with selected model')}</button>{['queued', 'thinking', 'streaming'].includes(selected.status) && <button className="wide-action danger-outline" onClick={() => stopGeneration(selected.id)}>{tr('停止生成','Stop generation')}</button>}</section>}
          {inspectorTab === 'actions' && selected?.type === 'action' && <section className="inspector-section"><h3>{tr('行动操作','Action controls')}</h3>{selected.status === 'running' && <button className="wide-action danger-outline" onClick={() => stopAgentJob(selected)}>{tr('停止当前任务','Stop current task')}</button>}<button className="wide-action" onClick={() => { setNodeType('action'); setActionRunner(selected.actionRunner || 'codex'); setDraft(tr('继续这个任务：','Continue this task:')); startBranch(selected); }}>{tr('追加指令并继续','Add instructions and continue')}</button></section>}
          {inspectorTab === 'actions' && (editingNode ? <section className="inspector-section node-editor"><h3>{tr('编辑节点','Edit node')}</h3><label>{tr('节点类型','Node type')}<select value={editDraft.type} onChange={(event) => setEditDraft((value) => ({ ...value, type: event.target.value }))}><option value="conversation">{copy.chat}</option><option value="thought">{copy.idea}</option><option value="action">{copy.action}</option></select></label><label>{tr('标题','Title')}<input value={editDraft.title} onChange={(event) => setEditDraft((value) => ({ ...value, title: event.target.value }))} /></label>{editDraft.type === 'conversation' && <label>{tr('这一轮的问题','Question in this turn')}<textarea value={editDraft.prompt} onChange={(event) => setEditDraft((value) => ({ ...value, prompt: event.target.value }))} /></label>}<label>{tr('正文（Markdown）','Body (Markdown)')}<textarea className="content-edit" value={editDraft.content} onChange={(event) => setEditDraft((value) => ({ ...value, content: event.target.value }))} /></label><label>{tr('标签','Tags')}<input value={editDraft.tags} onChange={(event) => setEditDraft((value) => ({ ...value, tags: event.target.value }))} placeholder={tr('研究，重要，待确认','Research, important, pending')} /></label><div className="node-colors"><span>{tr('卡片颜色','Card color')}</span>{NODE_COLORS.map(([id,label,color]) => <button key={id} type="button" title={colorLabel(id)} className={editDraft.color === color ? 'active' : ''} style={{ '--swatch': color || '#ffffff' }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setEditDraft((value) => ({ ...value, color })); }} />)}</div><label>{tr('备注','Note')}<textarea value={editDraft.note} onChange={(event) => setEditDraft((value) => ({ ...value, note: event.target.value }))} placeholder={tr('不会发送给 AI 的私人备注','Private note not sent to AI')} /></label><div><button onClick={() => setEditingNode(false)}>{tr('取消','Cancel')}</button><button className="save-edit" onClick={saveNodeEdit}>{tr('保存','Save')}</button></div></section> : <section className="inspector-section"><h3>{tr('节点操作','Node actions')}</h3><div className="node-colors quick-colors"><span>{tr('卡片颜色','Card color')}</span>{NODE_COLORS.map(([id,label,color]) => <button key={id} type="button" title={colorLabel(id)} className={selected.color === color ? 'active' : ''} style={{ '--swatch': color || '#ffffff' }} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); setNodes((items) => items.map((node) => node.id === selected.id ? { ...node, color } : node)); }} />)}</div><button className="wide-action" onClick={startEditingNode}>{tr('编辑、转换类型与标签','Edit, convert type, and tags')}</button><button className="wide-action" onClick={() => { setNodeType('conversation'); setDraft(tr(`请使用另一个角度重新回答：${selected?.content || ''}`,`Answer from another angle: ${selected?.content || ''}`)); startBranch(selected); }}>{tr('换模型重新回答','Answer again with another model')}</button>{selected.note && <div className="node-note"><strong>{tr('私人备注','Private note')}</strong><p>{selected.note}</p></div>}</section>)}
          {inspectorTab === 'context' && selected?.parentId && <section className="inspector-section inherited-link"><h3>{tr('父级分支','Parent branch')}</h3><div><span>{tr('继承自','Inherited from')} · {nodes.find((node) => node.id === selected.parentId)?.title || tr('已删除节点','Deleted node')}</span><button className="unlink-inherit" onClick={() => setNodes((items) => items.map((node) => node.id === selected.id ? { ...node, parentId: null } : node))}>{tr('解除继承','Remove inheritance')}</button></div></section>}
          {inspectorTab === 'actions' && <section className="inspector-section relationship-tools"><h3>{tr('关联与扩展','Relations and expansion')}</h3><div className="relation-types">{[['inherit',tr('继承','Inherit')],['reference',tr('引用','Reference')],['merge',tr('合并','Merge')]].map(([value,label]) => <button key={value} className={linkType === value ? 'active' : ''} onClick={() => setLinkType(value)}>{label}</button>)}</div><p className="relationship-help">{linkType === 'inherit' ? tr('目标节点会成为当前节点的子分支。','The target node becomes a child branch of the current node.') : linkType === 'merge' ? tr('将目标节点加入后续分支的合并上下文。','Add the target node to the merged context for later branches.') : tr('关联但不改变树结构；后续分支会引用目标节点。','Link without changing the tree; later branches cite the target node.')}</p><button className={`wide-action ${linkingFrom === selected.id ? 'active' : ''}`} onClick={() => setLinkingFrom((current) => current === selected.id ? null : selected.id)}>{linkingFrom === selected.id ? tr(`取消${({inherit:tr('继承','Inherit'),reference:tr('引用','Reference'),merge:tr('合并','Merge')})[linkType]}连线`, `Cancel ${({inherit:tr('继承','Inherit'),reference:tr('引用','Reference'),merge:tr('合并','Merge')})[linkType]} link`) : tr(`建立${({inherit:tr('继承','Inherit'),reference:tr('引用','Reference'),merge:tr('合并','Merge')})[linkType]}连线`, `Create ${({inherit:tr('继承','Inherit'),reference:tr('引用','Reference'),merge:tr('合并','Merge')})[linkType]} link`)}</button>{(selected.relations || []).length > 0 && <div className="relation-list">{selected.relations.map((relation) => <div key={relation.id}><span>{relation.type === 'merge' ? tr('合并','Merge') : tr('引用','Reference')} · {nodes.find((node) => node.id === relation.targetId)?.title || tr('已删除节点','Deleted node')}</span><button onClick={() => setNodes((items) => items.map((node) => node.id === selected.id ? { ...node, relations: (node.relations || []).filter((item) => item.id !== relation.id) } : node))}>{tr('删除','Delete')}</button></div>)}</div>}<div className="mindmap-mode-row">{[['questions',tr('问题','Questions')],['ideas',tr('想法','Ideas')],['counterpoints',tr('反驳','Counterpoints')],['actions',tr('行动','Actions')]].map(([value,label]) => <button key={value} className={mindMapState.mode === value ? 'active' : ''} onClick={() => setMindMapState((current) => ({ ...current, mode: value }))}>{label}</button>)}</div><button className="wide-action" onClick={() => generateMindMapSuggestions(selected, mindMapState.mode)}>{tr('AI 扩展思维导图','AI mind-map expansion')}</button>{mindMapState.nodeId === selected.id && <div className="mindmap-suggestions"><small>{systemText(mindMapState.status)}</small>{mindMapState.suggestions.map((idea, index) => <label key={`${idea}-${index}`}><input type="checkbox" checked={mindMapState.selected.includes(idea)} onChange={(event) => setMindMapState((current) => ({ ...current, selected: event.target.checked ? [...current.selected, idea] : current.selected.filter((item) => item !== idea) }))} />{idea}</label>)}{!!mindMapState.suggestions.length && <div className="mindmap-actions"><button className="wide-action" onClick={() => setMindMapState({ nodeId: null, status: '', suggestions: [], selected: [], mode: 'questions' })}>{tr('全部丢弃','Discard all')}</button><button className="primary-action" disabled={!mindMapState.selected.length} onClick={addMindMapSuggestions}>{tr('接受','Accept')} {mindMapState.selected.length} {tr('个节点','nodes')}</button></div>}</div>}</section>}
          {inspectorTab === 'actions' && <section className="inspector-section delete-section"><h3>{tr('删除','Delete')}</h3><button className="wide-action danger-outline" disabled={!deletionIds.size || deletingIds.size} onClick={deleteSelection}>{deletingIds.size ? tr('正在删除…','Deleting…') : selectedIds.size > 1 ? tr(`删除选中的 ${selectedIds.size} 个节点`,`Delete ${selectedIds.size} selected nodes`) : selected?.id === 'root' ? tr('根节点不能删除','The root node cannot be deleted') : tr(`删除节点及其 ${Math.max(0, deletionIds.size - 1)} 个后代`,`Delete node and ${Math.max(0, deletionIds.size - 1)} descendants`)}</button></section>}
          </div>
          <footer className="inspector-footer"><button className={selected.favorite ? 'active' : ''} onClick={() => setNodes((items) => items.map((node) => node.id === selected.id ? { ...node, favorite: !node.favorite } : node))}>{selected.favorite ? tr('★ 已收藏','★ Favorited') : tr('☆ 收藏','☆ Favorite')}</button><button className={selected.completed ? 'active' : ''} onClick={() => setNodes((items) => items.map((node) => node.id === selected.id ? { ...node, completed: !node.completed } : node))}>{selected.completed ? tr('✓ 已完成','✓ Completed') : tr('✓ 完成','✓ Complete')}</button><button className="branch" onClick={() => startBranch(selected)}>＋ {tr('分支','Branch')}</button></footer>
        </aside>
      ) : selected && selectedIds.size === 1 ? <button className="open-inspector" onClick={() => setInspectorOpen(true)}>‹</button> : null}
      {deleteUndo && <div className="undo-toast"><span>{tr(`已删除 ${deleteUndo.nodes.length} 个节点`,`${deleteUndo.nodes.length} nodes deleted`)}</span><button onClick={undoDelete}>{tr('撤销','Undo')} <small>Ctrl Z</small></button></div>}
      {searchOpen && <section className="search-panel"><div className="search-input"><span>⌕</span><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={text('searchPlaceholder')} /><small>Esc</small></div><div className="search-results">{searchResults.length ? searchResults.map((node) => <button key={node.id} onClick={() => focusSearchResult(node)}><span className={`result-dot ${node.type}`} /><div><strong>{node.title}</strong><small>{node.prompt || node.content}</small></div><em>{node.model || copy.idea}</em></button>) : <p>{text('noResults')}</p>}</div><footer>{searchResults.length} {text('results')} · Ctrl K</footer></section>}
      {libraryOpen && <section className="library-panel"><header><div><span>{text('currentCanvas')}</span><h2>{text('library')}</h2></div><button aria-label={text('close')} onClick={() => closeFloatingPanel('library', setLibraryOpen)}>×</button></header><div className="library-upload"><button onClick={() => libraryUploadRef.current?.click()}>{text('uploadCurrent')}</button><input ref={libraryUploadRef} type="file" multiple hidden onChange={(event) => { addAttachments(event); if (nodes.length && !branchSource) setRootComposerOpen(true); }} /><span>{tr('图片、PDF、文本、代码及常见文件','Images, PDFs, text, code, and common files')}</span></div><div className="library-list">{libraryItems.length ? libraryItems.map((item) => <article key={`${item.nodeId || 'draft'}-${item.id}`}><button className="library-preview" onClick={() => openLibraryItem(item)}>{item.dataUrl?.startsWith('data:image/') ? <img src={item.dataUrl} alt="" /> : <span>{item.name.split('.').pop()?.slice(0, 5).toUpperCase() || 'FILE'}</span>}</button><div><strong>{item.name}</strong><small>{item.nodeTitle} · {Math.max(1, Math.ceil((item.size || item.text?.length || 0) / 1024))} KB</small></div><div className="library-actions">{item.nodeId && <button onClick={() => { focusSearchResult(nodes.find((node) => node.id === item.nodeId)); closeFloatingPanel('library', setLibraryOpen); }}>{tr('定位','Locate')}</button>}<button onClick={() => addLibraryItemToInput(item)}>{tr('使用','Use')}</button><button className="remove" onClick={() => removeLibraryItem(item)}>{tr('移除','Remove')}</button></div></article>) : <p>{text('libraryEmpty')}</p>}</div><footer>{libraryItems.length} {tr('项资料','items')} · {tr('文件随当前画布保存','Files are saved with the current canvas')}</footer></section>}
      {minimapOpen && <section className={`minimap ${inspectorOpen && selected ? 'with-inspector' : ''}`} onPointerDown={navigateMiniMap} aria-label={text('minimap')}><div className="minimap-stage">{visibleNodes.map((node) => <i key={node.id} className={selectedIds.has(node.id) ? 'selected' : ''} style={{ left: `${((node.x - miniBounds.minX) / miniBounds.width) * 100}%`, top: `${((node.y - miniBounds.minY) / miniBounds.height) * 100}%`, width: `${Math.max(3, ((nodeSizes.get(node.id)?.width || 224) / miniBounds.width) * 100)}%`, height: `${Math.max(3, ((nodeSizes.get(node.id)?.height || 110) / miniBounds.height) * 100)}%` }} />)}</div><span>{text('navigate')}</span></section>}
      {settingsOpen && (
        <div className={`modal-backdrop ${settingsClosing ? 'closing' : ''}`} onPointerDown={(event) => { if (event.target === event.currentTarget) closeSettings(); }}>
          <section className="settings-card settings-unified">
            <div className="settings-head"><div><span>Wendaflow</span><h2>{text('settings')}</h2></div><button aria-label={text('close')} onClick={closeSettings}>×</button></div>
            <div className="settings-layout">
              <nav className="settings-nav" aria-label={text('settings')}>{[['models',text('modelConnections'),text('modelConnectionsHint')],['appearance',text('appearance'),text('themeDisplay')],['license',tr('授权','License'),tr('激活码与设备授权','Activation code and device access')],['notifications',tr('通知','Notifications'),tr('运行期间的应用内提醒','In-app alerts while the app is running')],['plugins',tr('插件','Plugins'),tr('扩展功能即将推出','Extensions are coming soon')],['project',text('projectData'),text('projectDataHint')],['about',tr('关于','About'),tr('版本、授权与官方入口','Version, license, and official links')],['sponsor',tr('赞助','Sponsor'),tr('支持 Wendaflow 的持续开发','Support continued Wendaflow development')]].map(([value,label,description]) => <button key={value} className={settingsSection === value ? 'active' : ''} onClick={() => setSettingsSection(value)}><i /> <span><strong>{label}</strong><small>{description}</small></span></button>)}</nav>
              <div className="settings-content">
              {settingsSection === 'models' && <section className="settings-section"><header><h3>{text('modelConnections')}</h3><p>{tr('管理本地模型与云端 API。修改会自动保存。','Manage local models and cloud APIs. Changes are saved automatically.')}</p></header><div className="settings-columns">
              <section className="settings-pane">
                <div className="pane-heading"><span>{tr('本地模型','Local models')}</span><h3>Ollama</h3></div>
                <div className="profile-tabs">{localProfiles.map((profile) => <button key={profile.id} className={profile.id === ollama.id ? 'active' : ''} onClick={() => { setActiveLocalId(profile.id); setOllamaStatus(''); }}>{profile.name}</button>)}<button className="add-profile" onClick={addLocalProfile}>＋</button></div>
                <div className="profile-title"><p>{localProfiles.length ? tr('可以保存多个本地模型，并在输入框里直接切换。','Save multiple local models and switch between them in the composer.') : tr('尚未添加本地模型，点击 ＋ 添加。','No local models yet. Click ＋ to add one.')}</p>{localProfiles.length > 0 && <button onClick={removeActiveLocal}>{tr('删除当前','Delete current')}</button>}</div>
                <p>{tr('请求只发送到你填写的本机地址。','Requests are sent only to the local address you enter.')}</p>
                <label>{tr('显示名称','Display name')}<input value={ollama.name} onChange={(event) => updateActiveLocal({ name: event.target.value })} /></label>
                <label>{tr('服务地址','Server URL')}<input value={ollama.endpoint} onChange={(event) => updateActiveLocal({ endpoint: event.target.value })} /></label>
                <label>{tr('模型名称','Model name')}<input value={ollama.model} onChange={(event) => updateActiveLocal({ model: event.target.value })} /></label>
                <div className="settings-actions"><span>{systemText(ollamaStatus) || tr('尚未测试连接','Connection not tested')}</span><button onClick={testOllama}>{tr('测试连接','Test connection')}</button></div>
              </section>
              <section className="settings-pane cloud-pane">
                <div className="pane-heading"><span>{tr('云端模型库','Cloud model library')}</span><h3>{tr('API 配置','API configuration')}</h3></div>
                <div className="profile-tabs">{cloudProfiles.map((profile) => <button key={profile.id} className={profile.id === activeCloud.id ? 'active' : ''} onClick={() => setActiveCloudId(profile.id)}>{profile.name}</button>)}<button className="add-profile" onClick={addCloudProfile}>＋</button></div>
                <div className="profile-title"><p>{cloudProfiles.length ? tr('每个模型独立保存协议、地址和模型名。','Each model keeps its own protocol, endpoint, and model name.') : tr('尚未添加云端模型，点击 ＋ 添加。','No cloud models yet. Click ＋ to add one.')}</p>{cloudProfiles.length > 0 && <button onClick={removeActiveCloud}>{tr('删除当前','Delete current')}</button>}</div>
                <div className="cloud-form-grid">
                  <label>{tr('显示名称','Display name')}<input value={activeCloud.name} onChange={(event) => updateActiveCloud({ name: event.target.value })} /></label>
                  <label>{tr('接口格式','API format')}<select value={activeCloud.format} onChange={(event) => { const format = event.target.value; const preset = CLOUD_FORMAT_PRESETS[format]; updateActiveCloud({ format, endpoint: preset.endpoint, model: preset.model }); }}><option value="responses">OpenAI Responses</option><option value="openai-compatible">OpenAI-compatible</option><option value="anthropic">Anthropic Messages</option><option value="gemini">Google Gemini</option></select></label>
                  <label className="span-two">{tr('接口地址','Endpoint')}<input value={activeCloud.endpoint} onChange={(event) => updateActiveCloud({ endpoint: event.target.value })} placeholder={activeCloud.format === 'gemini' ? GEMINI_ENDPOINT : 'https://…'} /></label>
                  <label>{tr('模型名称','Model name')}<input value={activeCloud.model} onChange={(event) => updateActiveCloud({ model: event.target.value })} /></label>
                  <label>{tr('API 密钥','API key')}<input type="password" autoComplete="off" value={activeCloud.apiKey} onChange={(event) => updateActiveCloud({ apiKey: event.target.value })} placeholder={tr('仅保存在本次会话','Stored only for this session')} /></label>
                </div>
                <div className="cloud-state"><i className={activeCloud.apiKey ? 'ready' : ''} />{activeCloud.apiKey ? tr('已配置，可在输入框直接选择','Configured and available in the composer') : tr('等待配置','Not configured')}</div>
              </section>
              </div></section>}
              {settingsSection === 'appearance' && <section className="settings-section"><header><h3>{text('appearance')}</h3><p>{text('appearanceHint')}</p></header><div className="appearance-setting"><div><strong>{text('interfaceTheme')}</strong><span>{text('interfaceThemeHint')}</span></div><div className="theme-presets">{[['sage','Mist'],['paper','Pearl'],['midnight','Midnight'],['graphite','Graphite'],['contrast-light','Daylight'],['contrast-blue','Cobalt'],['contrast-amber','Amber'],['contrast-plum','Plum'],['custom',text('customTheme')]].map(([value,label]) => <button key={value} className={theme === value ? 'active' : ''} onClick={() => setTheme(value)}><i data-swatch={value} /><span>{({Mist:tr('雾青','Mist'),Pearl:tr('珍珠','Pearl'),Midnight:tr('夜蓝','Midnight'),Graphite:tr('墨黑','Graphite'),Daylight:tr('极昼','Daylight'),Cobalt:tr('钴蓝','Cobalt'),Amber:tr('琥珀','Amber'),Plum:tr('紫曜','Plum')}[label] || label)}</span></button>)}</div></div><div className="appearance-setting language-setting"><div><strong>{copy.language}</strong><span>{copy.languageHint}</span></div><select value={uiLanguage} onChange={(event) => setUiLanguage(event.target.value)}>{UI_LANGUAGES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="appearance-setting preview-toggle-setting"><div><strong>{text('preview')}</strong><span>{text('previewHint')}</span></div><button type="button" className={`preview-switch ${previewEnabled ? 'enabled' : ''}`} role="switch" aria-checked={previewEnabled} onClick={() => setPreviewEnabled((value) => !value)}><i aria-hidden="true" /><span>{previewEnabled ? text('enabled') : text('disabled')}</span></button></div>{theme === 'custom' && <div className="custom-theme-editor"><div><strong>{text('customTheme')}</strong><span>{text('customThemeHint')}</span></div><div>{[['background',tr('背景','Background')],['surface',tr('卡片','Cards')],['text',tr('文字','Text')],['accent',tr('强调色','Accent')],['grid',tr('网格','Grid')]].map(([key,label]) => <label key={key}><span>{label}</span><input type="color" value={customTheme[key]} onChange={(event) => setCustomTheme((value) => ({ ...value, [key]: event.target.value }))} /><code>{customTheme[key]}</code></label>)}</div><button onClick={() => setCustomTheme(DEFAULT_CUSTOM_THEME)}>{text('restoreColors')}</button></div>}</section>}
              {settingsSection === 'notifications' && <section className="settings-section notification-settings"><header><h3>{tr('应用内通知','In-app notifications')}</h3><p>{tr('仅当 Wendaflow 正在运行时接收通知；关闭软件后不会保留后台连接。','Receive notifications only while Wendaflow is running. No background connection is kept after you close the app.')}</p></header><div className="appearance-setting preview-toggle-setting"><div><strong>{tr('接收通知','Receive notifications')}</strong><span>{tr('开启后，新消息会以右上角弹窗显示，并保留在通知中心。','When enabled, new messages appear as a pop-up and remain in Notification Center.')}</span></div><button type="button" className={`preview-switch ${notificationSettings.enabled ? 'enabled' : ''}`} role="switch" aria-checked={notificationSettings.enabled} onClick={() => setNotificationSettings((value) => ({ ...value, enabled: !value.enabled }))}><i aria-hidden="true" /><span>{notificationSettings.enabled ? text('enabled') : text('disabled')}</span></button></div><div className="notification-server-setting notification-device-setting"><span>{tr('通知中心','Notification center')}</span><small>{tr('通知服务会自动同步，无需设置地址。需要确认的通知会在详情窗口中保留，直到你手动确认。','Notifications sync automatically. Address setup is not required, and confirmation-required notices remain until acknowledged.')}</small><label>{tr('本机设备 ID','This device ID')}<input readOnly value={notificationSettings.deviceId} /></label></div></section>}
              {settingsSection === 'plugins' && <section className="settings-section plugin-settings"><header><h3>{tr('插件','Plugins')}</h3><p>{tr('扩展功能正在准备中。','Extensions are being prepared.')}</p></header><div className="plugin-coming-soon"><i>⌘</i><strong>{tr('敬请期待','Coming soon')}</strong><span>{tr('未来你可以在这里发现和管理 Wendaflow 的扩展能力。','You will be able to discover and manage Wendaflow extensions here.')}</span></div></section>}
              {settingsSection === 'sponsor' && <section className="settings-section sponsor-settings"><header><h3>{tr('赞助 Wendaflow','Sponsor Wendaflow')}</h3><p>{tr('如果 Wendaflow 对你有帮助，欢迎任选一种方式支持后续开发。点击二维码可放大查看。','If Wendaflow helps you, you can support its continued development through any option below. Click a QR code to enlarge it.')}</p></header><div className="sponsor-grid">{[['wechat.jpg',tr('微信支付','WeChat Pay'),tr('推荐使用微信支付','WeChat Pay recommended')],['alipay.jpg',tr('支付宝','Alipay'),tr('支付宝扫码支付','Scan with Alipay')],['binance.jpg',tr('币安支付','Binance Pay'),tr('使用币安 App 扫码支付','Scan with Binance App')],['usdt-tron.jpg',tr('USDT · TRON','USDT · TRON'),tr('仅支持 TRON 资产','TRON network only')]].map(([file,title,hint]) => <article className="sponsor-code" key={file} role="button" tabIndex={0} onClick={() => setSponsorPreview({ file, title, hint })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSponsorPreview({ file, title, hint }); } }}><img src={`sponsor/${file}`} alt={`${title} ${tr('赞助二维码','sponsorship QR code')}`} /><strong>{title}</strong><small>{hint}</small>{file === 'usdt-tron.jpg' && <div className="sponsor-wallet" onClick={(event) => event.stopPropagation()}><code>TV6sixoSdkN4GMQRxG2uDoPZifutjyZ3Wr</code><button type="button" onClick={() => { navigator.clipboard?.writeText('TV6sixoSdkN4GMQRxG2uDoPZifutjyZ3Wr'); setSponsorCopied(true); window.setTimeout(() => setSponsorCopied(false), 1600); }}>{sponsorCopied ? tr('已复制','Copied') : tr('复制地址','Copy address')}</button></div>}<span>{tr('点击放大','Click to enlarge')}</span></article>)}</div><p className="sponsor-note">{tr('感谢你的支持，它会直接帮助 Wendaflow 持续改进。','Thank you — your support directly helps Wendaflow keep improving.')}</p></section>}
              {settingsSection === 'license' && <section className="settings-section notification-settings license-settings"><header><h3>{tr('授权与激活','License & activation')}</h3><p>{tr('激活码首次使用时绑定本机设备；服务端撤销或到期会在下一次联网验证后生效。','An activation code binds to this device on first use. Revocation or expiry takes effect at the next online verification.')}</p></header>{license ? <div className="license-client-status"><strong>{tr('已激活','Activated')} · {String(license.tier || 'pro').toUpperCase()}</strong><span>{license.expiresAt ? `${tr('有效至','Valid until')} ${new Date(license.expiresAt).toLocaleDateString(uiLanguage)}` : tr('永久授权','Perpetual license')}</span><small>{systemText(licenseStatus) || tr('已绑定到这台设备。','Bound to this device.')}</small><button className="danger" onClick={deactivateLicense}>{tr('移除此设备上的授权','Remove local license')}</button></div> : <div className="license-activation"><label>{tr('激活码','Activation code')}<input value={activationCode} onChange={(event) => setActivationCode(event.target.value.toUpperCase())} onKeyDown={(event) => { if (event.key === 'Enter') activateLicense(); }} placeholder="WDF-XXXXXXX-XXXXXXX-XXXXXXX" autoComplete="off" /></label><button className="primary" disabled={licenseBusy} onClick={activateLicense}>{licenseBusy ? tr('正在激活…','Activating…') : tr('激活此设备','Activate this device')}</button>{licenseStatus && <small>{systemText(licenseStatus)}</small>}</div>}</section>}
              {settingsSection === 'project' && <section className="settings-section"><header><h3>{text('projectData')}</h3><p>{tr('备份或恢复完整画布，包括节点、附件和布局。','Back up or restore complete canvases, including nodes, attachments, and layout.')}</p></header><div className="settings-project-row"><div><strong>{tr('Wendaflow 画布文件','Wendaflow canvas file')}</strong><span>{systemText(projectStatus) || tr('使用 .wdf 格式保存完整项目','Save the complete project in .wdf format')}</span></div><div><button onClick={exportProject}>{tr('导出 WDF','Export WDF')}</button><button onClick={() => importRef.current?.click()}>{text('importWdf')}</button></div><input ref={importRef} type="file" accept=".wdf,application/x-branchspace-wdf" hidden onChange={importProject} /></div></section>}
              {settingsSection === 'about' && <section className="settings-section about-settings"><header><h3>{tr('关于 Wendaflow','About Wendaflow')}</h3><p>{tr('让思考不再被单一线性对话束缚。','A spatial workspace for conversations, context, and execution.')}</p></header><div className="about-hero"><div className="about-mark">W</div><div><strong>Wendaflow</strong><span>{tr('让对话自由分岔','Let conversations branch freely')}</span></div><em>v{APP_VERSION}</em></div><div className="about-grid"><article><strong>{tr('当前版本','Current version')}</strong><span>v{APP_VERSION}</span></article><article><strong>{tr('授权状态','License status')}</strong><span>{license ? `${String(license.tier || 'pro').toUpperCase()} · ${tr('已激活','Activated')}` : tr('未激活','Not activated')}</span></article><article><strong>{tr('官方网站','Official website')}</strong><a href="https://cn.qnjyxh.xyz" target="_blank" rel="noreferrer">cn.qnjyxh.xyz</a></article><article><strong>{tr('通知服务','Notification service')}</strong><span>{notificationSettings.enabled ? tr('已开启','Enabled') : tr('已关闭','Disabled')}</span></article></div><div className="settings-project-row update-check-row"><div><strong>{tr('软件更新','Software updates')}</strong><span>{updateCheckState === 'checking' ? tr('正在检查更新…','Checking for updates…') : updateCheckState === 'available' ? tr('发现可用更新，已显示在通知中心。','An update is available in Notification Center.') : updateCheckState === 'current' ? tr('当前已是最新版本。','You are up to date.') : updateCheckState === 'failed' ? tr('无法连接更新服务，请稍后重试。','Could not reach the update service. Please try again.') : tr('启动时会自动检查；也可以随时手动检查。','Checked at startup; you can also check manually.')}</span></div><button type="button" disabled={updateCheckState === 'checking'} onClick={() => { void checkForUpdates(true); }}>{updateCheckState === 'checking' ? tr('正在检查…','Checking…') : tr('检查更新','Check for updates')}</button></div><p className="about-note">{tr('Wendaflow 仅在你选择的模型连接中处理请求；模型密钥与画布数据由当前设备管理。','Wendaflow sends requests only through the model connections you configure. Model keys and canvas data stay managed by this device.')}</p></section>}
              </div>
            </div>
          </section>
        </div>
      )}
      {sponsorPreview && <div className="sponsor-preview-backdrop" role="dialog" aria-modal="true" aria-label={sponsorPreview.title} onPointerDown={(event) => { if (event.target === event.currentTarget) setSponsorPreview(null); }}><section className="sponsor-preview"><button className="sponsor-preview-close" type="button" aria-label={text('close')} onClick={() => setSponsorPreview(null)}>×</button><strong>{sponsorPreview.title}</strong><small>{sponsorPreview.hint}</small><img src={`sponsor/${sponsorPreview.file}`} alt={`${sponsorPreview.title} ${tr('赞助二维码','sponsorship QR code')}`} />{sponsorPreview.file === 'usdt-tron.jpg' && <div className="sponsor-preview-wallet"><code>TV6sixoSdkN4GMQRxG2uDoPZifutjyZ3Wr</code><button type="button" onClick={() => { navigator.clipboard?.writeText('TV6sixoSdkN4GMQRxG2uDoPZifutjyZ3Wr'); setSponsorCopied(true); window.setTimeout(() => setSponsorCopied(false), 1600); }}>{sponsorCopied ? tr('已复制','Copied') : tr('复制地址','Copy address')}</button></div>}</section></div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
